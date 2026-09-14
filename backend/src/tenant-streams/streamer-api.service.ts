import { Injectable, Logger } from '@nestjs/common';
import {
  streamerBaseUrl,
  streamerCredential,
  type StreamerConnection,
} from '../common/utils/streamer.util';

const REQUEST_TIMEOUT_MS = 10000;
/** Guard against an unbounded loop if a server keeps handing back a cursor. */
const MAX_PAGES = 200;
const PAGE_SIZE = 100;

export interface RemoteSession {
  id: string;
  name?: string;
  type?: string;
  proto?: string;
  ip?: string;
  country?: string;
  user_agent?: string;
  user_id?: string;
  bytes?: number;
  opened_at?: number;
  duration?: number;
}

export interface RemoteStream {
  name: string;
  named_by?: string;
  config: Record<string, unknown>;
}

export type StreamerResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'UNAUTHORIZED' | 'UNREACHABLE' | 'NOT_FOUND' | 'REJECTED'; message: string };

/**
 * Thin HTTP client for one streaming server's API. Every method returns a
 * result object rather than throwing: a server being down is an expected
 * outcome that callers record as sync state, not an exception.
 */
@Injectable()
export class StreamerApiService {
  private readonly logger = new Logger(StreamerApiService.name);

  /** Cursor-paged listing. The server caps a page at 100, so this must page. */
  async listStreams(server: StreamerConnection): Promise<StreamerResult<RemoteStream[]>> {
    const streams: RemoteStream[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) query.set('cursor', cursor);

      const result = await this.request<{
        streams?: Record<string, unknown>[];
        next?: string | null;
      }>(server, `/streams?${query.toString()}`, 'GET');
      if (!result.ok) return result;

      for (const raw of result.data.streams ?? []) {
        streams.push({
          name: String(raw.name ?? ''),
          named_by: raw.named_by as string | undefined,
          config: raw,
        });
      }

      const next = result.data.next;
      if (!next) return { ok: true, data: streams };
      cursor = next;
    }

    this.logger.warn(`listStreams stopped at ${MAX_PAGES} pages for ${streamerBaseUrl(server)}`);
    return { ok: true, data: streams };
  }

  /** Cursor-paged session listing; the endpoint offers no per-stream filter. */
  async listSessions(server: StreamerConnection): Promise<StreamerResult<RemoteSession[]>> {
    const sessions: RemoteSession[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) query.set('cursor', cursor);

      const result = await this.request<{ sessions?: RemoteSession[]; next?: string | null }>(
        server,
        `/sessions?${query.toString()}`,
        'GET',
      );
      if (!result.ok) return result;

      sessions.push(...(result.data.sessions ?? []));
      const next = result.data.next;
      if (!next) return { ok: true, data: sessions };
      cursor = next;
    }
    this.logger.warn(`listSessions stopped at ${MAX_PAGES} pages`);
    return { ok: true, data: sessions };
  }

  async getStream(
    server: StreamerConnection,
    name: string,
  ): Promise<StreamerResult<Record<string, unknown>>> {
    return this.request(server, `/streams/${encodeURIComponent(name)}`, 'GET');
  }

  async putStream(
    server: StreamerConnection,
    name: string,
    config: Record<string, unknown>,
  ): Promise<StreamerResult<unknown>> {
    return this.request(server, `/streams/${encodeURIComponent(name)}`, 'PUT', config);
  }

  async deleteStream(server: StreamerConnection, name: string): Promise<StreamerResult<unknown>> {
    const result = await this.request<unknown>(
      server,
      `/streams/${encodeURIComponent(name)}`,
      'DELETE',
    );
    // Already absent is the outcome a delete wants, so it is not a failure.
    if (!result.ok && result.reason === 'NOT_FOUND') return { ok: true, data: null };
    return result;
  }

  async getEventSink(
    server: StreamerConnection,
    name: string,
  ): Promise<StreamerResult<Record<string, unknown>>> {
    return this.request(server, `/event_sinks/${encodeURIComponent(name)}`, 'GET');
  }

  /** Creates or replaces an event sink - where and which events the server posts. */
  async putEventSink(
    server: StreamerConnection,
    name: string,
    config: Record<string, unknown>,
  ): Promise<StreamerResult<unknown>> {
    return this.request(server, `/event_sinks/${encodeURIComponent(name)}`, 'PUT', config);
  }

  async deleteEventSink(server: StreamerConnection, name: string): Promise<StreamerResult<unknown>> {
    const result = await this.request<unknown>(
      server,
      `/event_sinks/${encodeURIComponent(name)}`,
      'DELETE',
    );
    // Already absent is the outcome a delete wants, so it is not a failure.
    if (!result.ok && result.reason === 'NOT_FOUND') return { ok: true, data: null };
    return result;
  }

  /**
   * Runtime status of the whole server, not one stream: version, load, client
   * and stream counts, throughput. The same endpoint the connectivity probe
   * uses, so a successful read also proves the credentials work.
   */
  async getServerStats(
    server: StreamerConnection,
  ): Promise<StreamerResult<Record<string, unknown>>> {
    return this.request<Record<string, unknown>>(server, '/config/stats', 'GET');
  }

  private async request<T>(
    server: StreamerConnection,
    path: string,
    method: 'GET' | 'PUT' | 'DELETE' | 'POST',
    body?: unknown,
  ): Promise<StreamerResult<T>> {
    const credential = streamerCredential(server);
    if (!credential) {
      return { ok: false, reason: 'UNAUTHORIZED', message: 'No credentials stored for this server' };
    }

    try {
      const response = await fetch(`${streamerBaseUrl(server)}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${credential}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 401 || response.status === 403) {
        return { ok: false, reason: 'UNAUTHORIZED', message: 'Server rejected the credentials' };
      }
      if (response.status === 404) {
        return { ok: false, reason: 'NOT_FOUND', message: 'Stream not found on the server' };
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          ok: false,
          reason: 'REJECTED',
          message: `Server returned ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
        };
      }

      // DELETE and PUT may answer with an empty body.
      const text = await response.text();
      return { ok: true, data: (text ? JSON.parse(text) : null) as T };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      return { ok: false, reason: 'UNREACHABLE', message };
    }
  }
}
