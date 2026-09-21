import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type TenantStreamSyncStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { streamerEpochSeconds } from '../common/utils/streamer.util';
import { StreamerApiService, type RemoteStream } from './streamer-api.service';
import {
  fromServerConfig,
  hashMappedConfig,
  stripNonWritable,
  toMappedConfig,
  toServerConfig,
  type StreamForConfig,
} from './stream-config.mapper';
import { buildStreamUrls } from './stream-urls';

const SERVER_SELECT = {
  id: true,
  name: true,
  status: true,
  tenantBusinessId: true,
  useSSL: true,
  domain: true,
  hostName: true,
  hostPort: true,
  apiBasePath: true,
  flussonicApiUsername: true,
  flussonicApiPasswordEnc: true,
  flussonicApiAccessToken: true,
} satisfies Prisma.TenantFlussonicServerSelect;

/**
 * Refuses an action that reaches out to a server which is not ACTIVE.
 *
 * A suspended, blocked or terminated server is one the tenant has deliberately
 * taken out of service, so pushing to it is not a transient failure to retry -
 * it is a change that should not be attempted at all. The message names the
 * server and its state, because the person seeing it (often a customer) cannot
 * see the server list.
 */
export function assertServerActive(
  server: { name: string; status: string },
  action: string,
): void {
  if (server.status !== 'ACTIVE') {
    throw new BadRequestException(
      `Server "${server.name}" is ${server.status.toLowerCase()}, so this stream cannot be ${action} right now.`,
    );
  }
}

/**
 * Only streams the server says came from config (ours, or another config-driven
 * system) are ours to reconcile. `user` streams are ephemeral play/publish
 * sessions and `remote` ones belong to another cluster node - adopting either
 * would persist something transient, and deleting them would cut off live
 * traffic.
 */
export const MANAGEABLE_NAMED_BY = ['config', 'external'];

/** Pause between the disable and the re-enable of a reload. */
const RELOAD_GAP_MS = 1000;

export type Classification =
  | 'IN_SYNC'
  | 'CONFLICT'
  | 'MISSING_ON_SERVER'
  | 'ORPHAN_ON_SERVER'
  | 'SKIPPED';

export interface ClassifyInput {
  remote: Array<{ name: string; namedBy?: string; hash: string }>;
  local: Array<{ name: string; configHash: string | null; syncStatus: string }>;
}

/**
 * Pure diff between what the server reports and what we hold. Kept free of I/O
 * so every branch is testable without a network or a database.
 */
export function classifyStreams({ remote, local }: ClassifyInput): Map<string, Classification> {
  const manageable = remote.filter(
    (r) => !r.namedBy || MANAGEABLE_NAMED_BY.includes(r.namedBy),
  );
  const remoteByName = new Map(manageable.map((r) => [r.name, r]));
  const localByName = new Map(local.map((l) => [l.name, l]));
  const result = new Map<string, Classification>();

  for (const name of new Set([...remoteByName.keys(), ...localByName.keys()])) {
    const r = remoteByName.get(name);
    const l = localByName.get(name);

    if (l && (l.syncStatus === 'RENAMING' || l.syncStatus === 'TRANSFERRING')) {
      result.set(name, 'SKIPPED');
      continue;
    }
    if (r && l) {
      result.set(name, l.configHash && l.configHash === r.hash ? 'IN_SYNC' : 'CONFLICT');
      continue;
    }
    result.set(name, l ? 'MISSING_ON_SERVER' : 'ORPHAN_ON_SERVER');
  }
  return result;
}

/**
 * Splits a server-side name into our application/key pair. The key is the last
 * segment and the application is everything before it, so every shape the
 * server uses round-trips: `demo` -> (null, demo), `live/ch01` -> (live, ch01),
 * `a/b/c` -> (a/b, c). Only a name with an empty segment is unusable.
 */
export function splitStreamName(
  name: string,
): { applicationName: string | null; streamKey: string } | null {
  if (!name || name.split('/').some((part) => !part)) return null;
  const parts = name.split('/');
  const streamKey = parts.pop() as string;
  return { applicationName: parts.length ? parts.join('/') : null, streamKey };
}

export interface ReconcileSummary {
  serverId: string;
  checked: number;
  inSync: number;
  pushed: number;
  conflicts: number;
  unmanaged: number;
  skipped: number;
  failed: number;
  error?: string;
}

@Injectable()
export class TenantStreamSyncService {
  private readonly logger = new Logger(TenantStreamSyncService.name);
  /** One reconcile per server at a time; a slow server must not overlap itself. */
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly streamerApi: StreamerApiService,
  ) {}

  /**
   * Pushes one stream's config to its server and records the outcome. Never
   * throws: the local write has already happened and must not be rolled back
   * because a server was briefly unreachable.
   */
  async pushStream(streamId: string): Promise<TenantStreamSyncStatus> {
    const stream = await this.prisma.tenantStream.findUnique({
      where: { id: streamId },
      include: { inputs: true, tenantFlussonicServer: { select: SERVER_SELECT } },
    });
    if (!stream) return 'PENDING_PUSH';

    // A soft-deleted stream should no longer exist on the server at all.
    if (stream.status === 'DELETED') return this.deleteRemote(streamId);

    const server = stream.tenantFlussonicServer;
    // Read the current remote config first so settings we do not manage
    // (transcoder, dvr, drm, ...) survive the PUT that replaces the object.
    const existing = await this.streamerApi.getStream(server, stream.name);
    const remoteConfig = existing.ok ? existing.data : null;
    if (!existing.ok && existing.reason !== 'NOT_FOUND') {
      return this.recordSync(streamId, existing.reason === 'UNREACHABLE' ? 'UNREACHABLE' : 'PENDING_PUSH');
    }

    const payload = toServerConfig(stream as StreamForConfig, remoteConfig);
    const put = await this.streamerApi.putStream(server, stream.name, payload);
    if (!put.ok) {
      this.logger.warn(`push ${stream.name} failed: ${put.message}`);
      return this.recordSync(streamId, put.reason === 'UNREACHABLE' ? 'UNREACHABLE' : 'PENDING_PUSH');
    }

    const hash = hashMappedConfig(toMappedConfig(stream as StreamForConfig));
    return this.recordSync(streamId, 'IN_SYNC', hash);
  }


  /**
   * Renames a stream on its server. Flussonic has no rename: the stream must be
   * created under the new name and removed under the old one, which disconnects
   * anyone watching the old name. Ordered create-then-delete on purpose - a
   * stream briefly existing twice is recoverable, briefly existing nowhere is an
   * outage - and every step is recorded so a half-finished rename is visible.
   */
  async renameStream(
    streamId: string,
    next: { applicationName?: string | null; streamKey: string },
    actorId?: string,
  ) {
    const stream = await this.prisma.tenantStream.findFirst({
      where: { id: streamId, status: { not: 'DELETED' } },
      include: { inputs: true, tenantFlussonicServer: { select: SERVER_SELECT } },
    });
    if (!stream) throw new NotFoundException('Stream not found');
    if (stream.syncStatus === 'RENAMING' || stream.syncStatus === 'TRANSFERRING') {
      throw new BadRequestException('This stream is already mid-operation');
    }
    assertServerActive(stream.tenantFlussonicServer, 'renamed');

    const applicationName = next.applicationName?.trim() ? next.applicationName.trim() : null;
    const newName = applicationName ? `${applicationName}/${next.streamKey}` : next.streamKey;
    const oldName = stream.name;

    // Nothing to do - let the caller treat it as a plain update.
    if (newName === oldName) {
      return { renamed: false as const, stream: await this.reload(streamId) };
    }

    const clash = await this.prisma.tenantStream.findFirst({
      where: {
        tenantFlussonicServerId: stream.tenantFlussonicServerId,
        name: newName,
        id: { not: streamId },
      },
    });
    if (clash) {
      throw new BadRequestException(`Stream "${newName}" already exists on this server`);
    }

    const server = stream.tenantFlussonicServer;
    const timestamp = now();
    const operation = await this.prisma.tenantStreamOperation.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('OPS'),
        tenantStreamId: streamId,
        kind: 'RENAME',
        fromServerId: stream.tenantFlussonicServerId,
        toServerId: stream.tenantFlussonicServerId,
        fromName: oldName,
        toName: newName,
        state: 'PENDING',
        createdAt: timestamp,
        createdBy: actorId,
      },
    });

    const finish = async (
      state: 'COMPLETED' | 'FAILED' | 'ROLLED_BACK' | 'CREATED_ON_TARGET',
      error?: string,
    ) => {
      await this.prisma.tenantStreamOperation.update({
        where: { id: operation.id },
        data: {
          state,
          error,
          ...(state === 'COMPLETED' ? { completedAt: now() } : {}),
        },
      });
    };

    await this.prisma.tenantStream.update({
      where: { id: streamId },
      data: { syncStatus: 'RENAMING' },
    });

    try {
      // Refuse if something already occupies the new name on the server, so a
      // rename never clobbers a stream we do not know about.
      const occupied = await this.streamerApi.getStream(server, newName);
      if (occupied.ok) {
        await finish('FAILED', `"${newName}" already exists on the server`);
        await this.recordSync(streamId, 'CONFLICT');
        throw new BadRequestException(`"${newName}" already exists on the server`);
      }

      const current = await this.streamerApi.getStream(server, oldName);
      if (!current.ok && current.reason === 'UNREACHABLE') {
        await finish('FAILED', current.message);
        await this.recordSync(streamId, 'UNREACHABLE');
        throw new BadRequestException(`Server is unreachable: ${current.message}`);
      }

      // The stream may not exist remotely yet (never pushed). Then a rename is
      // purely local and the next push creates it under the new name.
      const existsRemotely = current.ok;
      if (existsRemotely) {
        const payload = toServerConfig(stream as StreamForConfig, current.data);
        const created = await this.streamerApi.putStream(server, newName, payload);
        if (!created.ok) {
          await finish('FAILED', created.message);
          await this.recordSync(streamId, 'PENDING_PUSH');
          throw new BadRequestException(`Could not create "${newName}": ${created.message}`);
        }

        const verified = await this.streamerApi.getStream(server, newName);
        if (!verified.ok) {
          // Undo the partial creation rather than leaving a stray stream.
          await this.streamerApi.deleteStream(server, newName);
          await finish('ROLLED_BACK', verified.message);
          await this.recordSync(streamId, 'PENDING_PUSH');
          throw new BadRequestException(`Could not verify "${newName}": ${verified.message}`);
        }

        const removed = await this.streamerApi.deleteStream(server, oldName);
        if (!removed.ok) {
          // Live under both names. The local row moves to the new name so the
          // two are not confused, and CONFLICT surfaces the leftover.
          await this.prisma.tenantStream.update({
            where: { id: streamId },
            data: {
              applicationName,
              streamKey: next.streamKey,
              name: newName,
              syncStatus: 'CONFLICT',
              updatedAt: now(),
              updatedBy: actorId,
            },
          });
          await finish('CREATED_ON_TARGET', `Old name "${oldName}" could not be removed: ${removed.message}`);
          this.logger.warn(`rename left ${oldName} behind on the server`);
          return { renamed: true as const, stream: await this.reload(streamId), warning: `Renamed, but "${oldName}" is still on the server and needs removing` };
        }
      }

      const updated = await this.prisma.tenantStream.update({
        where: { id: streamId },
        data: {
          applicationName,
          streamKey: next.streamKey,
          name: newName,
          syncStatus: existsRemotely ? 'IN_SYNC' : 'PENDING_PUSH',
          ...(existsRemotely
            ? {
                configHash: hashMappedConfig(toMappedConfig(stream as StreamForConfig)),
                lastSyncedAt: now(),
              }
            : {}),
          updatedAt: now(),
          updatedBy: actorId,
        },
        include: { inputs: { orderBy: { priority: 'asc' } } },
      });
      await finish('COMPLETED');
      return { renamed: true as const, stream: updated };
    } catch (err) {
      // A thrown error has already recorded its own state above; anything else
      // must not leave the row stuck in RENAMING.
      const stuck = await this.prisma.tenantStream.findUnique({
        where: { id: streamId },
        select: { syncStatus: true },
      });
      if (stuck?.syncStatus === 'RENAMING') {
        await this.recordSync(streamId, 'PENDING_PUSH');
        await finish('FAILED', err instanceof Error ? err.message : 'Rename failed');
      }
      throw err;
    }
  }

  private async reload(streamId: string) {
    return this.prisma.tenantStream.findUniqueOrThrow({
      where: { id: streamId },
      include: { inputs: { orderBy: { priority: 'asc' } } },
    });
  }


  /**
   * Live view of one stream: its config as the server holds it, the runtime
   * stats it reports, and the publish/playback URLs for its enabled protocols.
   * Never throws for an unreachable server - the caller still wants the URLs
   * and the stored config.
   */
  async viewStream(streamId: string) {
    const stream = await this.prisma.tenantStream.findFirst({
      where: { id: streamId, status: { not: 'DELETED' } },
      include: {
        inputs: { orderBy: { priority: 'asc' } },
        tenantFlussonicServer: {
          select: {
            ...SERVER_SELECT,
            name: true,
            httpPort: true,
            httpsPort: true,
            rtmpPort: true,
            rtspPort: true,
            srtPort: true,
            useSSL: true,
            domain: true,
            hostName: true,
          },
        },
      },
    });
    if (!stream) throw new NotFoundException('Stream not found');

    const server = stream.tenantFlussonicServer;
    const urls = buildStreamUrls(stream, server);

    const remote = await this.streamerApi.getStream(server, stream.name);
    const stats = remote.ok
      ? ((remote.data as Record<string, unknown>).stats as Record<string, unknown> | undefined)
      : undefined;

    return {
      urls,
      live: remote.ok,
      liveError: remote.ok ? null : remote.message,
      stats: stats ?? null,
      // media_info sits inside stats and carries the track list.
      mediaInfo: (stats?.media_info as Record<string, unknown> | undefined) ?? null,
    };
  }

  /**
   * Play sessions for one stream. The sessions endpoint has no stream filter,
   * so it is paged and matched on the session's `name`; capped because a busy
   * server can hold far more sessions than any one stream needs.
   */
  async streamSessions(streamId: string) {
    const stream = await this.prisma.tenantStream.findFirst({
      where: { id: streamId, status: { not: 'DELETED' } },
      include: { tenantFlussonicServer: { select: SERVER_SELECT } },
    });
    if (!stream) throw new NotFoundException('Stream not found');

    const result = await this.streamerApi.listSessions(stream.tenantFlussonicServer);
    if (!result.ok) throw new BadRequestException(result.message);
    // Timestamps are normalised here so every caller - tenant portal, system
    // console and customer portal - gets the epoch seconds the rest of the app uses.
    return result.data
      .filter((session) => session.name === stream.name)
      .map((session) => ({ ...session, opened_at: streamerEpochSeconds(session.opened_at) }));
  }

  /**
   * Disables the stream, waits, then re-enables it - the way to force a restart
   * of a stuck source. The gap is deliberate: the server needs a moment to tear
   * the old source connection down before the new one is accepted.
   */
  async reloadStream(streamId: string, actorId?: string) {
    const stream = await this.prisma.tenantStream.findFirst({
      where: { id: streamId, status: { not: 'DELETED' } },
      include: { inputs: true, tenantFlussonicServer: { select: SERVER_SELECT } },
    });
    if (!stream) throw new NotFoundException('Stream not found');
    if (stream.syncStatus === 'RENAMING' || stream.syncStatus === 'TRANSFERRING') {
      throw new BadRequestException('This stream is mid-operation');
    }
    assertServerActive(stream.tenantFlussonicServer, 'reloaded');

    const server = stream.tenantFlussonicServer;
    const current = await this.streamerApi.getStream(server, stream.name);
    if (!current.ok) {
      throw new BadRequestException(
        current.reason === 'NOT_FOUND'
          ? 'This stream does not exist on the server yet'
          : current.message,
      );
    }
    // Built the same way as an ordinary push rather than echoing the server's
    // own config back: that way `inputs` come from our rows and carry none of
    // the runtime fields the streamer refuses on a write.
    const base = toServerConfig(stream as StreamForConfig, current.data as Record<string, unknown>);

    const off = await this.streamerApi.putStream(server, stream.name, { ...base, disabled: true });
    if (!off.ok) throw new BadRequestException(`Could not disable: ${off.message}`);

    await new Promise((resolve) => setTimeout(resolve, RELOAD_GAP_MS));

    const on = await this.streamerApi.putStream(server, stream.name, { ...base, disabled: false });
    if (!on.ok) {
      // Left disabled on the server: say so rather than report success, and
      // mark it so a sync puts our intent back.
      await this.recordSync(streamId, 'CONFLICT');
      throw new BadRequestException(
        `Disabled, but could not re-enable: ${on.message}. The stream is currently off.`,
      );
    }

    // Our stored intent is "enabled" now, whatever it was before.
    await this.prisma.tenantStream.update({
      where: { id: streamId },
      data: { disabled: false, updatedAt: now(), updatedBy: actorId },
    });
    await this.pushStream(streamId);
    return { success: true, gapMs: RELOAD_GAP_MS };
  }

  /**
   * Verifies that a stream is on or off on its server as billing wants it, and
   * corrects the server if not. A stream can be switched on or off outside this
   * app - in the server's own UI or by another tool - leaving our record out of
   * step with what actually runs, so billing checks the server rather than
   * trusting our flag. `disabled` must match the stored row. Never throws.
   */
  async ensureRemoteState(
    streamId: string,
    disabled: boolean,
  ): Promise<'MATCHES' | 'CORRECTED' | 'UNAVAILABLE'> {
    const stream = await this.prisma.tenantStream.findUnique({
      where: { id: streamId },
      include: { inputs: true, tenantFlussonicServer: { select: SERVER_SELECT } },
    });
    if (!stream || stream.status === 'DELETED' || stream.disabled !== disabled) return 'UNAVAILABLE';
    if (stream.syncStatus === 'RENAMING' || stream.syncStatus === 'TRANSFERRING') return 'UNAVAILABLE';
    const server = stream.tenantFlussonicServer;
    if (server.status !== 'ACTIVE') return 'UNAVAILABLE';

    const remote = await this.streamerApi.getStream(server, stream.name);
    // Absent on the server is as good as off; creating a missing stream is the
    // reconcile's job, not billing's.
    if (!remote.ok) return remote.reason === 'NOT_FOUND' && disabled ? 'MATCHES' : 'UNAVAILABLE';
    if (!!(remote.data as Record<string, unknown>).disabled === disabled) return 'MATCHES';

    const status = await this.pushStream(streamId);
    if (status !== 'IN_SYNC') return 'UNAVAILABLE';
    this.logger.warn(
      `${stream.name} was switched ${disabled ? 'on' : 'off'} on ${server.name} outside this app; ` +
        `switched ${disabled ? 'off' : 'on'} again`,
    );
    return 'CORRECTED';
  }

  /** Removes a stream from its server; used after a soft delete. */
  async deleteRemote(streamId: string): Promise<TenantStreamSyncStatus> {
    const stream = await this.prisma.tenantStream.findUnique({
      where: { id: streamId },
      include: { tenantFlussonicServer: { select: SERVER_SELECT } },
    });
    if (!stream) return 'PENDING_PUSH';

    const result = await this.streamerApi.deleteStream(stream.tenantFlussonicServer, stream.name);
    if (!result.ok) {
      this.logger.warn(`remote delete ${stream.name} failed: ${result.message}`);
      return this.recordSync(
        streamId,
        result.reason === 'UNREACHABLE' ? 'UNREACHABLE' : 'PENDING_PUSH',
      );
    }
    // Gone on both sides. IN_SYNC on a deleted row means "nothing left to do".
    return this.recordSync(streamId, 'IN_SYNC', null);
  }

  /**
   * Reconciles every active server of a business. Sequential on purpose: these
   * are remote calls to machines serving live traffic, and a burst of parallel
   * listings across many servers is a worse neighbour than a slightly slower
   * pass.
   */
  async reconcileBusiness(tenantBusinessId: string, actorId?: string) {
    const servers = await this.prisma.tenantFlussonicServer.findMany({
      where: { tenantBusinessId, status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const summaries: Array<ReconcileSummary & { serverName: string }> = [];
    for (const server of servers) {
      const summary = await this.reconcileServer(server.id, actorId);
      summaries.push({ ...summary, serverName: server.name });
    }
    return summaries;
  }

  /** Unmanaged streams across every active server of a business. */
  async listUnmanagedForBusiness(tenantBusinessId: string) {
    const servers = await this.prisma.tenantFlussonicServer.findMany({
      where: { tenantBusinessId, status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const all: Array<Awaited<ReturnType<typeof this.listUnmanaged>>[number] & {
      serverId: string;
      serverName: string;
    }> = [];
    for (const server of servers) {
      try {
        const rows = await this.listUnmanaged(server.id);
        all.push(...rows.map((r) => ({ ...r, serverId: server.id, serverName: server.name })));
      } catch {
        // One unreachable server must not hide the others' results.
      }
    }
    return all;
  }

  /**
   * Adopts every adoptable unmanaged stream on a server - the bulk import for
   * a server that was already in production before it was managed here.
   * Per-stream failures are collected rather than aborting the run, so one bad
   * name cannot strand the other 47.
   */
  async adoptAll(
    serverId: string,
    options: { actorId?: string } = {},
  ): Promise<{ adopted: number; skipped: number; failed: number; errors: Array<{ name: string; error: string }> }> {
    const unmanaged = await this.listUnmanaged(serverId);
    const result = { adopted: 0, skipped: 0, failed: 0, errors: [] as Array<{ name: string; error: string }> };

    for (const stream of unmanaged) {
      if (!stream.adoptable) {
        result.skipped += 1;
        result.errors.push({ name: stream.name, error: stream.reason ?? 'Not adoptable' });
        continue;
      }
      try {
        await this.adoptStream(serverId, stream.name, { actorId: options.actorId });
        result.adopted += 1;
      } catch (err) {
        result.failed += 1;
        result.errors.push({
          name: stream.name,
          error: err instanceof Error ? err.message : 'Adopt failed',
        });
      }
    }
    return result;
  }

  /** Full reconcile for one server. */
  async reconcileServer(serverId: string, actorId?: string): Promise<ReconcileSummary> {
    const summary: ReconcileSummary = {
      serverId,
      checked: 0,
      inSync: 0,
      pushed: 0,
      conflicts: 0,
      unmanaged: 0,
      skipped: 0,
      failed: 0,
    };

    if (this.running.has(serverId)) {
      return { ...summary, error: 'A sync is already running for this server' };
    }
    this.running.add(serverId);
    try {
      const server = await this.prisma.tenantFlussonicServer.findFirst({
        where: { id: serverId, status: { not: 'DELETED' } },
        select: SERVER_SELECT,
      });
      if (!server) throw new NotFoundException('Server not found');

      const remote = await this.streamerApi.listStreams(server);
      if (!remote.ok) {
        await this.prisma.tenantStream.updateMany({
          where: {
            tenantFlussonicServerId: serverId,
            status: { not: 'DELETED' },
            syncStatus: { notIn: ['RENAMING', 'TRANSFERRING'] },
          },
          data: { syncStatus: 'UNREACHABLE', updatedAt: now() },
        });
        return { ...summary, error: remote.message };
      }

      const local = await this.prisma.tenantStream.findMany({
        where: { tenantFlussonicServerId: serverId, status: { not: 'DELETED' } },
        select: { id: true, name: true, configHash: true, syncStatus: true },
      });

      const remoteHashes = remote.data.map((r) => ({
        name: r.name,
        namedBy: r.named_by,
        hash: hashMappedConfig(fromServerConfig(r.config)),
      }));
      const classified = classifyStreams({ remote: remoteHashes, local });
      const localByName = new Map(local.map((l) => [l.name, l]));
      summary.checked = classified.size;

      for (const [name, kind] of classified) {
        const row = localByName.get(name);
        switch (kind) {
          case 'IN_SYNC':
            summary.inSync += 1;
            if (row) await this.recordSync(row.id, 'IN_SYNC');
            break;
          case 'CONFLICT':
            // Deliberately not auto-resolved: overwriting a change someone made
            // on the server, or discarding one made here, is a human decision.
            summary.conflicts += 1;
            if (row) await this.recordSync(row.id, 'CONFLICT');
            break;
          case 'MISSING_ON_SERVER': {
            if (!row) break;
            const status = await this.pushStream(row.id);
            if (status === 'IN_SYNC') summary.pushed += 1;
            else summary.failed += 1;
            break;
          }
          case 'ORPHAN_ON_SERVER':
            // Never deleted: a stream configured by hand is not ours to remove.
            summary.unmanaged += 1;
            break;
          case 'SKIPPED':
            summary.skipped += 1;
            break;
        }
      }

      await this.prisma.tenantFlussonicServer.update({
        where: { id: serverId },
        data: { updatedAt: now(), updatedBy: actorId },
      });
      return summary;
    } finally {
      this.running.delete(serverId);
    }
  }

  /**
   * Streams present on the server with no record here. `adoptable` is false
   * when the name cannot round-trip through our application/key shape.
   */
  async listUnmanaged(serverId: string) {
    const server = await this.prisma.tenantFlussonicServer.findFirst({
      where: { id: serverId, status: { not: 'DELETED' } },
      select: SERVER_SELECT,
    });
    if (!server) throw new NotFoundException('Server not found');

    const remote = await this.streamerApi.listStreams(server);
    if (!remote.ok) throw new BadRequestException(remote.message);

    const local = await this.prisma.tenantStream.findMany({
      where: { tenantFlussonicServerId: serverId, status: { not: 'DELETED' } },
      select: { name: true },
    });
    const known = new Set(local.map((l) => l.name));

    return remote.data
      .filter((r) => !known.has(r.name))
      .filter((r) => !r.named_by || MANAGEABLE_NAMED_BY.includes(r.named_by))
      .map((r) => {
        const split = splitStreamName(r.name);
        return {
          name: r.name,
          namedBy: r.named_by ?? null,
          title: (r.config.title as string) ?? null,
          disabled: !!r.config.disabled,
          inputCount: Array.isArray(r.config.inputs) ? r.config.inputs.length : 0,
          adoptable: !!split,
          reason: split ? null : 'Name contains an empty path segment',
        };
      });
  }

  /** Creates a local record from a stream that already exists on the server. */
  async adoptStream(
    serverId: string,
    name: string,
    options: { tenantCustomerId?: string; actorId?: string } = {},
  ) {
    const server = await this.prisma.tenantFlussonicServer.findFirst({
      where: { id: serverId, status: { not: 'DELETED' } },
      select: { ...SERVER_SELECT, tenantBusinessId: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    const split = splitStreamName(name);
    if (!split) {
      throw new BadRequestException(`"${name}" is not a usable stream name`);
    }

    const existingLocal = await this.prisma.tenantStream.findFirst({
      where: { tenantFlussonicServerId: serverId, name },
    });
    if (existingLocal) throw new BadRequestException('This stream is already managed here');

    const remote = await this.streamerApi.getStream(server, name);
    if (!remote.ok) throw new BadRequestException(remote.message);

    const mapped = fromServerConfig(remote.data);
    const timestamp = now();
    const created = await this.prisma.tenantStream.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('STR'),
        tenantBusinessId: server.tenantBusinessId,
        tenantFlussonicServerId: serverId,
        tenantCustomerId: options.tenantCustomerId,
        applicationName: split.applicationName,
        streamKey: split.streamKey,
        name,
        title: mapped.title || name,
        comment: mapped.comment ?? undefined,
        retryLimit: mapped.retry_limit ?? undefined,
        sourceTimeout: mapped.source_timeout ?? undefined,
        isStatic: mapped.static ?? true,
        disabled: mapped.disabled ?? false,
        protocols: mapped.protocols,
        namedBy: (remote.data.named_by as string) === 'external' ? 'EXTERNAL' : 'CONFIG',
        // Adopted as-is, so it is in sync by definition.
        syncStatus: 'IN_SYNC',
        configHash: hashMappedConfig(mapped),
        lastSyncedAt: timestamp,
        createdAt: timestamp,
        createdBy: options.actorId,
        updatedAt: timestamp,
        updatedBy: options.actorId,
        inputs: {
          create: mapped.inputs.map((input, index) => ({
            id: newId(),
            priority: input.priority ?? index + 1,
            url: input.url,
            comment: input.comment ?? undefined,
            sourceTimeout: input.source_timeout ?? undefined,
            timeout: input.timeout ?? undefined,
            framesTimeout: input.frames_timeout ?? undefined,
            userAgent: input.user_agent ?? undefined,
            maxBitrate: input.max_bitrate ?? undefined,
          })),
        },
      },
      include: { inputs: { orderBy: { priority: 'asc' } } },
    });
    return created;
  }

  private async recordSync(
    streamId: string,
    syncStatus: TenantStreamSyncStatus,
    configHash?: string | null,
  ): Promise<TenantStreamSyncStatus> {
    await this.prisma.tenantStream.update({
      where: { id: streamId },
      data: {
        syncStatus,
        ...(configHash !== undefined ? { configHash } : {}),
        ...(syncStatus === 'IN_SYNC' ? { lastSyncedAt: now() } : {}),
      },
    });
    return syncStatus;
  }
}
