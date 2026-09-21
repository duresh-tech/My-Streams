import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { streamerEpochSeconds } from '../src/common/utils/streamer.util';

describe('streamerEpochSeconds', () => {
  const seconds = 1790016362; // 2026-09-22

  it('leaves a value already in seconds alone', () => {
    assert.equal(streamerEpochSeconds(seconds), seconds);
  });

  it('scales milliseconds and microseconds down to seconds', () => {
    assert.equal(streamerEpochSeconds(seconds * 1000), seconds);
    assert.equal(streamerEpochSeconds(seconds * 1000 + 999), seconds);
    assert.equal(streamerEpochSeconds(seconds * 1_000_000), seconds);
  });

  it('gives no answer for a missing or unusable value', () => {
    for (const value of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(streamerEpochSeconds(value as number), undefined);
    }
  });
});
