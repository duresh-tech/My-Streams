/**
 * Timestamp formatting in the backend's timezone.
 *
 * The zone is not configured here: it comes from the backend's public branding
 * endpoint (APP_TIMEZONE). Keeping a second copy in the frontend env would let
 * the two drift, and then the same instant would read differently depending on
 * which side rendered it.
 *
 * Timestamps from the API are UNIX epoch seconds, which are absolute - the zone
 * only decides how an instant is displayed.
 */

/** Used before the backend's zone has loaded, and if it never does. */
export const FALLBACK_TIMEZONE = "UTC";

function parts(
  epochSeconds: number,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour12: false,
    ...options,
  });
  const result: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(epochSeconds * 1000))) {
    result[part.type] = part.value;
  }
  // `hour: '2-digit'` with hour12:false renders midnight as 24 in some runtimes.
  if (result.hour === "24") result.hour = "00";
  return result;
}

function isRenderable(epochSeconds: number | null | undefined): epochSeconds is number {
  return typeof epochSeconds === "number" && Number.isFinite(epochSeconds);
}

/** `YYYY-MM-DD HH:mm:ss` - sorts correctly and has no locale ambiguity. */
export function formatDateTime(
  epochSeconds: number | null | undefined,
  timezone = FALLBACK_TIMEZONE,
): string {
  if (!isRenderable(epochSeconds)) return "—";
  const p = parts(epochSeconds, timezone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Date only. */
export function formatDateOnly(
  epochSeconds: number | null | undefined,
  timezone = FALLBACK_TIMEZONE,
): string {
  if (!isRenderable(epochSeconds)) return "—";
  const p = parts(epochSeconds, timezone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${p.year}-${p.month}-${p.day}`;
}

/** Clock time only, for dense tables where the date is implied. */
export function formatTimeOnly(
  epochSeconds: number | null | undefined,
  timezone = FALLBACK_TIMEZONE,
): string {
  if (!isRenderable(epochSeconds)) return "—";
  const p = parts(epochSeconds, timezone, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${p.hour}:${p.minute}:${p.second}`;
}

/** A `Date` (rather than epoch seconds) rendered in the same zone. */
export function formatDateObject(date: Date | null | undefined, timezone = FALLBACK_TIMEZONE): string {
  if (!date || Number.isNaN(date.getTime())) return "—";
  return formatDateTime(Math.floor(date.getTime() / 1000), timezone);
}

/** Clock time of a `Date`, in the same zone. */
export function formatDateObjectTime(
  date: Date | null | undefined,
  timezone = FALLBACK_TIMEZONE,
): string {
  if (!date || Number.isNaN(date.getTime())) return "—";
  return formatTimeOnly(Math.floor(date.getTime() / 1000), timezone);
}
