import { z } from 'zod';

/**
 * Playback protocols, exactly as the server's `play_protocols_spec` declares
 * them. This array is the single place the list is defined - the Zod schema,
 * the defaults and the API docs all derive from it, so adding a protocol is a
 * one-line change with no migration.
 */
export const PLAY_PROTOCOLS = [
  'hls',
  'cmaf',
  'dash',
  'player',
  'mss',
  'rtmp',
  'rtsp',
  'm4f',
  'm4s',
  'mseld',
  'tshttp',
  'webrtc',
  'srt',
  'shoutcast',
  'mp4',
  'jpeg',
  'api',
] as const;

export type PlayProtocol = (typeof PLAY_PROTOCOLS)[number];

/**
 * `whitelist` is NOT a protocol - it inverts the meaning of the whole set:
 *   true  -> only the enabled protocols may play
 *   false -> the enabled protocols are forbidden, everything else may play
 * Treating it as an eighteenth protocol would turn an allow-list into a
 * deny-list for every stream, so it is modelled separately here and must be
 * labelled as a mode switch in any UI.
 */
export const StreamProtocolsSchema = z.object({
  whitelist: z.boolean().default(true),
  ...Object.fromEntries(
    PLAY_PROTOCOLS.map((protocol) => [protocol, z.boolean().default(false)]),
  ),
}) as z.ZodObject<
  { whitelist: z.ZodDefault<z.ZodBoolean> } & Record<PlayProtocol, z.ZodDefault<z.ZodBoolean>>
>;

export type StreamProtocols = z.infer<typeof StreamProtocolsSchema>;

/** Allow-list mode with nothing enabled yet - the safe default for a new stream. */
export function defaultProtocols(): StreamProtocols {
  return StreamProtocolsSchema.parse({});
}

/**
 * Narrows an arbitrary JSON column value back to the protocol shape. A row
 * written before a protocol was added simply gets `false` for it.
 */
export function parseProtocols(value: unknown): StreamProtocols {
  const result = StreamProtocolsSchema.safeParse(value ?? {});
  return result.success ? result.data : defaultProtocols();
}
