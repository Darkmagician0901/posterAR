/**
 * POST /api/publish-exhibit — writes an exhibit document to S3.
 *
 * Structurally the same endpoint as `api/publish.ts` — same auth, same rate
 * limiting, same reasons for both — but with its own middle: an exhibit names
 * stories rather than carrying content, so what it must check is that each
 * named story is actually publishable as a picture-triggered story, not that
 * its own bytes are well-formed. That is where §8's remaining refusals live,
 * because they need the story documents. Every member story is read back
 * **from the bucket** rather than trusted from the client's copy, so a story
 * published a week ago is checked exactly as rigorously as one published a
 * minute ago.
 *
 * Reads stay unauthenticated — published documents are public by design and
 * are fetched straight from the bucket, not through this function.
 */

import { timingSafeEqual } from 'node:crypto';
import { getJson, objectExists, putJson } from './_s3';
import { exhibitIssues, normalizeStoryIds, validateExhibitDoc } from '../src/exhibit/exhibitDoc';
import { markerKey } from '../src/markers/markerStorage';
import { validateStoryDoc, type StoryDoc } from '../src/story/storyDoc';

/** Shape returned on success. */
interface PublishResult {
  id: string;
  url: string;
}

/** Maximum accepted document size. An exhibit is just a title and a list of ids. */
const MAX_BODY_BYTES = 12 * 1024 * 1024;

/** Ids are slugs; keep the accepted shape narrow and path-safe. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** In-memory throttle. Per-instance only — see the note in the handler. */
const attempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = { max: 10, windowMs: 60_000 };

/**
 * Validated against an empty-framed document rather than a bundled default,
 * exactly as `api/publish.ts` does: a member story that fell back to demo
 * content because its published JSON was somehow malformed must not read as
 * "attached and fine" here just because the fallback happens to have frames.
 */
const EMPTY_STORY: StoryDoc = {
  schemaVersion: 4,
  id: 'unpublished',
  title: '',
  loc: '',
  intro: { title: '', subtitle: '' },
  outro: { title: '', subtitle: '' },
  frames: [],
};

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
    return json({ error: 'That exhibit is too large to publish.' }, 413);
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

  const id = typeof body.id === 'string' ? body.id.trim().toLowerCase() : '';
  if (!ID_PATTERN.test(id)) {
    return json({ error: 'Exhibit id must be lowercase letters, numbers and hyphens.' }, 400);
  }

  const rawDoc = typeof body.doc === 'object' && body.doc !== null ? body.doc : {};

  // Refuse against the SUBMITTED list, before validateExhibitDoc normalises it.
  // The order is the whole point: validateExhibitDoc truncates past ten and
  // drops duplicates, so running these checks on its output would make every
  // one of them unfireable and quietly publish a fourteen-story exhibit as ten
  // — leaving four pictures that do nothing, which is exactly what this
  // endpoint exists to prevent. See `exhibitIssues`' own doc comment.
  const issues = exhibitIssues(
    normalizeStoryIds((rawDoc as { storyIds?: unknown }).storyIds),
    (rawDoc as { feedbackUrl?: unknown }).feedbackUrl,
  );
  if (issues.length > 0) return json({ error: issues.join(' ') }, 422);

  const doc = validateExhibitDoc({ ...rawDoc, id });
  if (doc === null) {
    return json({ error: 'That exhibit has no usable stories.' }, 400);
  }

  try {
    // Read each member story back from the bucket rather than trusting the
    // client's copy. An exhibit can name a story published long ago by someone
    // else, and the refusals below are only meaningful against what a visitor
    // will actually fetch.
    const seenMarkers = new Map<string, string>();

    for (const storyId of doc.storyIds) {
      const raw = await getJson(`stories/${storyId}.json`);
      if (raw === null) {
        return json({ error: `"${storyId}" has not been published yet.` }, 422);
      }

      const story = validateStoryDoc(raw, EMPTY_STORY);
      const anchor = story.anchor;

      // Caught here rather than at runtime because the visitor's symptom is a
      // picture that silently does nothing, long after the operator has left.
      if (anchor === undefined) {
        return json(
          { error: `"${storyId}" is not attached to a picture, so nothing would ever trigger it.` },
          422,
        );
      }

      const owner = seenMarkers.get(anchor.markerId);
      if (owner !== undefined) {
        return json(
          { error: `"${storyId}" and "${owner}" use the same picture. One picture cannot mean two things.` },
          422,
        );
      }
      seenMarkers.set(anchor.markerId, storyId);

      // Both images, because both are read: the tracker needs the luminance
      // image and the scan prompt needs the thumbnail.
      for (const markerId of [anchor.markerId, anchor.thumbId]) {
        if (!(await objectExists(markerKey(markerId)))) {
          return json(
            { error: `The picture for "${storyId}" did not finish uploading. Re-upload it and try again.` },
            422,
          );
        }
      }
    }

    const key = `exhibits/${id}.json`;
    // 60 seconds, matching stories: this is a mutable object at a stable key,
    // which is how /?e=<id> resolves without a lookup table. A longer TTL makes
    // a republish invisible until it expires.
    await putJson(key, JSON.stringify(doc), 'public, max-age=60, must-revalidate');
    const base = (process.env.STORY_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
    return json({ id, url: `${base}/${key}` } satisfies PublishResult, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown storage error';
    return json({ error: `Could not save the exhibit: ${message}` }, 502);
  }
}
