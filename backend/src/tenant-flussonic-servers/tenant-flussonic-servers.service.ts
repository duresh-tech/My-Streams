import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { decryptSecret, encryptSecret } from '../common/utils/crypto.util';
import { streamerBaseUrl, streamerCredential } from '../common/utils/streamer.util';
import { StreamerApiService } from '../tenant-streams/streamer-api.service';
import { mapServerStats } from './server-stats.mapper';
import { listResponse, paginate } from '../common/dto/query.dto';
import {
  CreateTenantFlussonicServerDto,
  CreateTenantFlussonicServerSelfDto,
  UpdateTenantFlussonicServerDto,
  UpdateTenantFlussonicServerSelfDto,
} from './dto/tenant-flussonic-server.dto';
import { TenantFlussonicServerListQueryDto } from './dto/tenant-flussonic-server-query.dto';
import { EventSinkService } from './event-sink.service';
import {
  DEFAULT_EVENT_TYPES,
  STREAM_EVENT_GROUPS,
  sanitizeEventTypes,
} from '../tenant-stream-events/stream-events.logic';

const SERVER_INCLUDE = {
  tenantBusiness: { select: { id: true, systemCode: true, name: true } },
};

/**
 * Stored credentials are write-only. Callers only need to know whether one is
 * set, so the encrypted columns are swapped for boolean flags on the way out -
 * the same contract tenant-mail-config uses for its SMTP password.
 */
function sanitize<
  T extends {
    flussonicApiUsername: string | null;
    flussonicApiPasswordEnc: string | null;
    flussonicApiAccessToken: string | null;
    flussonicVersion: string | null;
    eventWebhookToken: string | null;
    eventTypes: unknown;
  },
>(row: T) {
  const {
    flussonicApiUsername,
    flussonicApiPasswordEnc,
    flussonicApiAccessToken,
    flussonicVersion,
    // The webhook secret authenticates the server's posts; it never leaves the backend.
    eventWebhookToken,
    eventTypes,
    ...rest
  } = row;
  return {
    ...rest,
    apiUsername: flussonicApiUsername,
    serverVersion: flussonicVersion,
    hasApiPassword: !!flussonicApiPasswordEnc,
    hasApiAccessToken: !!flussonicApiAccessToken,
    eventTypes: sanitizeEventTypes(eventTypes),
  };
}

/**
 * Flussonic Media Server has no endpoint that exchanges credentials for a
 * token - the streamer API authenticates with HTTP Basic (view_auth/edit_auth)
 * or a bearer token configured on the server itself. So the stored "access
 * token" is the ready-to-send Basic credential, derived from the API username
 * and password. It is reversible to the password and never expires.
 */
function basicToken(username: string, password: string): string {
  return Buffer.from(`${username}:${password}`).toString('base64');
}

/** How long to wait for the server's API before calling it unreachable. */
const CONNECTION_TIMEOUT_MS = 8000;

/** Fields whose change invalidates a previous connectivity result. */
const CONNECTION_FIELDS = [
  'hostName',
  'hostPort',
  'domain',
  'useSSL',
  'apiBasePath',
  'apiUsername',
  'apiPassword',
  'apiAccessToken',
] as const;

@Injectable()
export class TenantFlussonicServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly streamer: StreamerApiService,
    private readonly eventSinks: EventSinkService,
  ) {}

  async findAll(query: TenantFlussonicServerListQueryDto) {
    return this.list(query, null);
  }

  async findOne(id: string) {
    const server = await this.prisma.tenantFlussonicServer.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: SERVER_INCLUDE,
    });
    if (!server) throw new NotFoundException('Server not found');
    return sanitize(server);
  }

  async create(dto: CreateTenantFlussonicServerDto, actorId?: string) {
    await this.assertBusinessExists(dto.tenantBusinessId);
    await this.assertNameUnique(dto.tenantBusinessId, dto.name);

    const { apiUsername, apiPassword, apiAccessToken, serverVersion, ...rest } = dto;
    const timestamp = now();
    const server = await this.prisma.tenantFlussonicServer.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('FLS'),
        ...rest,
        eventTypes: dto.eventTypes ?? DEFAULT_EVENT_TYPES,
        flussonicApiUsername: apiUsername,
        flussonicVersion: serverVersion,
        flussonicApiPasswordEnc: apiPassword ? encryptSecret(apiPassword) : undefined,
        flussonicApiAccessToken: this.resolveAccessToken(apiAccessToken, apiUsername, apiPassword),
        createdAt: timestamp,
        createdBy: actorId,
        updatedAt: timestamp,
        updatedBy: actorId,
      },
      include: SERVER_INCLUDE,
    });
    return this.syncEventSinkIfNeeded(server.id, server.eventsEnabled);
  }

  async update(id: string, dto: UpdateTenantFlussonicServerDto, actorId?: string) {
    const server = await this.prisma.tenantFlussonicServer.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!server) throw new NotFoundException('Server not found');

    const tenantBusinessId = dto.tenantBusinessId ?? server.tenantBusinessId;
    if (dto.tenantBusinessId) await this.assertBusinessExists(dto.tenantBusinessId);
    if (dto.name || dto.tenantBusinessId) {
      await this.assertNameUnique(tenantBusinessId, dto.name ?? server.name, id);
    }

    const { apiUsername, apiPassword, apiAccessToken, serverVersion, ...rest } = dto;
    const updated = await this.prisma.tenantFlussonicServer.update({
      where: { id },
      data: {
        ...rest,
        ...(apiUsername !== undefined ? { flussonicApiUsername: apiUsername } : {}),
        ...(serverVersion !== undefined ? { flussonicVersion: serverVersion } : {}),
        // Omitted = keep the stored secret; empty string = clear it.
        ...(apiPassword !== undefined
          ? { flussonicApiPasswordEnc: apiPassword ? encryptSecret(apiPassword) : null }
          : {}),
        ...this.accessTokenUpdate(server, apiAccessToken, apiUsername, apiPassword),
        // A past result says nothing about a server you just re-pointed or
        // re-credentialed, so the check has to be redone.
        ...(CONNECTION_FIELDS.some((field) => dto[field] !== undefined)
          ? { connectionStatus: 'UNKNOWN' as const, connectionCheckedAt: null }
          : {}),
        updatedAt: now(),
        updatedBy: actorId,
      },
      include: SERVER_INCLUDE,
    });
    // A new host, credentials or event choice all mean the sink must be rewritten
    // (or removed, when events were just switched off).
    const eventsTouched =
      dto.eventsEnabled !== undefined ||
      dto.eventTypes !== undefined ||
      CONNECTION_FIELDS.some((field) => dto[field] !== undefined);
    return this.syncEventSinkIfNeeded(id, eventsTouched && (server.eventsEnabled || updated.eventsEnabled));
  }

  async remove(id: string, actorId?: string) {
    const server = await this.prisma.tenantFlussonicServer.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!server) throw new NotFoundException('Server not found');

    const timestamp = now();
    await this.prisma.tenantFlussonicServer.update({
      where: { id },
      data: {
        status: 'DELETED',
        deletedAt: timestamp,
        deletedBy: actorId,
        updatedAt: timestamp,
        updatedBy: actorId,
      },
    });
    // A deleted server should stop posting events here.
    if (server.eventsEnabled) await this.eventSinks.sync(id);
    return { success: true };
  }

  async restore(id: string, actorId?: string) {
    const server = await this.prisma.tenantFlussonicServer.findFirst({
      where: { id, status: 'DELETED' },
    });
    if (!server) throw new NotFoundException('Server not found or not deleted');
    const restored = await this.prisma.tenantFlussonicServer.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        deletedAt: null,
        deletedBy: null,
        updatedAt: now(),
        updatedBy: actorId,
      },
      include: SERVER_INCLUDE,
    });
    return this.syncEventSinkIfNeeded(id, restored.eventsEnabled);
  }

  /** What the server form needs to offer stream events. */
  eventOptions() {
    return {
      available: !!this.eventSinks.publicApiUrl(),
      eventGroups: STREAM_EVENT_GROUPS,
      defaultEvents: DEFAULT_EVENT_TYPES,
    };
  }

  /** Re-applies the server's event settings to its sink - the form's Retry. */
  async syncEventSink(id: string) {
    const server = await this.prisma.tenantFlussonicServer.findFirst({
      where: { id, status: { not: 'DELETED' } },
      select: { id: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    await this.eventSinks.sync(id);
    return this.findOne(id);
  }

  /**
   * Brings the server's event sink in line after a save, then returns the row
   * with the sync outcome. A failed sync is recorded on the row and never fails
   * the save.
   */
  private async syncEventSinkIfNeeded(id: string, needed: boolean) {
    if (needed) await this.eventSinks.sync(id);
    const row = await this.prisma.tenantFlussonicServer.findUniqueOrThrow({
      where: { id },
      include: SERVER_INCLUDE,
    });
    return sanitize(row);
  }

  /**
   * Shared list query. `businessScope` is null for system callers (all
   * businesses) or the caller's mapped business ids for tenant callers.
   */
  private async list(query: TenantFlussonicServerListQueryDto, businessScope: string[] | null) {
    const { page, limit, search, status, connectionStatus, tenantBusinessId, sortBy, sortOrder } =
      query;
    const where = {
      status: status ? status : ({ not: 'DELETED' } as const),
      ...(connectionStatus ? { connectionStatus } : {}),
      ...(tenantBusinessId
        ? { tenantBusinessId }
        : businessScope
          ? { tenantBusinessId: { in: businessScope } }
          : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { hostName: { contains: search } },
              { domain: { contains: search } },
              { systemCode: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantFlussonicServer.findMany({
        where,
        include: SERVER_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantFlussonicServer.count({ where }),
    ]);
    return listResponse(items.map(sanitize), total, page, limit);
  }

  /**
   * An explicitly supplied token always wins; otherwise it is derived from the
   * credentials, so a server saved with a username and password comes out with
   * a usable token without the caller doing anything.
   */
  private resolveAccessToken(
    apiAccessToken: string | undefined,
    apiUsername: string | undefined,
    apiPassword: string | undefined,
  ): string | undefined {
    if (apiAccessToken) return encryptSecret(apiAccessToken);
    if (apiUsername && apiPassword) return encryptSecret(basicToken(apiUsername, apiPassword));
    return undefined;
  }

  /**
   * On update the token is regenerated whenever either credential changes, so
   * it never drifts out of sync with the password it encodes.
   */
  private accessTokenUpdate(
    server: { flussonicApiUsername: string | null; flussonicApiPasswordEnc: string | null },
    apiAccessToken: string | undefined,
    apiUsername: string | undefined,
    apiPassword: string | undefined,
  ): { flussonicApiAccessToken?: string | null } {
    if (apiAccessToken !== undefined) {
      return { flussonicApiAccessToken: apiAccessToken ? encryptSecret(apiAccessToken) : null };
    }
    if (apiUsername === undefined && apiPassword === undefined) return {};

    const username = apiUsername ?? server.flussonicApiUsername;
    const password =
      apiPassword ??
      (server.flussonicApiPasswordEnc ? decryptSecret(server.flussonicApiPasswordEnc) : null);
    if (!username || !password) return { flussonicApiAccessToken: null };
    return { flussonicApiAccessToken: encryptSecret(basicToken(username, password)) };
  }

  /**
   * Verifies connectivity by calling the server's own API with the stored
   * credentials, then records the outcome. Never throws for a failed check -
   * an unreachable server is a recorded state, not a request error.
   */
  async checkConnection(id: string, actorId?: string) {
    const server = await this.prisma.tenantFlussonicServer.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!server) throw new NotFoundException('Server not found');

    const connectionStatus = await this.probe(server);
    const updated = await this.prisma.tenantFlussonicServer.update({
      where: { id },
      data: {
        connectionStatus,
        connectionCheckedAt: now(),
        updatedAt: now(),
        updatedBy: actorId,
      },
      include: SERVER_INCLUDE,
    });
    return sanitize(updated);
  }

  /**
   * The server record plus its live runtime status.
   *
   * The read doubles as a connectivity check, so its outcome is recorded on the
   * row exactly as the explicit check does - a viewer should not have to press
   * "check connection" to correct a stale badge. An unreachable server is not
   * an error here either: the record still returns, with the reason attached,
   * because a dead server is precisely what the viewer needs to see.
   */
  async viewStats(id: string, actorId?: string) {
    const server = await this.prisma.tenantFlussonicServer.findFirst({
      where: { id, status: { not: 'DELETED' } },
    });
    if (!server) throw new NotFoundException('Server not found');

    const result = await this.streamer.getServerStats(server);
    const stats = result.ok ? mapServerStats(result.data) : null;

    const connectionStatus = result.ok
      ? 'CONNECTED'
      : result.reason === 'UNAUTHORIZED'
        ? 'UNAUTHORIZED'
        : 'UNREACHABLE';

    const timestamp = now();
    const updated = await this.prisma.tenantFlussonicServer.update({
      where: { id },
      data: {
        connectionStatus,
        connectionCheckedAt: timestamp,
        // The version the server reports beats whatever was typed in by hand,
        // so the list column stays true after an upgrade.
        ...(stats?.serverVersion && stats.serverVersion !== server.flussonicVersion
          ? { flussonicVersion: stats.serverVersion }
          : {}),
        updatedAt: timestamp,
        updatedBy: actorId,
      },
      include: SERVER_INCLUDE,
    });

    return {
      server: sanitize(updated),
      live: result.ok,
      liveError: result.ok ? null : result.message,
      stats,
    };
  }

  /**
   * GETs the documented status endpoint with HTTP Basic. The credential is the
   * stored access token, which is already base64(user:password), so this also
   * proves the token itself is usable.
   */
  private async probe(server: {
    useSSL: boolean;
    domain: string | null;
    hostName: string;
    hostPort: number;
    apiBasePath: string;
    flussonicApiUsername: string | null;
    flussonicApiPasswordEnc: string | null;
    flussonicApiAccessToken: string | null;
  }): Promise<'UNKNOWN' | 'CONNECTED' | 'UNAUTHORIZED' | 'UNREACHABLE'> {
    const credential = streamerCredential(server);
    if (!credential) return 'UNKNOWN';

    const base = streamerBaseUrl(server);

    try {
      const response = await fetch(`${base}/config/stats`, {
        method: 'GET',
        headers: { Authorization: `Basic ${credential}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
      });
      if (response.status === 401 || response.status === 403) return 'UNAUTHORIZED';
      return response.ok ? 'CONNECTED' : 'UNREACHABLE';
    } catch {
      // DNS failure, refused connection, TLS error, or the timeout above.
      return 'UNREACHABLE';
    }
  }

  private async assertBusinessExists(tenantBusinessId: string) {
    const business = await this.prisma.tenantBusiness.findFirst({
      where: { id: tenantBusinessId, status: { not: 'DELETED' } },
    });
    if (!business) {
      throw new BadRequestException('Tenant business does not exist or is deleted');
    }
  }

  private async assertNameUnique(tenantBusinessId: string, name: string, excludeId?: string) {
    const existing = await this.prisma.tenantFlussonicServer.findFirst({
      where: { tenantBusinessId, name, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) {
      throw new BadRequestException(`Server name "${name}" is already used for this business`);
    }
  }

  // ---------- Tenant self-service (scoped to the caller's mapped businesses) ----------

  async findAllForTenantUser(tenantUserId: string, query: TenantFlussonicServerListQueryDto) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    if (query.tenantBusinessId && !businessIds.includes(query.tenantBusinessId)) {
      throw new ForbiddenException('You are not mapped to this business');
    }
    return this.list(query, businessIds);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessIds = await this.getMappedBusinessIds(tenantUserId);
    const server = await this.prisma.tenantFlussonicServer.findFirst({
      where: { id, tenantBusinessId: { in: businessIds }, status: { not: 'DELETED' } },
      include: SERVER_INCLUDE,
    });
    if (!server) throw new NotFoundException('Server not found');
    return sanitize(server);
  }

  async createForTenantUser(tenantUserId: string, dto: CreateTenantFlussonicServerSelfDto) {
    const tenantBusinessId = await this.getMappedBusinessId(tenantUserId);
    return this.create({ ...dto, tenantBusinessId }, tenantUserId);
  }

  async updateForTenantUser(
    tenantUserId: string,
    id: string,
    dto: UpdateTenantFlussonicServerSelfDto,
  ) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.update(id, dto, tenantUserId);
  }

  async viewStatsForTenantUser(tenantUserId: string, id: string) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.viewStats(id, tenantUserId);
  }

  async checkConnectionForTenantUser(tenantUserId: string, id: string) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.checkConnection(id, tenantUserId);
  }

  async removeForTenantUser(tenantUserId: string, id: string) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.remove(id, tenantUserId);
  }

  async syncEventSinkForTenantUser(tenantUserId: string, id: string) {
    await this.findOneForTenantUser(tenantUserId, id);
    return this.syncEventSink(id);
  }

  private async getMappedBusinessIds(tenantUserId: string): Promise<string[]> {
    const mappings = await this.prisma.tenantMappedBusiness.findMany({
      where: { tenantUserId, status: 'ACTIVE' },
      select: { tenantBusinessId: true },
    });
    return mappings.map((m) => m.tenantBusinessId);
  }

  /**
   * The one business the caller is mapped to. TenantMappedBusiness is unique
   * per tenant user, so there is never a choice to present.
   */
  private async getMappedBusinessId(tenantUserId: string): Promise<string> {
    const [tenantBusinessId] = await this.getMappedBusinessIds(tenantUserId);
    if (!tenantBusinessId) {
      throw new BadRequestException('Your account is not mapped to a business');
    }
    return tenantBusinessId;
  }
}
