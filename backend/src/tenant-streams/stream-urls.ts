import { parseProtocols } from './stream-protocols';

/** What the builder needs from the stream. */
export interface StreamForUrls {
  name: string;
  ingestDomain: string | null;
  useSSL: boolean;
  protocols: unknown;
  /** Configured sources, in priority order. */
  inputs?: Array<{ priority: number; url: string }>;
}

/** A `publish://` input means the stream waits to be pushed to. */
export function isPublishInput(url: string): boolean {
  return url.trim().toLowerCase().startsWith('publish://');
}

/** What the builder needs from the server hosting it. */
export interface ServerForUrls {
  domain: string | null;
  hostName: string;
  useSSL: boolean;
  httpPort: number;
  httpsPort: number;
  rtmpPort: number;
  rtspPort: number;
  srtPort: number;
}

export interface ProtocolUrl {
  /** Protocol key as enabled on the stream, e.g. "hls". */
  protocol: string;
  /** Display label, e.g. "CMAF (LL-HLS)". */
  label: string;
  url: string;
}

export interface StreamUrls {
  /** Where a publisher pushes to. */
  inputs: ProtocolUrl[];
  /** Where a viewer plays from. */
  outputs: ProtocolUrl[];
  /** Resolved host, scheme and web port, exposed so the UI can explain itself. */
  host: string;
  scheme: 'http' | 'https';
  webPort: number;
}

/**
 * The stream's own ingest domain wins; otherwise the server's domain, falling
 * back to its host/IP.
 */
/**
 * How to pick the host the URLs are built on.
 *
 * `preferServerHost` ignores the stream's own ingest domain and uses the
 * server's. The ingest domain names where a publisher pushes to, which is not
 * necessarily a host that serves playback at all - and if it resolves to
 * plain http, a player running on an https page has its manifest request
 * blocked as mixed content and simply never starts. Public playback therefore
 * builds on the server's domain and its TLS setting.
 */
export interface StreamUrlOptions {
  preferServerHost?: boolean;
}

export function resolveHost(
  stream: StreamForUrls,
  server: ServerForUrls,
  options: StreamUrlOptions = {},
): string {
  const serverHost = server.domain?.trim() || server.hostName;
  if (options.preferServerHost) return serverHost;
  const ingest = stream.ingestDomain?.trim();
  return ingest || serverHost;
}

/**
 * TLS follows whichever host was used: the stream's flag when its own ingest
 * domain is in play, the server's flag otherwise.
 */
export function resolveScheme(
  stream: StreamForUrls,
  server: ServerForUrls,
  options: StreamUrlOptions = {},
): 'http' | 'https' {
  const ingest = stream.ingestDomain?.trim();
  const usingIngest = !options.preferServerHost && !!ingest;
  const secure = usingIngest ? stream.useSSL : server.useSSL;
  return secure ? 'https' : 'http';
}

/**
 * Builds every publish and playback URL for the protocols enabled on a stream.
 *
 * Only enabled protocols appear. `whitelist: false` inverts the meaning of the
 * protocol set - the listed protocols are the *forbidden* ones - so in that
 * mode the enabled flags describe what cannot be played and no URL is offered
 * for them.
 */
export function buildStreamUrls(
  stream: StreamForUrls,
  server: ServerForUrls,
  options: StreamUrlOptions = {},
): StreamUrls {
  const protocols = parseProtocols(stream.protocols);
  const host = resolveHost(stream, server, options);
  const scheme = resolveScheme(stream, server, options);
  const webPort = scheme === 'https' ? server.httpsPort : server.httpPort;
  const name = stream.name;

  // In deny-list mode a ticked protocol is blocked, so the set of playable
  // protocols is the complement - which we cannot enumerate from flags alone.
  // Offering a URL for a blocked protocol would be worse than offering none.
  const enabled = (key: string): boolean =>
    protocols.whitelist ? !!(protocols as Record<string, boolean>)[key] : false;

  const web = `${scheme}://${host}:${webPort}`;

  // What "input" means depends on how the stream is sourced.
  //
  // A `publish://` input means the stream sits waiting for someone to push to
  // it, so the useful thing to show is where to publish - derived from the
  // enabled input protocols. Any other input is a source the server pulls
  // from, and the only correct thing to show is that exact URL: inventing a
  // publish endpoint for a stream that is already pulling would be wrong.
  const configured = [...(stream.inputs ?? [])].sort((a, b) => a.priority - b.priority);
  const inputs: ProtocolUrl[] = [];

  const publishTargets = (): ProtocolUrl[] => {
    const targets: ProtocolUrl[] = [];
    if (enabled('rtmp')) {
      targets.push({ protocol: 'rtmp', label: 'RTMP', url: `rtmp://${host}:${server.rtmpPort}/${name}` });
    }
    if (enabled('srt')) {
      targets.push({
        protocol: 'srt',
        label: 'SRT',
        url: `srt://${host}:${server.srtPort}?streamid=#!::r=${name},m=publish`,
      });
    }
    if (enabled('rtsp')) {
      targets.push({ protocol: 'rtsp', label: 'RTSP', url: `rtsp://${host}:${server.rtspPort}/${name}` });
    }
    return targets;
  };

  if (configured.length === 0) {
    // Nothing configured yet: publish endpoints are the only sensible answer.
    inputs.push(...publishTargets());
  } else {
    let publishExpanded = false;
    for (const input of configured) {
      if (isPublishInput(input.url)) {
        // Several publish:// inputs still describe one set of endpoints.
        if (publishExpanded) continue;
        publishExpanded = true;
        inputs.push(...publishTargets());
        continue;
      }
      const scheme = /^([a-z0-9+.-]+):\/\//i.exec(input.url)?.[1];
      inputs.push({
        protocol: scheme?.toLowerCase() ?? 'source',
        label: scheme ? scheme.toUpperCase() : 'Source',
        url: input.url,
      });
    }
  }

  const outputs: ProtocolUrl[] = [];
  const push = (protocol: string, label: string, url: string) => {
    if (enabled(protocol)) outputs.push({ protocol, label, url });
  };

  push('hls', 'HLS', `${web}/${name}/index.m3u8`);
  push('cmaf', 'CMAF (LL-HLS)', `${web}/${name}/index.ll.m3u8`);
  push('dash', 'DASH', `${web}/${name}/index.mpd`);
  push('mp4', 'MP4', `${web}/${name}/index.mp4`);
  push('rtmp', 'RTMP', `rtmp://${host}:${server.rtmpPort}/${name}`);
  push('rtsp', 'RTSP', `rtsp://${host}:${server.rtspPort}/${name}`);
  push('srt', 'SRT (shared)', `srt://${host}:${server.srtPort}?streamid=#!::r=${name},m=request`);
  push('player', 'Player (embed)', `${web}/${name}/embed.html`);
  push('mss', 'MSS', `${web}/${name}.isml/manifest`);
  push('tshttp', 'MPEG-TS', `${web}/${name}/mpegts`);
  // m4f/m4s keep their own scheme but ride the web port.
  push('m4f', 'M4F', `m4f://${host}:${webPort}/${name}`);
  push('m4s', 'M4S', `m4s://${host}:${webPort}/${name}`);
  push('shoutcast', 'SHOUTcast', `${web}/${name}/shoutcast`);
  push('jpeg', 'JPEG preview', `${web}/${name}/preview.jpg`);
  push('api', 'API — media info', `${web}/${name}/media_info.json`);
  push('api', 'API — recording status', `${web}/${name}/recording_status.json`);

  return { inputs, outputs, host, scheme, webPort };
}
