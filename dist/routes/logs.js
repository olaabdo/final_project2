"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = logsRoutes;
const logs_1 = require("../repo/logs");
const filters_1 = require("../filters");
const validation_1 = require("../validation");
async function logsRoutes(app) {
    app.post('/logs', async (req, reply) => {
        const body = req.body;
        if (!body || !Array.isArray(body.logs) || body.logs.length === 0) {
            return reply.code(400).send({ error: 'body must be { logs: [...] } with at least one entry' });
        }
        if (body.logs.length > validation_1.MAX_BATCH) {
            return reply.code(400).send({ error: `batch too large, max ${validation_1.MAX_BATCH}` });
        }
        const valid = [];
        const rejected = [];
        for (let index = 0; index < body.logs.length; index++) {
            const result = (0, validation_1.validateLogEntry)(body.logs[index]);
            if (result.ok) {
                valid.push(result.entry);
            }
            else {
                rejected.push({ index, reason: result.reason });
            }
        }
        if (valid.length > 0) {
            await (0, logs_1.insertLogsBatch)(valid);
        }
        // 200 once at least one entry is accepted, 400 only when every entry was rejected.
        return reply.code(valid.length > 0 ? 200 : 400).send({
            accepted: valid.length,
            rejected,
        });
    });
    app.get('/logs', async (req, reply) => {
        try {
            const result = await (0, logs_1.queryLogs)(req.query);
            return reply.code(200).send(result);
        }
        catch (err) {
            if (err instanceof filters_1.BadRequestError) {
                return reply.code(400).send({ error: err.message });
            }
            throw err;
        }
    });
}
