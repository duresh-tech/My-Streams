import { decryptSecret } from './crypto.util';

/** The connection-relevant shape of a server row, so callers can pass a partial select. */
export interface StreamerConnection {
  useSSL: boolean;
  domain: string | null;
  hostName: string;
  hostPort: number;
  apiBasePath: string;
  flussonicApiUsername: string | null;
  flussonicApiPasswordEnc: string | null;
  flussonicApiAccessToken: string | null;
}

/** Base URL of a server's API, e.g. http://host:8080/streamer/api/v3 */
export function streamerBaseUrl(server: StreamerConnection): string {
  const scheme = server.useSSL ? 'https' : 'http';
  const host = server.domain || server.hostName;
  return `${scheme}://${host}:${server.hostPort}${server.apiBasePath}`;
}

/**
 * Epoch seconds from a streamer timestamp.
 *
 * The streamer reports some timestamps in milliseconds, so a value is scaled
 * down until it lands in a sane epoch-seconds range. This fails silently
 * otherwise: a millisecond value read as seconds is a date around the year
 * 58,000, which still formats as a plausible clock time, while any arithmetic
 * against the present (such as a session's duration) comes out negative.
 */
export function streamerEpochSeconds(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  let seconds = value;
  // 1e11 seconds is the year 5138 - any genuine timestamp in seconds is below it.
  while (seconds > 1e11) seconds /= 1000;
  return Math.floor(seconds);
}

/**
 * The HTTP Basic credential for a server. The stored access token is already
 * base64(user:password), so it is used directly; otherwise it is rebuilt from
 * the username and the decrypted password. Null when no credential is stored.
 */
export function streamerCredential(server: StreamerConnection): string | null {
  if (server.flussonicApiAccessToken) return decryptSecret(server.flussonicApiAccessToken);
  if (server.flussonicApiUsername && server.flussonicApiPasswordEnc) {
    return Buffer.from(
      `${server.flussonicApiUsername}:${decryptSecret(server.flussonicApiPasswordEnc)}`,
    ).toString('base64');
  }
  return null;
}
