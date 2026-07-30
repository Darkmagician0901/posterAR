/**
 * POST /api/publish — writes a story document to S3.
 *
 * The only authenticated endpoint in the app. It exists for two reasons that
 * both require a server: AWS credentials must never reach a browser, and the
 * live exhibit needs a gate so that finding /studio is not the same as being
 * able to overwrite what visitors see.
 *
 * Reads stay unauthenticated — published documents are public by design and are
 * fetched straight from the bucket, not through this function.
 *
 * Deployed by Vercel from the api/ directory. Uses the Web handler signature,
 * so it needs no platform-specific types.
 */

import { timingSafeEqual } from 'node:crypto';
import { objectExists, putJson } from './_s3';
import { collectAssetRefs } from '../src/story/artTokens';
import { assetKey } from '../src/story/assetStorage';
import { isAssetRef, validateStoryDoc, type StoryDoc } from '../src/story/storyDoc';

/** Shape returned on success. */
interface PublishResult {
  id: string;
  url: string;
}

/** Maximum accepted document size. Composed art is inlined, so this is generous. */
const MAX_BODY_BYTES = 12 * 1024 * 1024;

/** Ids are slugs; keep the accepted shape narrow and path-safe. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** In-memory throttle. Per-instance only — see the note in the handler. */
const attempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = { max: 10, windowMs: 60_000 };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/**
 * Compares two secrets without leaking their relationship through timing.
 *
 * Lengths are compared first because timingSafeEqual throws on a mismatch;
 * that leak is acceptable (it reveals only the length) and unavoidable here.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** True when this caller has exceeded the window. Also records the attempt. */
function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (entry === undefined || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Use POST to publish.' }, 405);
  }

  const secret = process.env.STUDIO_PUBLISH_SECRET;
  if (secret === undefined || secret === '') {
    return json(
      {
        error:
          'Publishing is not configured. Set STUDIO_PUBLISH_SECRET in the project environment.',
      },
      503,
    );
  }
  if (!process.env.S3_BUCKET) {
    return json(
      { error: 'Publishing is not configured. Set S3_BUCKET in the project environment.' },
      503,
    );
  }

  // Per-instance only: serverless spreads callers across instances, so this
  // slows a single attacker rather than stopping a distributed one. It is worth
  // having because the realistic threat here is someone guessing one secret in
  // a loop, not a botnet.
  const caller = request.headers.get('x-forwarded-for') ?? 'unknown';
  if (isRateLimited(caller)) {
    return json({ error: 'Too many attempts. Wait a minute and try again.' }, 429);
  }

  const auth = request.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (provided === '' || !secretMatches(provided, secret)) {
    return json({ error: 'Not authorised.' }, 401);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: 'That story is too large to publish.' }, 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: 'Body was not valid JSON.' }, 400);
  }

  const body = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as {
    doc?: unknown;
    id?: unknown;
  };

  // Validate against an empty-framed document rather than a bundled default:
  // publishing a story that silently fell back to the demo content would be
  // worse than refusing.
  const empty: StoryDoc = {
    schemaVersion: 4,
    id: 'unpublished',
    title: '',
    loc: '',
    intro: { title: '', subtitle: '' },
    outro: { title: '', subtitle: '' },
    frames: [],
  };
  const doc = validateStoryDoc(body.doc, empty);
  if (doc.frames.length === 0) {
    return json({ error: 'That story has no usable frames.' }, 400);
  }

  const id = typeof body.id === 'string' ? body.id.trim().toLowerCase() : '';
  if (!ID_PATTERN.test(id)) {
    return json({ error: 'Story id must be lowercase letters, numbers and hyphens.' }, 400);
  }

  // Every token in the art must name a declared asset, and every declared
  // asset must actually exist in the bucket. Both failures would otherwise
  // surface as a silent transparent gap on every visitor's device — long
  // after the operator has walked away.
  const declared = doc.assets ?? {};
  const referenced = new Set(doc.frames.flatMap((f) => collectAssetRefs(f.art)));

  for (const alias of referenced) {
    if (!(alias in declared)) {
      return json({ error: `Frame art references "${alias}", which is not an uploaded image.` }, 422);
    }
  }

  try {
    // Inside the try on purpose: objectExists rethrows every non-404 (an S3
    // outage, missing credentials, a wrong S3_REGION), and outside it those
    // escaped the handler as a bare 500 instead of the designed 502 that names
    // what went wrong.
    for (const [alias, asset] of Object.entries(declared)) {
      if (!isAssetRef(asset)) continue; // v3 inline asset: bytes are in the document
      // Both ids, because both are read: the resolver prefers r1024Id and only
      // falls back to assetId. A declared derivative whose bytes never landed
      // costs an extra round trip on every viewer's device — and would go
      // unnoticed, since the fallback hides it.
      const required = asset.r1024Id === undefined ? [asset.assetId] : [asset.assetId, asset.r1024Id];
      for (const storedId of required) {
        if (!(await objectExists(assetKey(storedId)))) {
          return json(
            { error: `The image "${alias}" did not finish uploading. Re-add it and try again.` },
            422,
          );
        }
      }
    }

    const key = `stories/${id}.json`;
    // 60 seconds, because this is the one object that is mutable at a stable
    // key — that is how /?s=<id> resolves without a lookup table. A longer TTL
    // makes a republish invisible until it expires.
    await putJson(key, JSON.stringify({ ...doc, id }), 'public, max-age=60, must-revalidate');
    const base = (process.env.STORY_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
    return json({ id, url: `${base}/${key}` } satisfies PublishResult, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown storage error';
    return json({ error: `Could not save the story: ${message}` }, 502);
  }
}
