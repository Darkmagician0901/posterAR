import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { AssetsRepo } from './db/assetsRepo.js';
import type { ObjectStore } from './storage/objectStore.js';
import { registerAssetRoutes } from './routes/assets.js';

export function buildApp(deps: { repo: AssetsRepo; store: ObjectStore }): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _req, reply) => {
    // Log server-side; never leak raw error details (pg messages, schema names)
    // to clients.
    console.error('[api] unhandled error:', err);
    reply.code(500).send({ error: 'internal error' });
  });
  app.register(cors, { origin: true, methods: ['GET', 'POST', 'DELETE'] });
  app.get('/health', async () => ({ ok: true }));
  registerAssetRoutes(app, deps);
  return app;
}
