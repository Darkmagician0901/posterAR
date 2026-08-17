# The image-marker layer — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An operator uploads a picture in Studio, binds it to a story, and groups stories into an exhibit; a visitor opens `/?e=<id>`, walks a room of printed pictures, and each one brings its own story alive on top of it.

**Architecture:** Marker fingerprints are generated **client-side** by a canvas port of `@8thwall/image-target-cli`'s PLANAR path — a crop, a resize, a grayscale, and a JSON document, with no feature extraction anywhere in it. Both PNGs are stored content-addressed under `markers/<sha>.png` through the existing unauthenticated presign endpoint, whose safety invariant (the key is derived server-side from the submitted digest, then bound into a signed checksum header) is preserved exactly. The tracker's `target.json` is **never stored** — the viewer synthesizes it at load time from `StoryAnchor`, so there is no unverifiable object for anyone to poison.

**Tech Stack:** TypeScript (strict), React 18, Zustand 4, plain three.js, 8th Wall (XR8), vitest ^4.1.8 + happy-dom ^20.9.0, AWS S3 + Lambda + Amplify.

**Spec:** `docs/marker-layer-design.md` — read it before starting. This plan argues from that spec and does not restate its reasoning.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Commit messages: ONE plain readable sentence.** Imperative mood, capitalized, **no trailing period**, and **no `feat:`/`fix:`/`docs:` prefix and no scope**. One line only — **no body**. Written so a non-engineer skimming GitHub history understands what changed. Example: `Add a draggable 3D phone preview so authors can look around a scene`. *(The four commits already on this branch violate this — do not copy their style, and do not rewrite them either.)*
- **No `Co-Authored-By: Claude` trailer** on any commit.
- **Plain three.js only.** Do NOT add `@react-three/*` or `@use-gesture/*`.
- **TypeScript strict mode; no `any`** without an inline comment justifying it.
- **Only pure logic is unit-tested.** Canvas rasterization, XR8 interactions, and pointer events are verified on device (`TESTING.md`), never against happy-dom stubs. A test that asserts against a stubbed rasterizer is worse than no test.
- **`ASSET_ID_RE = /^[a-f0-9]{64}$/`** from `src/story/assetHash.ts` is the whole security property for every id that becomes a path segment. Reuse it; never hand-roll a second regex.
- **Marker key prefix is `markers/`**, never `assets/`. `api/publish.ts`'s reachability check derives from `doc.assets` only, so a marker under `assets/` would read as unreachable and be garbage-collected.
- **Marker files are PNG**, whatever the source photo was. Fixed extension is what makes the key derivable from the hash alone.
- **Simultaneous image targets: ≤ 10.** The engine's cap; enforced at publish.
- **Minimum marker crop: 480 × 640.** From the CLI's `constants.json`.
- Run `npm run type-check` and `npm run test` before every commit. Both must pass.

### Pre-existing failures — not yours to fix, not yours to hide

`api/_s3.test.ts` currently fails with 3 errors: it cannot import `@aws-sdk/client-s3` or `@aws-sdk/s3-request-presigner`. Both are declared in `package.json:28-29` but are absent from `node_modules`. This reproduces on clean `main` and is unrelated to marker work. Baseline is **417 passed / 3 failed**. If `npm install` has been run and they now pass, the baseline is 420/420. **Never report these 3 as caused by your task, and never delete the test file to make them go away.**

### Superseded prior art — do not resurrect

`origin/feat/marker-anchored-authoring` contains `src/studio/MarkerPanel.tsx` and a `doc.marker` field on `schemaVersion: 3`. That is the **pre-§1 conception** — an authoring reference image with a printed width in metres, whose own header says a tracked target "needs a fingerprint the interactive-only image-target CLI cannot produce headlessly." `docs/marker-layer-design.md` §1 overturns exactly that premise. Do not merge, cherry-pick, or imitate it, and do not name anything `doc.marker` — this plan uses `doc.anchor` (§3.3) and `MarkersPanel` (plural).

### A file this plan does NOT have

`src/xr8/imageTargetData.ts` exists **only** on `feat/marker-spaces-testbed` (commit `920c8d6`, PR #40, which must stay unmerged). Do not import it. Task 12 defines the `ImageTargetData` type on this branch. Spec §3.5 already anticipates this: the manifest-loading path "become[s] unnecessary" because the viewer synthesizes instead.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/markers/markerCrop.ts` | CLI crop arithmetic — `getDefaultCrop`, `validateCrop` | 1 ✅ |
| `src/markers/markerImages.ts` | Canvas: rotate → crop → resize → grayscale → 2 PNGs | 1 ✅ |
| `src/markers/markerStorage.ts` | `markerKey(id)` — the single definition of `markers/<id>.png` | 2 |
| `src/services/contentUpload.ts` | Shared presign/PUT/412 byte uploader, asset **and** marker | 3 |
| `src/services/markerApi.ts` | Uploads a marker's two PNGs, returns their two ids | 3 |
| `src/studio/markerCropEdit.ts` | Pure crop-box drag/resize maths, 3:4 locked, in bounds | 4 |
| `src/studio/markerLibrary.ts` | Per-device marker library, its own localStorage key | 5 |
| `src/studio/MarkersPanel.tsx` | Drop a photo, choose a crop, see the grayscale, upload | 6 |
| `src/story/storyDoc.ts` | Gains `StoryAnchor`, `LocalTransform`, `sanitizeAnchor` | 7 |
| `src/studio/stageGeometry.ts` | Gains a stage-frame parameter so the stage can be 3:4 | 9 |
| `src/exhibit/exhibitDoc.ts` | `ExhibitDoc` + `validateExhibitDoc` + every §8 refusal | 10 |
| `api/publish-exhibit.ts` | Authenticated exhibit publish, with the §8 refusals | 11 |
| `src/studio/ExhibitDialog.tsx` | Name it, list story ids, publish | 12 |
| `src/markers/markerTarget.ts` | `ImageTargetData` + `markerTargetData(anchor)` | 13 |
| `src/services/exhibitApi.ts` | `?e=` resolution, fetch, derived marker→story map | 14 |
| `src/markers/markerSelection.ts` | Nearest-centre choice + dwell, as pure geometry | 15 |
| `src/xr8/markerTracking.ts` | XR8 configure + imagefound/updated/lost → world matrix | 16 |

---

## Phase 0 — Device verification (HUMAN, GATING)

**This is a gate, not a formality.** It answers spec §2's invalidating question and §4.2's resampling risk, and both answers change what gets built. Tasks 2–9 may proceed in parallel with it; **Task 16 must not start until it passes.**

- [ ] **Step 1: Generate one fingerprint each way from the same photo**

CLI side, on any machine with node:

```bash
npx @8thwall/image-target-cli@1.0.0
```

Browser side: once Task 6 lands, drop the same photo into the Markers panel and download both PNGs.

- [ ] **Step 2: Print the cropped image matte, at a known width**

Record the printed width in millimetres. Matte, not glossy — gloss blows out under room light and destroys tracking.

- [ ] **Step 3: Run the testbed on device**

Check out `feat/marker-spaces-testbed`, `npm run dev`, open `?mode=marker` on the phone.

- [ ] **Step 4: Record VER-M1's two measurements**

| Measurement | Why it matters |
|---|---|
| Detection latency, browser fingerprint vs CLI fingerprint | §4.2 — if the browser version is measurably worse, fall back to a Lambda running the CLI's `applyCrop`; the JSON shape is unchanged either way so nothing downstream moves |
| Follow-mode jitter against the printed picture's own border | §2 — art pinned onto a marker is the harshest possible pose-stability test. If the art visibly slides against the border, switch `mode` to `latch`, or inset the art so its edges do not coincide with the marker's |

Write both results into `docs/marker-layer-design.md` §12 as VER-M1's outcome, then commit.

```bash
git add docs/marker-layer-design.md
git commit -m "Record what the printed marker measured on device"
```

---

## Task 1: Fingerprint core ✅ ALREADY BUILT

Delivered by commits `a1d91f3` and `024f1b0`. Do not redo.

**Produces** (later tasks consume these exact names):

```ts
// src/markers/markerCrop.ts
export const MARKER_MIN_WIDTH = 480;
export const MARKER_MIN_HEIGHT = 640;
export const MARKER_LUMINANCE_HEIGHT = 640;
export const MARKER_THUMBNAIL_HEIGHT = 350;
export interface ImageSize { width: number; height: number }
export interface MarkerCrop {
  top: number; left: number; width: number; height: number;
  isRotated: boolean; originalWidth: number; originalHeight: number;
}
export function getDefaultCrop(size: ImageSize, isRotated: boolean): MarkerCrop;
export function validateCrop(crop: MarkerCrop, size: ImageSize): string[];

// src/markers/markerImages.ts
export interface MarkerImages { luminance: Blob; thumbnail: Blob }
export async function renderMarkerImages(source: ImageBitmap, crop: MarkerCrop): Promise<MarkerImages>;
```

Two facts an executor will otherwise get wrong:

- `getDefaultCrop`'s `isRotated` describes the **source** being landscape. When true, the returned crop is in **post-rotation** coordinates, and `originalWidth`/`originalHeight` are the post-swap values — not `size`.
- `validateCrop`'s `size` must be in the **same** space as `crop`, i.e. post-rotation. Passing the pre-rotation size for a rotated crop silently validates the wrong axis.

- [x] Built, tested (13 tests), committed, pushed.

---

## Task 2: Marker object key and the presign `kind` discriminator

**Files:**
- Create: `src/markers/markerStorage.ts`
- Create: `src/markers/markerStorage.test.ts`
- Modify: `api/story-assets.ts` (the `EXT` map at :45-47, the `contentType` check at :95, the key at :102)
- Modify: `api/story-assets.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `markerKey(markerId: string): string` → `markers/<markerId>.png`. The endpoint gains an optional request field `kind?: 'asset' | 'marker'`; absent means `'asset'`, so every existing caller is untouched.

- [ ] **Step 1: Write the failing test for the key**

Create `src/markers/markerStorage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { markerKey } from './markerStorage';

describe('markerKey', () => {
  const id = 'a'.repeat(64);

  it('addresses a marker by its own hash, under the markers prefix', () => {
    expect(markerKey(id)).toBe(`markers/${id}.png`);
  });

  it('stays outside the assets prefix so the publish reachability check ignores it', () => {
    expect(markerKey(id).startsWith('assets/')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/markers/markerStorage.test.ts`
Expected: FAIL — cannot resolve `./markerStorage`.

- [ ] **Step 3: Write the module**

Create `src/markers/markerStorage.ts`:

```ts
/**
 * markerStorage.ts — where a marker's bytes live.
 *
 * One key-construction function, imported by both `api/` (the presign endpoint
 * that writes, the exhibit publish endpoint that probes) and `src/` (the
 * viewer, which derives the same path). A second hand-written copy of this
 * string is how content addressing fails: the two drift, the read 404s, and
 * because the address comes from content rather than assignment, re-uploading
 * cannot fix it.
 *
 * A separate prefix from `assets/` on purpose. `api/publish.ts` derives
 * reachability from `doc.assets` alone, and marker ids live in `doc.anchor`, so
 * a marker stored under `assets/` would read as unreachable and be collected.
 *
 * Both of a marker's files — luminance and thumbnail — go through here, each
 * under the hash of ITS OWN bytes. Grouping them under the luminance's hash
 * would put the thumbnail at an address nobody can verify, which on an
 * unauthenticated `If-None-Match: *` endpoint is a permanent squattable slot.
 * See `docs/marker-layer-design.md` §3.4.
 */

/**
 * Object key for one marker image's stored bytes.
 *
 * @param markerId — 64-hex SHA-256 of the PNG stored under this key. A
 *   thumbnail passes its OWN id here, never its luminance image's.
 * @returns The S3 key, relative to the bucket root.
 */
export function markerKey(markerId: string): string {
  return `markers/${markerId}.png`;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/markers/markerStorage.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the failing endpoint tests**

Append to `api/story-assets.test.ts` (inside the existing top-level `describe`, reusing its `post` helper, `present`, `presigned`, and `SHA`):

```ts
  it('stores a marker under markers/<sha>.png when kind is marker', async () => {
    const res = await post({
      sha256: SHA,
      sha256Base64: hexToBase64(SHA),
      contentType: 'image/png',
      kind: 'marker',
    });
    expect(res.status).toBe(201);
    expect(presigned.at(-1)).toBe(markerKey(SHA));
  });

  it('still refuses png when kind is absent, so asset callers cannot drift', async () => {
    const res = await post({
      sha256: SHA,
      sha256Base64: hexToBase64(SHA),
      contentType: 'image/png',
    });
    expect(res.status).toBe(400);
  });

  it('refuses webp for a marker, so a marker key can only ever hold a png', async () => {
    const res = await post({
      sha256: SHA,
      sha256Base64: hexToBase64(SHA),
      contentType: 'image/webp',
      kind: 'marker',
    });
    expect(res.status).toBe(400);
  });

  it('refuses an unknown kind rather than silently treating it as an asset', async () => {
    const res = await post({
      sha256: SHA,
      sha256Base64: hexToBase64(SHA),
      contentType: 'image/png',
      kind: 'sneaky',
    });
    expect(res.status).toBe(400);
  });

  it('still requires the checksum to match the address for a marker', async () => {
    const other = 'b'.repeat(64);
    const res = await post({
      sha256: SHA,
      sha256Base64: hexToBase64(other),
      contentType: 'image/png',
      kind: 'marker',
    });
    expect(res.status).toBe(400);
  });
```

Add the import at the top of the file, beside the existing `assetKey` import:

```ts
import { markerKey } from '../src/markers/markerStorage';
```

- [ ] **Step 6: Run them and watch them fail**

Run: `npx vitest run api/story-assets.test.ts`
Expected: FAIL — the marker cases 400 because `image/png` is not in `EXT`.

- [ ] **Step 7: Extend the endpoint**

In `api/story-assets.ts`, add the import:

```ts
import { markerKey } from '../src/markers/markerStorage';
```

Replace the `EXT` constant (:45-47) with two allowlists — one per kind — so widening one can never accidentally widen the other:

```ts
/**
 * Accepted upload types, per kind.
 *
 * Two maps rather than one, because the two kinds have opposite constraints
 * and a single widened map would satisfy neither. Assets are webp-only: the
 * read path (`src/story/assetResolver.ts`) fetches `full.webp`, so any other
 * extension writes a key nothing ever reads — a 404 that resolves to a silent
 * transparent pixel and, because the address is content-derived, is unfixable
 * by re-uploading. Markers are png-only: the key is `markers/<sha>.png` with a
 * fixed extension, which is what lets the viewer derive the path from the hash
 * alone (`docs/marker-layer-design.md` §3.5), and lossless is the right choice
 * for an image the tracker matches camera frames against.
 *
 * `image/svg+xml` is deliberately absent from both: an SVG served from the
 * public bucket origin is active content and therefore a stored-XSS vector.
 */
const ACCEPTED: Record<UploadKind, { type: string; key: (sha: string) => string }> = {
  asset: { type: 'image/webp', key: assetKey },
  marker: { type: 'image/png', key: markerKey },
};

/** Which prefix an upload is destined for. Absent in a request ⇒ 'asset'. */
type UploadKind = 'asset' | 'marker';

function isUploadKind(v: unknown): v is UploadKind {
  return v === 'asset' || v === 'marker';
}
```

Destructure `kind` alongside the existing fields:

```ts
  const { sha256, sha256Base64, contentType, kind } = parsed as Record<string, unknown>;
```

Replace the `contentType` check (:95-100) with:

```ts
  // Absent means 'asset', so every caller written before markers existed keeps
  // working unchanged. An unrecognised value is refused rather than defaulted:
  // a typo must not silently write a marker into the asset prefix.
  if (kind !== undefined && !isUploadKind(kind)) {
    return json({ error: "kind must be 'asset' or 'marker'." }, 400);
  }
  const uploadKind: UploadKind = isUploadKind(kind) ? kind : 'asset';
  const accepted = ACCEPTED[uploadKind];

  if (contentType !== accepted.type) {
    return json(
      { error: `Unsupported image type for a ${uploadKind}. Only ${accepted.type} is accepted.` },
      400,
    );
  }
```

Replace the key line (:102):

```ts
  // Still derived server-side from the submitted digest — the property that
  // makes this endpoint safe to leave unauthenticated. The kind selects which
  // prefix, never which bytes may claim which address.
  const key = accepted.key(sha256);
```

- [ ] **Step 8: Run the whole endpoint suite**

Run: `npx vitest run api/story-assets.test.ts`
Expected: PASS — every pre-existing test plus the 5 new ones.

- [ ] **Step 9: Verify and commit**

Run: `npm run type-check && npm run lint && npm run test`
Expected: type-check and lint clean; suite at baseline + 7 new tests, with only the 3 known `api/_s3.test.ts` failures.

```bash
git add src/markers/markerStorage.ts src/markers/markerStorage.test.ts api/story-assets.ts api/story-assets.test.ts
git commit -m "Let operators upload marker images without weakening the upload endpoint"
```

---

## Task 3: The shared uploader and the marker upload service

**Files:**
- Create: `src/services/contentUpload.ts`
- Create: `src/services/contentUpload.test.ts`
- Modify: `src/services/assetApi.ts` (delete its private `uploadBytes`, import the shared one)
- Create: `src/services/markerApi.ts`
- Create: `src/services/markerApi.test.ts`

**Interfaces:**
- Consumes: `markerKey` (Task 2), `MarkerImages` (Task 1), `sha256Hex` / `hexToBase64` from `src/story/assetHash.ts`.
- Produces:
  ```ts
  // src/services/contentUpload.ts
  export type UploadKind = 'asset' | 'marker';
  export async function uploadContent(bytes: Blob, contentType: string, kind: UploadKind): Promise<string>;

  // src/services/markerApi.ts
  export interface UploadedMarker { markerId: string; thumbId: string }
  export async function uploadMarker(images: MarkerImages): Promise<UploadedMarker>;
  ```

`assetApi.ts` already contains exactly this presign/PUT/412-is-success logic as a private function. Extracting it rather than copying it is the point of this task: two copies would drift, and the half that drifts is the half that enforces "the address written is the hash of the bytes written."

- [ ] **Step 1: Write the failing test for the shared uploader**

Create `src/services/contentUpload.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { uploadContent } from './contentUpload';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function presignOk(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('uploadContent', () => {
  it('sends the kind so the server picks the right prefix', async () => {
    fetchMock
      .mockResolvedValueOnce(presignOk({ exists: false, uploadUrl: 'https://s3/put', requiredHeaders: {} }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await uploadContent(new Blob([new Uint8Array([1, 2, 3])]), 'image/png', 'marker');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { kind: string };
    expect(body.kind).toBe('marker');
  });

  it('sends the base64 digest as the base64 form of the hex one', async () => {
    fetchMock
      .mockResolvedValueOnce(presignOk({ exists: false, uploadUrl: 'https://s3/put', requiredHeaders: {} }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await uploadContent(new Blob([new Uint8Array([1, 2, 3])]), 'image/png', 'marker');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      sha256: string; sha256Base64: string;
    };
    expect(body.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(body.sha256Base64).toBe(Buffer.from(body.sha256, 'hex').toString('base64'));
  });

  it('skips the PUT when the server says the bytes are already stored', async () => {
    fetchMock.mockResolvedValueOnce(presignOk({ exists: true }, 200));

    const id = await uploadContent(new Blob([new Uint8Array([9])]), 'image/png', 'marker');

    expect(id).toMatch(/^[a-f0-9]{64}$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats a 412 as success, because it means identical bytes won the race', async () => {
    fetchMock
      .mockResolvedValueOnce(presignOk({ exists: false, uploadUrl: 'https://s3/put', requiredHeaders: {} }))
      .mockResolvedValueOnce(new Response(null, { status: 412 }));

    await expect(
      uploadContent(new Blob([new Uint8Array([1])]), 'image/png', 'marker'),
    ).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  it('throws when the upload fails for any other reason', async () => {
    fetchMock
      .mockResolvedValueOnce(presignOk({ exists: false, uploadUrl: 'https://s3/put', requiredHeaders: {} }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(
      uploadContent(new Blob([new Uint8Array([1])]), 'image/png', 'marker'),
    ).rejects.toThrow(/upload failed/);
  });
});
```

**Note for the executor:** happy-dom provides `crypto.subtle`. If `sha256Hex` throws in this environment, do not stub it — that would test nothing. Instead confirm the test runner is on a secure-context shim, and if it genuinely cannot digest, move these five assertions to the device checklist and say so in the commit.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/services/contentUpload.test.ts`
Expected: FAIL — cannot resolve `./contentUpload`.

- [ ] **Step 3: Extract the uploader**

Create `src/services/contentUpload.ts` by moving `uploadBytes` out of `assetApi.ts` verbatim, adding the `kind` parameter:

```ts
/**
 * contentUpload.ts — the one place bytes are put into the bucket.
 *
 * Shared by story assets and marker images so the presign/PUT/412 handling
 * cannot drift between them, and so both obey the same rule: the address
 * written is the hash of the bytes written. The server enforces exactly that
 * and refuses any request where the two disagree — which is the only reason
 * the endpoint is safe to leave unauthenticated.
 */

import { API_BASE_URL } from '@/utils/constants';
import { hexToBase64, sha256Hex } from '@/story/assetHash';

/** Which prefix the bytes are destined for. Mirrors `api/story-assets.ts`. */
export type UploadKind = 'asset' | 'marker';

interface PresignResponse {
  exists: boolean;
  uploadUrl?: string;
  requiredHeaders?: Record<string, string>;
}

/**
 * Presigns and uploads one blob under its own content address.
 *
 * @param bytes — The bytes being uploaded.
 * @param contentType — MIME type of `bytes`. Must match what the server's
 *   allowlist accepts for `kind`, or the presign is refused.
 * @param kind — Selects the prefix: 'asset' ⇒ `assets/<sha>/full.webp`,
 *   'marker' ⇒ `markers/<sha>.png`.
 * @returns The content address the bytes are stored under.
 * @throws When the presign or upload fails for any reason other than the
 *   object already existing.
 */
export async function uploadContent(
  bytes: Blob,
  contentType: string,
  kind: UploadKind,
): Promise<string> {
  const sha256 = await sha256Hex(await bytes.arrayBuffer());
  // Same digest as the key, in the encoding S3's checksum header takes. The
  // server rejects the request unless these two agree.
  const sha256Base64 = hexToBase64(sha256);

  const presignRes = await fetch(`${API_BASE_URL}/api/story-assets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sha256, sha256Base64, contentType, kind }),
  });
  if (!presignRes.ok) throw new Error(`presign failed: ${presignRes.status}`);

  const presign = (await presignRes.json()) as PresignResponse;
  // Already stored. Content addressing makes this a certainty rather than a
  // guess, so there is nothing to upload.
  if (presign.exists) return sha256;

  if (!presign.uploadUrl) throw new Error('presign returned no upload URL');

  const put = await fetch(presign.uploadUrl, {
    // Sent verbatim: these headers are part of the signature, so altering or
    // dropping one produces a mismatch rather than a silent success.
    method: 'PUT',
    headers: presign.requiredHeaders ?? {},
    body: bytes,
  });

  // 412 Precondition Failed means If-None-Match rejected the write because the
  // object already exists — a race with another uploader of identical bytes.
  // The bytes we wanted are stored, so this is success.
  if (!put.ok && put.status !== 412) {
    throw new Error(`upload failed: ${put.status}`);
  }

  return sha256;
}
```

- [ ] **Step 4: Rewire `assetApi.ts`**

Delete its private `uploadBytes` and its now-unused `API_BASE_URL` / `sha256Hex` / `hexToBase64` imports, and add:

```ts
import { uploadContent } from './contentUpload';
```

Replace the two call sites in `uploadStoryAsset`:

```ts
  const assetId = await uploadContent(blob, contentType, 'asset');
```

```ts
      return { assetId, r1024Id: await uploadContent(derivative, contentType, 'asset') };
```

Keep the `AssetContentType` export and every doc comment as they are — `src/story/assetStorage.ts`'s reasoning about why a derivative is self-addressed is exactly what Task 2's marker layout follows, and it must stay findable.

- [ ] **Step 5: Run both suites**

Run: `npx vitest run src/services/contentUpload.test.ts src/services/assetApi.test.ts`
Expected: PASS. `assetApi.test.ts` must pass **unchanged** — if it needs edits, the extraction changed behaviour and is wrong.

- [ ] **Step 6: Write the failing marker-service test**

Create `src/services/markerApi.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { uploadMarker } from './markerApi';

const uploadContent = vi.fn();
vi.mock('./contentUpload', () => ({
  uploadContent: (...args: unknown[]) => uploadContent(...args),
}));

beforeEach(() => {
  uploadContent.mockReset();
});

describe('uploadMarker', () => {
  const images = {
    luminance: new Blob([new Uint8Array([1])], { type: 'image/png' }),
    thumbnail: new Blob([new Uint8Array([2])], { type: 'image/png' }),
  };

  it('addresses each image by its own bytes, never the luminance hash twice', async () => {
    uploadContent.mockResolvedValueOnce('a'.repeat(64)).mockResolvedValueOnce('b'.repeat(64));

    const out = await uploadMarker(images);

    expect(out).toEqual({ markerId: 'a'.repeat(64), thumbId: 'b'.repeat(64) });
    expect(uploadContent).toHaveBeenNthCalledWith(1, images.luminance, 'image/png', 'marker');
    expect(uploadContent).toHaveBeenNthCalledWith(2, images.thumbnail, 'image/png', 'marker');
  });

  it('fails loudly when the thumbnail does not land', async () => {
    uploadContent.mockResolvedValueOnce('a'.repeat(64)).mockRejectedValueOnce(new Error('nope'));

    await expect(uploadMarker(images)).rejects.toThrow();
  });
});
```

The second test encodes a real decision: unlike a story asset's `r1024Id` derivative — whose loss is cosmetic and is therefore swallowed — a missing thumbnail leaves the operator with an unidentifiable entry in the library and the visitor with no scan hint, so it must throw.

- [ ] **Step 7: Run it and watch it fail**

Run: `npx vitest run src/services/markerApi.test.ts`
Expected: FAIL — cannot resolve `./markerApi`.

- [ ] **Step 8: Write the marker service**

Create `src/services/markerApi.ts`:

```ts
/**
 * markerApi.ts — storing a marker's two images.
 *
 * Both PNGs go up as ordinary content-addressed objects under the `markers/`
 * prefix, each under the hash of its OWN bytes. There is deliberately no third
 * upload: the tracker's target document is synthesized on the client at load
 * time (`src/markers/markerTarget.ts`), so there is no stored JSON for anyone
 * to poison — see `docs/marker-layer-design.md` §3.4 and §3.5.
 */

import type { MarkerImages } from '@/markers/markerImages';
import { uploadContent } from './contentUpload';

/** The two content addresses one marker is made of. */
export interface UploadedMarker {
  /** SHA-256 of the luminance PNG. This is the marker's identity. */
  markerId: string;
  /** SHA-256 of the thumbnail PNG, addressed on its own bytes. */
  thumbId: string;
}

/**
 * Uploads a marker's luminance and thumbnail images.
 *
 * Sequential rather than parallel: the luminance image is the marker's
 * identity, so if the connection is failing there is no point spending the
 * operator's bandwidth on a thumbnail for a marker that will not exist.
 *
 * @param images — The two PNGs from `renderMarkerImages`.
 * @returns Both content addresses.
 * @throws When either upload fails. A marker without its thumbnail is
 *   unidentifiable in the library and gives the visitor no scan hint, so —
 *   unlike a story asset's optional derivative — this failure is not swallowed.
 */
export async function uploadMarker(images: MarkerImages): Promise<UploadedMarker> {
  const markerId = await uploadContent(images.luminance, 'image/png', 'marker');
  const thumbId = await uploadContent(images.thumbnail, 'image/png', 'marker');
  return { markerId, thumbId };
}
```

- [ ] **Step 9: Run, verify, commit**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all green apart from the 3 known `api/_s3.test.ts` failures.

```bash
git add src/services/contentUpload.ts src/services/contentUpload.test.ts src/services/assetApi.ts src/services/markerApi.ts src/services/markerApi.test.ts
git commit -m "Send marker images to storage through the same verified upload path as story images"
```

---

## Task 4: Crop-box drag maths

**Files:**
- Create: `src/studio/markerCropEdit.ts`
- Create: `src/studio/markerCropEdit.test.ts`

**Interfaces:**
- Consumes: `MarkerCrop`, `ImageSize`, `MARKER_MIN_WIDTH`, `MARKER_MIN_HEIGHT` (Task 1).
- Produces:
  ```ts
  export function moveCrop(crop: MarkerCrop, dx: number, dy: number, size: ImageSize): MarkerCrop;
  export function scaleCrop(crop: MarkerCrop, factor: number, size: ImageSize): MarkerCrop;
  export function canCrop(size: ImageSize): boolean;
  ```

`size` here is always **post-rotation**, matching `validateCrop`. Pure arithmetic, no DOM, so the drag behaviour is testable without synthesising pointer events.

- [ ] **Step 1: Write the failing tests**

Create `src/studio/markerCropEdit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getDefaultCrop, validateCrop, MARKER_MIN_WIDTH, MARKER_MIN_HEIGHT } from '@/markers/markerCrop';
import { canCrop, moveCrop, scaleCrop } from './markerCropEdit';

const size = { width: 1200, height: 1600 };
const base = getDefaultCrop(size, false);

describe('canCrop', () => {
  it('accepts an image at exactly the minimum', () => {
    expect(canCrop({ width: MARKER_MIN_WIDTH, height: MARKER_MIN_HEIGHT })).toBe(true);
  });

  it('rejects an image one pixel too narrow', () => {
    expect(canCrop({ width: MARKER_MIN_WIDTH - 1, height: MARKER_MIN_HEIGHT })).toBe(false);
  });

  it('rejects an image one pixel too short', () => {
    expect(canCrop({ width: MARKER_MIN_WIDTH, height: MARKER_MIN_HEIGHT - 1 })).toBe(false);
  });
});

describe('moveCrop', () => {
  it('moves by the requested delta when there is room', () => {
    const moved = moveCrop(base, 10, -20, size);
    expect(moved.left).toBe(base.left + 10);
    expect(moved.top).toBe(base.top - 20);
  });

  it('never leaves the image, however far it is dragged', () => {
    const moved = moveCrop(base, 99999, 99999, size);
    expect(validateCrop(moved, size)).toEqual([]);
    expect(moved.left + moved.width).toBeLessThanOrEqual(size.width);
    expect(moved.top + moved.height).toBeLessThanOrEqual(size.height);
  });

  it('never goes negative, however far it is dragged the other way', () => {
    const moved = moveCrop(base, -99999, -99999, size);
    expect(moved.left).toBe(0);
    expect(moved.top).toBe(0);
  });

  it('leaves the size and the rotation bookkeeping alone', () => {
    const moved = moveCrop(base, 7, 7, size);
    expect(moved.width).toBe(base.width);
    expect(moved.height).toBe(base.height);
    expect(moved.isRotated).toBe(base.isRotated);
    expect(moved.originalWidth).toBe(base.originalWidth);
  });
});

describe('scaleCrop', () => {
  it('keeps 3:4 exactly, because the tracker image is 480x640', () => {
    const grown = scaleCrop(base, 0.8, size);
    expect(grown.width / grown.height).toBeCloseTo(3 / 4, 5);
  });

  it('refuses to shrink below the CLI minimum', () => {
    const tiny = scaleCrop(base, 0.01, size);
    expect(tiny.width).toBeGreaterThanOrEqual(MARKER_MIN_WIDTH);
    expect(tiny.height).toBeGreaterThanOrEqual(MARKER_MIN_HEIGHT);
    expect(validateCrop(tiny, size)).toEqual([]);
  });

  it('refuses to grow past the image', () => {
    const huge = scaleCrop(base, 99, size);
    expect(validateCrop(huge, size)).toEqual([]);
  });

  it('produces a valid crop at every factor across the range', () => {
    for (let f = 0.05; f <= 4; f += 0.05) {
      expect(validateCrop(scaleCrop(base, f, size), size)).toEqual([]);
    }
  });
});
```

That last test is the one worth having: it sweeps the whole range rather than trusting three sampled points, and `validateCrop` is the CLI's own rule, so it cannot disagree with what the generator will accept.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/studio/markerCropEdit.test.ts`
Expected: FAIL — cannot resolve `./markerCropEdit`.

- [ ] **Step 3: Implement**

Create `src/studio/markerCropEdit.ts`:

```ts
/**
 * markerCropEdit.ts — moving and resizing the marker crop box.
 *
 * Every function returns a crop that `validateCrop` accepts, so the UI can
 * never hand the generator a rectangle the CLI's own rules would refuse. The
 * aspect stays locked at 3:4 because that is the shape of the 480x640 image
 * the tracker matches against — a free-form box would be resampled to 3:4
 * anyway, distorting what the operator saw in the preview.
 *
 * Pure arithmetic, no DOM. Pointer handling lives in MarkersPanel; the rules
 * live here so they are testable without synthesising drags.
 */

import {
  MARKER_MIN_HEIGHT,
  MARKER_MIN_WIDTH,
  type ImageSize,
  type MarkerCrop,
} from '@/markers/markerCrop';

/** Clamps `v` into `[lo, hi]`. `hi` below `lo` yields `lo`. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(Math.max(lo, hi), v));
}

/**
 * True when an image is large enough to cut any legal marker from.
 *
 * @param size — Post-rotation dimensions.
 */
export function canCrop(size: ImageSize): boolean {
  return size.width >= MARKER_MIN_WIDTH && size.height >= MARKER_MIN_HEIGHT;
}

/**
 * Slides the crop box, stopping at the image edges.
 *
 * @param crop — Current crop.
 * @param dx — Pixels right(+) / left(-).
 * @param dy — Pixels down(+) / up(-).
 * @param size — Post-rotation dimensions of the image being cut.
 * @returns The moved crop, always in bounds.
 */
export function moveCrop(crop: MarkerCrop, dx: number, dy: number, size: ImageSize): MarkerCrop {
  return {
    ...crop,
    left: Math.round(clamp(crop.left + dx, 0, size.width - crop.width)),
    top: Math.round(clamp(crop.top + dy, 0, size.height - crop.height)),
  };
}

/**
 * Resizes the crop box about its own centre, keeping 3:4.
 *
 * Height is the driven axis and width follows it, matching the CLI, where both
 * output images are resized by height. Bounds are applied to the height before
 * the width is derived, so the result cannot be a rectangle that fits one axis
 * and overflows the other.
 *
 * @param crop — Current crop.
 * @param factor — Multiplier; below 1 shrinks.
 * @param size — Post-rotation dimensions of the image being cut.
 * @returns The resized crop, never below the CLI minimum and never larger than
 *   the image.
 */
export function scaleCrop(crop: MarkerCrop, factor: number, size: ImageSize): MarkerCrop {
  const maxHeight = Math.min(size.height, Math.floor((size.width * 4) / 3));
  const height = Math.round(clamp(crop.height * factor, MARKER_MIN_HEIGHT, maxHeight));
  const width = Math.round((height * 3) / 4);

  const cx = crop.left + crop.width / 2;
  const cy = crop.top + crop.height / 2;

  return {
    ...crop,
    width,
    height,
    left: Math.round(clamp(cx - width / 2, 0, size.width - width)),
    top: Math.round(clamp(cy - height / 2, 0, size.height - height)),
  };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/studio/markerCropEdit.test.ts`
Expected: PASS, 11 tests.

**Fixture correction.** The `moveCrop` "when there is room" test must NOT use `getDefaultCrop`'s output as its subject. `getDefaultCrop` maximises at least one axis to match the source exactly — that is its whole job — so the default crop has zero slack on that axis by construction, and on an exact 3:4 source it has zero slack on both. `moveCrop` then clamps to no movement at all, correctly. Use an explicit interior crop with real slack instead, e.g. `{ ...base, top: 400, left: 300, width: 480, height: 640 }` against a 1200 × 1600 source.

- [ ] **Step 5: Verify and commit**

Run: `npm run type-check && npm run lint && npm run test`

```bash
git add src/studio/markerCropEdit.ts src/studio/markerCropEdit.test.ts
git commit -m "Keep the marker crop box inside the picture and locked to the printed shape"
```

---

## Task 5: The per-device marker library

**Files:**
- Create: `src/studio/markerLibrary.ts`
- Create: `src/studio/markerLibrary.test.ts`

**Interfaces:**
- Consumes: `MarkerCrop` (Task 1), `ASSET_ID_RE` from `src/story/assetHash.ts`.
- Produces:
  ```ts
  export const MARKER_LIBRARY_KEY = 'arcade.studio.markers';
  export interface MarkerLibraryEntry {
    markerId: string; thumbId: string; name: string; crop: MarkerCrop; addedAt: number;
  }
  export function readMarkerLibrary(): MarkerLibraryEntry[];
  export function writeMarkerLibrary(entries: MarkerLibraryEntry[]): string | null;
  export function addToLibrary(entries: MarkerLibraryEntry[], entry: MarkerLibraryEntry): MarkerLibraryEntry[];
  ```

Its own localStorage key, **not** part of `StoryDoc`. Spec §11 is explicit: a marker's durable metadata lives in `StoryAnchor` once bound, and an unbound marker is a per-device draft. Putting the library inside the draft document would publish it, which is the mutable-index-that-disagrees-with-the-stories problem the spec declines.

- [ ] **Step 1: Write the failing tests**

Create `src/studio/markerLibrary.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getDefaultCrop } from '@/markers/markerCrop';
import {
  MARKER_LIBRARY_KEY,
  addToLibrary,
  readMarkerLibrary,
  writeMarkerLibrary,
  type MarkerLibraryEntry,
} from './markerLibrary';

const crop = getDefaultCrop({ width: 1200, height: 1600 }, false);

function entry(id: string, name = 'Poster'): MarkerLibraryEntry {
  return { markerId: id.repeat(64), thumbId: 'b'.repeat(64), name, crop, addedAt: 1 };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('readMarkerLibrary', () => {
  it('is empty when nothing was ever saved', () => {
    expect(readMarkerLibrary()).toEqual([]);
  });

  it('round-trips what was written', () => {
    writeMarkerLibrary([entry('a')]);
    expect(readMarkerLibrary()).toEqual([entry('a')]);
  });

  it('returns empty rather than throwing on corrupt storage', () => {
    window.localStorage.setItem(MARKER_LIBRARY_KEY, '{not json');
    expect(readMarkerLibrary()).toEqual([]);
  });

  it('drops an entry whose id could name a path, not just a hash', () => {
    window.localStorage.setItem(
      MARKER_LIBRARY_KEY,
      JSON.stringify([{ ...entry('a'), markerId: '../../etc/passwd' }]),
    );
    expect(readMarkerLibrary()).toEqual([]);
  });

  it('drops an entry with no crop, because the target could not be synthesized', () => {
    const { crop: _drop, ...noCrop } = entry('a');
    window.localStorage.setItem(MARKER_LIBRARY_KEY, JSON.stringify([noCrop]));
    expect(readMarkerLibrary()).toEqual([]);
  });
});

describe('addToLibrary', () => {
  it('appends a new marker', () => {
    expect(addToLibrary([], entry('a'))).toHaveLength(1);
  });

  it('replaces rather than duplicates when the same picture is added twice', () => {
    const first = addToLibrary([], entry('a', 'Old name'));
    const second = addToLibrary(first, entry('a', 'New name'));
    expect(second).toHaveLength(1);
    expect(second[0].name).toBe('New name');
  });
});
```

The dedup test matters because content addressing makes re-uploading the same crop of the same photo produce the same `markerId` — spec §11 relies on exactly that for recovery, so the library must treat it as one marker rather than growing a duplicate every time.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/studio/markerLibrary.test.ts`
Expected: FAIL — cannot resolve `./markerLibrary`.

- [ ] **Step 3: Implement**

Create `src/studio/markerLibrary.ts`:

```ts
/**
 * markerLibrary.ts — the operator's uploaded markers, on this device.
 *
 * Deliberately NOT part of StoryDoc. A marker's durable metadata — its crop
 * and its thumbnail id — lives in `StoryAnchor` once the marker is bound to a
 * story, so the library is only a staging area for markers not yet bound. A
 * published `markers/index.json` would make it portable and is declined in
 * `docs/marker-layer-design.md` §11, because it reintroduces a mutable
 * document that can disagree with the stories.
 *
 * The bytes are always safe in S3 regardless: re-uploading the same crop of
 * the same photo is deterministic under content addressing, so a lost library
 * costs the operator a re-crop, never a marker.
 *
 * Read is defensive because localStorage is user-writable and every id here
 * becomes a path segment.
 */

import { ASSET_ID_RE } from '@/story/assetHash';
import type { MarkerCrop } from '@/markers/markerCrop';

/** localStorage key. Separate from the draft, which is published. */
export const MARKER_LIBRARY_KEY = 'arcade.studio.markers';

/** One uploaded marker, as the Studio remembers it. */
export interface MarkerLibraryEntry {
  /** SHA-256 of the luminance PNG. */
  markerId: string;
  /** SHA-256 of the thumbnail PNG. */
  thumbId: string;
  /** The operator's own label. Studio-side only — never reaches the engine. */
  name: string;
  /** The crop this marker was cut with; feeds the synthesized target. */
  crop: MarkerCrop;
  /** Epoch millis, for stable ordering. */
  addedAt: number;
}

/** True when `v` is a usable library entry. */
function isEntry(v: unknown): v is MarkerLibraryEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  // Both ids become path segments, so they must be hashes and nothing else.
  if (typeof e.markerId !== 'string' || !ASSET_ID_RE.test(e.markerId)) return false;
  if (typeof e.thumbId !== 'string' || !ASSET_ID_RE.test(e.thumbId)) return false;
  // Without a crop the synthesized target would be malformed, so an entry
  // missing one is unusable rather than merely incomplete.
  if (typeof e.crop !== 'object' || e.crop === null) return false;
  const c = e.crop as Record<string, unknown>;
  return ['top', 'left', 'width', 'height'].every((k) => typeof c[k] === 'number');
}

/**
 * Reads the library.
 *
 * @returns Every well-formed entry. Corrupt storage yields an empty library
 *   rather than throwing, and one bad entry is dropped on its own.
 */
export function readMarkerLibrary(): MarkerLibraryEntry[] {
  try {
    const raw = window.localStorage.getItem(MARKER_LIBRARY_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/**
 * Writes the library.
 *
 * @param entries — The full library.
 * @returns An error message when the write failed (a full quota, private
 *   browsing), or null on success.
 */
export function writeMarkerLibrary(entries: MarkerLibraryEntry[]): string | null {
  try {
    window.localStorage.setItem(MARKER_LIBRARY_KEY, JSON.stringify(entries));
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'could not save the marker library';
  }
}

/**
 * Adds one marker, replacing any entry with the same id.
 *
 * Replacement rather than append, because content addressing makes the same
 * crop of the same photo produce the same markerId every time — which is what
 * makes a lost library recoverable, and what would otherwise fill the library
 * with identical rows.
 *
 * @param entries — The current library.
 * @param entry — The marker to record.
 * @returns A new array; the input is not mutated.
 */
export function addToLibrary(
  entries: MarkerLibraryEntry[],
  entry: MarkerLibraryEntry,
): MarkerLibraryEntry[] {
  return [...entries.filter((e) => e.markerId !== entry.markerId), entry];
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/studio/markerLibrary.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Verify and commit**

```bash
git add src/studio/markerLibrary.ts src/studio/markerLibrary.test.ts
git commit -m "Remember which marker pictures an author has already uploaded"
```

---

## Task 6: The Markers panel

**Files:**
- Create: `src/studio/MarkersPanel.tsx`
- Modify: `src/studio/StudioApp.tsx` (add the panel behind a top-bar button)
- Modify: `src/studio/studio.css`

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 4, 5.
- Produces: a mounted panel. No new exported logic — all of it already exists and is tested.

**No unit tests for this file.** It is canvas rasterization and pointer handling: happy-dom has no rasterizer, so a test here would assert against a stub. Verified on device per `TESTING.md`. Every rule it enforces is already covered by Tasks 4 and 5.

- [ ] **Step 1: Build the panel**

Create `src/studio/MarkersPanel.tsx`. It must do exactly these things, in this order:

1. Accept a dropped/selected image file; decode it with `createImageBitmap(file)`.
2. Derive `isRotated = bitmap.width > bitmap.height`, then `postSize = isRotated ? {width: bitmap.height, height: bitmap.width} : {width: bitmap.width, height: bitmap.height}`. **Every later call takes `postSize`, never the bitmap's own dimensions** — this is the single most likely bug in the task.
3. Refuse with a plain message when `!canCrop(postSize)`, quoting the 480 × 640 minimum.
4. Seed `crop = getDefaultCrop({width: bitmap.width, height: bitmap.height}, isRotated)`. Note this one call takes the **pre**-rotation size and does the swap internally.
5. Let the operator drag (`moveCrop`) and zoom (`scaleCrop`) the box over a preview of the image.
6. Show the **grayscale preview** — call `renderMarkerImages(bitmap, crop)` on a debounce and paint `MarkerImages.luminance` via `URL.createObjectURL`. Revoke the previous URL on every regeneration and on unmount.
7. State the marker rules plainly beside the preview: **detailed, busy, non-repeating, matte when printed.** Spec §7.1 — this is the only moment the operator sees what the tracker sees, and a picture rich in colour can be flat in grayscale.
8. On upload: `renderMarkerImages` → `uploadMarker` → `addToLibrary` + `writeMarkerLibrary`. Show the error on failure; never leave a spinner running.
9. List the library by thumbnail, each row offering **Bind to this story** (Task 8) and a print-ready download of the cropped image at its known pixel dimensions.

Two implementation notes that will otherwise cost an hour:

- The preview `<img>` and the crop box must share one coordinate space. Use the existing `toViewBox` helper from `./stageGeometry` against an SVG whose viewBox is `0 0 postSize.width postSize.height`, exactly as `StageEditor.tsx` does — do not invent a second mapping.
- `renderMarkerImages` is async and the operator drags continuously. Debounce it (~150 ms) and drop stale results by comparing a monotonically increasing request id, or the preview will flicker between crops.

- [ ] **Step 2: Mount it**

In `StudioApp.tsx`, add a `markersOpen` state beside the existing `stageOpen` / `publishOpen`, a top-bar button in `.st-actions` (`◫ MARKERS`, `title="Upload a picture visitors will scan"`), and render `{markersOpen && <MarkersPanel onClose={() => setMarkersOpen(false)} />}` beside the other overlays.

- [ ] **Step 3: Verify**

Run: `npm run type-check && npm run lint && npm run test`
Expected: green. No new tests — say so explicitly in your report.

- [ ] **Step 4: Verify on device**

`npm run dev`, open `/studio`, drop a photo, confirm: the grayscale preview matches the crop box, a landscape photo rotates to portrait, an image below 480 × 640 is refused with a readable message, and upload survives a page reload.

- [ ] **Step 5: Commit**

```bash
git add src/studio/MarkersPanel.tsx src/studio/StudioApp.tsx src/studio/studio.css
git commit -m "Let an author upload the picture visitors will point their phone at"
```

---

## Task 7: `StoryAnchor` on the story document

**Files:**
- Modify: `src/story/storyDoc.ts`
- Modify: `src/story/storyDoc.test.ts`

**Interfaces:**
- Consumes: `MarkerCrop` (Task 1), `ASSET_ID_RE`.
- Produces:
  ```ts
  export interface LocalTransform { position: [number, number, number]; rotation: [number, number, number, number] }
  export const IDENTITY_LOCAL: LocalTransform;
  export interface StoryAnchor {
    type: 'marker'; markerId: string; thumbId: string; crop: MarkerCrop;
    local: LocalTransform; widthInMarkers: 1; mode: 'follow';
  }
  // StoryDoc gains: anchor?: StoryAnchor
  ```

**`schemaVersion` stays 4.** `anchor` is optional and absent means today's behaviour exactly, so nothing breaks — a bump would force every existing published story through a migration for no gain.

- [ ] **Step 1: Write the failing tests**

Append to `src/story/storyDoc.test.ts`:

```ts
describe('anchor', () => {
  const crop = {
    top: 0, left: 100, width: 1200, height: 1600,
    isRotated: false, originalWidth: 1400, originalHeight: 1600,
  };
  const anchor = {
    type: 'marker', markerId: 'a'.repeat(64), thumbId: 'b'.repeat(64),
    crop, local: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    widthInMarkers: 1, mode: 'follow',
  };

  it('keeps a well-formed anchor', () => {
    const doc = validateStoryDoc({ ...DEFAULT_STORY, anchor }, DEFAULT_STORY);
    expect(doc.anchor?.markerId).toBe('a'.repeat(64));
  });

  it('leaves a story with no anchor alone, so today is unchanged', () => {
    expect(validateStoryDoc({ ...DEFAULT_STORY }, DEFAULT_STORY).anchor).toBeUndefined();
  });

  it('drops an anchor whose markerId could name a host', () => {
    const bad = { ...anchor, markerId: 'https://evil.example/x.png' };
    expect(validateStoryDoc({ ...DEFAULT_STORY, anchor: bad }, DEFAULT_STORY).anchor).toBeUndefined();
  });

  it('drops an anchor whose markerId could traverse', () => {
    const bad = { ...anchor, markerId: '../../../etc/passwd' };
    expect(validateStoryDoc({ ...DEFAULT_STORY, anchor: bad }, DEFAULT_STORY).anchor).toBeUndefined();
  });

  it('drops an anchor with a bad thumbId, because it is a path segment too', () => {
    const bad = { ...anchor, thumbId: 'nope' };
    expect(validateStoryDoc({ ...DEFAULT_STORY, anchor: bad }, DEFAULT_STORY).anchor).toBeUndefined();
  });

  it('drops an anchor with no crop, because the target could not be synthesized', () => {
    const { crop: _drop, ...bad } = anchor;
    expect(validateStoryDoc({ ...DEFAULT_STORY, anchor: bad }, DEFAULT_STORY).anchor).toBeUndefined();
  });

  it('normalises an unknown mode to follow rather than dropping the anchor', () => {
    const doc = validateStoryDoc({ ...DEFAULT_STORY, anchor: { ...anchor, mode: 'latch' } }, DEFAULT_STORY);
    expect(doc.anchor?.mode).toBe('follow');
  });

  it('forces identity local and widthInMarkers 1, which is all v1 renders', () => {
    const doc = validateStoryDoc(
      { ...DEFAULT_STORY, anchor: { ...anchor, widthInMarkers: 7, local: { position: [9, 9, 9], rotation: [1, 0, 0, 0] } } },
      DEFAULT_STORY,
    );
    expect(doc.anchor?.widthInMarkers).toBe(1);
    expect(doc.anchor?.local).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0, 1] });
  });

  it('drops a non-marker anchor type', () => {
    const bad = { ...anchor, type: 'plane' };
    expect(validateStoryDoc({ ...DEFAULT_STORY, anchor: bad }, DEFAULT_STORY).anchor).toBeUndefined();
  });
});
```

The last-but-one test encodes a real decision: `mode: 'latch'` is a value the **type** permits but the renderer does not implement, so a document naming it must render as `follow` rather than silently render nothing. `latch` becomes real by changing this line, which is exactly the "renderer change, not a schema change" §5.2 asks for.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/story/storyDoc.test.ts`
Expected: FAIL — `anchor` is not a property of `StoryDoc`.

- [ ] **Step 3: Add the types**

In `src/story/storyDoc.ts`, above `StoryDoc`:

```ts
/** A rigid transform in the marker's own space. */
export interface LocalTransform {
  /** Metres along the marker's local axes, from its centre. */
  position: [number, number, number];
  /** Rotation as a quaternion, `[x, y, z, w]`. */
  rotation: [number, number, number, number];
}

/**
 * The only transform v1 renders.
 *
 * Offset placement is deliberately unbuilt (`docs/marker-layer-design.md`
 * §11): it needs a Studio positioning UI and the marker-normal-axis
 * verification this design currently avoids needing, because pinning the art
 * flush onto the picture makes the question moot.
 */
export const IDENTITY_LOCAL: LocalTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
};

/**
 * What real-world thing a story is attached to.
 *
 * Absent means today's behaviour: a centre-screen ground hit-test and
 * tap-to-place. The five-era landscape story has no anchor and is untouched.
 *
 * `local` and `widthInMarkers` are fixed in v1 but kept in the type, because
 * removing them would make offset placement a schema migration instead of a UI
 * addition.
 */
export interface StoryAnchor {
  type: 'marker';
  /** SHA-256 of the luminance PNG — the image the tracker matches. */
  markerId: string;
  /** SHA-256 of the thumbnail PNG, addressed on its own bytes. */
  thumbId: string;
  /** The crop the marker was cut with; feeds the synthesized target. */
  crop: MarkerCrop;
  /** Identity in v1. */
  local: LocalTransform;
  /** 1 in v1: the art covers the marker exactly. */
  widthInMarkers: 1;
  /** 'follow' in v1; 'latch' is permitted by the type and unbuilt. */
  mode: 'follow';
}
```

Add to `StoryDoc`:

```ts
  /** The printed picture this story lives on. Absent ⇒ tap-to-place. */
  anchor?: StoryAnchor;
```

- [ ] **Step 4: Add the sanitizer**

Beside `sanitizeAssets`:

```ts
/**
 * Sanitizes an anchor. Returns undefined when it is unusable.
 *
 * All-or-nothing, unlike the per-field fallback elsewhere, because a partial
 * anchor is worse than none: a story with a malformed marker binding would
 * configure a target that never matches, leaving a picture that silently does
 * nothing. Falling back to "no anchor" degrades to tap-to-place, which at
 * least puts something on screen.
 *
 * Both ids are checked against ASSET_ID_RE because both become path segments,
 * and a published document is untrusted input — 64 hex characters cannot
 * express a scheme, a host, or a traversal.
 */
function sanitizeAnchor(raw: unknown): StoryAnchor | undefined {
  const r = bag(raw);
  if (r.type !== 'marker') return undefined;

  const markerId = str(r.markerId, '');
  const thumbId = str(r.thumbId, '');
  if (!ASSET_ID_RE.test(markerId) || !ASSET_ID_RE.test(thumbId)) return undefined;

  const c = bag(r.crop);
  const nums = ['top', 'left', 'width', 'height'] as const;
  if (!nums.every((k) => typeof c[k] === 'number' && Number.isFinite(c[k]))) return undefined;

  const crop: MarkerCrop = {
    top: c.top as number,
    left: c.left as number,
    width: c.width as number,
    height: c.height as number,
    isRotated: c.isRotated === true,
    originalWidth: num(c.originalWidth, c.width as number),
    originalHeight: num(c.originalHeight, c.height as number),
  };

  return {
    type: 'marker',
    markerId,
    thumbId,
    crop,
    // Forced, not read. v1 renders identity at 1:1 only, so honouring a stored
    // offset would place art where nothing can put it back.
    local: IDENTITY_LOCAL,
    widthInMarkers: 1,
    mode: 'follow',
  };
}
```

Add the import at the top of the file:

```ts
import type { MarkerCrop } from '@/markers/markerCrop';
```

And wire it into `validateStoryDoc`, after the `assets` line:

```ts
  const anchor = sanitizeAnchor(r.anchor);
```

and before `return doc`:

```ts
  if (anchor !== undefined) doc.anchor = anchor;
```

- [ ] **Step 5: Run and watch it pass**

Run: `npx vitest run src/story/storyDoc.test.ts`
Expected: PASS, including all 9 new tests.

- [ ] **Step 6: Verify and commit**

Run: `npm run type-check && npm run lint && npm run test`

```bash
git add src/story/storyDoc.ts src/story/storyDoc.test.ts
git commit -m "Record which printed picture a story belongs to"
```

---

## Task 8: Binding a marker to the story

**Files:**
- Modify: `src/studio/studioDraftStore.ts`
- Modify: `src/studio/studioDraftStore.test.ts`
- Modify: `src/studio/MarkersPanel.tsx` (wire the Bind / Unbind buttons)

**Interfaces:**
- Consumes: `MarkerLibraryEntry` (Task 5), `StoryAnchor` / `IDENTITY_LOCAL` (Task 7).
- Produces: two store actions —
  ```ts
  bindMarker(entry: MarkerLibraryEntry): void;
  unbindMarker(): void;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/studio/studioDraftStore.test.ts`:

```ts
describe('marker binding', () => {
  const crop = {
    top: 0, left: 0, width: 1200, height: 1600,
    isRotated: false, originalWidth: 1200, originalHeight: 1600,
  };
  const entry = {
    markerId: 'a'.repeat(64), thumbId: 'b'.repeat(64),
    name: 'Lobby poster', crop, addedAt: 1,
  };

  it('writes an anchor the validator accepts', () => {
    useStudioDraft.getState().bindMarker(entry);
    const { doc } = useStudioDraft.getState();
    expect(doc.anchor?.markerId).toBe(entry.markerId);
    expect(validateStoryDoc(doc, DEFAULT_STORY).anchor?.markerId).toBe(entry.markerId);
  });

  it('pins the art onto the marker at 1:1, which is all v1 renders', () => {
    useStudioDraft.getState().bindMarker(entry);
    const { anchor } = useStudioDraft.getState().doc;
    expect(anchor?.widthInMarkers).toBe(1);
    expect(anchor?.mode).toBe('follow');
    expect(anchor?.local).toEqual(IDENTITY_LOCAL);
  });

  it('rebinding replaces rather than accumulating', () => {
    useStudioDraft.getState().bindMarker(entry);
    useStudioDraft.getState().bindMarker({ ...entry, markerId: 'c'.repeat(64) });
    expect(useStudioDraft.getState().doc.anchor?.markerId).toBe('c'.repeat(64));
  });

  it('unbinding restores a story with no anchor at all', () => {
    useStudioDraft.getState().bindMarker(entry);
    useStudioDraft.getState().unbindMarker();
    expect(useStudioDraft.getState().doc.anchor).toBeUndefined();
    expect('anchor' in useStudioDraft.getState().doc).toBe(false);
  });

  it('binding is undoable like every other edit', () => {
    useStudioDraft.getState().bindMarker(entry);
    useStudioDraft.getState().undo();
    expect(useStudioDraft.getState().doc.anchor).toBeUndefined();
  });
});
```

The fourth test checks `'anchor' in doc` and not just `=== undefined`, because `{...doc, anchor: undefined}` serialises to `"anchor": undefined` being dropped by `JSON.stringify` but leaves the key present in memory — and the difference shows up as a phantom anchor in a `Object.keys` check somewhere later.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/studio/studioDraftStore.test.ts`
Expected: FAIL — `bindMarker` is not a function.

- [ ] **Step 3: Implement**

Add to the `StudioState` interface:

```ts
  /** Binds a library marker to this story, replacing any current binding. */
  bindMarker: (entry: MarkerLibraryEntry) => void;
  /** Removes the binding, restoring tap-to-place. */
  unbindMarker: () => void;
```

And to the store body, beside `addAsset`:

```ts
    bindMarker: (entry) => {
      const { doc } = get();
      commit({
        ...doc,
        anchor: {
          type: 'marker',
          markerId: entry.markerId,
          thumbId: entry.thumbId,
          crop: entry.crop,
          local: IDENTITY_LOCAL,
          widthInMarkers: 1,
          mode: 'follow',
        },
      });
    },

    unbindMarker: () => {
      // Destructured out rather than set to undefined: an `anchor: undefined`
      // key survives in memory and reads as present to `'anchor' in doc`, which
      // is how a phantom binding gets published.
      const { anchor: _drop, ...rest } = get().doc;
      commit(rest);
    },
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/studio/studioDraftStore.test.ts`
Expected: PASS, 5 new tests.

- [ ] **Step 5: Wire the UI**

In `MarkersPanel.tsx`, each library row gets a **Bind** button calling `bindMarker(entry)`, and the currently bound marker's row shows **Bound** plus an **Unbind** button. Read the current binding with `useStudioDraft((s) => s.doc.anchor?.markerId)`.

- [ ] **Step 6: Verify and commit**

```bash
git add src/studio/studioDraftStore.ts src/studio/studioDraftStore.test.ts src/studio/MarkersPanel.tsx
git commit -m "Let an author attach a story to one of their uploaded pictures"
```

---

## Task 9: The 3:4 stage and the ghost backdrop

**Files:**
- Modify: `src/studio/stageGeometry.ts`
- Modify: `src/studio/stageGeometry.test.ts`
- Modify: `src/studio/StageEditor.tsx`
- Modify: `src/studio/studio.css`

**Interfaces:**
- Consumes: `doc.anchor` (Task 7).
- Produces:
  ```ts
  export interface StageFrame { w: number; h: number; ppm: number; groundY: number }
  export const FRONT: StageFrame;          // unchanged values: 520 x 300, ppm 46, groundY 238
  export const MARKER_FRONT: StageFrame;   // 300 x 400, ppm 46, groundY 317
  export function frontProject(x: number, z: number, e?: number, frame?: StageFrame): Point;
  export function frontUnprojectX(viewX: number, z: number, frame?: StageFrame): number;
  ```

`MARKER_FRONT` is exactly 3:4 and keeps `ppm` identical to `FRONT`, so a prop's physical size does not change when a story is bound. `groundY` sits at the same 79.3% of frame height as `FRONT`'s (238/300), which is 317 of 400.

- [ ] **Step 1: Write the failing tests**

Append to `src/studio/stageGeometry.test.ts`:

```ts
describe('marker stage', () => {
  it('is exactly 3:4, matching the printed picture', () => {
    expect(MARKER_FRONT.w / MARKER_FRONT.h).toBeCloseTo(3 / 4, 6);
  });

  it('keeps the same pixels-per-metre, so props do not resize when a story is bound', () => {
    expect(MARKER_FRONT.ppm).toBe(FRONT.ppm);
  });

  it('puts the ground line at the same proportion of the frame', () => {
    expect(MARKER_FRONT.groundY / MARKER_FRONT.h).toBeCloseTo(FRONT.groundY / FRONT.h, 3);
  });

  it('projects into the marker frame when one is given', () => {
    expect(frontProject(0, 0, 0, MARKER_FRONT).x).toBe(MARKER_FRONT.w / 2);
  });

  it('still projects into the landscape frame by default', () => {
    expect(frontProject(0, 0, 0).x).toBe(FRONT.w / 2);
  });

  it('round-trips a drag in the marker frame', () => {
    const x = 1.4;
    const p = frontProject(x, 2, 0, MARKER_FRONT);
    expect(frontUnprojectX(p.x, 2, MARKER_FRONT)).toBeCloseTo(x, 6);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/studio/stageGeometry.test.ts`
Expected: FAIL — `MARKER_FRONT` is not exported.

- [ ] **Step 3: Parameterise the frame**

In `stageGeometry.ts`, replace the `FRONT` declaration:

```ts
/** A camera-view frame, in SVG user units. */
export interface StageFrame {
  w: number;
  h: number;
  /** Pixels per metre. Shared across frames so props keep their real size. */
  ppm: number;
  /** Where the ground line sits, in view units from the top. */
  groundY: number;
}

/** The default landscape stage, matching the era art's proportions. */
export const FRONT: StageFrame = { w: 520, h: 300, ppm: 46, groundY: 238 };

/**
 * The stage a marker-bound story composes on.
 *
 * Exactly 3:4, because that is the shape of the printed picture the art will
 * cover, so the author is literally designing on top of what they printed
 * rather than discovering the misfit on a phone. `ppm` matches FRONT so
 * binding a story never resizes its props, and the ground line sits at the
 * same proportion of the frame.
 */
export const MARKER_FRONT: StageFrame = { w: 300, h: 400, ppm: 46, groundY: 317 };
```

Replace the module-level `depthRise` constant with a function, since it depends on the frame:

```ts
/** How much a prop rises up the camera view per metre of depth. */
function depthRise(frame: StageFrame): number {
  return frame.ppm * 0.3;
}
```

Add the optional `frame` parameter to both projections:

```ts
export function frontProject(x: number, z: number, e = 0, frame: StageFrame = FRONT): Point {
  const s = depthScale(z);
  return {
    x: frame.w / 2 + x * frame.ppm * s,
    y: frame.groundY - z * depthRise(frame) * s - e * frame.ppm * s,
  };
}

export function frontUnprojectX(viewX: number, z: number, frame: StageFrame = FRONT): number {
  const s = depthScale(z);
  return (viewX - frame.w / 2) / (frame.ppm * s);
}
```

Both default to `FRONT`, so every existing call site keeps working untouched.

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/studio/stageGeometry.test.ts`
Expected: PASS — the 6 new tests **and** every pre-existing one, unchanged.

- [ ] **Step 5: Use the frame in the editor**

In `StageEditor.tsx`, derive the frame once:

```ts
const anchor = useStudioDraft((s) => s.doc.anchor);
const frame = anchor ? MARKER_FRONT : FRONT;
```

Replace every `FRONT.w` / `FRONT.h` / `FRONT.groundY` / `FRONT.ppm` with `frame.*` (lines around :132-137, :298-303), and pass `frame` as the fourth argument to `frontProject` and the third to `frontUnprojectX`. The `toViewBox` calls at :216-221 take `frame.w` / `frame.h`.

- [ ] **Step 6: Paint the ghost**

When `anchor` is set, render the marker thumbnail behind the composed art inside the front SVG, before the existing `<image>`:

```tsx
{anchor && (
  <image
    href={`${ASSET_BASE_URL}/markers/${anchor.thumbId}.png`}
    x="0" y="0" width={frame.w} height={frame.h}
    opacity={0.28} preserveAspectRatio="xMidYMid slice"
  />
)}
```

Read `ASSET_BASE_URL` from `@/utils/constants` the same way the resolver does. This is authoring-only chrome — it must never reach the published document or the viewer.

- [ ] **Step 7: Verify on device and commit**

Run: `npm run type-check && npm run lint && npm run test`, then `npm run dev` and confirm the stage turns portrait when a marker is bound and back to landscape when unbound.

```bash
git add src/studio/stageGeometry.ts src/studio/stageGeometry.test.ts src/studio/StageEditor.tsx src/studio/studio.css
git commit -m "Compose marker stories on the shape of the picture they will cover"
```

---

## Task 10: `ExhibitDoc` and its validator

**Files:**
- Create: `src/exhibit/exhibitDoc.ts`
- Create: `src/exhibit/exhibitDoc.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const EXHIBIT_SCHEMA_VERSION = 1;
  export const MAX_EXHIBIT_STORIES = 10;
  export interface ExhibitDoc { schemaVersion: 1; id: string; title: string; storyIds: string[] }
  export function validateExhibitDoc(raw: unknown): ExhibitDoc | null;
  export function exhibitIssues(doc: ExhibitDoc): string[];
  ```

Two functions, not one, because they answer different questions at different times. `validateExhibitDoc` is the **runtime** read of untrusted JSON — it returns a usable document or null. `exhibitIssues` is the **publish-time** refusal list, where the operator is present and can fix things (spec §8's asymmetry: refuse loudly at publish, degrade quietly at runtime).

The story-level refusals from §8 (no anchor, duplicate markerId, missing marker object) need the story documents, which the exhibit does not contain — those live in Task 11, where the server can fetch them.

- [ ] **Step 1: Write the failing tests**

Create `src/exhibit/exhibitDoc.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MAX_EXHIBIT_STORIES,
  exhibitIssues,
  validateExhibitDoc,
  type ExhibitDoc,
} from './exhibitDoc';

const good = { schemaVersion: 1, id: 'lobby', title: 'The Lobby', storyIds: ['a-story', 'b-story'] };

describe('validateExhibitDoc', () => {
  it('accepts a well-formed exhibit', () => {
    expect(validateExhibitDoc(good)?.storyIds).toEqual(['a-story', 'b-story']);
  });

  it('rejects a non-object', () => {
    expect(validateExhibitDoc('nope')).toBeNull();
    expect(validateExhibitDoc(null)).toBeNull();
  });

  it('rejects an exhibit with no usable stories', () => {
    expect(validateExhibitDoc({ ...good, storyIds: [] })).toBeNull();
  });

  it('drops a story id that could traverse, keeping the rest', () => {
    const doc = validateExhibitDoc({ ...good, storyIds: ['a-story', '../../secret'] });
    expect(doc?.storyIds).toEqual(['a-story']);
  });

  it('drops a story id that could name a host', () => {
    const doc = validateExhibitDoc({ ...good, storyIds: ['a-story', 'https://evil.example/x'] });
    expect(doc?.storyIds).toEqual(['a-story']);
  });

  it('de-duplicates repeated story ids', () => {
    const doc = validateExhibitDoc({ ...good, storyIds: ['a-story', 'a-story'] });
    expect(doc?.storyIds).toEqual(['a-story']);
  });

  it('falls back to a usable title rather than rejecting', () => {
    expect(validateExhibitDoc({ ...good, title: '' })?.title).toBe('Untitled exhibit');
  });

  it('truncates past the engine cap rather than failing the whole exhibit at runtime', () => {
    const many = Array.from({ length: 14 }, (_, i) => `story-${i}`);
    expect(validateExhibitDoc({ ...good, storyIds: many })?.storyIds).toHaveLength(MAX_EXHIBIT_STORIES);
  });
});

describe('exhibitIssues', () => {
  it('passes a good exhibit', () => {
    expect(exhibitIssues(good as ExhibitDoc)).toEqual([]);
  });

  it('refuses an empty exhibit', () => {
    expect(exhibitIssues({ ...good, storyIds: [] } as ExhibitDoc)).toContain(
      'An exhibit needs at least one story.',
    );
  });

  it('refuses more than the engine can track at once, and says why', () => {
    const many = Array.from({ length: 11 }, (_, i) => `story-${i}`);
    const issues = exhibitIssues({ ...good, storyIds: many } as ExhibitDoc);
    expect(issues.join(' ')).toContain('10');
  });

  it('refuses a duplicate story, because one picture cannot mean two things', () => {
    expect(exhibitIssues({ ...good, storyIds: ['a', 'a'] } as ExhibitDoc).join(' ')).toContain('twice');
  });
});
```

Note the deliberate difference between the two: `validateExhibitDoc` **truncates** an over-long list (a visitor gets 10 working pictures rather than nothing), while `exhibitIssues` **refuses** it (the operator is present and must be told). That is spec §8's asymmetry made concrete, and it is why the same rule appears in both functions with different consequences.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/exhibit/exhibitDoc.test.ts`
Expected: FAIL — cannot resolve `./exhibitDoc`.

- [ ] **Step 3: Implement**

Create `src/exhibit/exhibitDoc.ts`:

```ts
/**
 * exhibitDoc.ts — a room of printed pictures.
 *
 * An exhibit is a list of stories and nothing else. It deliberately does NOT
 * name markers: `StoryDoc.anchor.markerId` already records which picture a
 * story belongs to, and storing the pair here too would be two copies of one
 * fact — which drift, leaving a rebound story whose exhibit still names the old
 * marker, a picture that silently does nothing. The marker→story map is derived
 * at load time instead and cannot go stale. See
 * `docs/marker-layer-design.md` §3.2.
 */

/** Current schema version. */
export const EXHIBIT_SCHEMA_VERSION = 1;

/**
 * How many stories one exhibit may hold.
 *
 * The 8th Wall engine tracks roughly ten image targets simultaneously. Larger
 * rooms split into several exhibits; loading marker sets by proximity is not
 * built (`docs/marker-layer-design.md` §11).
 */
export const MAX_EXHIBIT_STORIES = 10;

/** A published exhibit. */
export interface ExhibitDoc {
  schemaVersion: 1;
  /** The `?e=` value. */
  id: string;
  title: string;
  /** Member stories, in the operator's order. */
  storyIds: string[];
}

/**
 * Accepted id shape. Matches the story publish endpoint's, because these ids
 * become path segments and are read from untrusted published JSON.
 */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Reads an untrusted exhibit document.
 *
 * Degrades rather than refuses, per `arcade-architecture.md` §9.2: a bad story
 * id is dropped on its own and an over-long list is truncated, so a visitor
 * gets the pictures that do work instead of a blank room. Only an exhibit with
 * no usable story at all returns null, because there is then nothing to show.
 *
 * @param raw — Parsed JSON of unknown shape.
 * @returns A well-formed exhibit, or null. Never throws.
 */
export function validateExhibitDoc(raw: unknown): ExhibitDoc | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === 'string' ? r.id.trim().toLowerCase() : '';
  if (!ID_PATTERN.test(id)) return null;

  const ids = Array.isArray(r.storyIds) ? r.storyIds : [];
  const storyIds = [
    ...new Set(
      ids
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim().toLowerCase())
        .filter((v) => ID_PATTERN.test(v)),
    ),
  ].slice(0, MAX_EXHIBIT_STORIES);

  if (storyIds.length === 0) return null;

  const title = typeof r.title === 'string' && r.title.trim() !== '' ? r.title : 'Untitled exhibit';

  return { schemaVersion: EXHIBIT_SCHEMA_VERSION, id, title, storyIds };
}

/**
 * Lists why an exhibit cannot be published.
 *
 * The mirror image of `validateExhibitDoc`: where that one quietly drops what
 * it cannot use because the visitor cannot fix anything, this one names every
 * problem, because the operator is standing right there.
 *
 * Story-level refusals — a story with no anchor, two stories on one marker, a
 * marker whose bytes were never uploaded — need the story documents and are
 * checked server-side in `api/publish-exhibit.ts`.
 *
 * @param doc — The exhibit about to be published.
 * @returns Human-readable issues; empty when publishable.
 */
export function exhibitIssues(doc: ExhibitDoc): string[] {
  const issues: string[] = [];

  if (doc.storyIds.length === 0) {
    issues.push('An exhibit needs at least one story.');
  }
  if (doc.storyIds.length > MAX_EXHIBIT_STORIES) {
    issues.push(
      `An exhibit can hold ${MAX_EXHIBIT_STORIES} stories at most, because that is how many pictures the tracker can watch at once. This one has ${doc.storyIds.length}.`,
    );
  }

  const seen = new Set<string>();
  for (const id of doc.storyIds) {
    if (seen.has(id)) issues.push(`"${id}" is in this exhibit twice.`);
    seen.add(id);
  }

  return issues;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/exhibit/exhibitDoc.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Verify and commit**

```bash
git add src/exhibit/exhibitDoc.ts src/exhibit/exhibitDoc.test.ts
git commit -m "Describe a room of printed pictures as a list of stories"
```

---

## Task 11: Publishing an exhibit

**Files:**
- Create: `api/publish-exhibit.ts`
- Create: `api/publish-exhibit.test.ts`
- Modify: `api/_lambda.ts` (the `ROUTES` table at :59-60)

**Interfaces:**
- Consumes: `validateExhibitDoc`, `exhibitIssues`, `MAX_EXHIBIT_STORIES` (Task 10); `markerKey` (Task 2); `validateStoryDoc` and `StoryAnchor` (Task 7); `objectExists` / `putJson` from `api/_s3.ts`.
- Produces: `POST /api/publish-exhibit` → `{ id, url }` on 200.

This endpoint is where §8's remaining refusals live, because they need the story documents. It reads each member story back **from the bucket** rather than trusting the client, so a story published a week ago is checked as rigorously as one published a minute ago.

- [ ] **Step 1: Write the failing tests**

Create `api/publish-exhibit.test.ts`, mocking `./_s3` exactly as `api/story-assets.test.ts` does — copy that file's `get BUCKET()` getter comment and pattern verbatim, including `vi.resetModules()` for the 503 case. Add a `getJson`-style store so member stories can be seeded. Cover, at minimum:

```ts
  it('refuses without the publish secret', /* 401 */);
  it('refuses a story that is not bound to any picture', /* 422, names the story */);
  it('refuses two stories bound to the same picture', /* 422 */);
  it('refuses more stories than the tracker can watch at once', /* 422, mentions 10 */);
  it('refuses a marker whose image never finished uploading', /* 422 — objectExists(markerKey(id)) false */);
  it('refuses a marker id that is not a hash', /* 422 */);
  it('refuses an anchor whose crop is missing', /* 422 */);
  it('writes the exhibit with a 60-second TTL so a republish is promptly visible', /* asserts the cache-control string */);
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run api/publish-exhibit.test.ts`
Expected: FAIL — cannot resolve `./publish-exhibit`.

- [ ] **Step 3: Implement**

Create `api/publish-exhibit.ts` following `api/publish.ts` structurally — same auth, same `secretMatches`, same `isRateLimited`, same `json` helper, same `try` placement around the S3 calls (that placement is load-bearing: `objectExists` rethrows every non-404, and outside the try those escape as a bare 500 instead of the designed 502).

The exhibit-specific middle:

```ts
  const doc = validateExhibitDoc({ ...body.doc, id });
  if (doc === null) {
    return json({ error: 'That exhibit has no usable stories.' }, 400);
  }

  const issues = exhibitIssues(doc);
  if (issues.length > 0) return json({ error: issues.join(' ') }, 422);

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
      for (const id of [anchor.markerId, anchor.thumbId]) {
        if (!(await objectExists(markerKey(id)))) {
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
    return json({ id, url: `${base}/${key}` }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown storage error';
    return json({ error: `Could not save the exhibit: ${message}` }, 502);
  }
```

`validateStoryDoc` needs a known-good fallback; use an empty document exactly as `api/publish.ts:127-135` does, so a story that fell back to demo content cannot pass:

```ts
const EMPTY_STORY: StoryDoc = {
  schemaVersion: 4, id: 'unpublished', title: '', loc: '',
  intro: { title: '', subtitle: '' }, outro: { title: '', subtitle: '' }, frames: [],
};
```

`getJson` does not exist yet in `api/_s3.ts` — add it beside `putJson`, returning `null` on a 404 and rethrowing everything else, matching `objectExists`'s error discipline. Add a test for it in `api/_s3.test.ts`.

- [ ] **Step 4: Route it**

In `api/_lambda.ts`, add to `ROUTES`:

```ts
  '/api/publish-exhibit': publishExhibit,
```

with the matching import. One Lambda serves all routes — do not create a second function, and do not add an Amplify rewrite: `/api/<*>` already covers it.

- [ ] **Step 5: Run and watch them pass**

Run: `npx vitest run api/`
Expected: PASS apart from the 3 known `_s3.test.ts` import failures.

- [ ] **Step 6: Verify and commit**

```bash
git add api/publish-exhibit.ts api/publish-exhibit.test.ts api/_lambda.ts api/_s3.ts api/_s3.test.ts
git commit -m "Refuse to publish an exhibit that would leave a picture doing nothing"
```

**Deploy note:** the API is a separate Lambda. This route does not exist in production until someone runs `npm run build:lambda` and uploads `dist-lambda.zip`. A frontend push does **not** deploy it.

---

## Task 12: The Exhibit dialog

**Files:**
- Create: `src/studio/ExhibitDialog.tsx`
- Modify: `src/studio/StudioApp.tsx`
- Modify: `src/services/storyApi.ts` (add `publishExhibit`, mirroring `publishStory`)
- Modify: `src/services/storyApi.test.ts`
- Modify: `src/studio/studio.css`

**Interfaces:**
- Produces: `publishExhibit(doc: ExhibitDoc, id: string, secret: string): Promise<PublishOutcome>` — the same `PublishOutcome` union `publishStory` already returns, with `viewUrl` pointing at `/?e=<id>`.

**A real limitation, stated rather than papered over:** there is no story index, so the operator types the story ids they got when publishing each story. Spec §7.3 asks for "pick which stories belong to it", which implies a list; building that list needs a published `stories/index.json`, which is the same mutable-index-that-can-disagree problem §11 declines for markers. Typing ids is the honest v1. Make the field forgiving — accept a newline- or comma-separated list, trim and lowercase each — and show each id's publish state after a HEAD, so a typo is visible before publishing rather than after.

- [ ] **Step 1: Add `publishExhibit`**

In `src/services/storyApi.ts`, beside `publishStory`:

```ts
/**
 * Publishes an exhibit document.
 *
 * @param doc — The exhibit to publish.
 * @param id — Exhibit id; becomes the `?e=` value.
 * @param secret — The publish secret, sent as a bearer token.
 * @returns The published location, or a message explaining why it failed.
 */
export async function publishExhibit(
  doc: unknown,
  id: string,
  secret: string,
): Promise<PublishOutcome> {
  try {
    const res = await fetch('/api/publish-exhibit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ id, doc }),
    });

    const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok) {
      return { ok: false, error: payload.error ?? `Publish failed (${res.status}).` };
    }
    if (typeof payload.url !== 'string') {
      return { ok: false, error: 'The server did not return an exhibit location.' };
    }
    return {
      ok: true,
      id,
      url: payload.url,
      viewUrl: `${window.location.origin}/?e=${encodeURIComponent(id)}`,
    };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection.' };
  }
}
```

Add tests mirroring the existing `publishStory` ones: success, server error text passthrough, network failure, and that `viewUrl` uses `?e=`.

- [ ] **Step 2: Build the dialog**

`ExhibitDialog.tsx` follows `PublishDialog.tsx`'s shape — same passphrase field and same "only remember it after the server accepts it" behaviour (commit `150008c` established that; do not regress it). Fields: exhibit title, exhibit id (slugified from the title via the existing `slugifyStoryId`), and the story id list. Show `exhibitIssues` inline as the operator types, and the server's 422 text on failure. On success show the `/?e=<id>` link and a QR code if `PublishDialog` already has one.

- [ ] **Step 3: Mount it** in `StudioApp.tsx` beside the other overlays.

- [ ] **Step 4: Verify and commit**

```bash
git add src/studio/ExhibitDialog.tsx src/studio/StudioApp.tsx src/services/storyApi.ts src/services/storyApi.test.ts src/studio/studio.css
git commit -m "Let an author group their stories into one room visitors can walk"
```

---

## Task 13: The synthesized tracker target

**Files:**
- Create: `src/markers/markerTarget.ts`
- Create: `src/markers/markerTarget.test.ts`

**Interfaces:**
- Consumes: `StoryAnchor` (Task 7).
- Produces:
  ```ts
  export interface ImageTargetData {
    imagePath: string; metadata: null; name: string;
    type: 'PLANAR'; properties: MarkerCrop;
    resources: { luminanceImage: string }; created: number; updated: number;
  }
  export const MARKER_IMAGE_ROUTE = '/image-targets';
  export function markerTargetData(anchor: StoryAnchor): ImageTargetData;
  ```

Do **not** import `src/xr8/imageTargetData.ts` — it does not exist on this branch (see Global Constraints).

- [ ] **Step 1: Write the failing tests**

Create `src/markers/markerTarget.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { markerTargetData } from './markerTarget';
import type { StoryAnchor } from '@/story/storyDoc';

const crop = {
  top: 0, left: 100, width: 1200, height: 1600,
  isRotated: false, originalWidth: 1400, originalHeight: 1600,
};
const anchor: StoryAnchor = {
  type: 'marker', markerId: 'a'.repeat(64), thumbId: 'b'.repeat(64),
  crop, local: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
  widthInMarkers: 1, mode: 'follow',
};

describe('markerTargetData', () => {
  it('names the target by its markerId, so an imagefound event keys straight into the story map', () => {
    expect(markerTargetData(anchor).name).toBe(anchor.markerId);
  });

  it('requests a same-origin path, because the engine resolves imagePath against the page', () => {
    const path = markerTargetData(anchor).imagePath;
    expect(path.startsWith('/')).toBe(true);
    expect(path).not.toMatch(/^https?:/);
  });

  it('builds the path from the markerId alone, which cannot name a host', () => {
    expect(markerTargetData(anchor).imagePath).toBe(`/image-targets/${anchor.markerId}.png`);
  });

  it('carries the crop through as the target properties', () => {
    expect(markerTargetData(anchor).properties).toEqual(crop);
  });

  it('sets metadata to null, matching what the CLI emits', () => {
    expect(markerTargetData(anchor).metadata).toBeNull();
  });

  it('is PLANAR — curved markers are not generated', () => {
    expect(markerTargetData(anchor).type).toBe('PLANAR');
  });

  it('is identical across calls, so a reload configures the same targets', () => {
    expect(markerTargetData(anchor)).toEqual(markerTargetData(anchor));
  });
});
```

The last test is why `created`/`updated` are zeroed: a wall-clock value would make the derived document differ between loads for no reason.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/markers/markerTarget.test.ts`
Expected: FAIL — cannot resolve `./markerTarget`.

- [ ] **Step 3: Implement**

Create `src/markers/markerTarget.ts`:

```ts
/**
 * markerTarget.ts — the tracker's target document, built rather than fetched.
 *
 * `@8thwall/image-target-cli` writes this JSON to disk; nothing here does.
 * Everything in it is a constant, derivable from the markerId, or carried by
 * the anchor, so storing it would add an object nobody can verify — and on an
 * unauthenticated, first-writer-wins endpoint, an unverifiable object is a
 * squattable one. A poisoned target would be the worst of the three files,
 * because an attacker-chosen absolute `imagePath` reaches the engine untouched.
 * See `docs/marker-layer-design.md` §3.4 and §3.5.
 */

import type { MarkerCrop } from './markerCrop';
import type { StoryAnchor } from '@/story/storyDoc';

/**
 * Same-origin route the marker luminance images are served from.
 *
 * The engine resolves `imagePath` relative to the PAGE url, and its handling
 * of an absolute cross-origin path is undocumented. The app is served from
 * Amplify and content from the S3/CloudFront origin, so this must be a rewrite
 * on the app's own domain, ordered before the SPA catch-all — see
 * `docs/marker-layer-design.md` §9 and open item OPS-M1.
 */
export const MARKER_IMAGE_ROUTE = '/image-targets';

/** The fingerprint document the engine's `imageTargetData` takes. */
export interface ImageTargetData {
  imagePath: string;
  /** Always null. The CLI emits the literal value; nothing reads it. */
  metadata: null;
  /** The markerId — see `markerTargetData`. */
  name: string;
  type: 'PLANAR';
  properties: MarkerCrop;
  resources: { luminanceImage: string };
  created: number;
  updated: number;
}

/**
 * Builds the target document for one anchor.
 *
 * `name` is the markerId rather than the operator's label, for two reasons:
 * `imagefound` events carry `name`, so a detection keys directly into the
 * marker→story map with no second lookup; and two markers cannot collide on a
 * human-chosen label. The operator's own name is Studio-side metadata that
 * never reaches the engine.
 *
 * @param anchor — A validated anchor. Its `markerId` has already matched
 *   ASSET_ID_RE, so the path built here cannot express a scheme or a
 *   traversal — which is what makes an untrusted published document safe to
 *   turn into a URL.
 * @returns The fingerprint document, identical on every call.
 */
export function markerTargetData(anchor: StoryAnchor): ImageTargetData {
  return {
    imagePath: `${MARKER_IMAGE_ROUTE}/${anchor.markerId}.png`,
    metadata: null,
    name: anchor.markerId,
    type: 'PLANAR',
    properties: anchor.crop,
    resources: { luminanceImage: `${anchor.markerId}.png` },
    // Zeroed, not `Date.now()`: nothing reads them, and a wall-clock value
    // would make the derived document differ between loads for no reason.
    created: 0,
    updated: 0,
  };
}
```

- [ ] **Step 4: Run, verify, commit**

```bash
git add src/markers/markerTarget.ts src/markers/markerTarget.test.ts
git commit -m "Build the tracker's picture description on the device instead of storing it"
```

---

## Task 14: Loading an exhibit

**Files:**
- Create: `src/services/exhibitApi.ts`
- Create: `src/services/exhibitApi.test.ts`

**Interfaces:**
- Consumes: `validateExhibitDoc` (Task 10), `validateStoryDoc` / `StoryAnchor` (Task 7).
- Produces:
  ```ts
  export function resolveExhibitId(search: string): string | null;
  export function publishedExhibitUrl(id: string): string;
  export async function fetchPublishedExhibit(id: string): Promise<unknown | null>;
  export function buildMarkerStoryMap(stories: StoryDoc[]): Map<string, StoryDoc>;
  ```

`resolveExhibitId` sits beside `resolveStorySource` rather than inside it: `?e=` and `?s=` are different loads, and folding a second kind into `StorySource` would make every existing consumer handle a case it has no meaning for.

- [ ] **Step 1: Write the failing tests**

Create `src/services/exhibitApi.test.ts` covering:

```ts
  it('reads ?e= as an exhibit id');
  it('lowercases and trims the id, matching the story path');
  it('ignores a malformed id rather than fetching it');       // '../x', 'https://…'
  it('returns null when there is no ?e=');
  it('prefers ?s= — a single story link still opens that story');
  it('maps each marker to its story');
  it('keeps the first story when two claim one marker, so a bad publish cannot blank the room');
  it('skips a story with no anchor rather than dropping the exhibit');
```

The seventh case is a runtime-degradation rule that mirrors a publish-time refusal: `api/publish-exhibit.ts` refuses two stories on one marker, but a visitor can still meet that state if the stories were republished after the exhibit was. Refusing to render would punish the visitor for the operator's mistake.

- [ ] **Step 2: Run and watch it fail**, then implement following `storyApi.ts`'s shape exactly — same `STORY_BASE_URL` handling, same "every failure returns null and never throws" discipline, same `credentials: 'omit'`.

`buildMarkerStoryMap` is pure:

```ts
/**
 * Derives the marker→story map from the stories themselves.
 *
 * The exhibit deliberately does not store this (`docs/marker-layer-design.md`
 * §3.2): the story owns its marker, so the map is derived at load time and
 * cannot go stale.
 *
 * @param stories — The fetched member stories, in exhibit order.
 * @returns A map keyed by markerId — which is also the synthesized target's
 *   `name`, so an `imagefound` event resolves through this directly.
 */
export function buildMarkerStoryMap(stories: StoryDoc[]): Map<string, StoryDoc> {
  const map = new Map<string, StoryDoc>();
  for (const story of stories) {
    const id = story.anchor?.markerId;
    // First writer wins: publish refuses duplicates, but a story republished
    // after the exhibit can still collide, and blanking the room over it would
    // punish the visitor for the operator's mistake.
    if (id !== undefined && !map.has(id)) map.set(id, story);
  }
  return map;
}
```

- [ ] **Step 3: Verify and commit**

```bash
git add src/services/exhibitApi.ts src/services/exhibitApi.test.ts
git commit -m "Open a room of stories from a single link"
```

---

## Task 15: Choosing which picture the visitor is looking at

**Files:**
- Create: `src/markers/markerSelection.ts`
- Create: `src/markers/markerSelection.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const DWELL_MS = 400;
  export interface TrackedMarker { name: string; screenX: number; screenY: number }
  export interface SelectionState { current: string | null; candidate: string | null; since: number }
  export const INITIAL_SELECTION: SelectionState;
  export function nearestToCentre(tracked: TrackedMarker[]): string | null;
  export function stepSelection(state: SelectionState, tracked: TrackedMarker[], now: number): SelectionState;
  ```

Screen coordinates are **normalised**, centre `(0, 0)`, edges at ±1, so the maths is resolution-independent and testable without a device.

- [ ] **Step 1: Write the failing tests**

Create `src/markers/markerSelection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DWELL_MS, INITIAL_SELECTION, nearestToCentre, stepSelection,
} from './markerSelection';

const a = { name: 'a', screenX: 0.05, screenY: 0 };
const b = { name: 'b', screenX: 0.6, screenY: 0.2 };

describe('nearestToCentre', () => {
  it('is null when nothing is tracked', () => {
    expect(nearestToCentre([])).toBeNull();
  });

  it('picks the marker closest to the middle of the screen', () => {
    expect(nearestToCentre([b, a])).toBe('a');
  });

  it('does not depend on the order events arrived in', () => {
    expect(nearestToCentre([a, b])).toBe(nearestToCentre([b, a]));
  });

  it('breaks an exact tie deterministically, so it cannot flicker', () => {
    const l = { name: 'l', screenX: -0.3, screenY: 0 };
    const r = { name: 'r', screenX: 0.3, screenY: 0 };
    expect(nearestToCentre([l, r])).toBe(nearestToCentre([r, l]));
  });
});

describe('stepSelection', () => {
  it('claims the session immediately when nothing is live yet', () => {
    expect(stepSelection(INITIAL_SELECTION, [a], 1000).current).toBe('a');
  });

  it('does not switch before the dwell has elapsed', () => {
    const live = stepSelection(INITIAL_SELECTION, [a], 0);
    expect(stepSelection(live, [b], DWELL_MS - 1).current).toBe('a');
  });

  it('switches once the new marker has held centre for the dwell', () => {
    const live = stepSelection(INITIAL_SELECTION, [a], 0);
    const pending = stepSelection(live, [b], 1);
    expect(stepSelection(pending, [b], 1 + DWELL_MS).current).toBe('b');
  });

  it('a glance across the room does not yank the story away', () => {
    const live = stepSelection(INITIAL_SELECTION, [a], 0);
    const glance = stepSelection(live, [b], 10);
    const back = stepSelection(glance, [a], 20);
    expect(stepSelection(back, [a], 10_000).current).toBe('a');
  });

  it('keeps the live story when every marker is lost', () => {
    const live = stepSelection(INITIAL_SELECTION, [a], 0);
    expect(stepSelection(live, [], 5000).current).toBe('a');
  });
});
```

The last two are the ones that matter. "Keeps the live story when every marker is lost" is `marker-testbed-design.md` §6's rule — an asset is never moved while its marker is out of view — and without it a visitor who lowers their phone mid-sentence loses the story.

- [ ] **Step 2: Run and watch it fail**, then implement:

```ts
/**
 * markerSelection.ts — which picture the visitor is looking at.
 *
 * Selection is by nearest to the centre of the screen, not by whichever event
 * fired most recently. Two pictures on one wall are both tracked at once, and
 * "most recent" flickers between them as the visitor's hand moves; "nearest
 * centre" is stable, and it matches what a visitor means by looking at
 * something. A short dwell keeps a glance across the room from yanking the
 * story away mid-sentence.
 *
 * Pure: screen positions are normalised to centre (0,0), edges ±1, so none of
 * this needs a device to test.
 */

/** How long a marker must hold centre before it claims the session. */
export const DWELL_MS = 400;

/** One marker the tracker currently sees. */
export interface TrackedMarker {
  /** The target's `name`, which is its markerId. */
  name: string;
  /** Normalised horizontal position; 0 is centre, ±1 the edges. */
  screenX: number;
  /** Normalised vertical position; 0 is centre, ±1 the edges. */
  screenY: number;
}

/** Which story is live, and which is trying to take over. */
export interface SelectionState {
  current: string | null;
  candidate: string | null;
  /** When `candidate` first took centre, in the caller's clock. */
  since: number;
}

export const INITIAL_SELECTION: SelectionState = { current: null, candidate: null, since: 0 };

/**
 * The tracked marker closest to the centre of the screen.
 *
 * @param tracked — Every marker currently visible.
 * @returns Its name, or null when nothing is tracked. Ties break on name so
 *   the result cannot depend on event order — an order-dependent tie is a
 *   flicker between two equidistant pictures.
 */
export function nearestToCentre(tracked: TrackedMarker[]): string | null {
  let best: TrackedMarker | null = null;
  let bestD = Infinity;

  for (const m of tracked) {
    const d = m.screenX * m.screenX + m.screenY * m.screenY;
    if (d < bestD || (d === bestD && best !== null && m.name < best.name)) {
      best = m;
      bestD = d;
    }
  }

  return best === null ? null : best.name;
}

/**
 * Advances the selection by one frame.
 *
 * @param state — The previous selection.
 * @param tracked — Every marker currently visible.
 * @param now — A monotonic clock in milliseconds.
 * @returns The next selection. The live story is never cleared by losing
 *   sight of its marker — only by another marker holding centre for the dwell.
 */
export function stepSelection(
  state: SelectionState,
  tracked: TrackedMarker[],
  now: number,
): SelectionState {
  const nearest = nearestToCentre(tracked);

  // Nothing visible: hold what is live. A visitor lowering their phone
  // mid-sentence must not lose the story.
  if (nearest === null) return { ...state, candidate: null, since: now };

  // Nothing live yet — the first picture seen claims the session at once,
  // because there is no story to interrupt.
  if (state.current === null) return { current: nearest, candidate: null, since: now };

  if (nearest === state.current) return { ...state, candidate: null, since: now };

  // A different picture. Start or continue its dwell.
  if (state.candidate !== nearest) return { ...state, candidate: nearest, since: now };

  return now - state.since >= DWELL_MS
    ? { current: nearest, candidate: null, since: now }
    : state;
}
```

- [ ] **Step 3: Verify and commit**

```bash
git add src/markers/markerSelection.ts src/markers/markerSelection.test.ts
git commit -m "Pick the picture a visitor is actually looking at, and hold it steady"
```

---

## Task 16: XR8 wiring — GATED ON PHASE 0 AND OPS-M1

**Do not start this task until Phase 0's two measurements are recorded and OPS-M1's rewrite is live.** Phase 0 can change `mode` from `follow` to `latch`, which changes what this task builds; without OPS-M1 the engine cannot fetch a single marker image and nothing will ever be detected.

**Files:**
- Create: `src/xr8/markerTracking.ts`
- Modify: `src/xr8/pipeline.ts`
- Modify: `src/components/StoryARExperience.tsx` (or wherever the exhibit load is triggered — locate it before editing)

**Interfaces:**
- Consumes: Tasks 13, 14, 15; `StoryTile` from `src/xr8/storyTile.ts`.

**No unit tests.** This is engine wiring, verified on device per `TESTING.md`. Every rule it applies is already covered by Tasks 13–15.

- [ ] **Step 1: Configure the targets**

```ts
XR8.XrController.configure({
  disableWorldTracking: false,
  imageTargetData: stories.map((s) => markerTargetData(s.anchor!)),
});
```

- [ ] **Step 2: Handle the three events**

Listen for `reality.imagefound`, `reality.imageupdated`, `reality.imagelost`. Maintain a `Map<string, TrackedMarker>` of what is currently visible, and call `stepSelection` once per frame — not once per event, or the dwell measures event frequency rather than time.

- [ ] **Step 3: Place the tile from the engine's own numbers**

```ts
// Sized from the engine's reported dimensions, so the plane covers the marker
// exactly WHATEVER those units mean — the design never needs to know whether
// scaledWidth is metres. Scale is deliberately excluded from the matrix: an
// estimate wobbling by 1% would rescale every stored offset.
const plane = new PlaneGeometry(event.scaledWidth, event.scaledHeight);
const matrix = rigid(event.position, event.rotation);
```

- [ ] **Step 4: Swap stories on selection change**

When `stepSelection` returns a different `current`, swap the document, its textures and the narration chrome **together**. Resolve that story's assets lazily on first detection through the existing `resolveAssets` LRU — story documents are kilobytes and are already resident, but assets are megabytes and a visitor may never walk to half the pictures.

- [ ] **Step 5: Runtime degradation**

Per spec §8: a marker whose PNG 404s leaves that picture inert while the others still track, surfaced in the HUD; no detection keeps the scan prompt up with thumbnails as hints; `trackingstatus` → `LIMITED` keeps its existing HUD treatment.

- [ ] **Step 6: Verify on device, then commit**

Two printed pictures, two stories, walk between them. Confirm switching, the dwell, and that lowering the phone does not clear the story.

```bash
git commit -m "Bring each printed picture alive with its own story"
```

---

## Task 17: DOC-M1 — correct the record

**Files:**
- Modify: `docs/arcade-architecture.md` (§10.3)
- Modify: `.claude/skills/8thwall-engine/reference/imagetargets.md`

- [ ] **Step 1: Amend §10.3**

It currently states markers cannot be created in-app because the CLI is interactive-only. That is false and `docs/marker-layer-design.md` §1 shows why — the CLI does a crop, a resize, and a grayscale, with no feature extraction. Replace the constraint, **keep the companion warning** that an operator who picks a plain logo gets bad tracking and blames the software, and link to the design doc.

- [ ] **Step 2: Regenerate the engine skill reference**

`imagetargets.md` still documents the retired hosted API. Run `npm run build:8thwall-docs`, then check the regenerated file actually reflects `XR8.XrController.configure({ imageTargetData })` — if the generator's source has not been updated, fix it by hand and say so.

- [ ] **Step 3: Commit**

```bash
git add docs/arcade-architecture.md .claude/skills/8thwall-engine/reference/imagetargets.md
git commit -m "Correct the record on whether markers can be made inside the app"
```

---

## OPS-M1 — the rewrite (blocks Task 16)

Amplify app `d114nr20m4npww`, ca-central-1. Add a rewrite from `/image-targets/<path>` to `markers/<path>` on the content distribution, ordered **before** the SPA catch-all.

**Not written here on purpose.** The real distribution domain must be read back from the account first — a guessed hostname in a paste block is exactly the failure that cost hours before. Read the current rules with:

```bash
aws amplify get-app --app-id d114nr20m4npww --query "app.customRules"
```

Then add the rule ahead of the existing SPA regex, keeping `/api/<*>` first. Verify by content type, never by whether a page appears:

```bash
curl -o /dev/null -w "%{content_type}\n" https://<app-domain>/image-targets/<a-real-markerId>.png
```

It must say `image/png`. Note `aws` was **not installed** in the environment this plan was written in — install it or run these from a machine that has it.

---

## Self-review

**Spec coverage.** §1 → Task 17. §3.1 → Task 10. §3.2 → Task 14 (`buildMarkerStoryMap`). §3.3 → Task 7. §3.4 → Tasks 2, 3. §3.5 → Task 13. §4.1/§4.2 → Task 1 ✅ + Phase 0. §4.3 → Task 2. §5 → Task 16. §6.1 → Task 14. §6.2 → Task 15. §6.3 → Task 16. §7.1 → Tasks 4, 5, 6. §7.2 → Task 9. §7.3 → Task 12. §8 publish refusals → Tasks 10, 11; §8 runtime degradation → Tasks 14, 16. §9 → OPS-M1 + `MARKER_IMAGE_ROUTE`. §10 → phase gates on Phase 0 and Task 16. §12 → Task 17, OPS-M1, Phase 0. §13's unit-test column → every task's tests.

**One gap, stated rather than hidden.** §7.1 asks for "a print-ready download of the cropped image at known dimensions". Task 6 step 1.9 includes it, but the cropped colour image at full resolution is **not** among the two PNGs `renderMarkerImages` returns and is **not** stored (§3.4 — nothing reads it). The download must therefore be regenerated in the browser from the operator's original file, which means it is only available while that file is still in the page. An operator who reloads before downloading must re-drop the photo. That is acceptable — content addressing makes the same crop of the same photo produce the same marker — but it must be said in the UI, not discovered.

**Placeholder scan.** Task 11 step 1 and Task 14 step 1 list test names rather than full bodies. That is deliberate and bounded: both files' mocking setup must be copied verbatim from an existing sibling (`api/story-assets.test.ts` and `src/services/storyApi.test.ts`), and reproducing those harnesses here would encourage divergence from the pattern they must match. Every other step carries its real content.

**Type consistency.** `MarkerCrop` is Task 1's throughout — the crop stored in `StoryAnchor` (7), carried in `MarkerLibraryEntry` (5), and emitted as `properties` (13) are the same type. `markerKey` (2) is the only definition of the marker path and is used by the endpoint (2), publish (11), and — via `MARKER_IMAGE_ROUTE` — the synthesized target (13). `UploadKind` is declared in `api/story-assets.ts` (2) and again in `src/services/contentUpload.ts` (3); these are two sides of a wire boundary, like `AssetContentType` already is, and are intentionally not shared. Target `name` is the `markerId` (13), which is the key of the map built in Task 14 and the `TrackedMarker.name` consumed in Task 15 — one identity end to end.
