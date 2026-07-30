/**
 * _s3.ts — S3 access for Vercel functions.
 *
 * The leading underscore keeps this out of Vercel's route table: files in api/
 * become endpoints, and this is a helper.
 *
 * S3 is the whole storage layer for v1 — there is no database. An object's
 * existence is the record that it was uploaded, and because the key is the
 * content hash, existence means those exact bytes are stored.
 *
 * Credentials come from Vercel OIDC when AWS_ROLE_ARN is set: the function
 * exchanges a short-lived Vercel-signed token for AWS credentials, so no static
 * secret is stored anywhere. A static key pair remains as a fallback until that
 * is wired up.
 */

import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { awsCredentialsProvider } from '@vercel/functions/oidc';

export const BUCKET = process.env.S3_BUCKET ?? '';

let client: S3Client | null = null;

/** Returns the shared S3 client, constructing it on first use. */
export function getS3(): S3Client {
  if (client) return client;
  const roleArn = process.env.AWS_ROLE_ARN;
  client = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    ...(roleArn ? { credentials: awsCredentialsProvider({ roleArn }) } : {}),
  });
  return client;
}

/**
 * Whether an object exists.
 *
 * This replaces what a `committed` database column would have tracked. There
 * is no half-written state to represent: the conditional write that creates an
 * object is atomic, so the object either is there or is not.
 *
 * @param key — Object key to probe.
 * @returns True when the object exists. A 404 returns false; every other error
 *   propagates, because "we could not tell" must never be reported as
 *   "missing" — its one caller, POST /api/story-assets, uses that to decide
 *   whether an upload can be skipped as a dedup hit.
 */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await getS3().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return false;
    throw err;
  }
}

/**
 * Presigns a PUT that S3 rejects unless the object is new AND the bytes hash to
 * the expected value.
 *
 * `If-None-Match: *` makes the write conditional, so a concurrent upload of
 * identical bytes cannot clobber a completed object — S3 answers 412, which the
 * client treats as a successful dedup rather than an error.
 *
 * `x-amz-checksum-sha256` closes an integrity hole specific to content
 * addressing: the client computes the hash, so without it a dishonest client
 * could store bytes X under the key SHA256(Y). Because dedup is global, that
 * would poison the address for every story.
 *
 * Both headers are SIGNED, so a client that drops or alters one gets a
 * signature mismatch rather than a silent success.
 *
 * @param key — Object key, e.g. `assets/<sha256>/full.webp`.
 * @param contentType — MIME type of the payload.
 * @param sha256Base64 — Expected digest, base64-encoded.
 * @returns A presigned URL valid for 5 minutes.
 */
export async function presignPutConditional(
  key: string,
  contentType: string,
  sha256Base64: string,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    IfNoneMatch: '*',
    ChecksumSHA256: sha256Base64,
    // Content-addressed, therefore immutable, therefore cacheable forever.
    CacheControl: 'public, max-age=31536000, immutable',
  });
  // The SDK's presigner hoists any x-amz-* header into the query string by
  // default (moveHeadersToQuery, run before canonical-header selection), which
  // would silently drop x-amz-checksum-sha256 out of X-Amz-SignedHeaders no
  // matter what signableHeaders says — signableHeaders only governs headers
  // that are still headers by the time signing happens. unhoistableHeaders
  // keeps it a header so it lands in SignedHeaders. if-none-match isn't
  // x-amz-prefixed, so it's never hoisted; it only needs signableHeaders.
  return getSignedUrl(getS3(), cmd, {
    expiresIn: 300,
    signableHeaders: new Set(['if-none-match']),
    unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
  });
}

/**
 * Writes a JSON object.
 *
 * `cacheControl` is a required parameter rather than a default because the two
 * callers need opposite values and getting it wrong is silent: `stories/` is
 * mutable at a stable key and needs a short TTL, while content-addressed
 * objects can be cached forever. A default would make one of them wrong
 * without anyone noticing.
 *
 * @param key — Object key, e.g. `stories/my-story.json`.
 * @param body — Serialized JSON.
 * @param cacheControl — Sent verbatim as the Cache-Control header.
 */
export async function putJson(key: string, body: string, cacheControl: string): Promise<void> {
  await getS3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      CacheControl: cacheControl,
    }),
  );
}
