"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
exports.env = {
    databaseUrl: process.env.DATABASE_URL ?? 'postgres://logsapp:logsapp@localhost:5432/logsapp',
    port: Number(process.env.PORT ?? 8080),
    pgPoolMax: Number(process.env.PG_POOL_MAX ?? 20),
    synchronousCommit: (process.env.PG_SYNCHRONOUS_COMMIT ?? 'off').toLowerCase(),
    retentionDays: Number(process.env.RETENTION_DAYS ?? 30),
    retentionIntervalMs: Number(process.env.RETENTION_INTERVAL_MS ?? 60_000),
};
