import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFilters, buildRollupFilters, parseTimeRange, BadRequestError } from './filters';

test('parseTimeRange accepts valid since/until', () => {
  const range = parseTimeRange({ since: '2026-01-01T00:00:00Z', until: '2026-01-02T00:00:00Z' });
  assert.ok(range.since instanceof Date);
  assert.ok(range.until instanceof Date);
});

test('parseTimeRange returns an empty range when neither is given', () => {
  const range = parseTimeRange({});
  assert.equal(range.since, undefined);
  assert.equal(range.until, undefined);
});

test('parseTimeRange rejects until earlier than since', () => {
  assert.throws(
    () => parseTimeRange({ since: '2026-01-02T00:00:00Z', until: '2026-01-01T00:00:00Z' }),
    BadRequestError
  );
});

test('parseTimeRange rejects an invalid timestamp', () => {
  assert.throws(() => parseTimeRange({ since: 'not-a-date' }), BadRequestError);
});

test('buildFilters combines service/level/attr filters with AND, parameterized', () => {
  const range = parseTimeRange({});
  const { where, params } = buildFilters(
    { service: 'checkout', level: 'error', 'attr.user_id': '42' },
    range
  );
  assert.match(where, /service = \$1/);
  assert.match(where, /level = \$2/);
  assert.match(where, /attributes ->> \$3 = \$4/);
  assert.deepEqual(params, ['checkout', 'error', 'user_id', '42']);
});

test('buildFilters rejects a level outside the contract enum', () => {
  const range = parseTimeRange({});
  assert.throws(() => buildFilters({ level: 'critical' }, range), BadRequestError);
});

test('buildFilters uses inclusive since / exclusive until', () => {
  const range = parseTimeRange({ since: '2026-01-01T00:00:00Z', until: '2026-01-02T00:00:00Z' });
  const { where } = buildFilters({}, range);
  assert.match(where, /ts >= \$1/);
  assert.match(where, /ts < \$2/);
});

test('buildRollupFilters uses bucket_start, not ts, and never touches message/attributes', () => {
  const range = parseTimeRange({ since: '2026-01-01T00:00:00Z' });
  const { where, params } = buildRollupFilters({ q: 'ignored-by-rollup' }, range);
  assert.match(where, /bucket_start >=/);
  assert.doesNotMatch(where, /message/);
  assert.deepEqual(params, [range.since]);
});
