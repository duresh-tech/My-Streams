import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bucketIndex, countSeries, distinctSeries, rangeBuckets } from '../src/common/utils/dashboard-buckets';
import { calendarDate, startOfDate } from '../src/tenant-billing/billing-math';

const IST = 'Asia/Kolkata';
const at = startOfDate('2026-09-14', IST) + 15 * 3600; // 14 Sep 2026, 15:00 IST

const contiguous = (buckets: ReturnType<typeof rangeBuckets>) =>
  buckets.every((bucket, i) => i === 0 || buckets[i - 1].end === bucket.start);

describe('rangeBuckets', () => {
  it('30d: 30 contiguous days ending today', () => {
    const buckets = rangeBuckets('30d', at, IST);
    assert.equal(buckets.length, 30);
    assert.ok(contiguous(buckets));
    assert.equal(buckets[29].key, '2026-09-14');
    assert.equal(buckets[0].key, '2026-08-16');
    assert.equal(buckets[29].label, '14 Sep');
    assert.equal(bucketIndex(buckets, at), 29);
  });

  it('90d: 13 contiguous weeks, the last ending with today', () => {
    const buckets = rangeBuckets('90d', at, IST);
    assert.equal(buckets.length, 13);
    assert.ok(contiguous(buckets));
    assert.equal(buckets[12].key, '2026-09-08');
    assert.equal(calendarDate(buckets[12].end - 1, IST), '2026-09-14');
    assert.equal(buckets[12].label, 'w/c 8 Sep');
  });

  it('12m: 12 calendar months ending with this month, across a year boundary', () => {
    const buckets = rangeBuckets('12m', at, IST);
    assert.equal(buckets.length, 12);
    assert.ok(contiguous(buckets));
    assert.equal(buckets[0].key, '2025-10');
    assert.equal(buckets[11].key, '2026-09');
    assert.equal(buckets[3].label, 'Jan 26');
    assert.equal(buckets[11].end, startOfDate('2026-10-01', IST));
  });
});

describe('series helpers', () => {
  const buckets = rangeBuckets('30d', at, IST);

  it('ignore instants outside the range', () => {
    assert.equal(bucketIndex(buckets, buckets[0].start - 1), -1);
    assert.equal(bucketIndex(buckets, buckets[29].end), -1);
  });

  it('count per bucket', () => {
    const series = countSeries(buckets, [at, at - 10, BigInt(buckets[0].start), buckets[0].start - 1]);
    assert.equal(series[29], 2);
    assert.equal(series[0], 1);
    assert.equal(series.reduce((a, b) => a + b, 0), 3);
  });

  it('count distinct keys per bucket', () => {
    const series = distinctSeries(buckets, [['u1', at], ['u1', at - 60], ['u2', at]]);
    assert.equal(series[29], 2);
  });
});
