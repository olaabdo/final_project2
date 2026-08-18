"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRetentionSweep = runRetentionSweep;
exports.startRetentionLoop = startRetentionLoop;
const db_1 = require("./db");
const env_1 = require("./env");
const BATCH_SIZE = 5000;
// Caps rows deleted per tick so a sweep never monopolizes the single Postgres
// CPU core while ingestion is running concurrently.
const MAX_BATCHES_PER_TICK = 20;
async function deleteOldLogsBatch(cutoff) {
    const { rowCount } = await db_1.pool.query(`DELETE FROM logs WHERE id IN (
       SELECT id FROM logs WHERE ts < $1 ORDER BY ts, id LIMIT $2
     )`, [cutoff, BATCH_SIZE]);
    return rowCount ?? 0;
}
/**
 * One retention pass: deletes expired rows from `logs` in small batches (bounded
 * DELETE ... LIMIT via a subquery — Postgres has no direct DELETE LIMIT) so no
 * single transaction holds locks or generates dead tuples for long, then clears
 * the corresponding rollup rows in one cheap statement (logs_agg_1m is orders of
 * magnitude smaller, no batching needed).
 */
async function runRetentionSweep() {
    if (env_1.env.retentionDays <= 0)
        return;
    const cutoff = new Date(Date.now() - env_1.env.retentionDays * 24 * 60 * 60 * 1000);
    for (let i = 0; i < MAX_BATCHES_PER_TICK; i++) {
        const deleted = await deleteOldLogsBatch(cutoff);
        if (deleted < BATCH_SIZE)
            break;
    }
    await db_1.pool.query('DELETE FROM logs_agg_1m WHERE bucket_start < $1', [cutoff]);
}
function startRetentionLoop() {
    return setInterval(() => {
        runRetentionSweep().catch((err) => {
            console.error('retention sweep failed', err);
        });
    }, env_1.env.retentionIntervalMs);
}
