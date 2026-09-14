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
