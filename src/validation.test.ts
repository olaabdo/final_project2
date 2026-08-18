import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLogEntry } from './validation';

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'checkout',
    message: 'payment declined',
    attributes: { user_id: '42', region: 'eu-west', retries: 3 },
    ...overrides,
  };
}

test('accepts a well-formed entry with flat attributes', () => {
  const result = validateLogEntry(baseEntry());
  assert.equal(result.ok, true);
});

test('accepts an entry with no attributes at all', () => {
  const { attributes, ...withoutAttributes } = baseEntry();
  const result = validateLogEntry(withoutAttributes);
  assert.equal(result.ok, true);
});

test('rejects an unsupported level', () => {
  const result = validateLogEntry(baseEntry({ level: 'critical' }));
  assert.equal(result.ok, false);
});

test('rejects "fatal" — the contract only allows debug/info/warn/error', () => {
  const result = validateLogEntry(baseEntry({ level: 'fatal' }));
  assert.equal(result.ok, false);
});

test('rejects a timestamp more than five minutes in the future', () => {
  const tooFarFuture = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const result = validateLogEntry(baseEntry({ timestamp: tooFarFuture }));
  assert.equal(result.ok, false);
});

test('accepts a timestamp a few seconds in the future (within the 5-minute grace)', () => {
  const nearFuture = new Date(Date.now() + 60 * 1000).toISOString();
  const result = validateLogEntry(baseEntry({ timestamp: nearFuture }));
  assert.equal(result.ok, true);
});

test('rejects a non-ISO timestamp', () => {
  const result = validateLogEntry(baseEntry({ timestamp: 'not-a-date' }));
  assert.equal(result.ok, false);
});

test('rejects nested objects in attributes', () => {
  const result = validateLogEntry(baseEntry({ attributes: { nested: { a: 1 } } }));
  assert.equal(result.ok, false);
});

test('rejects arrays in attributes', () => {
  const result = validateLogEntry(baseEntry({ attributes: { tags: ['a', 'b'] } }));
  assert.equal(result.ok, false);
});

test('rejects an empty service name', () => {
  const result = validateLogEntry(baseEntry({ service: '' }));
  assert.equal(result.ok, false);
});

test('rejects an empty message', () => {
  const result = validateLogEntry(baseEntry({ message: '' }));
  assert.equal(result.ok, false);
});

test('rejects a missing required field', () => {
  const { service, ...withoutService } = baseEntry();
  const result = validateLogEntry(withoutService);
  assert.equal(result.ok, false);
});

test('rejects a non-object entry', () => {
  assert.equal(validateLogEntry('not an object').ok, false);
  assert.equal(validateLogEntry(null).ok, false);
  assert.equal(validateLogEntry([1, 2, 3]).ok, false);
});

test('rejects attributes that is itself an array', () => {
  const result = validateLogEntry(baseEntry({ attributes: ['a', 'b'] }));
  assert.equal(result.ok, false);
});
