import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { loadConfig } from '../config.js';
import { getPool } from './pool.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', 'migrations');

export async function runMigrations(pool: pg.Pool): Promise<void> {
  await pool.query(
    'create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const name of files) {
    const done = await pool.query('select 1 from _migrations where name = $1', [name]);
    if (done.rowCount) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into _migrations (name) values ($1)', [name]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }
}

// Allow `npm run migrate` to apply migrations directly.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cfg = loadConfig(process.env);
  runMigrations(getPool(cfg.databaseUrl))
    .then(() => {
      console.log('migrations applied');
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
