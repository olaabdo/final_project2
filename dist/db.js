"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
const env_1 = require("./env");
exports.pool = new pg_1.Pool({
    connectionString: env_1.env.databaseUrl,
    max: env_1.env.pgPoolMax,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});
// Log ingestion favors throughput over durability of the last few commits on crash —
// acceptable for this workload, documented in the README.
exports.pool.on('connect', (client) => {
    const mode = env_1.env.synchronousCommit === 'off' ? 'OFF' : 'ON';
    client.query(`SET synchronous_commit = ${mode}`).catch(() => { });
});
