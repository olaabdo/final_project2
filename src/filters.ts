import { LOG_LEVELS, isLogLevel } from './constants';

export class BadRequestError extends Error {}

export interface ParsedFilters {
  where: string;
  params: unknown[];
}

function parseDate(value: unknown, field: string): Date {
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestError(`invalid ${field}, expected an ISO 8601 timestamp`);
  }
  return d;
}

function parseLevel(value: unknown): string {
  const level = String(value);
  if (!isLogLevel(level)) {
    throw new BadRequestError(`unsupported log level: '${level}', expected one of ${LOG_LEVELS.join(', ')}`);
  }
  return level;
}

interface TimeRange {
  since?: Date;
  until?: Date;
}

/**
 * Parses since/until once, up front, so "until earlier than since" can be
 * checked regardless of which endpoint (or rollup vs raw table) consumes it.
 */
export function parseTimeRange(query: Record<string, unknown>): TimeRange {
  const since = query.since !== undefined ? parseDate(query.since, 'since') : undefined;
  const until = query.until !== undefined ? parseDate(query.until, 'until') : undefined;
  if (since && until && until < since) {
    throw new BadRequestError('until must not be earlier than since');
  }
  return { since, until };
}

/**
 * Builds a combined SQL WHERE fragment (no leading "WHERE") + parameter list for
 * service / level / since / until / q / attr.<key> query filters. Shared by
 * GET /logs and GET /logs/aggregate so both endpoints support the same filter set.
 * `since` is inclusive, `until` is exclusive, per the API contract.
 */
export function buildFilters(query: Record<string, unknown>, range: TimeRange, startIndex = 1): ParsedFilters {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = startIndex;

  if (query.service) {
    clauses.push(`service = $${i++}`);
    params.push(String(query.service));
  }
  if (query.level) {
    clauses.push(`level = $${i++}`);
    params.push(parseLevel(query.level));
  }
  if (range.since) {
    clauses.push(`ts >= $${i++}`);
    params.push(range.since);
  }
  if (range.until) {
    clauses.push(`ts < $${i++}`);
    params.push(range.until);
  }
  if (query.q) {
    clauses.push(`message ILIKE $${i++}`);
    params.push(`%${query.q}%`);
  }

  for (const key of Object.keys(query)) {
    if (key.startsWith('attr.')) {
      const attrKey = key.slice('attr.'.length);
      if (!attrKey) continue;
      clauses.push(`attributes ->> $${i++} = $${i++}`);
      params.push(attrKey, String(query[key]));
    }
  }

  return { where: clauses.join(' AND '), params };
}

/**
 * Same as buildFilters but scoped to logs_agg_1m's columns (bucket_start instead
 * of ts, no message/attributes) — the rollup table only supports service/level/
 * since/until; callers must fall back to buildFilters + the raw logs table for
 * q= or attr.* filters.
 */
export function buildRollupFilters(query: Record<string, unknown>, range: TimeRange, startIndex = 1): ParsedFilters {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = startIndex;

  if (query.service) {
    clauses.push(`service = $${i++}`);
    params.push(String(query.service));
  }
  if (query.level) {
    clauses.push(`level = $${i++}`);
    params.push(parseLevel(query.level));
  }
  if (range.since) {
    clauses.push(`bucket_start >= $${i++}`);
    params.push(range.since);
  }
  if (range.until) {
    clauses.push(`bucket_start < $${i++}`);
    params.push(range.until);
  }

  return { where: clauses.join(' AND '), params };
}
