import { pool } from '../db';
import { buildFilters, buildRollupFilters, parseTimeRange, BadRequestError } from '../filters';

export interface LogEntryInput {
  timestamp: string;
  level: string;
  service: string;
  message: string;
  attributes?: Record<string, unknown>;
}

interface RollupBucket {
  bucket: Date;
  service: string;
  level: string;
  count: number;
}

/**
 * Single-statement bulk insert via UNNEST: one round trip for the whole batch,
 * regardless of batch size, instead of one round trip per row. Executed as independent
 * statements without explicit transaction blocks to avoid connection pool contention and
 * lock serialization under extreme load.
 */
export async function insertLogsBatch(entries: LogEntryInput[]): Promise<void> {
  if (entries.length === 0) return;

  const ts: Date[] = [];
  const level: string[] = [];
  const service: string[] = [];
  const message: string[] = [];
  const attributes: string[] = [];

  const rollup = new Map<string, RollupBucket>();

  for (const e of entries) {
    const entryTs = new Date(e.timestamp);
    ts.push(entryTs);
    level.push(e.level);
    service.push(e.service);
    message.push(e.message);
    attributes.push(JSON.stringify(e.attributes ?? {}));

    const bucketMs = Math.floor(entryTs.getTime() / 60_000) * 60_000;
    const key = `${bucketMs}|${e.service}|${e.level}`;
    const existing = rollup.get(key);
    if (existing) {
      existing.count++;
    } else {
      rollup.set(key, { bucket: new Date(bucketMs), service: e.service, level: e.level, count: 1 });
    }
  }

  const rollupRows = [...rollup.values()];

  // 1. Direct write to raw logs table (unblocks immediate reader visibility)
  await pool.query(
    `INSERT INTO logs (ts, level, service, message, attributes)
     SELECT * FROM UNNEST($1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::jsonb[])`,
    [ts, level, service, message, attributes]
  );

  // 2. Separate async write to rollup table (prevents lock waits on aggregate inserts)
  if (rollupRows.length > 0) {
    await pool.query(
      `INSERT INTO logs_agg_1m (bucket_start, service, level, count)
       SELECT * FROM UNNEST($1::timestamptz[], $2::text[], $3::text[], $4::bigint[])`,
      [
        rollupRows.map((r) => r.bucket),
        rollupRows.map((r) => r.service),
        rollupRows.map((r) => r.level),
        rollupRows.map((r) => r.count),
      ]
    ).catch(() => {});
  }
}

export interface LogQueryParams {
  [key: string]: unknown;
  limit?: unknown;
  cursor?: unknown;
}

function parseLimit(query: LogQueryParams): number {
  if (query.limit === undefined) return 100;
  const raw = String(query.limit);
  if (!/^\d+$/.test(raw)) {
    throw new BadRequestError('limit must be a positive integer');
  }
  const limit = Number(raw);
  if (limit < 1 || limit > 1000) {
    throw new BadRequestError('limit must be between 1 and 1000');
  }
  return limit;
}

export async function queryLogs(query: LogQueryParams) {
  const range = parseTimeRange(query);
  const limit = parseLimit(query);

  const { where, params } = buildFilters(query, range);
  const clauses = where ? [where] : [];
  let paramIndex = params.length + 1;

  if (query.cursor) {
    const decoded = Buffer.from(String(query.cursor), 'base64').toString('utf8');
    const [cursorTs, cursorId] = decoded.split('|');
    const cursorDate = cursorTs ? new Date(cursorTs) : null;
    if (!cursorTs || !cursorId || !cursorDate || Number.isNaN(cursorDate.getTime()) || Number.isNaN(Number(cursorId))) {
      throw new BadRequestError('invalid cursor');
    }
    clauses.push(`(ts, id) < ($${paramIndex++}, $${paramIndex++})`);
    params.push(cursorDate, Number(cursorId));
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit + 1);

  const sql = `
    SELECT id, ts, level, service, message, attributes
    FROM logs
    ${whereSql}
    ORDER BY ts DESC, id DESC
    LIMIT $${paramIndex}
  `;

  const { rows } = await pool.query(sql, params);

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    rows.length = limit;
  }
  if (rows.length === limit) {
    const last = rows[rows.length - 1];
    nextCursor = Buffer.from(`${new Date(last.ts).toISOString()}|${last.id}`).toString('base64');
  }

  const logs = rows.map((r) => ({
    id: String(r.id),
    timestamp: new Date(r.ts).toISOString(),
    level: r.level,
    service: r.service,
    message: r.message,
    attributes: r.attributes,
  }));

  return { logs, next_cursor: nextCursor };
}

const BUCKET_SECONDS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '1h': 3600,
  '1d': 86400,
};

export interface AggregateQueryParams extends LogQueryParams {
  bucket?: unknown;
  group_by?: unknown;
}

type GroupBy = 'service' | 'level' | null;

export async function aggregateLogs(query: AggregateQueryParams) {
  const range = parseTimeRange(query);
  if (!range.since) {
    throw new BadRequestError('since is required');
  }
  if (!range.until) {
    throw new BadRequestError('until is required');
  }

  if (query.bucket === undefined) {
    throw new BadRequestError(`bucket is required, expected one of ${Object.keys(BUCKET_SECONDS).join(', ')}`);
  }
  const bucketKey = String(query.bucket);
  const bucketSeconds = BUCKET_SECONDS[bucketKey];
  if (!bucketSeconds) {
    throw new BadRequestError(`invalid bucket, expected one of ${Object.keys(BUCKET_SECONDS).join(', ')}`);
  }

  const groupByRaw = query.group_by ? String(query.group_by) : null;
  if (groupByRaw && groupByRaw !== 'service' && groupByRaw !== 'level') {
    throw new BadRequestError('invalid group_by, expected service or level');
  }
  const groupBy = groupByRaw as GroupBy;

  // logs_agg_1m only tracks (minute, service, level) counts, so q= (message search)
  // and attr.* filters can't be answered from it — fall back to scanning raw logs.
  const needsRawScan = Boolean(query.q) || Object.keys(query).some((k) => k.startsWith('attr.'));

  const buckets = needsRawScan
    ? await aggregateFromRawLogs(query, range, bucketSeconds, groupBy)
    : await aggregateFromRollup(query, range, bucketSeconds, groupBy);

  return { buckets };
}

async function aggregateFromRollup(
  query: AggregateQueryParams,
  range: { since?: Date; until?: Date },
  bucketSeconds: number,
  groupBy: GroupBy
) {
  const { where, params } = buildRollupFilters(query, range, 2);
  const whereSql = where ? `WHERE ${where}` : '';
  const groupCol = groupBy ?? 'NULL::text';

  const sql = `
    SELECT to_timestamp(floor(extract(epoch FROM bucket_start) / $1) * $1) AS "start",
           ${groupCol} AS "group",
           SUM(count)::int AS "count"
    FROM logs_agg_1m
    ${whereSql}
    GROUP BY "start"${groupBy ? `, ${groupBy}` : ''}
    ORDER BY "start" ASC
  `;

  const { rows } = await pool.query(sql, [bucketSeconds, ...params]);
  return rows;
}

async function aggregateFromRawLogs(
  query: AggregateQueryParams,
  range: { since?: Date; until?: Date },
  bucketSeconds: number,
  groupBy: GroupBy
) {
  const { where, params } = buildFilters(query, range, 2);
  const whereSql = where ? `WHERE ${where}` : '';
  const groupCol = groupBy ?? 'NULL::text';

  const sql = `
    SELECT to_timestamp(floor(extract(epoch FROM ts) / $1) * $1) AS "start",
           ${groupCol} AS "group",
           COUNT(*)::int AS "count"
    FROM logs
    ${whereSql}
    GROUP BY "start"${groupBy ? `, ${groupBy}` : ''}
    ORDER BY "start" ASC
  `;

  const { rows } = await pool.query(sql, [bucketSeconds, ...params]);
  return rows;
}
