"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = healthRoute;
const db_1 = require("../db");
const migrate_1 = require("../migrate");
async function healthRoute(app) {
    app.get('/health', async (_req, reply) => {
        if (!migrate_1.migrationsComplete) {
            return reply.code(503).send({ status: 'not_ready', reason: 'migrations not complete' });
        }
        try {
            await db_1.pool.query('SELECT 1');
        }
        catch {
            return reply.code(503).send({ status: 'not_ready', reason: 'database unreachable' });
        }
        return reply.code(200).send({ status: 'ok' });
    });
}
