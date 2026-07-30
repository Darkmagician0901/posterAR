/**
 * POST /api/story-assets — issue a conditional upload URL for a story asset.
 *
 * Assets are content-addressed: the key is the SHA-256 of the bytes. That makes
 * "have I seen these bytes?" a HeadObject rather than a database query, and
 * makes the upload idempotent — so this endpoint holds no state of its own and
 * there is no matching commit endpoint.
 *
 * Reads are unauthenticated because published assets are public by design. The
 * write path is gated by possession of a presigned URL, which only this
 * endpoint issues.
 */

import { objectExists, presignPutConditional, BUCKET } from './_s3';

/**
 * Upload types and their storage extensions.
 *
 * `image/svg+xml` is deliberately absent: an SVG served from the public bucket
 * origin is active content and therefore a stored-XSS vector. Mirrors the
 * allowlist the poster route already enforces.
 */
const EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

const SHA256_RE = /^[a-f0-9]{64}$/;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405);
  }
  if (!BUCKET) {
    return json({ error: 'Uploads are not configured. Set S3_BUCKET.' }, 503);
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return json({ error: 'Body was not valid JSON.' }, 400);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return json({ error: 'Body must be an object.' }, 400);
  }

  const { sha256, sha256Base64, contentType } = parsed as Record<string, unknown>;

  // Lowercase hex only. This value becomes a path segment, so anything that
  // could express a traversal or a scheme is refused outright.
  if (typeof sha256 !== 'string' || !SHA256_RE.test(sha256)) {
    return json({ error: 'sha256 must be 64 lowercase hex characters.' }, 400);
  }
  if (typeof sha256Base64 !== 'string' || sha256Base64.length === 0 || sha256Base64.length > 64) {
    return json({ error: 'sha256Base64 is missing or malformed.' }, 400);
  }
  if (typeof contentType !== 'string' || !(contentType in EXT)) {
    return json({ error: 'Unsupported image type.' }, 400);
  }

  const key = `assets/${sha256}/full.${EXT[contentType]}`;

  // Existence is the whole dedup check. Because the key is the content hash,
  // a hit means these exact bytes are already stored — a certainty, not a
  // guess — so there is nothing to upload.
  if (await objectExists(key)) {
    return json({ exists: true }, 200);
  }

  const uploadUrl = await presignPutConditional(key, contentType, sha256Base64);

  return json(
    {
      exists: false,
      uploadUrl,
      // Returned explicitly because these headers are SIGNED: omitting or
      // changing one produces a signature mismatch, not a silent success.
      requiredHeaders: {
        'If-None-Match': '*',
        'x-amz-checksum-sha256': sha256Base64,
        'Content-Type': contentType,
      },
    },
    201,
  );
}
