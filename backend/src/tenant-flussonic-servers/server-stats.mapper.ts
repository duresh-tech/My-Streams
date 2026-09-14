/**
 * Maps the streaming server's runtime status onto our own field names.
 *
 * Two reasons not to pass the payload straight through:
 *
 * - The client apps must never carry the vendor's vocabulary, the same rule the
 *   rest of this module follows (`serverVersion`, not `flussonic_version`).
 * - The raw payload is large and mostly irrelevant - per-profile transcoder
 *   counters, licence text, module flags. Only the operational figures are
 *   mapped; everything unmapped is simply dropped.
 *
 * Every field is optional on the wire, so each one is read defensively and
 * comes out null rather than undefined when absent.
 */

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // Some counters arrive as strings on older builds.
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/**
 * Normalises a timestamp to epoch seconds, the unit every stored timestamp in
 * this app uses. Observed live: `started_at` is in seconds but `now` is in
 * milliseconds, so a bare pass-through would render the server clock as a date
 * tens of thousands of years out.
 */
function epochSeconds(value: unknown): number | null {
  const raw = num(value);
  if (raw === null) return null;
  // 1e11 seconds is the year 5138, so anything larger is milliseconds.
  return raw > 1e11 ? Math.floor(raw / 1000) : Math.floor(raw);
}

function str(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value;
  // streamer_status and license_type are documented as enums but have been
  // seen as objects; a readable label beats dropping the field.
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export interface ServerPartition {
  path: string | null;
  size: number | null;
  used: number | null;
  available: number | null;
  usedPercent: number | null;
}

/**
 * Disk partitions, normalised. The server reports either a `use` percentage or
 * size/used pairs depending on build, so the percentage is derived when it is
 * missing and both sizes are present.
 */
function partitions(value: unknown): ServerPartition[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = obj(entry) ?? {};
    const size = num(row.size) ?? num(row.total);
    const used = num(row.used);
    const available = num(row.available) ?? num(row.avail) ?? (size !== null && used !== null ? size - used : null);
    const reported = num(row.use) ?? num(row.used_percent) ?? num(row.usage);
    return {
      path: str(row.path) ?? str(row.mount) ?? str(row.name),
      size,
      used,
      available,
      usedPercent: reported ?? (size && used !== null ? Math.round((used / size) * 100) : null),
    };
  });
}

export interface ServerStats {
  /** Identity and build */
  serverVersion: string | null;
  build: number | null;
  hostname: string | null;
  runtimeId: string | null;
  /** Epoch seconds, as every timestamp in this app */
  startedAt: number | null;
  serverTime: number | null;
  uptime: number | null;

  /** Load */
  cpuUsage: number | null;
  memoryUsage: number | null;
  schedulerLoad: number | null;
  bandwidthUsage: number | null;
  totalBandwidth: number | null;

  /** Traffic */
  totalClients: number | null;
  totalStreams: number | null;
  onlineStreams: number | null;
  openedFiles: number | null;
  inputKbit: number | null;
  outputKbit: number | null;

  /** Health */
  streamerStatus: string | null;
  licenseType: string | null;
  configVersion: string | null;
  nextVersion: string | null;
  configError: unknown;
  textAlerts: Record<string, unknown> | null;
  transcoderCapable: boolean | null;

  partitions: ServerPartition[];

  /** Capacity and cumulative counters, when the server reports them */
  cpuUnits: number | null;
  ramBytes: number | null;
  inputsBandwidth: number | null;
  outputBandwidth: number | null;
  transcodedStreams: number | null;
  openedSessions: number | null;
  totalSessions: number | null;
  dvrStorageBytes: number | null;
}

export function mapServerStats(raw: Record<string, unknown>): ServerStats {
  return {
    serverVersion: str(raw.server_version),
    build: num(raw.build),
    hostname: str(raw.hostname),
    runtimeId: str(raw.id),
    startedAt: epochSeconds(raw.started_at),
    // `now` is the server's own clock, useful for spotting a skewed host.
    serverTime: epochSeconds(raw.now),
    uptime: num(raw.uptime),

    cpuUsage: num(raw.cpu_usage),
    memoryUsage: num(raw.memory_usage),
    schedulerLoad: num(raw.scheduler_load),
    bandwidthUsage: num(raw.bandwidth_usage),
    totalBandwidth: num(raw.total_bandwidth),

    totalClients: num(raw.total_clients),
    totalStreams: num(raw.total_streams),
    onlineStreams: num(raw.online_streams),
    openedFiles: num(raw.opened_files),
    inputKbit: num(raw.input_kbit),
    outputKbit: num(raw.output_kbit),

    streamerStatus: str(raw.streamer_status),
    licenseType: str(raw.license_type),
    configVersion: str(raw.config_version),
    nextVersion: str(raw.next_version),
    configError: raw.config_error ?? null,
    textAlerts: obj(raw.text_alerts),
    transcoderCapable: bool(raw.transcoder),

    partitions: partitions(raw.partitions),

    cpuUnits: num(raw.cpu_units),
    ramBytes: num(raw.ram_bytes),
    inputsBandwidth: num(raw.inputs_bandwidth),
    outputBandwidth: num(raw.output_bandwidth),
    transcodedStreams: num(raw.transcoded_streams),
    openedSessions: num(raw.playback_opened_sessions),
    totalSessions: num(raw.playback_total_sessions),
    dvrStorageBytes: num(raw.dvr_storage_bytes),
  };
}
