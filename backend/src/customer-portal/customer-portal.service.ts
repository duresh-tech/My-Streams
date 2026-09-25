import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TenantSubscriptionStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { now } from '../common/utils/id.util';
import { TenantStreamsService } from '../tenant-streams/tenant-streams.service';
import { TenantStreamSyncService } from '../tenant-streams/tenant-stream-sync.service';
import { buildStreamUrls } from '../tenant-streams/stream-urls';
import { parseProtocols } from '../tenant-streams/stream-protocols';
import { TenantFlussonicServersService } from '../tenant-flussonic-servers/tenant-flussonic-servers.service';
import {
  type AccessStream,
  graceDaysFor,
  loadCoverage,
  streamAccess,
} from '../tenant-billing/billing-access';
import { CustomerAuthUser } from '../common/decorators/current-customer.decorator';
import {
  CustomerCreateStreamDto,
  CustomerUpdateStreamDto,
} from './dto/customer-portal.dto';
import {
  UpdateCustomerCredentialsDto,
  UpdateCustomerProfileDto,
} from './dto/customer-profile.dto';
import { StorageService } from '../storage/storage.service';
import { toWebpImage } from '../common/utils/image.util';

const STREAM_INCLUDE = {
  tenantFlussonicServer: {
    select: {
      id: true,
      systemCode: true,
      name: true,
      // The portal shows the server's state on each stream, and disables the
      // actions that cannot work while it is not ACTIVE.
      status: true,
      connectionStatus: true,
      hostName: true,
      hostPort: true,
      useSSL: true,
      domain: true,
      httpPort: true,
      httpsPort: true,
      rtmpPort: true,
      rtspPort: true,
      srtPort: true,
    },
  },
  inputs: { orderBy: { priority: 'asc' } },
} satisfies Prisma.TenantStreamInclude;

type CustomerStreamRow = Prisma.TenantStreamGetPayload<{ include: typeof STREAM_INCLUDE }>;

/** A server that was deleted is gone for the customer: nothing on it is listed or reachable. */
const SERVER_NOT_DELETED = { status: { not: 'DELETED' } } satisfies Prisma.TenantFlussonicServerWhereInput;

const LIVE_SUBSCRIPTION_STATUSES: TenantSubscriptionStatus[] = ['PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'];

const LIVE_SUBSCRIPTION_SELECT = {
  status: true,
  subscriptionFor: true,
  planName: true,
  currentPeriodEnd: true,
  tenantCustomerServerId: true,
  tenantStreamId: true,
  tenantFlussonicServerId: true,
  invoiceItems: {
    where: { tenantInvoice: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } },
    select: {
      tenantInvoice: {
        select: { id: true, invoiceNumber: true, currency: true, grandTotal: true, amountPaid: true },
      },
    },
    take: 1,
  },
} satisfies Prisma.TenantSubscriptionSelect;

type LiveSubscription = Prisma.TenantSubscriptionGetPayload<{ select: typeof LIVE_SUBSCRIPTION_SELECT }>;

/**
 * The bill status shown on a server or stream: the plan, how long it runs, and
 * any invoice still waiting to be paid. Null when the service is not billed.
 */
function billingSummary(subscription: LiveSubscription | undefined) {
  if (!subscription) return null;
  const open = subscription.invoiceItems[0]?.tenantInvoice;
  return {
    /** STREAM: billed on its own. SERVER: covered by the plan on its server. */
    billedAs: subscription.subscriptionFor,
    status: subscription.status,
    planName: subscription.planName,
    currentPeriodEnd:
      subscription.currentPeriodEnd === null ? null : Number(subscription.currentPeriodEnd),
    openInvoice: open
      ? {
          id: open.id,
          invoiceNumber: open.invoiceNumber,
          currency: open.currency,
          balanceDue: Number(open.grandTotal.minus(open.amountPaid)),
        }
      : null,
  };
}

/**
 * Strips what a customer has no business seeing - sync bookkeeping, the config
 * hash, who edited it - and renames the vendor column to the neutral API name.
 */
function serializeForCustomer(stream: CustomerStreamRow) {
  const {
    tenantFlussonicServerId,
    tenantFlussonicServer,
    configHash,
    syncStatus,
    namedBy,
    createdBy,
    updatedBy,
    deletedBy,
    lastSyncedAt,
    tenantBusinessId,
    ...rest
  } = stream;
  return {
    ...rest,
    protocols: parseProtocols(stream.protocols),
    serverId: tenantFlussonicServerId,
    server: tenantFlussonicServer
      ? {
          id: tenantFlussonicServer.id,
          name: tenantFlussonicServer.name,
          status: tenantFlussonicServer.status,
          connectionStatus: tenantFlussonicServer.connectionStatus,
        }
      : undefined,
  };
}

/**
 * The profile fields a customer may see. Everything absent is either the
 * tenant's own bookkeeping or a secret: the password hash, the remark, the
 * notification and portal-access flags, and the audit columns.
 */
const PROFILE_SELECT = {
  id: true,
  systemCode: true,
  customerCode: true,
  username: true,
  fName: true,
  lName: true,
  fatherName: true,
  gender: true,
  dateOfBirth: true,
  primaryMobile: true,
  secondaryMobile: true,
  email: true,
  customerType: true,
  place: true,
  street: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  country: true,
  pincode: true,
  latitude: true,
  longitude: true,
  customerPicture: true,
  idProofType: true,
  idProofNumber: true,
  taxType: true,
  taxNumber: true,
  status: true,
  allowPortalAccess: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TenantCustomerSelect;

type ProfileRow = Prisma.TenantCustomerGetPayload<{ select: typeof PROFILE_SELECT }>;

/**
 * Decimal and Date do not survive JSON as the client expects them, so the
 * coordinates come out as numbers and the date of birth as a plain YYYY-MM-DD -
 * the same string the form field uses. Every other timestamp in this app is
 * epoch seconds; dateOfBirth is a DATE column with no time or zone, and
 * rendering it through a timezone would shift it by a day.
 */
function serializeProfile(row: ProfileRow) {
  const { latitude, longitude, dateOfBirth, ...rest } = row;
  return {
    ...rest,
    latitude: latitude === null ? null : Number(latitude),
    longitude: longitude === null ? null : Number(longitude),
    dateOfBirth: dateOfBirth ? dateOfBirth.toISOString().slice(0, 10) : null,
  };
}

/**
 * The customer portal.
 *
 * Every method takes the authenticated customer and scopes to it. A customer
 * has no role and no permission list: what they may touch is decided by
 * ownership (their streams) and their ACTIVE server assignments (where they may
 * add streams), what they may change by billing, and the rest by this class. That
 * is deliberate - authority lives in one place rather than being spread across
 * permission strings a customer could never be granted.
 */
@Injectable()
export class CustomerPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly streams: TenantStreamsService,
    private readonly sync: TenantStreamSyncService,
    private readonly servers: TenantFlussonicServersService,
    private readonly storage: StorageService,
  ) {}

  /** The servers assigned to this customer, with their quota, usage and bill status. */
  async listServers(customer: CustomerAuthUser) {
    const assignments = await this.prisma.tenantCustomerServer.findMany({
      where: { tenantCustomerId: customer.id, status: 'ACTIVE', tenantFlussonicServer: SERVER_NOT_DELETED },
      include: {
        tenantFlussonicServer: {
          select: { id: true, name: true, status: true, connectionStatus: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const used = await this.prisma.tenantStream.groupBy({
      by: ['tenantFlussonicServerId'],
      where: {
        tenantCustomerId: customer.id,
        status: { not: 'DELETED' },
        tenantFlussonicServerId: { in: assignments.map((a) => a.tenantFlussonicServerId) },
      },
      _count: { _all: true },
    });
    const counts = new Map(used.map((u) => [u.tenantFlussonicServerId, u._count._all]));
    const subscriptions = await this.liveSubscriptions(customer);

    return assignments.map((assignment) => {
      const streamsUsed = counts.get(assignment.tenantFlussonicServerId) ?? 0;
      // A suspended, blocked or terminated server is not one to act on, so the
      // actions are gated on the server being live. Connectivity deliberately
      // is not part of this: a server that is up but last seen unreachable is
      // exactly where a customer should still be able to press "check".
      const serverLive = assignment.tenantFlussonicServer.status === 'ACTIVE';
      const hasRoom = assignment.streamLimit === null || streamsUsed < assignment.streamLimit;
      return {
        assignmentId: assignment.id,
        serverId: assignment.tenantFlussonicServerId,
        name: assignment.tenantFlussonicServer.name,
        serverStatus: assignment.tenantFlussonicServer.status,
        connectionStatus: assignment.tenantFlussonicServer.connectionStatus,
        isDedicated: assignment.isDedicated,
        streamLimit: assignment.streamLimit,
        streamsUsed,
        streamsRemaining:
          assignment.streamLimit === null
            ? null
            : Math.max(0, assignment.streamLimit - streamsUsed),
        // A customer can only add a stream on a live server with room left.
        canCreateStream: serverLive && hasRoom,
        canCheckConnection: serverLive,
        billing: billingSummary(
          subscriptions.find(
            (s) => s.subscriptionFor === 'SERVER' && s.tenantCustomerServerId === assignment.id,
          ),
        ),
      };
    });
  }

  /** Newest first, so the first match for a service is its current subscription. */
  private liveSubscriptions(customer: CustomerAuthUser) {
    return this.prisma.tenantSubscription.findMany({
      where: { tenantCustomerId: customer.id, status: { in: LIVE_SUBSCRIPTION_STATUSES } },
      select: LIVE_SUBSCRIPTION_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Re-checks whether one assigned server is reachable, and nothing more.
   *
   * A customer gets connectivity only: not the stats, the version, the host or
   * the credentials state. When their stream will not play, "is the server up?"
   * is the one question they can answer for themselves, and it saves a support
   * call. The outcome is recorded on the server record like any other check, so
   * the tenant sees the same freshness the customer saw.
   */
  async checkServerConnection(customer: CustomerAuthUser, serverId: string) {
    await this.requireAssignment(customer, serverId, true);
    const server = await this.servers.checkConnection(serverId, customer.id);
    // Deliberately narrow: the full record carries host, ports and business.
    return {
      serverId: server.id,
      name: server.name,
      connectionStatus: server.connectionStatus,
      connectionCheckedAt: server.connectionCheckedAt,
    };
  }

  async listStreams(customer: CustomerAuthUser) {
    const [streams, subscriptions, accessOf] = await Promise.all([
      this.prisma.tenantStream.findMany({
        where: {
          tenantCustomerId: customer.id,
          status: { not: 'DELETED' },
          tenantFlussonicServer: SERVER_NOT_DELETED,
        },
        include: STREAM_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      this.liveSubscriptions(customer),
      this.accessResolver(customer),
    ]);
    return streams.map((stream) => ({
      ...serializeForCustomer(stream),
      access: accessOf(stream),
      // The stream's own plan, or else the server plan that covers it.
      billing: billingSummary(
        subscriptions.find((s) => s.subscriptionFor === 'STREAM' && s.tenantStreamId === stream.id) ??
          subscriptions.find(
            (s) =>
              s.subscriptionFor === 'SERVER' &&
              s.tenantFlussonicServerId === stream.tenantFlussonicServerId,
          ),
      ),
    }));
  }

  async getStream(customer: CustomerAuthUser, id: string) {
    const stream = await this.findOwnStream(customer, id);
    return { ...serializeForCustomer(stream), access: (await this.accessResolver(customer))(stream) };
  }

  /** Live stats and playback URLs, reusing the tenant-side view. */
  async viewStream(customer: CustomerAuthUser, id: string) {
    const stream = await this.findOwnStream(customer, id);
    const [view, accessOf] = await Promise.all([this.sync.viewStream(stream.id), this.accessResolver(customer)]);
    return { stream: { ...serializeForCustomer(stream), access: accessOf(stream) }, ...view };
  }

  async createStream(customer: CustomerAuthUser, dto: CustomerCreateStreamDto) {
    const assignment = await this.requireAssignment(customer, dto.serverId, true);
    await this.assertQuotaAvailable(customer, dto.serverId, assignment.streamLimit);

    // A new stream has no plan of its own yet. Unless a server plan covers it,
    // it starts switched off, and billing switches it on once it is billed.
    const accessOf = await this.accessResolver(customer);
    const blocked =
      accessOf({ id: '', tenantCustomerId: customer.id, tenantFlussonicServerId: dto.serverId }).state ===
      'BLOCKED';

    // Created through the tenant service so naming, uniqueness and the push to
    // the server behave identically however the stream was made.
    const created = await this.streams.create(
      {
        tenantBusinessId: customer.tenantBusinessId,
        serverId: dto.serverId,
        tenantCustomerId: customer.id,
        applicationName: dto.applicationName,
        streamKey: dto.streamKey,
        title: dto.title,
        useSSL: false,
        isStatic: true,
        disabled: blocked,
        inputs: dto.inputs,
        protocols: dto.protocols,
      },
      customer.id,
    );
    if (blocked) {
      await this.prisma.tenantStream.update({ where: { id: created.id }, data: { billingDisabledAt: now() } });
    }
    return created;
  }

  /**
   * A customer may change only the application name and the inputs. Title,
   * protocols, limits, the server and the customer assignment are all off
   * limits - they are commercial settings, not the customer's to move.
   */
  async updateStream(customer: CustomerAuthUser, id: string, dto: CustomerUpdateStreamDto) {
    const stream = await this.findOwnStream(customer, id);
    await this.assertBillingAllows(customer, stream, 'edited');

    // Changing the application name renames the stream on the server, which is
    // destructive, so it goes through the rename state machine rather than a
    // plain field write.
    const nextApplication = dto.applicationName?.trim() ? dto.applicationName.trim() : null;
    const applicationChanged =
      dto.applicationName !== undefined && nextApplication !== stream.applicationName;

    if (applicationChanged) {
      await this.sync.renameStream(
        stream.id,
        { applicationName: nextApplication, streamKey: stream.streamKey },
        customer.id,
      );
    }

    if (dto.inputs !== undefined) {
      return this.streams.update(stream.id, { inputs: dto.inputs }, customer.id);
    }
    return this.streams.findOne(stream.id);
  }

  async setDisabled(customer: CustomerAuthUser, id: string, disabled: boolean) {
    const stream = await this.findOwnStream(customer, id);
    // Switching off is always allowed; only switching on needs a bill.
    if (!disabled) await this.assertBillingAllows(customer, stream, 'enabled');
    return this.streams.setDisabled(stream.id, disabled, customer.id);
  }

  async reloadStream(customer: CustomerAuthUser, id: string) {
    const stream = await this.findOwnStream(customer, id);
    await this.assertBillingAllows(customer, stream, 'reloaded');
    return this.sync.reloadStream(stream.id, customer.id);
  }

  async deleteStream(customer: CustomerAuthUser, id: string) {
    const stream = await this.findOwnStream(customer, id);
    await this.assertBillingAllows(customer, stream, 'deleted');
    return this.streams.remove(stream.id, customer.id);
  }

  /**
   * Issues a new share code, which revokes every link already handed out.
   *
   * Deliberately not behind assertBillingAllows: this is how a customer shuts
   * off a link that has leaked, and refusing it over an unpaid invoice would
   * leave them unable to revoke access to their own stream.
   */
  async rotateStreamShareCode(customer: CustomerAuthUser, id: string) {
    const stream = await this.findOwnStream(customer, id);
    return this.streams.rotateShareCode(stream.id, customer.id);
  }

  /** Billing access for any of this customer's streams, from one read of their subscriptions. */
  private async accessResolver(customer: CustomerAuthUser) {
    const [subscriptions, graceDays] = await Promise.all([
      loadCoverage(this.prisma, { tenantBusinessId: customer.tenantBusinessId, tenantCustomerId: customer.id }),
      graceDaysFor(this.prisma, customer.tenantBusinessId),
    ]);
    const at = now();
    return (stream: AccessStream) => streamAccess(stream, subscriptions, at, graceDays);
  }

  /** Checked on every action, from the dates, so it never waits for the scheduled job. */
  private async assertBillingAllows(customer: CustomerAuthUser, stream: AccessStream, action: string) {
    const access = (await this.accessResolver(customer))(stream);
    if (access.state === 'BLOCKED') {
      throw new ForbiddenException(
        `This stream has no active bill, so it cannot be ${action}. Renew your plan to continue.`,
      );
    }
  }

  private async findOwnStream(customer: CustomerAuthUser, id: string) {
    const stream = await this.prisma.tenantStream.findFirst({
      // Scoped by customer id, not just stream id: a customer must never be
      // able to reach another customer's stream by guessing a UUID.
      where: {
        id,
        tenantCustomerId: customer.id,
        status: { not: 'DELETED' },
        tenantFlussonicServer: SERVER_NOT_DELETED,
      },
      include: STREAM_INCLUDE,
    });
    if (!stream) throw new NotFoundException('Stream not found');

    // Owning the stream is the access check. A stream can be attached to a
    // customer - and billed - without a server assignment; changes to it are
    // governed by billing (assertBillingAllows), and only creating a stream
    // needs an assignment, because that is where the quota lives.
    return stream;
  }

  /**
   * The assignment that lets this customer act on that server.
   *
   * `requireLiveServer` additionally refuses a server that is not ACTIVE. It is
   * asked for by the actions that reach out to the server - adding a stream,
   * checking the connection - and not by the read paths, so a customer can
   * still see what they have while a server is suspended.
   */
  private async requireAssignment(
    customer: CustomerAuthUser,
    serverId: string,
    requireLiveServer = false,
  ) {
    const assignment = await this.prisma.tenantCustomerServer.findFirst({
      where: {
        tenantCustomerId: customer.id,
        tenantFlussonicServerId: serverId,
        status: 'ACTIVE',
        tenantFlussonicServer: SERVER_NOT_DELETED,
      },
      include: { tenantFlussonicServer: { select: { status: true } } },
    });
    if (!assignment) {
      throw new ForbiddenException('This server is not assigned to you');
    }
    if (requireLiveServer && assignment.tenantFlussonicServer.status !== 'ACTIVE') {
      throw new ForbiddenException('This server is not active right now');
    }
    return assignment;
  }

  private async assertQuotaAvailable(
    customer: CustomerAuthUser,
    serverId: string,
    streamLimit: number | null,
  ) {
    if (streamLimit === null) return; // unlimited
    const used = await this.prisma.tenantStream.count({
      where: {
        tenantCustomerId: customer.id,
        tenantFlussonicServerId: serverId,
        status: { not: 'DELETED' },
      },
    });
    if (used >= streamLimit) {
      throw new BadRequestException(
        `Your stream limit for this server is reached (${used} of ${streamLimit})`,
      );
    }
  }

  // ---------- Profile ----------

  /**
   * The customer's own record, as they may see it.
   *
   * Narrower than the tenant-side view on purpose: the password hash never
   * leaves the service, and the tenant's bookkeeping - remark, notification
   * preferences, portal access - is not the customer's business.
   */
  async getProfile(customer: CustomerAuthUser) {
    const row = await this.prisma.tenantCustomer.findFirst({
      where: { id: customer.id, status: { not: 'DELETED' } },
      select: PROFILE_SELECT,
    });
    if (!row) throw new NotFoundException('Profile not found');
    return serializeProfile(row);
  }

  async updateProfile(customer: CustomerAuthUser, dto: UpdateCustomerProfileDto) {
    const existing = await this.prisma.tenantCustomer.findFirst({
      where: { id: customer.id, status: { not: 'DELETED' } },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Profile not found');

    const updated = await this.prisma.tenantCustomer.update({
      where: { id: customer.id },
      data: {
        ...dto,
        // tenant_customers keeps no actor columns, so there is nothing to
        // record the customer as the editor in; updatedAt is the whole trail.
        updatedAt: now(),
      },
      select: PROFILE_SELECT,
    });
    return serializeProfile(updated);
  }

  /**
   * Replaces the profile picture.
   *
   * The upload is validated and re-encoded as webp before it is stored, so the
   * store holds one format only, stripped of EXIF. The old file is deleted
   * afterwards: deleting first would risk losing it if the new one failed.
   */
  async updatePicture(customer: CustomerAuthUser, file?: { buffer: Buffer; size?: number }) {
    if (!file?.buffer) throw new BadRequestException('No picture provided');

    const existing = await this.prisma.tenantCustomer.findFirst({
      where: { id: customer.id, status: { not: 'DELETED' } },
      select: { customerPicture: true },
    });
    if (!existing) throw new NotFoundException('Profile not found');

    const converted = await toWebpImage(file, customer.customerCode || 'picture');
    const path = await this.storage.upload(converted, 'customer-pictures');

    const updated = await this.prisma.tenantCustomer.update({
      where: { id: customer.id },
      data: { customerPicture: path, updatedAt: now() },
      select: PROFILE_SELECT,
    });

    if (existing.customerPicture && existing.customerPicture !== path) {
      // An orphaned file is wasted storage, never a broken profile, so a
      // failed delete must not fail the request.
      await this.storage.remove(existing.customerPicture).catch(() => undefined);
    }

    return { ...serializeProfile(updated), bytes: converted.size };
  }

  /**
   * Changes the username, the password, or both.
   *
   * Every session is ended afterwards, this one included: the details the other
   * sessions were issued against no longer hold, and a password change that
   * left old sessions alive would not lock out whoever prompted it.
   *
   * Refused while a tenant admin is signed in as the customer - support may act
   * on an account, not take it over.
   */
  async updateCredentials(customer: CustomerAuthUser, dto: UpdateCustomerCredentialsDto) {
    if (customer.impersonated) {
      throw new ForbiddenException(
        'Sign-in details cannot be changed while signed in as this customer',
      );
    }

    const row = await this.prisma.tenantCustomer.findFirst({
      where: { id: customer.id, status: { not: 'DELETED' } },
      select: { id: true, username: true, passwordHash: true },
    });
    if (!row) throw new NotFoundException('Profile not found');

    const valid = row.passwordHash
      ? await argon2.verify(row.passwordHash, dto.currentPassword).catch(() => false)
      : false;
    if (!valid) throw new BadRequestException('The current password is not correct');

    const usernameChanged = !!dto.username && dto.username !== row.username;
    if (usernameChanged) {
      // Usernames are unique across the whole table, because a customer signs
      // in without naming a business.
      const taken = await this.prisma.tenantCustomer.findFirst({
        where: { username: dto.username, id: { not: customer.id } },
        select: { id: true },
      });
      if (taken) throw new BadRequestException('That username is already taken');
    }

    await this.prisma.tenantCustomer.update({
      where: { id: customer.id },
      data: {
        ...(usernameChanged ? { username: dto.username } : {}),
        ...(dto.newPassword
          ? { passwordHash: await argon2.hash(dto.newPassword, { type: argon2.argon2id }) }
          : {}),
        updatedAt: now(),
      },
    });

    await this.prisma.tenantCustomerRefreshToken.updateMany({
      where: { tenantCustomerId: customer.id, revokedAt: null },
      data: { revokedAt: now() },
    });

    return {
      success: true,
      usernameChanged,
      passwordChanged: !!dto.newPassword,
      // Tells the client to drop its token and send the customer to sign in.
      signedOut: true,
    };
  }

  /** Live play sessions for one of the customer's own streams. */
  async streamSessions(customer: CustomerAuthUser, id: string) {
    const stream = await this.findOwnStream(customer, id);
    return this.sync.streamSessions(stream.id);
  }
}
