import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_PUBLIC_BASE_URL: z.string().url(),
  // Path-style addressing (https://endpoint/bucket/key) is required by
  // Supabase and most S3-compatible services; real AWS S3 wants virtual-hosted
  // style (https://bucket.s3.region.amazonaws.com/key) and treats path-style
  // as legacy. Defaults to true so existing Supabase deployments are
  // unaffected; the AWS stack sets it to false.
  //
  // Parsed as an explicit enum rather than z.coerce.boolean(), which would
  // read the string "false" as true.
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  PORT: z.coerce.number().int().positive().default(8787),
});

export interface AppConfig {
  databaseUrl: string;
  s3: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicBaseUrl: string;
    forcePathStyle: boolean;
  };
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid server config: ${missing}`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    s3: {
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      accessKeyId: e.S3_ACCESS_KEY_ID,
      secretAccessKey: e.S3_SECRET_ACCESS_KEY,
      bucket: e.S3_BUCKET,
      publicBaseUrl: e.S3_PUBLIC_BASE_URL,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
    },
    port: e.PORT,
  };
}
