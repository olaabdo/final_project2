import { Pool, PoolClient } from 'pg';
import { env } from './env';

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.pgPoolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', (client: PoolClient) => {
  client.query("SET synchronous_commit = 'off'").catch((err) => {
    console.error('Failed to set synchronous_commit off', err);
  });
});