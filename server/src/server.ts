import { loadConfig } from './config.js'
import { getPool } from './db/pool.js'
import { runMigrations } from './db/migrate.js'
import { createAssetsRepo } from './db/assetsRepo.js'
import { createObjectStore } from './storage/objectStore.js'
import { buildApp } from './app.js'

const cfg = loadConfig(process.env)
const pool = getPool(cfg.databaseUrl)

await runMigrations(pool)
const app = buildApp({ repo: createAssetsRepo(pool), store: createObjectStore(cfg.s3) })
await app.listen({ port: cfg.port, host: '0.0.0.0' })
console.log(`api listening on :${cfg.port}`)
