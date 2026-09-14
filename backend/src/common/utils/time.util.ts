import { Logger } from '@nestjs/common';

const logger = new Logger('Timezone');

/** Used when APP_TIMEZONE is not set, so behaviour is defined rather than host-dependent. */
export const DEFAULT_TIMEZONE = 'UTC';

/**
 * Timestamps in this app are stored as UNIX epoch seconds, which are absolute -
 * an instant is the same number everywhere on earth. So a timezone cannot and
 * does not change what is stored; it decides how an instant is *rendered* and
 * how a naive date string ("1990-04-12") is interpreted.
 *
 * Setting `process.env.TZ` at boot makes that one zone apply to the whole
 * process: every `Date` formatting call, `toLocaleString`, log line, and any
 * naive date parsing. Node applies a runtime change to TZ, but only to Date
 * work that happens afterwards - which is why this runs as the first statement
 * in main.ts, before Nest is created.
 */
export function applyAppTimezone(): string {
  const configured = process.env.APP_TIMEZONE?.trim();
  const timezone = configured || DEFAULT_TIMEZONE;

  if (!isValidTimezone(timezone)) {
    // A typo must not silently fall back to the host zone: that would make
    // timestamps differ between machines with nothing to explain it.
    logger.error(
      `APP_TIMEZONE="${timezone}" is not a recognised IANA timezone. Falling back to ${DEFAULT_TIMEZONE}.`,
    );
    process.env.TZ = DEFAULT_TIMEZONE;
    return DEFAULT_TIMEZONE;
  }

  process.env.TZ = timezone;
  if (!configured) {
    logger.warn(`APP_TIMEZONE is not set; using ${DEFAULT_TIMEZONE}.`);
  } else {
    logger.log(`Application timezone: ${timezone}`);
  }
  return timezone;
}

/** The timezone in force, after `applyAppTimezone()` has run. */
export function appTimezone(): string {
  return process.env.TZ || DEFAULT_TIMEZONE;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Renders an epoch-seconds timestamp in the application timezone.
 * Format: `YYYY-MM-DD HH:mm:ss`, which sorts lexicographically and has no
 * locale ambiguity - unlike toLocaleString, whose output varies by host.
 */
export function formatTimestamp(
  epochSeconds: number | bigint | null | undefined,
  timezone = appTimezone(),
): string | null {
  if (epochSeconds === null || epochSeconds === undefined) return null;
  const seconds = typeof epochSeconds === 'bigint' ? Number(epochSeconds) : epochSeconds;
  if (!Number.isFinite(seconds)) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(seconds * 1000));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  // `hour: '2-digit'` with hour12:false yields 24 at midnight in some runtimes.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`;
}

/** The date portion only, in the application timezone. */
export function formatDate(
  epochSeconds: number | bigint | null | undefined,
  timezone = appTimezone(),
): string | null {
  return formatTimestamp(epochSeconds, timezone)?.slice(0, 10) ?? null;
}
