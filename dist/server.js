"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildServer = buildServer;
const fastify_1 = __importDefault(require("fastify"));
const health_1 = __importDefault(require("./routes/health"));
const logs_1 = __importDefault(require("./routes/logs"));
const aggregate_1 = __importDefault(require("./routes/aggregate"));
function buildServer() {
    const app = (0, fastify_1.default)({ logger: true, bodyLimit: 20 * 1024 * 1024 });
    app.register(health_1.default);
    app.register(logs_1.default);
    app.register(aggregate_1.default);
    return app;
}
