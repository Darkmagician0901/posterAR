import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import type { AssetsRepo } from './db/assetsRepo.js'
import type { ObjectStore } from './storage/objectStore.js'
import { registerAssetRoutes } from './routes/assets.js'

export function buildApp(deps: { repo: AssetsRepo; store: ObjectStore }): FastifyInstance {
  const app = Fastify({ logger: false })
  app.register(cors, { origin: true, methods: ['GET', 'POST', 'DELETE'] })
  app.get('/health', async () => ({ ok: true }))
  registerAssetRoutes(app, deps)
  return app
}
