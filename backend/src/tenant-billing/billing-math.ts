import { Prisma } from '@prisma/client';
import { appTimezone } from '../common/utils/time.util';

/**
 * Pure billing arithmetic: subscription periods and invoice money. No database,
 * no clock - every input is passed in - so each rule is testable on its own.
 */

export type DurationUnit = 'DAY' | 'MONTH' | 'YEAR';
export type TaxCalculationType = 'PERCENTAGE' | 'FIXED';

// ---------- Periods ----------

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// Building an Intl formatter is far slower than using one, and renewal
// scheduling calls this in a loop.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function toWallClock(epochSeconds: number, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(new Date(epochSeconds * 1000));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function wallClockAsUtc(wc: WallClock): number {
  return Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute, wc.second) / 1000;
}

/**
 * The instant a wall-clock time names in `timeZone`. Two passes, because the
 * zone's offset at the guessed instant may differ from the offset at the
 * answer. A time skipped by a DST change resolves to a nearby valid instant.
 */
function fromWallClock(wc: WallClock, timeZone: string): number {
  const asUtc = wallClockAsUtc(wc);
  const offsetAt = (instant: number) => wallClockAsUtc(toWallClock(instant, timeZone)) - instant;
  const guess = asUtc - offsetAt(asUtc);
  return asUtc - offsetAt(guess);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Adds a plan duration to an epoch-seconds instant, on the calendar of
 * `timeZone` (the application timezone by default), keeping the time of day.
 *
 * MONTH and YEAR clamp to the end of the target month: Jan 31 + 1 month is
 * Feb 28 (or 29), and Feb 29 + 1 year is Feb 28. Adding 30 days would drift,
 * and a naive month bump overflows Jan 31 into March.
 *
 * Because of the clamp, consecutive periods must be computed from one anchor
 * (anchor + n months), not by adding to the previous end - otherwise
 * Jan 31 -> Feb 28 -> Mar 28 loses three days for good.
 */
export function addDuration(
  epochSeconds: number,
  value: number,
  unit: DurationUnit,
  timeZone = appTimezone(),
): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`Duration must be a positive whole number, got ${value}`);
  }
  const start = toWallClock(epochSeconds, timeZone);
  let { year, month, day } = start;

  if (unit === 'DAY') {
    const shifted = new Date(Date.UTC(year, month - 1, day + value));
    year = shifted.getUTCFullYear();
    month = shifted.getUTCMonth() + 1;
    day = shifted.getUTCDate();
  } else {
    const totalMonths = year * 12 + (month - 1) + (unit === 'YEAR' ? value * 12 : value);
    year = Math.floor(totalMonths / 12);
    month = (totalMonths % 12) + 1;
    day = Math.min(day, daysInMonth(year, month));
  }

  return fromWallClock({ ...start, year, month, day }, timeZone);
}

/**
 * Midnight at the start of a `YYYY-MM-DD` calendar date in `timeZone`.
 * Subscription periods run midnight to midnight, so a plan bought on any day
 * expires at the start of the same calendar day one duration later.
 */
export function startOfDate(date: string, timeZone = appTimezone()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Expected a date as YYYY-MM-DD, got "${date}"`);
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`"${date}" is not a calendar date`);
  }
  return fromWallClock({ year, month, day, hour: 0, minute: 0, second: 0 }, timeZone);
}

/** The `YYYY-MM-DD` calendar date an instant falls on in `timeZone`. */
export function calendarDate(epochSeconds: number, timeZone = appTimezone()): string {
  const { year, month, day } = toWallClock(epochSeconds, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The period after one ending at `currentEnd`, for a subscription whose first
 * period started at `anchor`.
 *
 * MONTH/YEAR ends are taken from the anchor (anchor + n durations) so the
 * month-end clamp does not accumulate: a Jan 31 subscription renews to Feb 28
 * and then Mar 31, not Mar 28. If `currentEnd` is not on the anchor's schedule
 * (a period was changed by hand), the schedule restarts from `currentEnd`.
 */
export function nextPeriod(
  anchor: number,
  currentEnd: number,
  value: number,
  unit: DurationUnit,
  timeZone = appTimezone(),
): { start: number; end: number } {
  // Days never clamp, so there is nothing for the anchor to correct.
  if (unit !== 'DAY') {
    for (let n = 1; ; n++) {
      const end = addDuration(anchor, n * value, unit, timeZone);
      if (end === currentEnd) {
        return { start: currentEnd, end: addDuration(anchor, (n + 1) * value, unit, timeZone) };
      }
      if (end > currentEnd) break;
    }
  }
  return { start: currentEnd, end: addDuration(currentEnd, value, unit, timeZone) };
}

/**
 * `count` consecutive periods after one ending at `currentEnd`, billed as one -
 * an advance renewal. Each step goes through `nextPeriod`, so the ends stay on
 * the anchor's schedule exactly as if they had been renewed one at a time.
 */
export function nextPeriods(
  anchor: number,
  currentEnd: number,
  value: number,
  unit: DurationUnit,
  count: number,
  timeZone = appTimezone(),
): { start: number; end: number } {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`Periods must be a positive whole number, got ${count}`);
  }
  let end = currentEnd;
  for (let i = 0; i < count; i++) {
    end = nextPeriod(anchor, end, value, unit, timeZone).end;
  }
  return { start: currentEnd, end };
}

// ---------- Money ----------

const Decimal = Prisma.Decimal;
type Money = Prisma.Decimal;

/** Half-up to two decimals - the rounding printed invoices are expected to use. */
function round2(value: Money): Money {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function toMoney(value: Prisma.Decimal.Value, field: string): Money {
  const money = new Decimal(value);
  if (money.isNegative()) throw new RangeError(`${field} cannot be negative`);
  if (money.decimalPlaces() > 2) throw new RangeError(`${field} cannot have more than 2 decimals`);
  return money;
}

export interface LineInput {
  quantity: number;
  unitPrice: Prisma.Decimal.Value;
  discount?: Prisma.Decimal.Value;
  /** TenantTaxType.value is a Float column; Decimal reads a number by its shortest string form. */
  tax?: { calculationType: TaxCalculationType; value: Prisma.Decimal.Value } | null;
}

export interface LineAmounts {
  gross: Money; // quantity x unitPrice
  discount: Money;
  net: Money; // gross - discount
  taxAmount: Money;
  lineTotal: Money; // net + taxAmount
}

/**
 * One invoice line. Tax is rounded per line, and invoice totals are sums of
 * the rounded lines, so the printed lines always add up to the printed total.
 */
export function computeLine(input: LineInput): LineAmounts {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new RangeError(`Quantity must be a positive whole number, got ${input.quantity}`);
  }
  const gross = toMoney(input.unitPrice, 'Unit price').mul(input.quantity);
  const discount = toMoney(input.discount ?? 0, 'Discount');
  if (discount.greaterThan(gross)) {
    throw new RangeError('Discount cannot exceed the line amount');
  }
  const net = gross.minus(discount);

  let taxAmount = new Decimal(0);
  if (input.tax) {
    const rate = new Decimal(input.tax.value);
    if (rate.isNegative()) throw new RangeError('Tax value cannot be negative');
    taxAmount =
      input.tax.calculationType === 'PERCENTAGE'
        ? round2(net.mul(rate).div(100))
        : round2(rate.mul(input.quantity));
  }

  return { gross, discount, net, taxAmount, lineTotal: net.plus(taxAmount) };
}

export interface InvoiceTotals {
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  grandTotal: Money;
}

export function computeTotals(lines: LineAmounts[]): InvoiceTotals {
  const sum = (pick: (line: LineAmounts) => Money) =>
    lines.reduce((total, line) => total.plus(pick(line)), new Decimal(0));
  return {
    subtotal: sum((line) => line.gross),
    discountTotal: sum((line) => line.discount),
    taxTotal: sum((line) => line.taxAmount),
    grandTotal: sum((line) => line.lineTotal),
  };
}

// ---------- Invoice numbers ----------

const INVOICE_NUMBER_DIGITS = 6;

/** INV- + 42 -> INV-000042. Longer sequences simply grow past the padding. */
export function formatInvoiceNumber(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(INVOICE_NUMBER_DIGITS, '0')}`;
}
