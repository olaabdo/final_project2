"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrationsComplete = void 0;
exports.runMigrations = runMigrations;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const db_1 = require("./db");
exports.migrationsComplete = false;
const MIGRATIONS_DIR = node_path_1.default.join(__dirname, '..', 'migrations');
async function runMigrations() {
    const client = await db_1.pool.connect();
    try {
        await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
        const files = node_fs_1.default
            .readdirSync(MIGRATIONS_DIR)
            .filter((f) => f.endsWith('.sql'))
            .sort();
        for (const file of files) {
            const { rows } = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
            if (rows.length > 0)
                continue;
            const sql = node_fs_1.default.readFileSync(node_path_1.default.join(MIGRATIONS_DIR, file), 'utf8');
            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
                await client.query('COMMIT');
            }
            catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
        }
        exports.migrationsComplete = true;
    }
    finally {
        client.release();
    }
}
