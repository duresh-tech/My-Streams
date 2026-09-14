/**
 * Shared stream types. Extracted so the list page and the stream view can use
 * the same form dialog instead of maintaining two copies of a large form.
 *
 * PLAY_PROTOCOLS must match the backend's list; `whitelist` is deliberately not
 * in it, being a mode switch rather than a protocol.
 */
export const PLAY_PROTOCOLS = [
  "hls",
  "cmaf",
  "dash",
  "player",
  "mss",
  "rtmp",
  "rtsp",
  "m4f",
  "m4s",
  "mseld",
  "tshttp",
  "webrtc",
  "srt",
  "shoutcast",
  "mp4",
  "jpeg",
  "api",
] as const;

export type StreamStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "DELETED";

export type SyncStatus =
  | "IN_SYNC"
  | "PENDING_PUSH"
  | "MISSING_ON_SERVER"
  | "ORPHAN_ON_SERVER"
  | "CONFLICT"
  | "RENAMING"
  | "TRANSFERRING"
  | "UNREACHABLE";

export const SYNC_BADGE: Record<
  SyncStatus,
  { label: string; variant: "success" | "destructive" | "warning" | "info" | "outline" }
> = {
  IN_SYNC: { label: "In sync", variant: "success" },
  PENDING_PUSH: { label: "Pending push", variant: "warning" },
  MISSING_ON_SERVER: { label: "Missing on server", variant: "warning" },
  ORPHAN_ON_SERVER: { label: "Unmanaged", variant: "info" },
  CONFLICT: { label: "Conflict", variant: "destructive" },
  RENAMING: { label: "Renaming", variant: "info" },
  TRANSFERRING: { label: "Transferring", variant: "info" },
  UNREACHABLE: { label: "Unreachable", variant: "destructive" },
};

export type Protocols = { whitelist: boolean } & Record<string, boolean>;

export interface StreamInput {
  id?: string;
  priority?: number;
  url: string;
  comment?: string | null;
  sourceTimeout?: number | null;
}

export interface StreamRow {
  id: string;
  systemCode: string;
  serverId: string;
  tenantCustomerId: string | null;
  applicationName: string | null;
  streamKey: string;
  name: string;
  title: string;
  ingestDomain: string | null;
  useSSL: boolean;
  comment: string | null;
  retryLimit: number | null;
  sourceTimeout: number | null;
  isStatic: boolean;
  disabled: boolean;
  protocols: Protocols;
  status: StreamStatus;
  syncStatus: SyncStatus;
  inputs: StreamInput[];
  server?: {
    id: string;
    name: string;
    /** The server's own state; the actions that reach it need ACTIVE. */
    status?: string;
    connectionStatus?: string;
  };
  tenantCustomer?: { id: string; customerCode: string; fName: string; lName: string | null };
}

export interface StreamOption {
  id: string;
  name: string;
}

export interface FormInput {
  url: string;
  sourceTimeout: string;
  comment: string;
}

export interface FormValues {
  serverId: string;
  useSSL: boolean;
  tenantCustomerId: string;
  applicationName: string;
  streamKey: string;
  title: string;
  ingestDomain: string;
  comment: string;
  retryLimit: string;
  sourceTimeout: string;
  isStatic: boolean;
  disabled: boolean;
  protocols: Protocols;
  inputs: FormInput[];
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

/** Allow-list mode with nothing enabled - the safe default for a new stream. */
export function emptyProtocols(): Protocols {
  return { whitelist: true, ...Object.fromEntries(PLAY_PROTOCOLS.map((p) => [p, false])) };
}

export const EMPTY_INPUT: FormInput = { url: "", sourceTimeout: "", comment: "" };

export const EMPTY_FORM: FormValues = {
  serverId: "",
  useSSL: false,
  tenantCustomerId: "",
  applicationName: "",
  streamKey: "",
  title: "",
  ingestDomain: "",
  comment: "",
  retryLimit: "",
  sourceTimeout: "",
  isStatic: true,
  disabled: false,
  protocols: emptyProtocols(),
  inputs: [{ ...EMPTY_INPUT }],
  status: "ACTIVE",
};

/** Form values for an existing stream. */
export function formFromStream(row: StreamRow): FormValues {
  return {
    serverId: row.serverId,
    useSSL: row.useSSL,
    tenantCustomerId: row.tenantCustomerId ?? "",
    applicationName: row.applicationName ?? "",
    streamKey: row.streamKey,
    title: row.title,
    ingestDomain: row.ingestDomain ?? "",
    comment: row.comment ?? "",
    retryLimit: row.retryLimit == null ? "" : String(row.retryLimit),
    sourceTimeout: row.sourceTimeout == null ? "" : String(row.sourceTimeout),
    isStatic: row.isStatic,
    disabled: row.disabled,
    protocols: { ...emptyProtocols(), ...row.protocols },
    inputs:
      row.inputs.length > 0
        ? row.inputs.map((input) => ({
            url: input.url,
            sourceTimeout: input.sourceTimeout == null ? "" : String(input.sourceTimeout),
            comment: input.comment ?? "",
          }))
        : [{ ...EMPTY_INPUT }],
    status: row.status === "DELETED" ? "ACTIVE" : row.status,
  };
}

/**
 * The server-side name: `application/key`, or a bare key when there is no
 * application prefix. Mirrors buildStreamName on the backend.
 */
export function deriveStreamName(applicationName: string, streamKey: string): string {
  if (!streamKey) return "";
  return applicationName ? `${applicationName}/${streamKey}` : streamKey;
}

/**
 * Optional fields send `null` when emptied, not `undefined`.
 *
 * `undefined` is dropped from the JSON body entirely, which the API reads as
 * "leave this alone" - so clearing a field in the form could never clear it in
 * the database. `null` is an explicit "remove this".
 */
export function clearable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Same, for numeric fields typed as strings in the form. */
export function clearableNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}
