import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { AssetsRepo } from './db/assetsRepo.js';
import type { MarkerBindingsRepo } from './db/markerBindingsRepo.js';
import type { ObjectStore } from './storage/objectStore.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerSpaceRoutes } from './routes/spaces.js';

export function buildApp(deps: {
  repo: AssetsRepo;
  store: ObjectStore;
  /** Marker-space bindings. Optional so existing tests can build an
   *  assets-only app without stubbing a repository they never call. */
  bindings?: MarkerBindingsRepo;
}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _req, reply) => {
    // Log server-side; never leak raw error details (pg messages, schema names)
    // to clients.
    console.error('[api] unhandled error:', err);
    reply.code(500).send({ error: 'internal error' });
  });
  app.register(cors, { origin: true, methods: ['GET', 'POST', 'PUT', 'DELETE'] });
  app.get('/health', async () => ({ ok: true }));
  registerAssetRoutes(app, deps);
  if (deps.bindings) registerSpaceRoutes(app, { repo: deps.bindings });
  return app;
}
