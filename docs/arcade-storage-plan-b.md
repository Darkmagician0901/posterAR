# ARCADE Storage — Plan B (Phases 4–6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the story document itself off Vercel Blob and onto S3, serve it from the CDN, and reclaim unreferenced assets — completing the migration Plan A began.

**Architecture:** Publishing writes `stories/<id>.json` to S3 and the viewer fetches it from CloudFront, so the read path involves no API and no database. `stories/` is the one mutable object at a stable key and gets a 60-second TTL; everything else is content-addressed and cached indefinitely. Garbage collection reclaims assets no published document references.

**Tech Stack:** TypeScript (strict), Vercel Functions (Web handler signature), `@aws-sdk/client-s3`, vitest ^4.1.8, Terraform.

**Prerequisites:** Plan A complete and merged. `docs/arcade-storage-ops-checklist.md` OPS-1 through OPS-5 applied.

**Design source:** `docs/arcade-storage-aws-design.md`. Section references (§) point there.

## Global Constraints

- **TypeScript strict mode. No `any` without a comment justifying it.**
- **Conventional Commits**: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
- **No `Co-Authored-By: Claude` trailer on commits.**
- **Never put a secret in a `VITE_`-prefixed variable** — client variables are inlined into the bundle at build time and are readable by anyone.
- **No agent runs `terraform apply`, touches an AWS console, or sets a secret.** Those are the ops checklist, performed by the repository owner.
- Frontend verification: `npm run type-check`, `npm run lint`, `npm run test`.
- Every failure path must fall back to the bundled factory story. A visitor never sees a broken exhibit.

## Execution Specification

| Role | Model | Effort | Responsibility |
|---|---|---|---|
| **Coordinator** | Opus 5 | max | Dispatch, review between tasks, resolve cross-task inconsistencies, own merges and any conflicted git operation |
| **Implementer** | Sonnet 5 | high | One task, fresh context, TDD steps as written |
| **Reviewer** | Sonnet 5 | high | Verify the task's tests actually fail before and pass after; check the diff against the task's `Interfaces` block |

Dispatch one implementer per task. Do **not** hand a subagent a task whose
prerequisite ops item is unconfirmed — an implementer with no AWS access will
either stub the call or invent credentials, and both look like progress.

---

## Resolved: no database in v1

Planning surfaced a structural problem and it has been fixed rather than worked
around. A Vercel function cannot reach the RDS instance as provisioned — no
stable egress address to allowlist, and `variables.tf` rightly refuses
`0.0.0.0/0` — while §2.2 rules out running Fastify on ECS.

**v1 therefore uses no database at all** (§6). S3 answers existence with
`HeadObject`, atomicity with `If-None-Match: *`, and the metadata the tables
would have held was already in the document's `StoryAssetRef`. The
control-plane schema stays designed, for when a management UI needs it.

Consequences for this plan: `api/_s3.ts` is created by **Plan A Task 5**, not
here, so Task 1 below only extends it with `putJson`. Task 5's garbage
collection reads `stories/*.json` rather than querying `asset_usage`.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/story/assetVariants.ts` | Which variant to request, and the `full` fallback. |
| `src/story/assetVariants.test.ts` | Tests for the above. |
| `scripts/gc-assets.ts` | Reclaims assets no published document references. |
| `scripts/gc-assets.test.ts` | Tests for the reachability calculation. |

**Modified**

| File | Change |
|---|---|
| `api/_s3.ts` | Add `putJson` (created in Plan A Task 5). |
| `api/publish.ts` | S3 `PutObject` instead of `@vercel/blob`; reject unresolvable assets. |
| `api/publish.test.ts` | New tests for the S3 path. |
| `src/services/storyApi.ts` | Read `stories/` from `VITE_STORY_BASE_URL`. |
| `src/story/assetResolver.ts` | Prefer `r1024.webp`, fall back to `full.webp`. |
| `src/services/assetApi.ts` | Upload both variants. |
| `src/utils/imageUpload.ts` | Export a reusable downscale so the derivative is not new machinery. |
| `vercel.json` | Marker rewrite (content is OPS-8; the file edit is Task 6). |

---

## Task 1: Extend the S3 helper with `putJson`

`api/_s3.ts` already exists — **Plan A Task 5** created it with `BUCKET`,
`getS3`, `objectExists`, and `presignPutConditional`. This task adds the one
function publishing needs.

**Files:**
- Modify: `api/_s3.ts`
- Modify: `api/_s3.test.ts`

**Interfaces:**
- Consumes: `getS3`, `BUCKET` (Plan A Task 5).
- Produces: `putJson(key: string, body: string, cacheControl: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Append to `api/_s3.test.ts` — **merge the import into the existing block**
rather than adding a second one:

```ts
import { PutObjectCommand } from '@aws-sdk/client-s3';

describe('putJson', () => {
  it('sends the body, content type, and cache control verbatim', async () => {
    const sent: PutObjectCommand[] = [];
    const { putJson, getS3 } = await import('./_s3');
    // Replace the client's send with a recorder. The helper is a transport
    // shell, so what matters is exactly what it hands to the SDK.
    (getS3() as unknown as { send: (c: PutObjectCommand) => Promise<void> }).send = async (c) => {
      sent.push(c);
    };

    await putJson('stories/x.json', '{"a":1}', 'public, max-age=60, must-revalidate');

    expect(sent).toHaveLength(1);
    expect(sent[0].input.Key).toBe('stories/x.json');
    expect(sent[0].input.Body).toBe('{"a":1}');
    expect(sent[0].input.ContentType).toBe('application/json');
    expect(sent[0].input.CacheControl).toBe('public, max-age=60, must-revalidate');
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run api/_s3.test.ts`
Expected: FAIL — `putJson is not a function`.

- [ ] **Step 3: Add the function**

Append to `api/_s3.ts`:

```ts
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
```

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run api/_s3.test.ts`
Expected: PASS — the 2 tests from Plan A plus this one.

- [ ] **Step 5: Commit**

```bash
git add api/_s3.ts api/_s3.test.ts
git commit -m "feat(storage): putJson for publishing story artifacts

cacheControl is a required parameter rather than a default because the two
callers need opposite values and getting it wrong is silent — stories/ is
mutable at a stable key and needs a short TTL, while content-addressed objects
can be cached indefinitely. A default would make one of them wrong without
anyone noticing."
```

## Task 2: Publish to S3

**Files:**
- Modify: `api/publish.ts`
- Create: `api/publish.test.ts`

**Interfaces:**
- Consumes: `putJson`, `objectExists`, `BUCKET` (Task 1); `validateStoryDoc`, `isAssetRef` (Plan A Task 3); `collectAssetRefs` (Plan A Task 1).
- Produces: `POST /api/publish` → `200 { id, url }`; unchanged request shape.

- [ ] **Step 1: Write the failing tests**

Create `api/publish.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const puts: Array<{ key: string; body: string; cacheControl: string }> = [];
const existing = new Set<string>();

vi.mock('./_s3', () => ({
  BUCKET: 'test-bucket',
  getS3: () => ({}),
  async putJson(key: string, body: string, cacheControl: string) {
    puts.push({ key, body, cacheControl });
  },
  async objectExists(key: string) {
    return existing.has(key);
  },
}));

const SHA = 'a'.repeat(64);
const SECRET = 'test-secret';

const frame = (art: string) => ({
  key: 'f1', year: '1951', label: 'a', title: 't', line: 'l', washColor: '#000', art,
});

const doc = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 4,
  id: 'my-story',
  title: 'T',
  loc: '',
  intro: { title: '', subtitle: '' },
  outro: { title: '', subtitle: '' },
  frames: [frame('<svg viewBox="0 0 1 1"><image href="asset:logo"/></svg>')],
  assets: { logo: { assetId: SHA, aspect: 1 } },
  ...over,
});

async function post(body: unknown, auth = `Bearer ${SECRET}`) {
  const { default: handler } = await import('./publish');
  return handler(
    new Request('https://x/api/publish', {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  puts.length = 0;
  existing.clear();
  existing.add(`assets/${SHA}/full.webp`);
  process.env.STUDIO_PUBLISH_SECRET = SECRET;
  process.env.S3_BUCKET = 'test-bucket';
  vi.resetModules();
});

describe('POST /api/publish', () => {
  it('writes the artifact to stories/<id>.json', async () => {
    const res = await post({ id: 'my-story', doc: doc() });
    expect(res.status).toBe(200);
    expect(puts).toHaveLength(1);
    expect(puts[0].key).toBe('stories/my-story.json');
  });

  // stories/ is the one mutable object at a stable key. A long TTL means a
  // republish is invisible to visitors until it expires.
  it('sets a short cache TTL on the artifact', async () => {
    await post({ id: 'my-story', doc: doc() });
    expect(puts[0].cacheControl).toMatch(/max-age=60\b/);
  });

  it('rejects a document referencing an asset that was never uploaded', async () => {
    existing.clear();
    const res = await post({ id: 'my-story', doc: doc() });
    expect(res.status).toBe(422);
    expect(puts).toHaveLength(0);
    expect((await res.json()).error).toMatch(/upload/i);
  });

  // An art token with no matching assets entry would hydrate to a transparent
  // gap on every viewer's device. Better to refuse at publish.
  it('rejects art whose token has no assets entry', async () => {
    const res = await post({
      id: 'my-story',
      doc: doc({ assets: {} }),
    });
    expect(res.status).toBe(422);
    expect(puts).toHaveLength(0);
  });

  it('accepts a document with no assets at all', async () => {
    const res = await post({
      id: 'my-story',
      doc: doc({ frames: [frame('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>')], assets: undefined }),
    });
    expect(res.status).toBe(200);
    expect(puts).toHaveLength(1);
  });

  it('still rejects a bad secret before doing any work', async () => {
    const res = await post({ id: 'my-story', doc: doc() }, 'Bearer wrong');
    expect(res.status).toBe(401);
    expect(puts).toHaveLength(0);
  });

  it('still rejects an invalid id', async () => {
    const res = await post({ id: 'Not Valid!', doc: doc() });
    expect(res.status).toBe(400);
    expect(puts).toHaveLength(0);
  });

  it('still rejects a document with no usable frames', async () => {
    const res = await post({ id: 'my-story', doc: doc({ frames: [] }) });
    expect(res.status).toBe(400);
    expect(puts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run api/publish.test.ts`
Expected: FAIL — the handler still calls `@vercel/blob`.

Note: `vitest.config.ts` may exclude `api/`. If the file is not picked up, add
`api/**/*.test.ts` to the `include` array — that is a legitimate part of this
step, not a workaround.

- [ ] **Step 3: Replace the storage call and add asset verification**

In `api/publish.ts`, remove `import { put } from '@vercel/blob'` and the
`BLOB_READ_WRITE_TOKEN` guard. Add:

```ts
import { objectExists, putJson } from './_s3';
import { collectAssetRefs } from '../src/story/artTokens';
import { isAssetRef } from '../src/story/storyDoc';
```

Replace the `BLOB_READ_WRITE_TOKEN` configuration check with a bucket check:

```ts
  if (!process.env.S3_BUCKET) {
    return json(
      { error: 'Publishing is not configured. Set S3_BUCKET in the project environment.' },
      503,
    );
  }
```

After the `frames.length === 0` check and before writing, verify assets:

```ts
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

  for (const [alias, asset] of Object.entries(declared)) {
    if (!isAssetRef(asset)) continue; // v3 inline asset: bytes are in the document
    if (!(await objectExists(`assets/${asset.assetId}/full.webp`))) {
      return json({ error: `The image "${alias}" did not finish uploading. Re-add it and try again.` }, 422);
    }
  }
```

Replace the `put(...)` block:

```ts
  try {
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
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run api/publish.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Remove the Blob dependency**

```bash
npm uninstall @vercel/blob
npm run type-check
npm run test
```

Expected: pass, with no remaining import of `@vercel/blob`.

- [ ] **Step 6: Commit**

```bash
git add api/publish.ts api/publish.test.ts package.json package-lock.json vitest.config.ts
git commit -m "feat(storage): publish story artifacts to S3

Replaces Vercel Blob with an S3 PutObject. The artifact gets a 60-second TTL
because stories/<id>.json is the one object that is mutable at a stable key —
that is how /?s=<id> resolves without a lookup table, and a longer TTL would
make a republish invisible to visitors until it expired.

Publishing now also refuses a document whose art references an undeclared
alias, or whose declared asset never finished uploading. Both would otherwise
render as a silent transparent gap on every visitor's device, discovered long
after the operator walked away."
```

---

## Task 3: Read stories from the CDN

**Files:**
- Modify: `src/services/storyApi.ts`
- Modify: `src/services/storyApi.test.ts`

**Interfaces:**
- Consumes: `VITE_STORY_BASE_URL`.
- Produces: no signature change — `publishedStoryUrl(id)` and `fetchPublishedStory(id)` keep their shapes.

- [ ] **Step 1: Write the failing test**

Append to `src/services/storyApi.test.ts`:

```ts
describe('publishedStoryUrl', () => {
  it('builds a path under the configured story origin', () => {
    expect(publishedStoryUrl('my-story')).toMatch(/\/stories\/my-story\.json$/);
  });

  it('percent-encodes the id rather than interpolating it raw', () => {
    expect(publishedStoryUrl('a b')).toContain('a%20b');
  });
});

describe('fetchPublishedStory', () => {
  it('returns null rather than throwing when the document is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    await expect(fetchPublishedStory('gone')).resolves.toBeNull();
  });

  it('returns null rather than throwing when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    await expect(fetchPublishedStory('x')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/services/storyApi.test.ts`
Expected: PASS — `publishedStoryUrl` and `fetchPublishedStory` already behave this way. **This task is confirming existing behaviour survives the origin change, not adding it.** The read path was already host-agnostic; only `VITE_STORY_BASE_URL`'s value changes, and that is OPS-5.

- [ ] **Step 3: Update the environment documentation**

In `.env.example`, replace the Blob-specific comment:

```
# Origin published story documents are served from — the CloudFront domain
# fronting the S3 bucket, e.g. https://d111111abcdef8.cloudfront.net
# Empty disables loading published stories; ?draft=1 still works locally.
VITE_STORY_BASE_URL=

# Origin uploaded image assets are served from. Usually the same distribution.
# Empty means same-origin.
VITE_ASSET_BASE_URL=

# --- server only, never prefixed with VITE_ (that would inline it in the bundle) ---

# Shared secret required by POST /api/publish.
STUDIO_PUBLISH_SECRET=

# S3 target for published artifacts.
S3_BUCKET=
S3_REGION=

# Public base URL returned in the publish response.
STORY_PUBLIC_BASE_URL=

# Preferred: Vercel OIDC. Set this and omit the static key pair.
AWS_ROLE_ARN=
```

Delete the `BLOB_READ_WRITE_TOKEN` entry.

- [ ] **Step 4: Commit**

```bash
git add src/services/storyApi.test.ts .env.example
git commit -m "test(story): pin the read-path contract across the origin change

The viewer already fetched \${VITE_STORY_BASE_URL}/stories/<id>.json, so
moving to CloudFront is configuration rather than code. These tests pin the
behaviour that must survive it — percent-encoded ids, and null rather than a
throw on every failure path.

Documents the new environment variables and drops BLOB_READ_WRITE_TOKEN."
```

---

## Task 4: Display derivative (`r1024`)

Promoted from optional to required by §14.2: every hydrated byte inflates the
`data:` URL assigned to `img.src`, which is where this design has an
unquantified device limit.

**Files:**
- Modify: `src/utils/imageUpload.ts`
- Create: `src/story/assetVariants.ts`
- Test: `src/story/assetVariants.test.ts`
- Modify: `src/services/assetApi.ts`
- Modify: `src/story/assetResolver.ts`

**Interfaces:**
- Consumes: `uploadStoryAsset` (Plan A Task 8).
- Produces:
  - `RASTER_LONGEST_AXIS = 1024`
  - `variantKey(assetId: string, variant: 'full' | 'r1024'): string`
  - `uploadStoryAsset(blob: Blob, contentType: AssetContentType, derivative?: Blob | null)` — third parameter added to Plan A Task 8's two-parameter signature

- [ ] **Step 1: Write the failing test**

Create `src/story/assetVariants.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RASTER_LONGEST_AXIS, variantKey } from './assetVariants';

const SHA = 'a'.repeat(64);

describe('variantKey', () => {
  it('builds the full-size key', () => {
    expect(variantKey(SHA, 'full')).toBe(`assets/${SHA}/full.webp`);
  });

  it('builds the display-derivative key', () => {
    expect(variantKey(SHA, 'r1024')).toBe(`assets/${SHA}/r1024.webp`);
  });

  // Both variants share one content address, so the schema never changes when
  // the derivative is added or removed.
  it('places both variants under the same content address', () => {
    expect(variantKey(SHA, 'full').startsWith(`assets/${SHA}/`)).toBe(true);
    expect(variantKey(SHA, 'r1024').startsWith(`assets/${SHA}/`)).toBe(true);
  });
});

describe('RASTER_LONGEST_AXIS', () => {
  // svgTexture rasterizes the whole composed frame at 1024 on its longest
  // axis, so a single prop never needs more than that.
  it('matches the rasterizer budget', () => {
    expect(RASTER_LONGEST_AXIS).toBe(1024);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/story/assetVariants.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `src/story/assetVariants.ts`:

```ts
/**
 * assetVariants.ts — the stored forms of one asset.
 *
 * An asset is stored twice under a single content address: the canonical bytes
 * and a display derivative capped at the rasterizer's budget.
 *
 * The derivative is not merely a performance nicety. Every hydrated byte
 * inflates the data: URL that gets assigned to img.src, and that is the one
 * place this design carries an unquantified device limit (§14.2). Keeping the
 * hydrated payload small is a correctness margin.
 *
 * Because both variants live under the same content address, adding or
 * removing the derivative never changes the document schema.
 */

/**
 * Longest-axis cap for the display derivative.
 *
 * Matches RASTER_MAX in svgTexture.ts, which rasterizes the whole composed
 * frame at 1024 on its longest axis — so a single prop inside that frame can
 * never need more.
 */
export const RASTER_LONGEST_AXIS = 1024;

/** Which stored form of an asset. */
export type AssetVariant = 'full' | 'r1024';

/**
 * Object key for one variant.
 *
 * @param assetId — 64-hex content address.
 * @param variant — Which stored form.
 * @returns The S3 key, relative to the bucket root.
 */
export function variantKey(assetId: string, variant: AssetVariant): string {
  return `assets/${assetId}/${variant}.webp`;
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run src/story/assetVariants.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Prefer the derivative when resolving**

In `src/story/assetResolver.ts`, replace the fetch in `fetchAsDataUrl`:

```ts
async function fetchAsDataUrl(assetId: string): Promise<string> {
  const base = ASSET_BASE_URL.replace(/\/$/, '');
  // Prefer the display derivative; fall back to the canonical bytes so assets
  // uploaded before derivatives existed still resolve.
  for (const variant of ['r1024', 'full'] as const) {
    try {
      const res = await fetch(`${base}/${variantKey(assetId, variant)}`, { credentials: 'omit' });
      if (!res.ok) continue;
      return await blobToDataUrl(await res.blob());
    } catch {
      // Try the next variant; a transparent pixel is the last resort only.
    }
  }
  return TRANSPARENT_PIXEL;
}
```

Add `import { variantKey } from './assetVariants';`.

- [ ] **Step 6: Generate and upload the derivative**

In `src/utils/imageUpload.ts`, export the existing downscale so this is not new
machinery:

```ts
/**
 * Re-encodes an image at a smaller longest-axis cap.
 *
 * Reuses the same canvas path as processImage, so the derivative is produced
 * by existing, exercised code rather than a second implementation.
 *
 * @param source — Decoded image.
 * @param longestAxis — Cap for the longer dimension, in pixels.
 * @returns WebP bytes, or null when the source is already within the cap.
 */
export const downscaleToWebp = async (
  source: ImageBitmap | HTMLImageElement,
  longestAxis: number,
): Promise<Blob | null> => {
  const srcW = 'width' in source ? source.width : (source as HTMLImageElement).naturalWidth;
  const srcH = 'height' in source ? source.height : (source as HTMLImageElement).naturalHeight;
  if (Math.max(srcW, srcH) <= longestAxis) return null;
  const { width, height } = fitWithin(srcW, srcH, longestAxis);
  return canvasToWebp(drawToCanvas(source, width, height), INITIAL_QUALITY);
};
```

In `src/services/assetApi.ts`, accept and upload the derivative:

```ts
export async function uploadStoryAsset(
  blob: Blob,
  contentType: AssetContentType,
  derivative?: Blob | null,
): Promise<string> {
  // ... existing hash + presign + PUT of the canonical bytes ...

  // The derivative rides the same content address, so a failure here degrades
  // to "resolver falls back to full.webp" rather than breaking the asset.
  if (derivative) {
    try {
      await uploadVariant(sha256, 'r1024', derivative);
    } catch {
      // Non-fatal by design — see above.
    }
  }

  return sha256;
}
```

- [ ] **Step 7: Verify and commit**

```bash
npm run type-check
npm run lint
npm run test
git add src/story/assetVariants.ts src/story/assetVariants.test.ts src/story/assetResolver.ts src/services/assetApi.ts src/utils/imageUpload.ts
git commit -m "feat(storage): store a display derivative alongside each asset

svgTexture rasterizes a whole composed frame at 1024px on its longest axis, so
inlining a 2048px original is decoded and then largely discarded. More
importantly, every hydrated byte inflates the data: URL assigned to img.src —
the one place this design has an unquantified device limit — so a smaller
payload is a correctness margin, not just a speed win.

Both variants share one content address, so the schema is unchanged either
way, and a failed derivative upload degrades to the canonical bytes rather
than breaking the asset."
```

---

## Task 5: Garbage collection

**Files:**
- Create: `scripts/gc-assets.ts`
- Test: `scripts/gc-assets.test.ts`

**Interfaces:**
- Consumes: `collectAssetRefs` (Plan A Task 1); `isAssetRef` (Plan A Task 3).
- Produces: `unreachableAssets(published: StoryDoc[], stored: string[], graceCutoff): string[]`

> Reachability is derived from the published documents, which §4 names as the
> source of truth for rendering — so it cannot drift from what is actually
> being served. If a control plane is ever added (§6), the pure function below
> is unchanged; only its caller would differ.

- [ ] **Step 1: Write the failing test**

Create `scripts/gc-assets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { unreachableAssets } from './gc-assets';
import type { StoryDoc } from '../src/story/storyDoc';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

const story = (assets: Record<string, { assetId: string; aspect: number }>): StoryDoc => ({
  schemaVersion: 4,
  id: 's',
  title: '',
  loc: '',
  intro: { title: '', subtitle: '' },
  outro: { title: '', subtitle: '' },
  frames: [{ key: 'f', year: '', label: '', title: '', line: '', washColor: '', art: '<svg/>' }],
  assets,
});

describe('unreachableAssets', () => {
  it('keeps an asset a published story references', () => {
    expect(unreachableAssets([story({ logo: { assetId: A, aspect: 1 } })], [A], 0)).toEqual([]);
  });

  it('reclaims an asset nothing references', () => {
    expect(unreachableAssets([story({ logo: { assetId: A, aspect: 1 } })], [A, B], 0)).toEqual([B]);
  });

  // Assets are uploaded on drop, so one legitimately has no references
  // between being added and the story being published. Without the grace
  // window, GC would delete work in progress.
  it('spares a recently uploaded asset even when nothing references it', () => {
    const cutoff = 1_000;
    expect(unreachableAssets([], [B], cutoff, new Map([[B, 2_000]]))).toEqual([]);
    expect(unreachableAssets([], [B], cutoff, new Map([[B, 500]]))).toEqual([B]);
  });

  it('keeps an asset shared by two stories when only one is deleted', () => {
    const remaining = [story({ logo: { assetId: A, aspect: 1 } })];
    expect(unreachableAssets(remaining, [A], 0)).toEqual([]);
  });

  it('reclaims nothing when there is nothing stored', () => {
    expect(unreachableAssets([], [], 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run scripts/gc-assets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the reachability calculation**

Create `scripts/gc-assets.ts`:

```ts
/**
 * gc-assets.ts — reclaim assets no published story references.
 *
 * Reachability is computed from the published documents themselves, which are
 * the source of truth for rendering (§4). Deriving it rather than maintaining
 * a counter means the answer cannot drift out of sync with what is actually
 * being served.
 *
 * The reachability calculation is pure and unit-tested. The S3 listing and
 * deletion around it are not — they are a thin transport shell.
 */

import { isAssetRef, type StoryDoc } from '../src/story/storyDoc';

/**
 * Lists stored assets that are safe to delete.
 *
 * @param published — Every published document.
 * @param stored — Every stored assetId.
 * @param graceCutoff — Epoch ms; assets created after this are spared
 *   regardless of references. Uploads happen on drop, so an asset
 *   legitimately has no references between being added and the story being
 *   published — without this window, GC would delete work in progress.
 * @param createdAt — assetId to creation time in epoch ms. A missing entry is
 *   treated as old: an asset whose age cannot be established is not new, and
 *   the reference check still protects it.
 * @returns The assetIds to delete.
 */
export function unreachableAssets(
  published: StoryDoc[],
  stored: string[],
  graceCutoff: number,
  createdAt: ReadonlyMap<string, number> = new Map(),
): string[] {
  const reachable = new Set<string>();
  for (const doc of published) {
    for (const asset of Object.values(doc.assets ?? {})) {
      if (isAssetRef(asset)) reachable.add(asset.assetId);
    }
  }

  return stored.filter((id) => {
    if (reachable.has(id)) return false;
    return (createdAt.get(id) ?? 0) <= graceCutoff;
  });
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run scripts/gc-assets.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/gc-assets.ts scripts/gc-assets.test.ts
git commit -m "feat(storage): reclaim assets no published story references

Reachability is derived from the published documents themselves, which are the
source of truth for rendering. Deriving it rather than maintaining a counter
means the answer cannot drift out of sync with what is actually being served.

The grace window exists because uploads happen on drop: an asset legitimately
has no references between being added and the story being published, so
without it GC would delete work in progress. An asset whose age cannot be
established is treated as old, since the reference check still protects it."
```

---

## Task 6: End-to-end verification

No new logic. This is the gate that proves the migration landed.

**Prerequisites:** OPS-1 through OPS-5, OPS-7, OPS-8 all complete.

- [ ] **Step 1: Full green check**

```bash
npm run type-check && npm run lint && npm run test
```

- [ ] **Step 2: Confirm Vercel Blob is gone**

```bash
grep -rn "@vercel/blob\|BLOB_READ_WRITE_TOKEN" --include="*.ts" --include="*.tsx" --include="*.json" . \
  | grep -v node_modules | grep -v package-lock.json
```

Expected: **no matches.** Any hit means a code path still writes to Blob.

- [ ] **Step 3: Publish and confirm the artifact landed in S3**

Publish from the studio, then:

```bash
aws s3 ls "s3://<bucket>/stories/"
aws s3api head-object --bucket <bucket> --key "stories/<id>.json" --query CacheControl
```

Expected: the object exists and reports `public, max-age=60, must-revalidate`.

- [ ] **Step 4: Confirm the read path never touches the API**

Open `/?s=<id>` with the browser devtools Network tab filtered to XHR/fetch.

Expected: requests go to the **CloudFront domain only** — `stories/<id>.json`
and `assets/<sha>/…`. **No request to `/api/…`.** A call to the API here means
the read path acquired a backend dependency, which is the one property §4 rests
on.

- [ ] **Step 5: Confirm republishing is visible within the TTL**

Change a frame's title, republish, wait ~60 seconds, hard-reload `/?s=<id>`.

Expected: the change appears. If it does not, the `stories/` TTL is longer than
intended or a CloudFront behaviour is overriding the object's `Cache-Control`.

- [ ] **Step 6: Device check — a real exhibit on a real phone**

Open `/?s=<id>` on a phone and step through every frame.

Expected: uploaded images appear in every frame that uses them. A blank image
means hydration ran too late, the CORS configuration is wrong, or the asset
never uploaded — check the console before assuming which.

Record the worst-case frame's behaviour: this is the observation feeding the
`data:` URL size-ceiling risk (§14.2).

- [ ] **Step 7: Open the pull request**

```bash
git push -u origin feat/arcade-storage-b
gh pr create --draft --base main \
  --title "feat(storage): publish to S3, serve from CloudFront, reclaim unused assets" \
  --body "Implements Phases 4-6 of docs/arcade-storage-aws-design.md. Requires the ops checklist items listed in the plan."
```

---

## Spec coverage

| Spec section | Where |
|---|---|
| §2.2 deployment shape | OPS-5, OPS-6, OPS-7, OPS-8 |
| §5 `stories/`, `markers/`, `r1024` | Task 2, Task 4, OPS-3 |
| §5.1 base URLs | Task 3, OPS-5 |
| §6 `stories` table | **Not built** — §6 records it is not load-bearing in v1 |
| §7.4 garbage collection | Task 5 |
| §9 CORS, cold-cache test | OPS-2, OPS-7 |
| §9.1 unified-AWS path | Documented only; not taken |
| §14.1 fingerprint rewrite | OPS-8 |
| §14.2 iOS size ceiling | Task 4 (mitigation), Task 6 Step 6 (observation) |

## Not in either plan

- **Anchoring.** Its own spec, gated on device verification of the four unverified marker items. `StoryAnchor` is defined in §8.1 so adding it needs no migration; nothing reads it yet.
- **A story browser / management UI.** Without it, the `stories`, `markers`, and `story_markers` tables have no consumer.
- **Story deletion.** Defined with the management UI (§14.2).
- **Video and audio.** The bucket layout accommodates them; no render path exists.
