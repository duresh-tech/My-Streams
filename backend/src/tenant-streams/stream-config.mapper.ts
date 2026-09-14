import { createHash } from 'crypto';
import { PLAY_PROTOCOLS, parseProtocols, type StreamProtocols } from './stream-protocols';

/**
 * The only fields we manage. `stream_config` carries 65 properties - transcoder,
 * dvr, drm, pushes, thumbnails, abr_*, auth hooks and more - and a PUT replaces
 * the whole object, so anything absent from our payload would be wiped. We
 * therefore merge our fields onto the server's current config and hash only
 * this subset, so an unrelated remote change to `dvr` is not read as drift.
 */
export const MAPPED_FIELDS = [
  'title',
  'comment',
  'static',
  'disabled',
  'retry_limit',
  'source_timeout',
  'inputs',
  'protocols',
] as const;

/**
 * Keys a GET returns but a PUT refuses. Sending any of them back fails the whole
 * request with `unknown_key`, which is how the first rename attempt broke.
 *
 * - `name`, `named_by`, `stats`, `srt_port_resolve` are readOnly in the schema.
 *   `name` in particular is carried by the URL, never the body.
 * - `nomedia` is not in `stream_config` at all - an undocumented runtime field.
 * - `config_on_disk` describes what the server read from its own config file;
 *   echoing that back as intent is meaningless at best.
 *
 * A denylist rather than an allowlist on purpose: an allowlist would silently
 * drop a legitimate setting the day Flussonic adds one, which is exactly the
 * config-wiping this merge exists to prevent. If a future version returns
 * another non-writable key, the push fails loudly and the key is added here.
 */
export const NON_WRITABLE_KEYS = [
  'name',
  'named_by',
  'stats',
  'srt_port_resolve',
  'nomedia',
  'config_on_disk',
] as const;

/**
 * Read-only fields the server nests inside each input. `stats` is runtime data
 * (bytes, bitrate, source state) and sending it back crashes the streamer with
 * a 500 rather than a polite rejection, so a shallow strip of the top level is
 * not enough.
 */
export const NON_WRITABLE_INPUT_KEYS = ['stats'] as const;

/** Strips the keys a PUT would reject from a config read off the server. */
export function stripNonWritable(remote: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(remote)) {
    if ((NON_WRITABLE_KEYS as readonly string[]).includes(key)) continue;
    if (key === 'inputs' && Array.isArray(value)) {
      out[key] = value.map((input) =>
        input && typeof input === 'object'
          ? Object.fromEntries(
              Object.entries(input as Record<string, unknown>).filter(
                ([k]) => !(NON_WRITABLE_INPUT_KEYS as readonly string[]).includes(k),
              ),
            )
          : input,
      );
      continue;
    }
    out[key] = value;
  }
  return out;
}

export interface MappedInput {
  url: string;
  priority: number;
  comment?: string | null;
  source_timeout?: number | null;
  timeout?: number | null;
  frames_timeout?: number | null;
  user_agent?: string | null;
  max_bitrate?: number | null;
}

export interface MappedConfig {
  title?: string | null;
  comment?: string | null;
  static?: boolean;
  disabled?: boolean;
  retry_limit?: number | null;
  source_timeout?: number | null;
  inputs: MappedInput[];
  protocols: StreamProtocols;
}

/** Our row shape, narrowed to what the mapper needs. */
export interface StreamForConfig {
  title: string;
  comment: string | null;
  isStatic: boolean;
  disabled: boolean;
  retryLimit: number | null;
  sourceTimeout: number | null;
  protocols: unknown;
  inputs: Array<{
    priority: number;
    url: string;
    comment: string | null;
    sourceTimeout: number | null;
    timeout: number | null;
    framesTimeout: number | null;
    userAgent: string | null;
    maxBitrate: number | null;
  }>;
}

function omitNullish<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)) as T;
}

/** Our row -> the mapped subset of a Flussonic stream_config. */
export function toMappedConfig(stream: StreamForConfig): MappedConfig {
  return {
    title: stream.title,
    comment: stream.comment ?? undefined,
    static: stream.isStatic,
    disabled: stream.disabled,
    retry_limit: stream.retryLimit ?? undefined,
    source_timeout: stream.sourceTimeout ?? undefined,
    inputs: [...stream.inputs]
      .sort((a, b) => a.priority - b.priority)
      .map((input) =>
        omitNullish({
          url: input.url,
          priority: input.priority,
          comment: input.comment ?? undefined,
          source_timeout: input.sourceTimeout ?? undefined,
          timeout: input.timeout ?? undefined,
          frames_timeout: input.framesTimeout ?? undefined,
          user_agent: input.userAgent ?? undefined,
          max_bitrate: input.maxBitrate ?? undefined,
        }) as MappedInput,
      ),
    protocols: parseProtocols(stream.protocols),
  };
}

/**
 * A remote stream_config -> the same mapped subset, so a remote stream can be
 * hashed and compared against ours on equal terms.
 */
export function fromServerConfig(remote: Record<string, unknown>): MappedConfig {
  const rawInputs = Array.isArray(remote.inputs) ? (remote.inputs as Record<string, unknown>[]) : [];
  return {
    title: (remote.title as string) ?? undefined,
    comment: (remote.comment as string) ?? undefined,
    // `static` defaults to true on the server when absent.
    static: remote.static === undefined ? true : !!remote.static,
    disabled: !!remote.disabled,
    retry_limit: (remote.retry_limit as number) ?? undefined,
    source_timeout:
      typeof remote.source_timeout === 'number' ? remote.source_timeout : undefined,
    inputs: rawInputs
      .map((input, index) =>
        omitNullish({
          url: String(input.url ?? ''),
          // The server may omit priority; list order is the fallback.
          priority: typeof input.priority === 'number' ? input.priority : index + 1,
          comment: (input.comment as string) ?? undefined,
          source_timeout: typeof input.source_timeout === 'number' ? input.source_timeout : undefined,
          timeout: (input.timeout as number) ?? undefined,
          frames_timeout: (input.frames_timeout as number) ?? undefined,
          user_agent: (input.user_agent as string) ?? undefined,
          max_bitrate: (input.max_bitrate as number) ?? undefined,
        }) as MappedInput,
      )
      .sort((a, b) => a.priority - b.priority),
    protocols: parseProtocols(remote.protocols),
  };
}

/**
 * The payload for PUT /streams/{name}: the server's current config, stripped of
 * everything it would refuse, with our mapped fields overlaid so unmanaged
 * settings survive our writes. The name is not included - it travels in the URL
 * and is readOnly in the body.
 */
export function toServerConfig(
  stream: StreamForConfig,
  remoteConfig: Record<string, unknown> | null,
): Record<string, unknown> {
  const mapped = toMappedConfig(stream);
  return {
    ...stripNonWritable(remoteConfig ?? {}),
    ...omitNullish(mapped as unknown as Record<string, unknown>),
    // inputs and protocols are replaced wholesale, never merged key-by-key:
    // a removed input must actually disappear.
    inputs: mapped.inputs,
    protocols: mapped.protocols,
  };
}

/**
 * Canonical JSON: object keys sorted at every depth, arrays left in order.
 * Key order must never affect the hash, or every sync reports false drift;
 * input order must affect it, because priority is meaningful.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
}

/** SHA-256 of the canonicalised mapped config - the drift detector. */
export function hashMappedConfig(config: MappedConfig): string {
  // Protocols are normalised through the declared list so a row written before
  // a protocol existed hashes the same as one written after.
  const protocols = parseProtocols(config.protocols);
  const normalised = {
    ...config,
    protocols: {
      whitelist: protocols.whitelist,
      ...Object.fromEntries(PLAY_PROTOCOLS.map((p) => [p, !!protocols[p]])),
    },
  };
  return createHash('sha256').update(canonicalize(normalised)).digest('hex');
}
