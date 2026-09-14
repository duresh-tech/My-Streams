import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { now } from '../common/utils/id.util';
import { StreamerApiService } from '../tenant-streams/streamer-api.service';
import { sanitizeEventTypes } from '../tenant-stream-events/stream-events.logic';

/**
 * Keeps each streaming server's event sink - where it posts events and which
 * ones - in line with the server's stored settings. One sink per server row,
 * named after it, so two businesses pointing at the same streaming host never
 * overwrite each other's sink.
 */
@Injectable()
export class EventSinkService {
  private readonly logger = new Logger(EventSinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly streamer: StreamerApiService,
    private readonly config: ConfigService,
  ) {}

  /** The API's public base URL (with /api/v1), or null when stream events cannot be offered. */
  publicApiUrl(): string | null {
    const value = (this.config.get<string>('PUBLIC_API_URL') ?? '').trim().replace(/\/+$/, '');
    return value || null;
  }

  static sinkName(serverId: string): string {
    return `mystreams-${serverId}`;
  }

  /**
   * Creates, updates or removes the sink on the server. Never throws: the
   * outcome is recorded on the server row (eventSinkSyncedAt / eventSinkError)
   * so a failed sync never fails the save that triggered it.
   */
  async sync(serverId: string): Promise<{ ok: boolean; error: string | null }> {
    const server = await this.prisma.tenantFlussonicServer.findUnique({ where: { id: serverId } });
    if (!server) return { ok: false, error: 'Server not found' };

    const name = EventSinkService.sinkName(server.id);
    let error: string | null = null;

    if (!server.eventsEnabled || server.status === 'DELETED') {
      const removed = await this.streamer.deleteEventSink(server, name);
      if (!removed.ok) error = `Could not remove the event sink: ${removed.message}`;
    } else {
      const base = this.publicApiUrl();
      const types = sanitizeEventTypes(server.eventTypes);
      if (!base) {
        error = 'PUBLIC_API_URL is not set on the backend, so the server has nowhere to send events';
      } else if (types.length === 0) {
        error = 'Choose at least one event to receive';
      } else {
        let token = server.eventWebhookToken;
        if (!token) {
          token = randomBytes(24).toString('hex');
          await this.prisma.tenantFlussonicServer.update({ where: { id: server.id }, data: { eventWebhookToken: token } });
        }
        const saved = await this.streamer.putEventSink(server, name, {
          url: `${base}/webhooks/flussonic/${server.id}/${token}`,
          // Every filter must match; an event matches a filter when it is any of the listed values.
          only: [{ event: types }],
        });
        if (!saved.ok) error = `Could not save the event sink: ${saved.message}`;
      }
    }

    await this.prisma.tenantFlussonicServer.update({
      where: { id: server.id },
      data: { ...(error ? {} : { eventSinkSyncedAt: now() }), eventSinkError: error ? error.slice(0, 500) : null },
    });
    if (error) this.logger.warn(`Event sink for ${server.name}: ${error}`);
    return { ok: !error, error };
  }
}
