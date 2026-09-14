import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accessState, streamAccess, type CoveringSubscription } from '../src/tenant-billing/billing-access';
import { startOfDate } from '../src/tenant-billing/billing-math';

const IST = 'Asia/Kolkata';
const DAY = 86400;
const end = startOfDate('2026-09-10', IST);

const streamSub = (tenantStreamId: string, periodEnd: number): CoveringSubscription => ({
  subscriptionFor: 'STREAM',
  tenantStreamId,
  tenantCustomerId: 'c1',
  tenantFlussonicServerId: 's1',
  currentPeriodEnd: BigInt(periodEnd),
});

const serverSub = (serverId: string, periodEnd: number): CoveringSubscription => ({
  subscriptionFor: 'SERVER',
  tenantStreamId: null,
  tenantCustomerId: 'c1',
  tenantFlussonicServerId: serverId,
  currentPeriodEnd: BigInt(periodEnd),
});

const stream = { id: 'st1', tenantCustomerId: 'c1', tenantFlussonicServerId: 's1' };

describe('accessState', () => {
  it('is ACTIVE until the period ends, to the second', () => {
    assert.equal(accessState(end, end - 1, 3, IST), 'ACTIVE');
    assert.equal(accessState(end, end, 3, IST), 'GRACE');
  });

  it('is GRACE for graceDays after the end, then BLOCKED', () => {
    assert.equal(accessState(end, end + 3 * DAY - 1, 3, IST), 'GRACE');
    assert.equal(accessState(end, end + 3 * DAY, 3, IST), 'BLOCKED');
  });

  it('has no grace when graceDays is 0, and blocks with no period at all', () => {
    assert.equal(accessState(end, end, 0, IST), 'BLOCKED');
    assert.equal(accessState(null, end, 3, IST), 'BLOCKED');
  });
});

describe('streamAccess', () => {
  it("never blocks the tenant's own streams", () => {
    assert.equal(streamAccess({ ...stream, tenantCustomerId: null }, [], end, 3, IST).state, 'ACTIVE');
  });

  it('blocks a customer stream nothing covers', () => {
    assert.equal(streamAccess(stream, [], end, 3, IST).state, 'BLOCKED');
  });

  it('is covered by its own stream plan but not by another stream\'s', () => {
    assert.equal(streamAccess(stream, [streamSub('st1', end + DAY)], end, 3, IST).state, 'ACTIVE');
    assert.equal(streamAccess(stream, [streamSub('st2', end + DAY)], end, 3, IST).state, 'BLOCKED');
  });

  it('is covered by a server plan on its own server only', () => {
    assert.equal(streamAccess(stream, [serverSub('s1', end + DAY)], end, 3, IST).state, 'ACTIVE');
    assert.equal(streamAccess(stream, [serverSub('s2', end + DAY)], end, 3, IST).state, 'BLOCKED');
  });

  it('uses the latest covering end', () => {
    const access = streamAccess(stream, [streamSub('st1', end - 10 * DAY), serverSub('s1', end + DAY)], end, 3, IST);
    assert.equal(access.state, 'ACTIVE');
    assert.equal(access.periodEnd, end + DAY);
  });

  it('reports EXEMPT only when an exempt stream would otherwise be blocked', () => {
    assert.equal(streamAccess({ ...stream, billingExempt: true }, [], end, 3, IST).state, 'EXEMPT');
    assert.equal(
      streamAccess({ ...stream, billingExempt: true }, [serverSub('s1', end + DAY)], end, 3, IST).state,
      'ACTIVE',
    );
  });
});
