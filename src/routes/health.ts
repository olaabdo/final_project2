import { FastifyInstance } from 'fastify';
import { pool } from '../db';
import { migrationsComplete } from '../migrate';

export default async function healthRoute(app: FastifyInstance) {
  app.get('/health', async (_req, reply) => {
    if (!migrationsComplete) {
      return reply.code(503).send({ status: 'not_ready', reason: 'migrations not complete' });
    }
    try {
      await pool.query('SELECT 1');
    } catch {
      return reply.code(503).send({ status: 'not_ready', reason: 'database unreachable' });
    }
    return reply.code(200).send({ status: 'ok' });
  });
}
