import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLogLevel, LOG_LEVELS } from './constants';

test('isLogLevel accepts exactly the four contract levels', () => {
  for (const level of LOG_LEVELS) {
    assert.equal(isLogLevel(level), true);
  }
});

test('isLogLevel rejects levels outside the contract, including "fatal"', () => {
  assert.equal(isLogLevel('fatal'), false);
  assert.equal(isLogLevel('critical'), false);
  assert.equal(isLogLevel(''), false);
});
