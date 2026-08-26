import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

const base = {
  DATABASE_URL: 'postgres://localhost/db',
  S3_ENDPOINT: 'https://x.supabase.co/storage/v1/s3',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_BUCKET: 'assets',
  S3_PUBLIC_BASE_URL: 'https://x.supabase.co/storage/v1/object/public/assets',
};

describe('loadConfig', () => {
  it('parses a complete env', () => {
    const cfg = loadConfig({ ...base, PORT: '9000' } as NodeJS.ProcessEnv);
    expect(cfg.databaseUrl).toBe('postgres://localhost/db');
    expect(cfg.s3.bucket).toBe('assets');
    expect(cfg.port).toBe(9000);
  });

  it('defaults PORT to 8787', () => {
    expect(loadConfig(base as NodeJS.ProcessEnv).port).toBe(8787);
  });

  it('defaults S3_FORCE_PATH_STYLE to true for S3-compatible endpoints', () => {
    expect(loadConfig(base as NodeJS.ProcessEnv).s3.forcePathStyle).toBe(true);
  });

  it('reads the string "false" as false, not as a truthy string', () => {
    const cfg = loadConfig({ ...base, S3_FORCE_PATH_STYLE: 'false' } as NodeJS.ProcessEnv);
    expect(cfg.s3.forcePathStyle).toBe(false);
  });

  it('rejects a value that is neither "true" nor "false"', () => {
    expect(() => loadConfig({ ...base, S3_FORCE_PATH_STYLE: 'no' } as NodeJS.ProcessEnv)).toThrow(
      /S3_FORCE_PATH_STYLE/,
    );
  });

  it('throws when a required var is missing', () => {
    const { DATABASE_URL: _DATABASE_URL, ...rest } = base;
    expect(() => loadConfig(rest as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });
});
