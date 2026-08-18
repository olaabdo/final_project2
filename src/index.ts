import { runMigrations } from './migrate';
import { buildServer } from './server';
import { env } from './env';
import { startRetentionLoop } from './retention';

async function main() {
  await runMigrations();
  startRetentionLoop();
  const app = buildServer();
  await app.listen({ port: env.port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
