import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EVENT_TYPES,
  aggregateEmailStatus,
  alertRecipients,
  cooldownActive,
  cooldownKey,
  customerBcc,
  normalizeIncomingEvents,
  ruleMatches,
  sanitizeEventTypes,
} from '../src/tenant-stream-events/stream-events.logic';

const ctx = { event: 'stream_closed', serverId: 's1', streamId: 'st1', customerId: 'c1' };
const rule = (over: Partial<Parameters<typeof ruleMatches>[0]> = {}) => ({
  events: ['stream_closed'],
  serverIds: [],
  streamIds: [],
  customerIds: [],
  ...over,
});

describe('normalizeIncomingEvents', () => {
  it('accepts a single event, an array, or { events }', () => {
    const one = { event: 'stream_opened', media: 'live/a', utc_ms: 1789300000123 };
    assert.equal(normalizeIncomingEvents(one, 5).length, 1);
    assert.equal(normalizeIncomingEvents([one, one], 5).length, 2);
    assert.equal(normalizeIncomingEvents({ events: [one] }, 5).length, 1);
  });

  it('drops entries without a string event and uses utc_ms for the time', () => {
    const events = normalizeIncomingEvents([{ media: 'x' }, { event: 1 }, { event: 'play_closed', utc_ms: 1789300000999 }], 42);
    assert.equal(events.length, 1);
    assert.equal(events[0].occurredAt, 1789300000);
    assert.equal(events[0].media, null);
  });

  it('falls back to the receive time without utc_ms', () => {
    assert.equal(normalizeIncomingEvents({ event: 'source_closed' }, 42)[0].occurredAt, 42);
  });
});

describe('sanitizeEventTypes', () => {
  it('keeps known names once, in canonical order', () => {
    assert.deepEqual(sanitizeEventTypes(['play_closed', 'nope', 'stream_opened', 'play_closed']), ['stream_opened', 'play_closed']);
    assert.deepEqual(sanitizeEventTypes('stream_opened'), []);
  });

  it('defaults exclude viewer events', () => {
    assert.ok(!DEFAULT_EVENT_TYPES.some((type) => type.startsWith('play_')));
  });
});

describe('ruleMatches', () => {
  it('needs the event, and a rule with no events never fires', () => {
    assert.equal(ruleMatches(rule(), ctx), true);
    assert.equal(ruleMatches(rule({ events: ['stream_opened'] }), ctx), false);
    assert.equal(ruleMatches(rule({ events: [] }), ctx), false);
  });

  it('treats empty scopes as all and checks each non-empty one', () => {
    assert.equal(ruleMatches(rule({ serverIds: ['s1'], streamIds: ['st1'], customerIds: ['c1'] }), ctx), true);
    assert.equal(ruleMatches(rule({ serverIds: ['s2'] }), ctx), false);
    assert.equal(ruleMatches(rule({ customerIds: ['c2'] }), ctx), false);
  });

  it('never matches unmanaged media on a stream or customer scope', () => {
    const unmanaged = { ...ctx, streamId: null, customerId: null };
    assert.equal(ruleMatches(rule({ streamIds: ['st1'] }), unmanaged), false);
    assert.equal(ruleMatches(rule({ customerIds: ['c1'] }), unmanaged), false);
    assert.equal(ruleMatches(rule({ serverIds: ['s1'] }), unmanaged), true);
  });
});

describe('cooldown', () => {
  it('is active within the window only, and never at 0 minutes', () => {
    assert.equal(cooldownActive(1000, 1000 + 14 * 60, 15), true);
    assert.equal(cooldownActive(1000, 1000 + 15 * 60, 15), false);
    assert.equal(cooldownActive(null, 1000, 15), false);
    assert.equal(cooldownActive(1000, 1001, 0), false);
  });

  it('keys by stream, else by media name', () => {
    assert.equal(cooldownKey('st1', 'live/a'), 'stream:st1');
    assert.equal(cooldownKey(null, 'live/a'), 'media:live/a');
  });
});

describe('alertRecipients', () => {
  it('merges customer emails and removes blanks, missing ones and case-insensitive duplicates', () => {
    assert.deepEqual(alertRecipients([' ops@x.com ', 'OPS@x.com', ''], ['cust@x.com', null, 'CUST@x.com']), ['ops@x.com', 'cust@x.com']);
    assert.deepEqual(alertRecipients(['ops@x.com'], []), ['ops@x.com']);
  });
});

describe('customerBcc', () => {
  it('emails no customers, the owner, or the owner plus the server customers', () => {
    assert.deepEqual(customerBcc('NONE', 'owner@x.com', ['a@x.com'], []), []);
    assert.deepEqual(customerBcc('STREAM_OWNER', 'owner@x.com', ['a@x.com'], []), ['owner@x.com']);
    assert.deepEqual(customerBcc('SERVER_CUSTOMERS', 'owner@x.com', ['a@x.com', 'OWNER@x.com'], []), ['owner@x.com', 'a@x.com']);
  });

  it('still reaches server customers when the stream has no owner, and skips direct recipients', () => {
    assert.deepEqual(customerBcc('SERVER_CUSTOMERS', null, ['a@x.com', 'noc@x.com'], ['NOC@x.com']), ['a@x.com']);
    assert.deepEqual(customerBcc('STREAM_OWNER', null, ['a@x.com'], []), []);
  });
});

describe('aggregateEmailStatus', () => {
  it('prefers sent, then failed, then no mail config, then cooldown', () => {
    assert.equal(aggregateEmailStatus([]), 'NOT_MATCHED');
    assert.equal(aggregateEmailStatus(['COOLDOWN', 'SENT']), 'SENT');
    assert.equal(aggregateEmailStatus(['COOLDOWN', 'FAILED']), 'FAILED');
    assert.equal(aggregateEmailStatus(['COOLDOWN', 'NO_MAIL_CONFIG']), 'NO_MAIL_CONFIG');
    assert.equal(aggregateEmailStatus(['COOLDOWN']), 'COOLDOWN');
  });
});
