import { addDuration, calendarDate, startOfDate } from '../../tenant-billing/billing-math';
import { appTimezone } from './time.util';

/** The time ranges a dashboard can show. */
export const DASHBOARD_RANGES = ['30d', '90d', '12m'] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export interface Bucket {
  key: string;
  label: string;
  /** Epoch seconds, inclusive. */
  start: number;
  /** Epoch seconds, exclusive - the next bucket's start. */
  end: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Moves a YYYY-MM-DD calendar date by whole days; no timezone is involved. */
function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function dayLabel(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

/**
 * Contiguous buckets ending with the one that contains `at`, on the calendar of
 * `timeZone`: 30 days, 13 weeks (for 90 days - 90 daily bars are unreadable),
 * or 12 calendar months.
 */
export function rangeBuckets(range: DashboardRange, at: number, timeZone = appTimezone()): Bucket[] {
  const today = calendarDate(at, timeZone);

  if (range === '12m') {
    const [year, month] = today.split('-').map(Number);
    return Array.from({ length: 12 }, (_, i) => {
      const index = year * 12 + (month - 1) - (11 - i);
      const y = Math.floor(index / 12);
      const m = (index % 12) + 1;
      const first = `${y}-${String(m).padStart(2, '0')}-01`;
      const start = startOfDate(first, timeZone);
      return { key: first.slice(0, 7), label: `${MONTHS[m - 1]} ${String(y).slice(2)}`, start, end: addDuration(start, 1, 'MONTH', timeZone) };
    });
  }

  const [count, step] = range === '30d' ? [30, 1] : [13, 7];
  return Array.from({ length: count }, (_, i) => {
    const first = shiftDate(today, -step * (count - 1 - i) - (step - 1));
    return {
      key: first,
      label: step === 1 ? dayLabel(first) : `w/c ${dayLabel(first)}`,
      start: startOfDate(first, timeZone),
      end: startOfDate(shiftDate(first, step), timeZone),
    };
  });
}

/** The bucket an instant falls in, or -1 outside the range. */
export function bucketIndex(buckets: Bucket[], at: number | bigint): number {
  const t = Number(at);
  if (buckets.length === 0 || t < buckets[0].start || t >= buckets[buckets.length - 1].end) return -1;
  return buckets.findIndex((bucket) => t >= bucket.start && t < bucket.end);
}

/** How many instants fall in each bucket. */
export function countSeries(buckets: Bucket[], instants: Array<number | bigint>): number[] {
  const series = buckets.map(() => 0);
  for (const at of instants) {
    const i = bucketIndex(buckets, at);
    if (i >= 0) series[i]++;
  }
  return series;
}

/** How many distinct keys (e.g. user ids) appear in each bucket. */
export function distinctSeries(buckets: Bucket[], rows: Array<[string, number | bigint]>): number[] {
  const sets = buckets.map(() => new Set<string>());
  for (const [key, at] of rows) {
    const i = bucketIndex(buckets, at);
    if (i >= 0) sets[i].add(key);
  }
  return sets.map((set) => set.size);
}
