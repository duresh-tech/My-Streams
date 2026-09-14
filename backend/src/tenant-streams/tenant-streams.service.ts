import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import { defaultProtocols, parseProtocols } from './stream-protocols';
import {
  CreateTenantStreamDto,
  CreateTenantStreamSelfDto,
  UpdateTenantStreamDto,
  UpdateTenantStreamSelfDto,
} from './dto/tenant-stream.dto';
import { TenantStreamListQueryDto } from './dto/tenant-stream-query.dto';
import { TenantStreamSyncService } from './tenant-stream-sync.service';
import { assertServerActive } from './tenant-stream-sync.service';
import { graceDaysFor, loadCoverage, streamAccess } from '../tenant-billing/billing-access';

const STREAM_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
  tenantFlussonicServer: {
    // status and connectionStatus travel with the stream so a list can show
    // which server is usable without a second request per row.
    select: {
      id: true,
      systemCode: true,
      name: true,
      status: true,
      connectionStatus: true,
      hostName: true,
      hostPort: true,
      useSSL: true,
    },
  },
  tenantCustomer: { select: { id: true, customerCode: true, fName: true, lName: true } },
  inputs: { orderBy: { priority: 'asc' } },
} satisfies Prisma.TenantStreamInclude;

/**
 * The server's identity for a stream. The application prefix is optional:
 * Flussonic accepts both `live/ch01` and a bare `demo`.
 */
export function buildStreamName(
  applicationName: string | null | undefined,
  streamKey: string,
): string {
  return applicationName ? `${applicationName}/${streamKey}` : streamKey;
}

type StreamRow = Prisma.TenantStreamGetPayload<{ include: typeof STREAM_INCLUDE }>;

/**
 * Narrows the `protocols` JSON column back to its declared shape, and renames
 * the vendor-specific columns to the neutral API names so the client apps never
 * carry the vendor name - the same contract the streaming-servers module uses.
 */
function serializeStream(stream: StreamRow) {
  const { tenantFlussonicServerId, tenantFlussonicServer, ...rest } = stream;
  return {
    ...rest,
    serverId: tenantFlussonicServerId,
    server: tenantFlussonicServer,
    protocols: parseProtocols(stream.protocols),
  };
}

@Injectable()
export class TenantStreamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: TenantStreamSyncService,
  ) {}

  /**
   * Write-through: the local change is already committed, so a server that is
   * down must not fail the request - it leaves the row PENDING_PUSH for the
   * reconcile to retry. The returned row carries the resulting syncStatus so
   * the caller can surface a warning.
   */
  private async pushAndReload(streamId: string) {
    await this.sync.pushStream(streamId);
    const reloaded = await this.prisma.tenantStream.findUnique({
      where: { id: streamId },
      include: STREAM_INCLUDE,
    });
    return reloaded ? serializeStream(reloaded) : null;
  }

  async findAll(query: TenantStreamListQueryDto) {
    return this.list(query, null);
  }

  async findOne(id: string) {
    const stream = await this.prisma.tenantStream.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: STREAM_INCLUDE,
    });
    if (!stream) throw new NotFoundException('Stream not found');
    return serializeStream(stream);
  }

  async create(dto: CreateTenantStreamDto, actorId?: string) {
    const { inputs, protocols, applicationName, streamKey, serverId, ...fields } = dto;
    await this.assertServerBelongsToBusiness(serverId, dto.tenantBusinessId);
    if (dto.tenantCustomerId) {
      await this.assertCustomerBelongsToBusiness(dto.tenantCustomerId, dto.tenantBusinessId);
    }

    const name = buildStreamName(applicationName, streamKey);
    await this.assertNameFree(serverId, name);

    const timestamp = now();
    const stream = await this.prisma.tenantStream.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('STR'),
        ...fields,
        tenantFlussonicServerId: serverId,
        applicationName,
        streamKey,
        name,
        protocols: protocols ?? defaultProtocols(),
        createdAt: timestamp,
        createdBy: actorId,
        updatedAt: timestamp,
        updatedBy: actorId,
        inputs: {
          create: inputs.map((input, index) => ({
            id: newId(),
            priority: index + 1,
            ...input,
          })),
        },
      },
      include: STREAM_INCLUDE,
    });
    return (await this.pushAndReload(stream.id)) ?? serializeStream(stream);
  }

  async update(id: string, dto: UpdateTenantStreamDto, actorId?: string) {
    const stream = await this.prisma.tenantStream.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: { tenantFlussonicServer: { select: { name: true, status: true } } },
    });
    if (!stream) throw new NotFoundException('Stream not found');
    this.assertNotMidOperation(stream.syncStatus);

    const tenantBusinessId = dto.tenantBusinessId ?? stream.tenantBusinessId;
    const effectiveServerId = dto.serverId ?? stream.tenantFlussonicServerId;
    // Checked before validating the target: a server change is refused here
    // whatever the target is, and saying so beats "does not exist for this
    // business" when the caller picked a server from another tenant.
    if (dto.serverId && dto.serverId !== stream.tenantFlussonicServerId) {
      throw new BadRequestException(
        'Changing the server is a transfer. Use the transfer endpoint so the stream is moved in a recoverable order.',
      );
    }
    // After the transfer check: "this is a transfer" is the more useful answer
    // to someone moving a stream, whatever state either server is in.
    assertServerActive(stream.tenantFlussonicServer, 'edited');
    if (dto.tenantBusinessId) {
      await this.assertServerBelongsToBusiness(effectiveServerId, tenantBusinessId);
    }
    if (dto.tenantCustomerId) {
      await this.assertCustomerBelongsToBusiness(dto.tenantCustomerId, tenantBusinessId);
    }

    const { inputs, protocols, serverId: _ignoredServerId, ...fields } = dto;
    const updated = await this.prisma.tenantStream.update({
      where: { id },
      data: {
        ...fields,
        ...(protocols !== undefined ? { protocols } : {}),
        // Inputs are positional, so an update replaces the whole list rather
        // than trying to match rows up by index.
        ...(inputs !== undefined
          ? {
              inputs: {
                deleteMany: {},
                create: inputs.map((input, index) => ({
                  id: newId(),
                  priority: index + 1,
                  ...input,
                })),
              },
            }
          : {}),
        // Any change to what we push means the server is behind again.
        syncStatus: 'PENDING_PUSH',
        updatedAt: now(),
        updatedBy: actorId,
      },
      include: STREAM_INCLUDE,
    });
    return (await this.pushAndReload(updated.id)) ?? serializeStream(updated);
  }

  /**
   * A user's switch. It always clears billing's own mark, so billing never
   * switches back on a stream a user turned off; `billingExempt` records a
   * tenant enabling a stream billing had blocked.
   */
  async setDisabled(id: string, disabled: boolean, actorId?: string, billingExempt?: boolean) {
    const stream = await this.prisma.tenantStream.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: { tenantFlussonicServer: { select: { name: true, status: true } } },
    });
    if (!stream) throw new NotFoundException('Stream not found');
    this.assertNotMidOperation(stream.syncStatus);
    assertServerActive(stream.tenantFlussonicServer, disabled ? 'disabled' : 'enabled');

    const updated = await this.prisma.tenantStream.update({
      where: { id },
      data: {
        disabled,
        billingDisabledAt: null,
        ...(billingExempt !== undefined ? { billingExempt } : {}),
        syncStatus: 'PENDING_PUSH',
        updatedAt: now(),
        updatedBy: actorId,
      },
      include: STREAM_INCLUDE,
    });
    return (await this.pushAndReload(updated.id)) ?? serializeStream(updated);
  }

  /**
   * Billing's own switch, used by the lifecycle job. Marks the streams it
   * turns off so only those come back on when the bill is paid. Pushed when the
   * server is active; otherwise left PENDING_PUSH for the reconcile.
   */
  async setBillingDisabled(id: string, disabled: boolean) {
    const stream = await this.prisma.tenantStream.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: { tenantFlussonicServer: { select: { status: true } } },
    });
    if (!stream) return;
    this.assertNotMidOperation(stream.syncStatus);

    const timestamp = now();
    await this.prisma.tenantStream.update({
      where: { id },
      data: {
        disabled,
        billingDisabledAt: disabled ? timestamp : null,
        syncStatus: 'PENDING_PUSH',
        updatedAt: timestamp,
      },
    });
    if (stream.tenantFlussonicServer.status === 'ACTIVE') await this.sync.pushStream(id);
  }

  async remove(id: string, actorId?: string) {
    const stream = await this.prisma.tenantStream.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!stream) throw new NotFoundException('Stream not found');
    this.assertNotMidOperation(stream.syncStatus);

    const timestamp = now();
    await this.prisma.tenantStream.update({
      where: { id },
      data: {
        status: 'DELETED',
        // The row is gone for us but still configured on the server until a
        // push removes it.
        syncStatus: 'PENDING_PUSH',
        deletedAt: timestamp,
        deletedBy: actorId,
        updatedAt: timestamp,
        updatedBy: actorId,
      },
    });
    // A stream that is deleted here must stop existing on the server too,
    // otherwise it keeps consuming capacity and serving viewers.
    const syncStatus = await this.sync.deleteRemote(id);
    return { success: true, syncStatus };
  }

  async restore(id: string, actorId?: string) {
    const stream = await this.prisma.tenantStream.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!stream) throw new NotFoundException('Stream not found or not deleted');
    // The name may have been taken by another stream while this one was deleted.
    await this.assertNameFree(stream.tenantFlussonicServerId, stream.name, id);

    const restored = await this.prisma.tenantStream.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        syncStatus: 'PENDING_PUSH',
        deletedAt: null,
        deletedBy: null,
        updatedAt: now(),
        updatedBy: actorId,
      },
      include: STREAM_INCLUDE,
    });
    return (await this.pushAndReload(restored.id)) ?? serializeStream(restored);
  }

  /**
   * Shared list query. `businessScope` is null for system callers.
   * Tenant callers must not receive streams whose host server was soft-deleted.
   */
  private async list(
    query: TenantStreamListQueryDto,
    businessScope: string | null,
    excludeDeletedServers = false,
  ) {
    const {
      page,
      limit,
      search,
      status,
      syncStatus,
      tenantBusinessId,
      serverId,
      tenantCustomerId,
      disabled,
      sortBy,
      sortOrder,
    } = query;

    const where: Prisma.TenantStreamWhereInput = {
      status: status ? status : { not: 'DELETED' },
      ...(businessScope ? { tenantBusinessId: businessScope } : {}),
      ...(excludeDeletedServers
        ? { tenantFlussonicServer: { status: { not: 'DELETED' } } }
        : {}),
      ...(tenantBusinessId && !businessScope ? { tenantBusinessId } : {}),
      ...(syncStatus ? { syncStatus } : {}),
      ...(serverId ? { tenantFlussonicServerId: serverId } : {}),
      ...(tenantCustomerId ? { tenantCustomerId } : {}),
      ...(disabled !== undefined ? { disabled } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { title: { contains: search } },
              { streamKey: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantStream.findMany({
        where,
        include: STREAM_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantStream.count({ where }),
    ]);
    return listResponse(items.map(serializeStream), total, page, limit);
  }

  private assertNotMidOperation(syncStatus: string) {
    if (syncStatus === 'RENAMING' || syncStatus === 'TRANSFERRING') {
      throw new BadRequestException(
        'This stream is in the middle of a rename or transfer. Wait for it to finish.',
      );
    }
  }

  private async assertNameFree(serverId: string, name: string, excludeId?: string) {
    const existing = await this.prisma.tenantStream.findFirst({
      where: { tenantFlussonicServerId: serverId, name, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) {
      throw new BadRequestException(`Stream "${name}" already exists on this server`);
    }
  }

  private async assertServerBelongsToBusiness(serverId: string, tenantBusinessId: string) {
    const server = await this.prisma.tenantFlussonicServer.findFirst({
      where: { id: serverId, tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!server) {
      throw new BadRequestException('Server does not exist for this business');
    }
  }

  private async assertCustomerBelongsToBusiness(customerId: string, tenantBusinessId: string) {
    const customer = await this.prisma.tenantCustomer.findFirst({
      where: { id: customerId, tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!customer) {
      throw new BadRequestException('Customer does not exist for this business');
    }
  }

  // ---------- Tenant self-service (scoped to the caller's business) ----------

  async findAllForTenantUser(tenantUserId: string, query: TenantStreamListQueryDto) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    return this.list(query, tenantBusinessId, true);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    const stream = await this.prisma.tenantStream.findFirst({
      where: { id, tenantBusinessId, status: { not: 'DELETED' } },
      include: STREAM_INCLUDE,
    });
    if (!stream) throw new NotFoundException('Stream not found');
    return serializeStream(stream);
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantStreamSelfDto) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    return this.create({ ...dto, tenantBusinessId }, tenantUserId);
  }

  async updateForTenantUser(tenantUserId: string, id: string, dto: UpdateTenantStreamSelfDto) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.update(id, dto, tenantUserId);
  }

  async setDisabledForTenantUser(
    tenantUserId: string,
    id: string,
    disabled: boolean,
    canOverrideBilling = false,
  ) {
    await this.findOneForTenantUser(tenantUserId, id);
    // Switching off by hand ends any billing exemption.
    if (disabled) return this.setDisabled(id, true, tenantUserId, false);

    const stream = await this.prisma.tenantStream.findUniqueOrThrow({
      where: { id },
      select: { id: true, tenantBusinessId: true, tenantCustomerId: true, tenantFlussonicServerId: true },
    });
    if (stream.tenantCustomerId) {
      const [subscriptions, graceDays] = await Promise.all([
        loadCoverage(this.prisma, { tenantCustomerId: stream.tenantCustomerId }),
        graceDaysFor(this.prisma, stream.tenantBusinessId),
      ]);
      if (streamAccess(stream, subscriptions, now(), graceDays).state === 'BLOCKED') {
        if (!canOverrideBilling) {
          throw new ForbiddenException(
            "This customer's stream has no active bill. Enabling it anyway requires tenant-streams:override_billing.",
          );
        }
        return this.setDisabled(id, false, tenantUserId, true);
      }
    }
    return this.setDisabled(id, false, tenantUserId);
  }

  async removeForTenantUser(tenantUserId: string, id: string) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.remove(id, tenantUserId);
  }

  async viewForTenantUser(tenantUserId: string, id: string) {
    const stream = await this.findOneForTenantUser(tenantUserId, id);
    return { stream, ...(await this.sync.viewStream(id)) };
  }

  async sessionsForTenantUser(tenantUserId: string, id: string) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.sync.streamSessions(id);
  }

  async reloadForTenantUser(tenantUserId: string, id: string) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.sync.reloadStream(id, tenantUserId);
  }

  async renameForTenantUser(
    tenantUserId: string,
    id: string,
    next: { applicationName?: string; streamKey: string },
  ) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.sync.renameStream(id, next, tenantUserId);
  }

  async syncAllForTenantUser(tenantUserId: string) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    return this.sync.reconcileBusiness(tenantBusinessId, tenantUserId);
  }

  async listAllUnmanagedForTenantUser(tenantUserId: string) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    return this.sync.listUnmanagedForBusiness(tenantBusinessId);
  }

  async adoptAllForTenantUser(tenantUserId: string, serverId: string) {
    await this.assertServerForTenantUser(tenantUserId, serverId);
    return this.sync.adoptAll(serverId, { actorId: tenantUserId });
  }

  async syncServerForTenantUser(tenantUserId: string, serverId: string) {
    await this.assertServerForTenantUser(tenantUserId, serverId);
    return this.sync.reconcileServer(serverId, tenantUserId);
  }

  async listUnmanagedForTenantUser(tenantUserId: string, serverId: string) {
    await this.assertServerForTenantUser(tenantUserId, serverId);
    return this.sync.listUnmanaged(serverId);
  }

  async adoptForTenantUser(
    tenantUserId: string,
    serverId: string,
    name: string,
    tenantCustomerId?: string,
  ) {
    const tenantBusinessId = await this.assertServerForTenantUser(tenantUserId, serverId);
    if (tenantCustomerId) {
      await this.assertCustomerBelongsToBusiness(tenantCustomerId, tenantBusinessId);
    }
    return this.sync.adoptStream(serverId, name, { tenantCustomerId, actorId: tenantUserId });
  }

  /** Resolves the caller's business and checks the server belongs to it. */
  private async assertServerForTenantUser(tenantUserId: string, serverId: string) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    await this.assertServerBelongsToBusiness(serverId, tenantBusinessId);
    return tenantBusinessId;
  }

  private async getMappedBusinessId(tenantUserId: string): Promise<string> {
    const mapping = await this.prisma.tenantMappedBusiness.findFirst({
      where: { tenantUserId, status: 'ACTIVE' },
      select: { tenantBusinessId: true },
    });
    if (!mapping) {
      throw new ForbiddenException('Your account is not mapped to a business');
    }
    return mapping.tenantBusinessId;
  }
}
