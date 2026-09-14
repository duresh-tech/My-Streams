/**
 * Pure rules for stream events and their email alerts - no database, no clock,
 * no network - so each is testable on its own.
 */

/** The events a streaming server can send here, as Flussonic 24.03 names them. */
export const STREAM_EVENT_GROUPS = [
  {
    group: 'SOURCE',
    label: 'Source',
    events: ['source_opened', 'source_connected', 'source_started', 'source_updated', 'source_closed'],
  },
  { group: 'STREAM', label: 'Stream', events: ['stream_opened', 'stream_updated', 'stream_closed'] },
  { group: 'VIEWER', label: 'Viewer', events: ['play_opened', 'play_started', 'play_updated', 'play_closed'] },
] as const;

export type StreamEventType = (typeof STREAM_EVENT_GROUPS)[number]['events'][number];

export const STREAM_EVENT_TYPES = STREAM_EVENT_GROUPS.flatMap((g) => g.events) as StreamEventType[];

/**
 * Source and stream events on, viewer events off: `play_updated` fires every
 * few seconds for every viewer, which on a busy server is a flood.
 */
export const DEFAULT_EVENT_TYPES = STREAM_EVENT_GROUPS.filter((g) => g.group !== 'VIEWER').flatMap(
  (g) => g.events,
) as StreamEventType[];

/** A cap per webhook request, so one oversized batch cannot stall ingestion. */
export const MAX_EVENTS_PER_REQUEST = 1000;

export interface IncomingEvent {
  event: string;
  media: string | null;
  /** Epoch seconds: the server's `utc_ms` when present, else when it was received. */
  occurredAt: number;
  payload: Record<string, unknown>;
}

/**
 * The server may post one event, an array of them, or `{ events: [...] }`.
 * Anything without a string `event` is not an event and is dropped.
 */
export function normalizeIncomingEvents(body: unknown, receivedAt: number): IncomingEvent[] {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const list: unknown[] = Array.isArray(body)
    ? body
    : record && Array.isArray(record.events)
      ? (record.events as unknown[])
      : [body];

  return list
    .filter((item): item is Record<string, unknown> =>
      !!item && typeof item === 'object' && typeof (item as Record<string, unknown>).event === 'string',
    )
    .slice(0, MAX_EVENTS_PER_REQUEST)
    .map((item) => ({
      event: String(item.event).slice(0, 40),
      media: typeof item.media === 'string' ? item.media.slice(0, 200) : null,
      occurredAt: typeof item.utc_ms === 'number' ? Math.floor(item.utc_ms / 1000) : receivedAt,
      payload: item,
    }));
}

/** Only known event names, de-duplicated, in the canonical order. */
export function sanitizeEventTypes(value: unknown): StreamEventType[] {
  const wanted = new Set(jsonStringArray(value));
  return STREAM_EVENT_TYPES.filter((type) => wanted.has(type));
}

/** A JSON column holding a string array; anything else reads as empty. */
export function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export interface AlertRuleScope {
  events: string[];
  serverIds: string[];
  streamIds: string[];
  customerIds: string[];
}

export interface EventContext {
  event: string;
  serverId: string;
  streamId: string | null;
  customerId: string | null;
}

/**
 * A rule fires for an event it lists (a rule listing none never fires) whose
 * server, stream and customer are each within scope - an empty scope list
 * means all. A stream- or customer-scoped rule never matches media that is not
 * a managed stream, because there is nothing to compare.
 */
export function ruleMatches(rule: AlertRuleScope, ctx: EventContext): boolean {
  if (!rule.events.includes(ctx.event)) return false;
  if (rule.serverIds.length > 0 && !rule.serverIds.includes(ctx.serverId)) return false;
  if (rule.streamIds.length > 0 && (!ctx.streamId || !rule.streamIds.includes(ctx.streamId))) return false;
  if (rule.customerIds.length > 0 && (!ctx.customerId || !rule.customerIds.includes(ctx.customerId))) {
    return false;
  }
  return true;
}

/** The key a cooldown is kept under: the managed stream, or else the raw media name. */
export function cooldownKey(streamId: string | null, media: string | null): string {
  return streamId ? `stream:${streamId}` : `media:${media ?? ''}`.slice(0, 220);
}

export function cooldownActive(lastSentAt: number | null, at: number, cooldownMinutes: number): boolean {
  return cooldownMinutes > 0 && lastSentAt !== null && at - lastSentAt < cooldownMinutes * 60;
}

/** Email addresses trimmed and de-duplicated case-insensitively, blanks and missing ones dropped. */
export function alertRecipients(recipients: string[], customerEmails: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...recipients, ...customerEmails.filter((email): email is string => !!email)]) {
    const email = raw.trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

/**
 * The customer addresses an alert Bccs, excluding anyone already a direct
 * recipient: none, the stream's owner, or the owner plus the customers assigned
 * to the stream's server.
 */
export function customerBcc(
  mode: 'NONE' | 'STREAM_OWNER' | 'SERVER_CUSTOMERS',
  ownerEmail: string | null | undefined,
  serverCustomerEmails: string[],
  directRecipients: string[],
): string[] {
  if (mode === 'NONE') return [];
  const direct = new Set(directRecipients.map((email) => email.toLowerCase()));
  return alertRecipients([], [ownerEmail, ...(mode === 'SERVER_CUSTOMERS' ? serverCustomerEmails : [])]).filter(
    (email) => !direct.has(email.toLowerCase()),
  );
}

export type RuleOutcome ='SENT' | 'COOLDOWN' | 'FAILED' | 'NO_MAIL_CONFIG';
export type EmailStatus = 'NOT_MATCHED' | RuleOutcome;

/** One status for an event that may have matched several rules: the most informative wins. */
export function aggregateEmailStatus(outcomes: RuleOutcome[]): EmailStatus {
  if (outcomes.length === 0) return 'NOT_MATCHED';
  for (const status of ['SENT', 'FAILED', 'NO_MAIL_CONFIG', 'COOLDOWN'] as const) {
    if (outcomes.includes(status)) return status;
  }
  return 'NOT_MATCHED';
}
