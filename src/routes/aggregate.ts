import { FastifyInstance } from 'fastify';
import { aggregateLogs } from '../repo/logs';
import { BadRequestError } from '../filters';

export default async function aggregateRoutes(app: FastifyInstance) {
  app.get('/logs/aggregate', async (req, reply) => {
    try {
      const result = await aggregateLogs(req.query as Record<string, unknown>);
      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof BadRequestError) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });
}
