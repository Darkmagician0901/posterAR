import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'
import { loadConfig } from '../config.js'
import { getPool } from './pool.js'

const here = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(here, '..', '..', 'migrations')

export async function runMigrations(pool: pg.Pool): Promise<void> {
  await pool.query(
    'create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())',
  )
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  for (const name of files) {
    const done = await pool.query('select 1 from _migrations where name = $1', [name])
    if (done.rowCount) continue
    const sql = await readFile(join(MIGRATIONS_DIR, name), 'utf8')
    await pool.query('begin')
    try {
      await pool.query(sql)
      await pool.query('insert into _migrations (name) values ($1)', [name])
      await pool.query('commit')
    } catch (err) {
      await pool.query('rollback')
      throw err
    }
  }
}

// Allow `npm run migrate` to apply migrations directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig(process.env)
  runMigrations(getPool(cfg.databaseUrl))
    .then(() => { console.log('migrations applied'); process.exit(0) })
    .catch((e) => { console.error(e); process.exit(1) })
}
