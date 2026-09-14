import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type TenantEventAlertRule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import { sendSmtpMail } from '../common/utils/mail.util';
import { getMappedBusinessId } from '../tenant-billing/billing-scope';
import {
  DEFAULT_EVENT_TYPES,
  STREAM_EVENT_GROUPS,
  alertRecipients,
  jsonStringArray,
  sanitizeEventTypes,
} from './stream-events.logic';
import {
  CreateEventAlertRuleDto,
  EventAlertRuleListQueryDto,
  UpdateEventAlertRuleDto,
} from './dto/stream-events.dto';

/** JSON columns leave as plain arrays. */
export function serializeRule(row: TenantEventAlertRule) {
  const { events, serverIds, streamIds, customerIds, recipients, ...rest } = row;
  return {
    ...rest,
    events: jsonStringArray(events),
    serverIds: jsonStringArray(serverIds),
    streamIds: jsonStringArray(streamIds),
    customerIds: jsonStringArray(customerIds),
    recipients: jsonStringArray(recipients),
  };
}

const customerName = (c: { fName: string; lName: string | null }) => [c.fName, c.lName].filter(Boolean).join(' ');

/**
 * Email alert rules on stream events, scoped to the caller's business. A rule
 * lists any number of events, optionally narrowed to servers, streams and
 * customers, and who to email.
 */
@Injectable()
export class TenantEventAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everything the rule form picks from. */
  async optionsForTenantUser(tenantUserId: string) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const [servers, streams, customers, mailConfig] = await Promise.all([
      this.prisma.tenantFlussonicServer.findMany({
        where: { tenantBusinessId: businessId, status: { not: 'DELETED' } },
        select: { id: true, name: true, eventsEnabled: true, eventTypes: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.tenantStream.findMany({
        where: { tenantBusinessId: businessId, status: { not: 'DELETED' } },
        select: { id: true, name: true, title: true, tenantFlussonicServerId: true, tenantCustomerId: true },
        orderBy: { title: 'asc' },
      }),
      this.prisma.tenantCustomer.findMany({
        where: { tenantBusinessId: businessId, status: { not: 'DELETED' } },
        select: { id: true, customerCode: true, fName: true, lName: true, email: true },
        orderBy: { fName: 'asc' },
      }),
      this.prisma.tenantMailConfig.findFirst({
        where: { tenantBusinessId: businessId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    return {
      eventGroups: STREAM_EVENT_GROUPS,
      defaultEvents: DEFAULT_EVENT_TYPES,
      mailConfigured: !!mailConfig,
      servers: servers.map((s) => ({ id: s.id, name: s.name, eventsEnabled: s.eventsEnabled, eventTypes: sanitizeEventTypes(s.eventTypes) })),
      streams: streams.map((s) => ({ id: s.id, name: s.name, title: s.title, serverId: s.tenantFlussonicServerId, customerId: s.tenantCustomerId })),
      customers: customers.map((c) => ({ id: c.id, customerCode: c.customerCode, name: customerName(c), email: c.email })),
    };
  }

  async listForTenantUser(tenantUserId: string, query: EventAlertRuleListQueryDto) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const { page, limit, search, status } = query;
    const where: Prisma.TenantEventAlertRuleWhereInput = {
      tenantBusinessId: businessId,
      status: status ?? { not: 'DELETED' },
      ...(search ? { name: { contains: search } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantEventAlertRule.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(page, limit) }),
      this.prisma.tenantEventAlertRule.count({ where }),
    ]);
    return listResponse(items.map(serializeRule), total, page, limit);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    return serializeRule(await this.findRow(businessId, id));
  }

  async createForTenantUser(tenantUserId: string, dto: CreateEventAlertRuleDto) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    await this.assertScope(businessId, dto);
    const timestamp = now();
    const row = await this.prisma.tenantEventAlertRule.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('EAR'),
        tenantBusinessId: businessId,
        name: dto.name,
        events: dto.events,
        serverIds: dto.serverIds,
        streamIds: dto.streamIds,
        customerIds: dto.customerIds,
        recipients: dto.recipients,
        customerRecipients: dto.customerRecipients,
        cooldownMinutes: dto.cooldownMinutes,
        status: dto.status,
        createdAt: timestamp,
        createdBy: tenantUserId,
        updatedAt: timestamp,
        updatedBy: tenantUserId,
      },
    });
    return serializeRule(row);
  }

  async updateForTenantUser(tenantUserId: string, id: string, dto: UpdateEventAlertRuleDto) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const existing = await this.findRow(businessId, id);
    await this.assertScope(businessId, dto);

    const recipients = dto.recipients ?? jsonStringArray(existing.recipients);
    const customerRecipients = dto.customerRecipients ?? existing.customerRecipients;
    if (recipients.length === 0 && customerRecipients === 'NONE') {
      throw new BadRequestException('Add at least one recipient, or choose customers to email');
    }

    const row = await this.prisma.tenantEventAlertRule.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.events !== undefined ? { events: dto.events } : {}),
        ...(dto.serverIds !== undefined ? { serverIds: dto.serverIds } : {}),
        ...(dto.streamIds !== undefined ? { streamIds: dto.streamIds } : {}),
        ...(dto.customerIds !== undefined ? { customerIds: dto.customerIds } : {}),
        ...(dto.recipients !== undefined ? { recipients: dto.recipients } : {}),
        ...(dto.customerRecipients !== undefined ? { customerRecipients: dto.customerRecipients } : {}),
        ...(dto.cooldownMinutes !== undefined ? { cooldownMinutes: dto.cooldownMinutes } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        updatedAt: now(),
        updatedBy: tenantUserId,
      },
    });
    return serializeRule(row);
  }

  async removeForTenantUser(tenantUserId: string, id: string) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const existing = await this.findRow(businessId, id);
    const timestamp = now();
    await this.prisma.tenantEventAlertRule.update({
      where: { id: existing.id },
      data: { status: 'DELETED', deletedAt: timestamp, deletedBy: tenantUserId, updatedAt: timestamp, updatedBy: tenantUserId },
    });
    return { success: true };
  }

  /** Sends a sample alert to the rule's recipient addresses, to check delivery. */
  async testForTenantUser(tenantUserId: string, id: string) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const rule = await this.findRow(businessId, id);
    const mailConfig = await this.prisma.tenantMailConfig.findFirst({
      where: { tenantBusinessId: businessId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!mailConfig) throw new BadRequestException('Set up Mail Config first - alerts are sent through it');

    const recipients = alertRecipients(jsonStringArray(rule.recipients), []);
    if (recipients.length === 0) {
      throw new BadRequestException(
        'This rule has no recipient addresses to test. Customer emails are only known when a real event arrives.',
      );
    }
    try {
      await sendSmtpMail(mailConfig, {
        to: recipients,
        subject: `[Test] ${rule.name}`,
        text: [
          `This is a test of the "${rule.name}" stream event alert.`,
          '',
          `Events: ${jsonStringArray(rule.events).join(', ') || '(none - this rule never fires)'}`,
          `Cooldown: ${rule.cooldownMinutes} minute(s) per stream`,
          '',
          'Real alerts name the event, server, stream, customer and time.',
        ].join('\n'),
      });
    } catch (error) {
      throw new BadRequestException(`Could not send the test alert: ${error instanceof Error ? error.message : error}`);
    }
    return { success: true, recipients };
  }

  private async findRow(businessId: string, id: string) {
    const row = await this.prisma.tenantEventAlertRule.findFirst({
      where: { id, tenantBusinessId: businessId, status: { not: 'DELETED' } },
    });
    if (!row) throw new NotFoundException('Alert rule not found');
    return row;
  }

  /** Every scoped id must belong to the business. */
  private async assertScope(
    businessId: string,
    dto: { serverIds?: string[]; streamIds?: string[]; customerIds?: string[] },
  ) {
    const check = async (label: string, ids: string[] | undefined, count: (ids: string[]) => Promise<number>) => {
      if (!ids || ids.length === 0) return;
      const unique = [...new Set(ids)];
      if ((await count(unique)) !== unique.length) {
        throw new BadRequestException(`One or more ${label} do not belong to your business`);
      }
    };
    await check('servers', dto.serverIds, (ids) =>
      this.prisma.tenantFlussonicServer.count({ where: { id: { in: ids }, tenantBusinessId: businessId, status: { not: 'DELETED' } } }),
    );
    await check('streams', dto.streamIds, (ids) =>
      this.prisma.tenantStream.count({ where: { id: { in: ids }, tenantBusinessId: businessId, status: { not: 'DELETED' } } }),
    );
    await check('customers', dto.customerIds, (ids) =>
      this.prisma.tenantCustomer.count({ where: { id: { in: ids }, tenantBusinessId: businessId, status: { not: 'DELETED' } } }),
    );
  }
}
