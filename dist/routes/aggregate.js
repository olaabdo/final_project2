"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = aggregateRoutes;
const logs_1 = require("../repo/logs");
const filters_1 = require("../filters");
async function aggregateRoutes(app) {
    app.get('/logs/aggregate', async (req, reply) => {
        try {
            const result = await (0, logs_1.aggregateLogs)(req.query);
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
