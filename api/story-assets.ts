/**
 * POST /api/story-assets — issue a conditional upload URL for a story asset.
 *
 * Assets are content-addressed: the key is the SHA-256 of the bytes. That makes
 * "have I seen these bytes?" a HeadObject rather than a database query, and
 * makes the upload idempotent — so this endpoint holds no state of its own and
 * there is no matching commit endpoint.
 *
 * Reads are unauthenticated because published assets are public by design.
 * The write path is unauthenticated too, and is safe only because of one check
 * below: the checksum S3 will enforce on the upload must equal the digest named
 * by the key. An address can therefore only ever be presigned for bytes that
 * genuinely hash to it, so a caller cannot claim an address for content that
 * does not belong to it — and because `If-None-Match: '*'` makes a taken
 * address permanent, that is the difference between "someone wastes their own
 * bandwidth" and "someone permanently defaces a published exhibit".
 *
 * That check is why this endpoint has no `variant` parameter. A variant wrote a
 * second key beside the parent's (`assets/<parentSha>/r1024.webp`) whose bytes
 * were, by construction, NOT the parent's hash — an unverifiable address, and
 * usually an empty one, which anyone could read out of a public story document
 * and fill with their own image. Derivatives are now ordinary assets stored
 * under their own hash; see src/story/assetStorage.ts.
 */

import { objectExists, presignPutConditional, BUCKET } from './_s3';
import { assetKey } from '../src/story/assetStorage';
import { hexToBase64 } from '../src/story/assetHash';

/**
 * Upload types accepted.
 *
 * Narrowed to webp only: the read path (`src/story/assetResolver.ts`) fetches
 * `full.webp`, so a key written under any other extension is one nothing ever
 * reads — a 404 that resolves to a silent transparent pixel, and because the
 * address is content-derived, unfixable by re-uploading. This allowlist is what
 * makes "store and read `.webp` only" true by construction instead of by
 * convention. Widening it later is a deliberate edit here, paired with widening
 * the reader.
 *
 * `image/svg+xml` is deliberately absent: an SVG served from the public bucket
 * origin is active content and therefore a stored-XSS vector. Mirrors the
 * allowlist the poster route already enforces.
 */
const EXT: Record<string, string> = {
  'image/webp': 'webp',
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
  if (typeof sha256Base64 !== 'string' || sha256Base64.length === 0) {
    return json({ error: 'sha256Base64 is missing or malformed.' }, 400);
  }
  // The load-bearing check. `sha256Base64` is signed into the URL as
  // `x-amz-checksum-sha256`, which S3 verifies against the bytes actually
  // uploaded; `sha256` is the address those bytes are written to. Requiring
  // them to be the same digest is what makes the address self-enforcing —
  // without it, possession of any published assetId is possession of a write
  // token for arbitrary bytes at that address.
  if (sha256Base64 !== hexToBase64(sha256)) {
    return json({ error: 'sha256Base64 must be the base64 form of sha256.' }, 400);
  }
  if (typeof contentType !== 'string' || !(contentType in EXT)) {
    return json(
      { error: `Unsupported image type${typeof contentType === 'string' ? `: ${contentType}` : ''}. Only image/webp is accepted.` },
      400,
    );
  }

  const key = assetKey(sha256);

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
