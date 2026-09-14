import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDuration,
  calendarDate,
  computeLine,
  computeTotals,
  formatInvoiceNumber,
  nextPeriod,
  nextPeriods,
  startOfDate,
} from '../src/tenant-billing/billing-math';

const IST = 'Asia/Kolkata';
const NEW_YORK = 'America/New_York';
const utc = (y: number, m: number, d: number, h = 0, min = 0) =>
  Date.UTC(y, m - 1, d, h, min) / 1000;

describe('addDuration', () => {
  it('clamps Jan 31 + 1 month to Feb 28 in a common year, keeping the time of day', () => {
    // 10:00 IST = 04:30 UTC
    assert.equal(addDuration(utc(2026, 1, 31, 4, 30), 1, 'MONTH', IST), utc(2026, 2, 28, 4, 30));
  });

  it('clamps Jan 31 + 1 month to Feb 29 in a leap year', () => {
    assert.equal(addDuration(utc(2028, 1, 31, 4, 30), 1, 'MONTH', IST), utc(2028, 2, 29, 4, 30));
  });

  it('clamps Feb 29 + 1 year to Feb 28', () => {
    assert.equal(addDuration(utc(2028, 2, 29, 4, 30), 1, 'YEAR', IST), utc(2029, 2, 28, 4, 30));
  });

  it('rolls December into January of the next year', () => {
    assert.equal(addDuration(utc(2026, 12, 15, 4, 30), 1, 'MONTH', IST), utc(2027, 1, 15, 4, 30));
  });

  it('clamps multi-month additions to the target month only', () => {
    assert.equal(addDuration(utc(2026, 10, 31, 4, 30), 3, 'MONTH', IST), utc(2027, 1, 31, 4, 30));
    assert.equal(addDuration(utc(2026, 11, 30, 4, 30), 3, 'MONTH', IST), utc(2027, 2, 28, 4, 30));
  });

  it('keeps the anchor day when periods are computed from one anchor', () => {
    const anchor = utc(2026, 1, 31, 4, 30);
    assert.equal(addDuration(anchor, 2, 'MONTH', IST), utc(2026, 3, 31, 4, 30));
  });

  it('uses the calendar day in the given zone, not the UTC day', () => {
    // 23:30 UTC on Jan 31 is already 05:00 on Feb 1 in IST.
    assert.equal(addDuration(utc(2026, 1, 31, 23, 30), 1, 'MONTH', IST), utc(2026, 2, 28, 23, 30));
  });

  it('adds days across a month boundary', () => {
    assert.equal(addDuration(utc(2026, 1, 30, 4, 30), 5, 'DAY', IST), utc(2026, 2, 4, 4, 30));
  });

  it('keeps local time of day across a DST change (a 23-hour day)', () => {
    // 2026-03-07 12:00 EST (17:00 UTC) + 1 day = 2026-03-08 12:00 EDT (16:00 UTC)
    const start = utc(2026, 3, 7, 17);
    const end = addDuration(start, 1, 'DAY', NEW_YORK);
    assert.equal(end, utc(2026, 3, 8, 16));
    assert.equal(end - start, 23 * 3600);
  });

  it('rejects a non-positive or fractional duration', () => {
    assert.throws(() => addDuration(utc(2026, 1, 1), 0, 'DAY', IST), RangeError);
    assert.throws(() => addDuration(utc(2026, 1, 1), 1.5, 'MONTH', IST), RangeError);
  });
});

describe('startOfDate / calendarDate', () => {
  it('returns local midnight in the given zone', () => {
    // 2026-09-13 00:00 IST = 2026-09-12 18:30 UTC
    assert.equal(startOfDate('2026-09-13', IST), utc(2026, 9, 12, 18, 30));
  });

  it('reads the calendar date in the given zone', () => {
    assert.equal(calendarDate(startOfDate('2026-02-28', IST), IST), '2026-02-28');
    // 19:00 UTC on the 12th is 00:30 IST on the 13th.
    assert.equal(calendarDate(utc(2026, 9, 12, 19), IST), '2026-09-13');
  });

  it('rejects malformed and impossible dates', () => {
    assert.throws(() => startOfDate('2026-2-3', IST), RangeError);
    assert.throws(() => startOfDate('2026-02-30', IST), RangeError);
    assert.throws(() => startOfDate('2026-13-01', IST), RangeError);
  });
});

describe('nextPeriod', () => {
  it('renews from the anchor so month-end clamping does not accumulate', () => {
    const anchor = startOfDate('2026-01-31', IST);
    const firstEnd = addDuration(anchor, 1, 'MONTH', IST);
    assert.equal(calendarDate(firstEnd, IST), '2026-02-28');
    const second = nextPeriod(anchor, firstEnd, 1, 'MONTH', IST);
    assert.equal(second.start, firstEnd);
    assert.equal(calendarDate(second.end, IST), '2026-03-31');
  });

  it('handles multi-month durations', () => {
    const anchor = startOfDate('2026-08-31', IST);
    const firstEnd = addDuration(anchor, 6, 'MONTH', IST);
    assert.equal(calendarDate(firstEnd, IST), '2027-02-28');
    assert.equal(calendarDate(nextPeriod(anchor, firstEnd, 6, 'MONTH', IST).end, IST), '2027-08-31');
  });

  it('restarts from the current end when it is off the anchor schedule', () => {
    const anchor = startOfDate('2026-01-15', IST);
    const edited = startOfDate('2026-02-20', IST);
    const next = nextPeriod(anchor, edited, 1, 'MONTH', IST);
    assert.equal(next.start, edited);
    assert.equal(calendarDate(next.end, IST), '2026-03-20');
  });

  it('adds days directly for DAY plans', () => {
    const anchor = startOfDate('2026-01-01', IST);
    const firstEnd = addDuration(anchor, 30, 'DAY', IST);
    assert.equal(calendarDate(firstEnd, IST), '2026-01-31');
    assert.equal(calendarDate(nextPeriod(anchor, firstEnd, 30, 'DAY', IST).end, IST), '2026-03-02');
  });
});

describe('nextPeriods', () => {
  it('bills several periods ahead on the anchor schedule', () => {
    const anchor = startOfDate('2026-01-31', IST);
    const firstEnd = addDuration(anchor, 1, 'MONTH', IST);
    const three = nextPeriods(anchor, firstEnd, 1, 'MONTH', 3, IST);
    assert.equal(three.start, firstEnd);
    // Feb 28 -> Mar 31 -> Apr 30 -> May 31: the clamp never sticks.
    assert.equal(calendarDate(three.end, IST), '2026-05-31');
  });

  it('matches a single nextPeriod for one period', () => {
    const anchor = startOfDate('2026-03-10', IST);
    const firstEnd = addDuration(anchor, 1, 'YEAR', IST);
    assert.deepEqual(nextPeriods(anchor, firstEnd, 1, 'YEAR', 1, IST), nextPeriod(anchor, firstEnd, 1, 'YEAR', IST));
  });

  it('rejects a non-positive or fractional count', () => {
    const anchor = startOfDate('2026-03-10', IST);
    assert.throws(() => nextPeriods(anchor, anchor, 1, 'MONTH', 0, IST), RangeError);
    assert.throws(() => nextPeriods(anchor, anchor, 1, 'MONTH', 1.5, IST), RangeError);
  });
});

describe('computeLine', () => {
  it('applies percentage tax to the net amount', () => {
    const line = computeLine({ quantity: 1, unitPrice: 249, tax: { calculationType: 'PERCENTAGE', value: 18 } });
    assert.equal(line.taxAmount.toFixed(2), '44.82');
    assert.equal(line.lineTotal.toFixed(2), '293.82');
  });

  it('rounds tax half-up, not half-even', () => {
    // 0.10 x 5% = 0.005 -> 0.01 (banker's rounding would give 0.00)
    const line = computeLine({ quantity: 1, unitPrice: '0.10', tax: { calculationType: 'PERCENTAGE', value: 5 } });
    assert.equal(line.taxAmount.toFixed(2), '0.01');
  });

  it('does not leak binary floating point error', () => {
    const line = computeLine({ quantity: 3, unitPrice: 0.1 });
    assert.equal(line.gross.toString(), '0.3');
  });

  it('charges fixed tax once per unit', () => {
    const line = computeLine({ quantity: 3, unitPrice: 10, tax: { calculationType: 'FIXED', value: 5 } });
    assert.equal(line.taxAmount.toFixed(2), '15.00');
    assert.equal(line.lineTotal.toFixed(2), '45.00');
  });

  it('taxes the amount after discount', () => {
    const line = computeLine({
      quantity: 1,
      unitPrice: 300,
      discount: 50,
      tax: { calculationType: 'PERCENTAGE', value: 18 },
    });
    assert.equal(line.net.toFixed(2), '250.00');
    assert.equal(line.taxAmount.toFixed(2), '45.00');
  });

  it('rejects invalid quantities, discounts and prices', () => {
    assert.throws(() => computeLine({ quantity: 0, unitPrice: 10 }), RangeError);
    assert.throws(() => computeLine({ quantity: 1, unitPrice: 10, discount: 10.01 }), RangeError);
    assert.throws(() => computeLine({ quantity: 1, unitPrice: 10, discount: -1 }), RangeError);
    assert.throws(() => computeLine({ quantity: 1, unitPrice: '10.001' }), RangeError);
  });
});

describe('computeTotals', () => {
  it('sums rounded lines, so printed lines add up to the printed total', () => {
    // Each line: 0.03 x 18% = 0.0054 -> 0.01. Rounding once at invoice level
    // would give 0.09 x 18% = 0.0162 -> 0.02, which the lines would not add up to.
    const tax = { calculationType: 'PERCENTAGE' as const, value: 18 };
    const lines = [1, 2, 3].map(() => computeLine({ quantity: 1, unitPrice: '0.03', tax }));
    const totals = computeTotals(lines);
    assert.equal(totals.subtotal.toFixed(2), '0.09');
    assert.equal(totals.taxTotal.toFixed(2), '0.03');
    assert.equal(totals.grandTotal.toFixed(2), '0.12');
  });

  it('reports discounts separately from the subtotal', () => {
    const totals = computeTotals([
      computeLine({ quantity: 2, unitPrice: 100, discount: 20 }),
      computeLine({ quantity: 1, unitPrice: 50 }),
    ]);
    assert.equal(totals.subtotal.toFixed(2), '250.00');
    assert.equal(totals.discountTotal.toFixed(2), '20.00');
    assert.equal(totals.grandTotal.toFixed(2), '230.00');
  });

  it('totals an empty invoice to zero', () => {
    assert.equal(computeTotals([]).grandTotal.toFixed(2), '0.00');
  });
});

describe('formatInvoiceNumber', () => {
  it('zero-pads to six digits and grows past them', () => {
    assert.equal(formatInvoiceNumber('INV-', 42), 'INV-000042');
    assert.equal(formatInvoiceNumber('INV-', 1234567), 'INV-1234567');
    assert.equal(formatInvoiceNumber('', 1), '000001');
  });
});
