"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertLogsBatch = insertLogsBatch;
exports.queryLogs = queryLogs;
exports.aggregateLogs = aggregateLogs;
const db_1 = require("../db");
const filters_1 = require("../filters");
/**
 * Single-statement bulk insert via UNNEST: one round trip for the whole batch,
 * regardless of batch size, instead of one round trip per row. Runs in the same
 * transaction as the logs_agg_1m insert so the rollup never drifts from the raw
 * logs table.
 */
async function insertLogsBatch(entries) {
    if (entries.length === 0)
        return;
    const ts = [];
    const level = [];
    const service = [];
    const message = [];
    const attributes = [];
    const rollup = new Map();
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
        }
        else {
            rollup.set(key, { bucket: new Date(bucketMs), service: e.service, level: e.level, count: 1 });
        }
    }
    const rollupRows = [...rollup.values()];
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO logs (ts, level, service, message, attributes)
       SELECT * FROM UNNEST($1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::jsonb[])`, [ts, level, service, message, attributes]);
        // Plain insert, no ON CONFLICT — see migrations/0002_aggregates.sql for why
        // an upsert here would serialize concurrent ingest batches on lock waits.
        await client.query(`INSERT INTO logs_agg_1m (bucket_start, service, level, count)
       SELECT * FROM UNNEST($1::timestamptz[], $2::text[], $3::text[], $4::bigint[])`, [
            rollupRows.map((r) => r.bucket),
            rollupRows.map((r) => r.service),
            rollupRows.map((r) => r.level),
            rollupRows.map((r) => r.count),
        ]);
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
function parseLimit(query) {
    if (query.limit === undefined)
        return 100;
    const raw = String(query.limit);
    if (!/^\d+$/.test(raw)) {
        throw new filters_1.BadRequestError('limit must be a positive integer');
    }
    const limit = Number(raw);
    if (limit < 1 || limit > 1000) {
        throw new filters_1.BadRequestError('limit must be between 1 and 1000');
    }
    return limit;
}
async function queryLogs(query) {
    const range = (0, filters_1.parseTimeRange)(query);
    const limit = parseLimit(query);
    const { where, params } = (0, filters_1.buildFilters)(query, range);
    const clauses = where ? [where] : [];
    let paramIndex = params.length + 1;
    if (query.cursor) {
        const decoded = Buffer.from(String(query.cursor), 'base64').toString('utf8');
        const [cursorTs, cursorId] = decoded.split('|');
        const cursorDate = cursorTs ? new Date(cursorTs) : null;
        if (!cursorTs || !cursorId || !cursorDate || Number.isNaN(cursorDate.getTime()) || Number.isNaN(Number(cursorId))) {
            throw new filters_1.BadRequestError('invalid cursor');
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
    const { rows } = await db_1.pool.query(sql, params);
    let nextCursor = null;
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
const BUCKET_SECONDS = {
    '1m': 60,
    '5m': 300,
    '1h': 3600,
    '1d': 86400,
};
async function aggregateLogs(query) {
    const range = (0, filters_1.parseTimeRange)(query);
    if (!range.since) {
        throw new filters_1.BadRequestError('since is required');
    }
    if (!range.until) {
        throw new filters_1.BadRequestError('until is required');
    }
    if (query.bucket === undefined) {
        throw new filters_1.BadRequestError(`bucket is required, expected one of ${Object.keys(BUCKET_SECONDS).join(', ')}`);
    }
    const bucketKey = String(query.bucket);
    const bucketSeconds = BUCKET_SECONDS[bucketKey];
    if (!bucketSeconds) {
        throw new filters_1.BadRequestError(`invalid bucket, expected one of ${Object.keys(BUCKET_SECONDS).join(', ')}`);
    }
    const groupByRaw = query.group_by ? String(query.group_by) : null;
    if (groupByRaw && groupByRaw !== 'service' && groupByRaw !== 'level') {
        throw new filters_1.BadRequestError('invalid group_by, expected service or level');
    }
    const groupBy = groupByRaw;
    // logs_agg_1m only tracks (minute, service, level) counts, so q= (message search)
    // and attr.* filters can't be answered from it — fall back to scanning raw logs.
    const needsRawScan = Boolean(query.q) || Object.keys(query).some((k) => k.startsWith('attr.'));
    const buckets = needsRawScan
        ? await aggregateFromRawLogs(query, range, bucketSeconds, groupBy)
        : await aggregateFromRollup(query, range, bucketSeconds, groupBy);
    return { buckets };
}
async function aggregateFromRollup(query, range, bucketSeconds, groupBy) {
    const { where, params } = (0, filters_1.buildRollupFilters)(query, range, 2);
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
    const { rows } = await db_1.pool.query(sql, [bucketSeconds, ...params]);
    return rows;
}
async function aggregateFromRawLogs(query, range, bucketSeconds, groupBy) {
    const { where, params } = (0, filters_1.buildFilters)(query, range, 2);
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
    const { rows } = await db_1.pool.query(sql, [bucketSeconds, ...params]);
    return rows;
}
