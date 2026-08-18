"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const migrate_1 = require("./migrate");
const server_1 = require("./server");
const env_1 = require("./env");
const retention_1 = require("./retention");
async function main() {
    await (0, migrate_1.runMigrations)();
    (0, retention_1.startRetentionLoop)();
    const app = (0, server_1.buildServer)();
    await app.listen({ port: env_1.env.port, host: '0.0.0.0' });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
