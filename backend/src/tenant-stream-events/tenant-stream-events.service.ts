import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { newId, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import { appTimezone } from '../common/utils/time.util';
import { sendSmtpMail } from '../common/utils/mail.util';
import { getMappedBusinessId } from '../tenant-billing/billing-scope';
import { addDuration, startOfDate } from '../tenant-billing/billing-math';
import {
  STREAM_EVENT_GROUPS,
  aggregateEmailStatus,
  alertRecipients,
  cooldownActive,
  cooldownKey,
  customerBcc,
  jsonStringArray,
  normalizeIncomingEvents,
  ruleMatches,
  type RuleOutcome,
} from './stream-events.logic';
import { StreamEventListQueryDto } from './dto/stream-events.dto';

/** How long received events are kept. */
const RETENTION_DAYS = 30;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const customerName = (c: { fName: string; lName: string | null }) => [c.fName, c.lName].filter(Boolean).join(' ');

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function dayStart(date: string, field: string): number {
  try {
    return startOfDate(date);
  } catch (error) {
    if (error instanceof RangeError) throw new BadRequestException(`${field}: ${error.message}`);
    throw error;
  }
}

interface StoredEvent {
  id: string;
  event: string;
  media: string | null;
  occurredAt: number;
  payload: Record<string, unknown>;
  tenantStreamId: string | null;
  tenantCustomerId: string | null;
}

/**
 * Stream events posted by streaming servers: stored for 30 days, and matched
 * against the business's alert rules to send emails.
 */
@Injectable()
export class TenantStreamEventsService {
  private readonly logger = new Logger(TenantStreamEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The webhook. Stores the events and answers at once, so the server does not
   * buffer and resend; alert emails are worked out afterwards. An unknown
   * server or a wrong token answers 404 without saying which.
   */
  async ingest(serverId: string, token: string, body: unknown) {
    const server = await this.prisma.tenantFlussonicServer.findFirst({
      where: { id: serverId, status: { not: 'DELETED' } },
      select: { id: true, name: true, tenantBusinessId: true, eventsEnabled: true, eventWebhookToken: true },
    });
    if (!server?.eventWebhookToken || !sameSecret(token, server.eventWebhookToken)) {
      throw new NotFoundException();
    }
    // Events switched off here but still configured on the server are accepted and dropped.
    if (!server.eventsEnabled) return { accepted: 0 };

    const receivedAt = now();
    const incoming = normalizeIncomingEvents(body, receivedAt);
    if (incoming.length === 0) return { accepted: 0 };

    const medias = [...new Set(incoming.map((e) => e.media).filter((m): m is string => !!m))];
    const streams = medias.length
      ? await this.prisma.tenantStream.findMany({
          where: { tenantFlussonicServerId: server.id, name: { in: medias }, status: { not: 'DELETED' } },
          select: { id: true, name: true, tenantCustomerId: true },
        })
      : [];
    const streamByName = new Map(streams.map((s) => [s.name, s]));

    const stored: StoredEvent[] = incoming.map((e) => {
      const stream = e.media ? streamByName.get(e.media) : undefined;
      return {
        id: newId(),
        event: e.event,
        media: e.media,
        occurredAt: e.occurredAt,
        payload: e.payload,
        tenantStreamId: stream?.id ?? null,
        tenantCustomerId: stream?.tenantCustomerId ?? null,
      };
    });
    await this.prisma.tenantStreamEvent.createMany({
      data: stored.map((e) => ({
        id: e.id,
        tenantBusinessId: server.tenantBusinessId,
        tenantFlussonicServerId: server.id,
        tenantStreamId: e.tenantStreamId,
        tenantCustomerId: e.tenantCustomerId,
        event: e.event,
        media: e.media,
        occurredAt: e.occurredAt,
        payload: e.payload as Prisma.InputJsonValue,
        createdAt: receivedAt,
      })),
    });

    void this.processAlerts(server, stored).catch((error) =>
      this.logger.error(`Alert processing failed for ${server.name}: ${errorMessage(error)}`),
    );
    return { accepted: stored.length };
  }

  /** Matches stored events against active rules and sends the emails, one event at a time. */
  private async processAlerts(
    server: { id: string; name: string; tenantBusinessId: string },
    events: StoredEvent[],
  ) {
    const rules = (
      await this.prisma.tenantEventAlertRule.findMany({
        where: { tenantBusinessId: server.tenantBusinessId, status: 'ACTIVE' },
      })
    ).map((rule) => ({
      row: rule,
      scope: {
        events: jsonStringArray(rule.events),
        serverIds: jsonStringArray(rule.serverIds),
        streamIds: jsonStringArray(rule.streamIds),
        customerIds: jsonStringArray(rule.customerIds),
      },
      recipients: jsonStringArray(rule.recipients),
    }));
    if (rules.length === 0) return;

    const mailConfig = await this.prisma.tenantMailConfig.findFirst({
      where: { tenantBusinessId: server.tenantBusinessId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const streamIds = [...new Set(events.map((e) => e.tenantStreamId).filter((id): id is string => !!id))];
    const customerIds = [...new Set(events.map((e) => e.tenantCustomerId).filter((id): id is string => !!id))];
    const [streams, customers] = await Promise.all([
      this.prisma.tenantStream.findMany({ where: { id: { in: streamIds } }, select: { id: true, name: true, title: true } }),
      this.prisma.tenantCustomer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, customerCode: true, fName: true, lName: true, email: true },
      }),
    ]);
    const streamById = new Map(streams.map((s) => [s.id, s]));
    const customerById = new Map(customers.map((c) => [c.id, c]));

    // Only read when a matching rule emails the server's customers.
    let serverCustomerEmails: string[] | null = null;
    const loadServerCustomerEmails = async () => {
      if (serverCustomerEmails === null) {
        const assignments = await this.prisma.tenantCustomerServer.findMany({
          where: {
            tenantFlussonicServerId: server.id,
            status: 'ACTIVE',
            tenantCustomer: { status: { not: 'DELETED' }, email: { not: null } },
          },
          select: { tenantCustomer: { select: { email: true } } },
        });
        serverCustomerEmails = assignments
          .map((assignment) => assignment.tenantCustomer.email)
          .filter((email): email is string => !!email);
      }
      return serverCustomerEmails;
    };

    for (const event of events) {
      const matched = rules.filter((rule) =>
        ruleMatches(rule.scope, {
          event: event.event,
          serverId: server.id,
          streamId: event.tenantStreamId,
          customerId: event.tenantCustomerId,
        }),
      );
      if (matched.length === 0) continue;

      const stream = event.tenantStreamId ? streamById.get(event.tenantStreamId) : undefined;
      const customer = event.tenantCustomerId ? customerById.get(event.tenantCustomerId) : undefined;
      const key = cooldownKey(event.tenantStreamId, event.media);
      const outcomes: RuleOutcome[] = [];
      let lastError: string | null = null;

      for (const rule of matched) {
        const at = now();
        const cooldown = await this.prisma.tenantEventAlertCooldown.findUnique({
          where: { tenantEventAlertRuleId_targetKey: { tenantEventAlertRuleId: rule.row.id, targetKey: key } },
        });
        if (cooldownActive(cooldown ? Number(cooldown.lastSentAt) : null, at, rule.row.cooldownMinutes)) {
          outcomes.push('COOLDOWN');
          continue;
        }
        if (!mailConfig) {
          outcomes.push('NO_MAIL_CONFIG');
          continue;
        }
        const to = alertRecipients(rule.recipients, []);
        // Customers are Bcc'd so those sharing a server never see each other's address.
        const bcc = customerBcc(
          rule.row.customerRecipients,
          customer?.email,
          rule.row.customerRecipients === 'SERVER_CUSTOMERS' ? await loadServerCustomerEmails() : [],
          to,
        );
        if (to.length === 0 && bcc.length === 0) {
          outcomes.push('FAILED');
          lastError = `"${rule.row.name}" has no one to email for this stream`;
          continue;
        }

        const streamLabel = stream ? `${stream.title} (${stream.name})` : (event.media ?? 'unknown media');
        try {
          await sendSmtpMail(mailConfig, {
            ...(to.length ? { to } : {}),
            bcc,
            subject: `[${server.name}] ${event.event} - ${streamLabel}`,
            text: [
              `Alert: ${rule.row.name}`,
              '',
              `Event:    ${event.event}`,
              `Server:   ${server.name}`,
              `Stream:   ${streamLabel}`,
              ...(customer ? [`Customer: ${customerName(customer)} (${customer.customerCode})`] : []),
              `Time:     ${new Date(event.occurredAt * 1000).toLocaleString('en-GB', { timeZone: appTimezone() })}`,
              ...(typeof event.payload.reason === 'string' ? [`Reason:   ${event.payload.reason}`] : []),
              ...(rule.row.cooldownMinutes > 0
                ? ['', `Further alerts from this rule for this stream are held for ${rule.row.cooldownMinutes} minute(s).`]
                : []),
            ].join('\n'),
          });
          await this.prisma.tenantEventAlertCooldown.upsert({
            where: { tenantEventAlertRuleId_targetKey: { tenantEventAlertRuleId: rule.row.id, targetKey: key } },
            create: { tenantEventAlertRuleId: rule.row.id, targetKey: key, lastSentAt: at },
            update: { lastSentAt: at },
          });
          await this.prisma.tenantEventAlertRule.update({ where: { id: rule.row.id }, data: { lastTriggeredAt: at } });
          outcomes.push('SENT');
        } catch (error) {
          outcomes.push('FAILED');
          lastError = `"${rule.row.name}": ${errorMessage(error)}`;
        }
      }

      const status = aggregateEmailStatus(outcomes);
      await this.prisma.tenantStreamEvent.update({
        where: { id: event.id },
        data: { emailStatus: status, emailError: status === 'FAILED' && lastError ? lastError.slice(0, 500) : null },
      });
    }
  }

  // ---------- Event log ----------

  async optionsForTenantUser(tenantUserId: string) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const [servers, streams] = await Promise.all([
      this.prisma.tenantFlussonicServer.findMany({
        where: { tenantBusinessId: businessId, status: { not: 'DELETED' } },
        select: { id: true, name: true, eventsEnabled: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.tenantStream.findMany({
        where: { tenantBusinessId: businessId, status: { not: 'DELETED' } },
        select: { id: true, name: true, title: true, tenantFlussonicServerId: true },
        orderBy: { title: 'asc' },
      }),
    ]);
    return {
      eventGroups: STREAM_EVENT_GROUPS,
      retentionDays: RETENTION_DAYS,
      servers,
      streams: streams.map((s) => ({ id: s.id, name: s.name, title: s.title, serverId: s.tenantFlussonicServerId })),
    };
  }

  async listForTenantUser(tenantUserId: string, query: StreamEventListQueryDto) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const { page, limit, search, tenantFlussonicServerId, tenantStreamId, event, emailStatus, from, to } = query;
    const where: Prisma.TenantStreamEventWhereInput = {
      tenantBusinessId: businessId,
      ...(tenantFlussonicServerId ? { tenantFlussonicServerId } : {}),
      ...(tenantStreamId ? { tenantStreamId } : {}),
      ...(event ? { event } : {}),
      ...(emailStatus ? { emailStatus } : {}),
      ...(search ? { media: { contains: search } } : {}),
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: dayStart(from, 'from') } : {}),
              // `to` is inclusive: everything before the start of the next day.
              ...(to ? { lt: addDuration(dayStart(to, 'to'), 1, 'DAY') } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantStreamEvent.findMany({
        where,
        include: {
          tenantFlussonicServer: { select: { id: true, name: true } },
          tenantStream: { select: { id: true, name: true, title: true } },
          tenantCustomer: { select: { id: true, customerCode: true, fName: true, lName: true } },
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        ...paginate(page, limit),
      }),
      this.prisma.tenantStreamEvent.count({ where }),
    ]);
    return listResponse(
      items.map(({ tenantFlussonicServer, tenantStream, tenantCustomer, ...row }) => ({
        ...row,
        server: tenantFlussonicServer,
        stream: tenantStream,
        customer: tenantCustomer
          ? { id: tenantCustomer.id, customerCode: tenantCustomer.customerCode, name: customerName(tenantCustomer) }
          : null,
      })),
      total,
      page,
      limit,
    );
  }

  /** Drops events past the retention window, once a day. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'stream-events-retention' })
  async purgeOldEvents() {
    try {
      const { count } = await this.prisma.tenantStreamEvent.deleteMany({
        where: { createdAt: { lt: now() - RETENTION_DAYS * 86400 } },
      });
      if (count) this.logger.log(`Removed ${count} stream event(s) older than ${RETENTION_DAYS} days`);
    } catch (error) {
      this.logger.error(`Stream event retention failed: ${errorMessage(error)}`);
    }
  }
}
