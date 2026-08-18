import Fastify, { FastifyInstance } from 'fastify';
import healthRoute from './routes/health';
import logsRoutes from './routes/logs';
import aggregateRoutes from './routes/aggregate';

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true, bodyLimit: 20 * 1024 * 1024 });

  app.register(healthRoute);
  app.register(logsRoutes);
  app.register(aggregateRoutes);

  return app;
}
