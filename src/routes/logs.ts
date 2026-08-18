import { FastifyInstance } from 'fastify';
import { insertLogsBatch, queryLogs } from '../repo/logs';
import { BadRequestError } from '../filters';
import { validateLogEntry, LogEntry, MAX_BATCH } from '../validation';

export default async function logsRoutes(app: FastifyInstance) {
  app.post('/logs', async (req, reply) => {
    const body = req.body as { logs?: unknown };
    if (!body || !Array.isArray(body.logs) || body.logs.length === 0) {
      return reply.code(400).send({ error: 'body must be { logs: [...] } with at least one entry' });
    }
    if (body.logs.length > MAX_BATCH) {
      return reply.code(400).send({ error: `batch too large, max ${MAX_BATCH}` });
    }

    const valid: LogEntry[] = [];
    const rejected: { index: number; reason: string }[] = [];

    for (let index = 0; index < body.logs.length; index++) {
      const result = validateLogEntry(body.logs[index]);
      if (result.ok) {
        valid.push(result.entry);
      } else {
        rejected.push({ index, reason: result.reason });
      }
    }

    if (valid.length > 0) {
      await insertLogsBatch(valid);
    }

    // 200 once at least one entry is accepted, 400 only when every entry was rejected.
    return reply.code(valid.length > 0 ? 200 : 400).send({
      accepted: valid.length,
      rejected,
    });
  });

  app.get('/logs', async (req, reply) => {
    try {
      const result = await queryLogs(req.query as Record<string, unknown>);
      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof BadRequestError) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });
}
