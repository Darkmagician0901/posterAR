# ARCADE Storage — Plan A (Phases 0–3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move uploaded image bytes out of the story document and into S3 under a content address, so a published document drops from ~10.6 MB to a few KB while rendering identically.

**Architecture:** Uploaded images go to S3 once, keyed by the SHA-256 of their bytes. The document stores only an opaque `assetId`. `frame.art` carries an `asset:<alias>` token, and a pure `hydrateArt` pass swaps in `data:` URLs immediately before rasterization — required because [SVG in an image context cannot load external resources](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image). Publishing still goes to Vercel Blob in this plan; moving it to S3 is Plan B.

**Tech Stack:** TypeScript (strict), React 18.3.1, plain three.js, Zustand 4, vitest ^4.1.8 + happy-dom ^20.9.0, Fastify + `pg` + `@aws-sdk/client-s3` on the server, Terraform for AWS.

**Design source:** `docs/arcade-storage-aws-design.md`. Section references below (§) point there.

## Global Constraints

- **TypeScript strict mode. No `any` without a comment justifying it.**
- **Plain three.js only.** Do NOT add `@react-three/*` or `@use-gesture/*` — both were removed in the 8th Wall migration.
- **Conventional Commits**: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, with scopes such as `story`, `storage`, `upload`, `studio`.
- **No `Co-Authored-By: Claude` trailer on commits.**
- **GIFs must stay GIFs.** Never flatten a GIF to WebP — it collapses all frames to one.
- Frontend verification: `npm run type-check`, `npm run lint`, `npm run test`.
- Server verification: `cd server && npm test`.
- Every new pure module gets a colocated `*.test.ts`. Browser/engine interactions are verified on device, not unit-tested — follow the existing posture.
- **Do not touch `stories/` publishing or CloudFront.** That is Plan B.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/story/artTokens.ts` | Find and replace `asset:` tokens in an SVG string. Pure — no DOM, no network. |
| `src/story/artTokens.test.ts` | Tests for the above. |
| `src/story/assetHash.ts` | SHA-256 of bytes as lowercase hex, plus the base64 form S3 wants. |
| `src/story/assetHash.test.ts` | Tests for the above. |
| `src/story/assetResolver.ts` | `assetId` → `data:` URL, bounded cache, never throws. |
| `src/story/assetResolver.test.ts` | Tests for the above. |
| `src/services/assetApi.ts` | Presign/commit client; dedup, 412 and 409 handling. |
| `src/services/assetApi.test.ts` | Tests for the above. |
| `src/studio/assetGuard.ts` | Refuses animated GIFs as composed frame assets (§2.1). |
| `src/studio/assetGuard.test.ts` | Tests for the above. |
| `src/studio/composeImages.ts` | Adapter: document assets → `compose()`'s `ImageAsset` map. |
| `src/studio/composeImages.test.ts` | Tests for the above. |
| `src/studio/useResolvedAssets.ts` | Supplies resolved bytes to studio previews only. |
| `server/migrations/003_story_assets.sql` | `story_assets` + `asset_usage` tables. |
| `server/src/db/storyAssetsRepo.ts` | Row access for `story_assets`. |
| `server/src/routes/storyAssets.ts` | `POST /api/story-assets/presign`, `POST /api/story-assets/:sha/commit`. |
| `server/src/routes/storyAssets.test.ts` | Tests for the above. |

**Modified**

| File | Change |
|---|---|
| `src/story/storyDoc.ts` | v4 types; validator dispatches on `schemaVersion`; `StoryAssetRef`. |
| `src/story/storyDoc.test.ts` | v3-still-works and v4 validation cases. |
| `src/story/svgTexture.ts` | Blob URL instead of percent-encoded data URL. |
| `src/story/props/compose.ts` | Doc comments only — the code already takes hrefs from the caller. |
| `src/services/storyApi.ts` | Hydrate assets after fetching a document. |
| `src/studio/StageEditor.tsx` | Guard uploads, upload on drop, compose via the adapter. |
| `src/studio/PhonePreview.tsx` | Resolve assets for the preview. |
| `src/App.tsx` | Hydrate the loaded document before it reaches the content store. |
| `src/vite-env.d.ts` | Declare `VITE_ASSET_BASE_URL`. |
| `server/src/storage/objectStore.ts` | Add `presignPutConditional`. |
| `server/src/app.ts` | Register the new routes. |
| `infra/terraform/s3.tf` | Scope the lifecycle rule to `tmp/`; per-prefix cache-control; CORS. |
| `infra/terraform/variables.tf` | Remove the `["*"]` CORS default. |

---

## Task 0: Integration branch

Tasks 3, 11 and 12 touch files that exist **only** on `feat/story-composition`. Everything must be built on a branch that has both.

**Files:** none — branch setup only.

**Interfaces:**
- Consumes: nothing.
- Produces: branch `feat/arcade-storage` containing `main` + `feat/story-composition`.

- [ ] **Step 1: Create the integration branch from main**

```bash
git fetch origin
git checkout -b feat/arcade-storage origin/main
```

- [ ] **Step 2: Merge the studio branch**

```bash
git merge origin/feat/story-composition
```

Expected: `src/App.tsx` auto-merges. `CLAUDE.md` conflicts — this is known and expected.

- [ ] **Step 3: Resolve the CLAUDE.md conflict**

Keep **both** sides: `main`'s content plus the studio section that `feat/story-composition` adds. Delete the `<<<<<<<`, `=======`, `>>>>>>>` markers. No content should be lost from either side.

```bash
git add CLAUDE.md
git commit --no-edit
```

- [ ] **Step 4: Verify the merged tree is green**

```bash
npm ci
npm run type-check
npm run lint
npm run test
```

Expected: all pass. If tests fail here, **stop** — the failure belongs to the merge, not to this plan, and must be understood before building on it.

- [ ] **Step 5: Push**

```bash
git push -u origin feat/arcade-storage
```

---

## Task 1: `artTokens` — find and replace asset tokens

The pure heart of the design. A token in the art (`href="asset:logo"`) is swapped for a `data:` URL at render time.

**Files:**
- Create: `src/story/artTokens.ts`
- Test: `src/story/artTokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ASSET_ALIAS_RE: RegExp` — `/^[A-Za-z0-9_-]{1,64}$/`
  - `collectAssetRefs(art: string): string[]` — unique aliases, in first-seen order
  - `hydrateArt(art: string, resolved: ReadonlyMap<string, string>): string`
  - `TRANSPARENT_PIXEL: string` — a 1×1 transparent PNG data URL

- [ ] **Step 1: Write the failing test**

Create `src/story/artTokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { collectAssetRefs, hydrateArt, TRANSPARENT_PIXEL } from './artTokens';

const IMG = (href: string) => `<svg viewBox="0 0 10 10"><image href="${href}" x="0"/></svg>`;

describe('collectAssetRefs', () => {
  it('finds an alias in an href', () => {
    expect(collectAssetRefs(IMG('asset:logo'))).toEqual(['logo']);
  });

  it('finds an alias in an xlink:href', () => {
    const art = '<svg><image xlink:href="asset:old_style"/></svg>';
    expect(collectAssetRefs(art)).toEqual(['old_style']);
  });

  it('de-duplicates and preserves first-seen order', () => {
    const art = IMG('asset:b') + IMG('asset:a') + IMG('asset:b');
    expect(collectAssetRefs(art)).toEqual(['b', 'a']);
  });

  it('returns nothing for art with no tokens', () => {
    expect(collectAssetRefs('<svg><path d="M0 0"/></svg>')).toEqual([]);
  });

  // The literal text "asset:" inside prose must never be mistaken for a token.
  it('ignores asset: appearing in text content', () => {
    const art = '<svg><text>see asset:logo for details</text></svg>';
    expect(collectAssetRefs(art)).toEqual([]);
  });

  it('ignores an alias longer than 64 characters', () => {
    expect(collectAssetRefs(IMG(`asset:${'x'.repeat(65)}`))).toEqual([]);
  });
});

describe('hydrateArt', () => {
  it('replaces a token with the resolved data URL', () => {
    const out = hydrateArt(IMG('asset:logo'), new Map([['logo', 'data:image/webp;base64,AAA']]));
    expect(out).toContain('href="data:image/webp;base64,AAA"');
    expect(out).not.toContain('asset:logo');
  });

  it('preserves the attribute name it matched', () => {
    const out = hydrateArt('<image xlink:href="asset:a"/>', new Map([['a', 'data:image/webp;base64,Z']]));
    expect(out).toBe('<image xlink:href="data:image/webp;base64,Z"/>');
  });

  it('substitutes a transparent pixel for an unresolved alias', () => {
    const out = hydrateArt(IMG('asset:missing'), new Map());
    expect(out).toContain(TRANSPARENT_PIXEL);
    expect(out).not.toContain('asset:missing');
  });

  it('leaves non-token hrefs untouched', () => {
    const art = IMG('data:image/png;base64,QQ');
    expect(hydrateArt(art, new Map())).toBe(art);
  });

  // A resolved value is inserted into a double-quoted attribute, so a quote in
  // it would break out of the attribute and inject markup.
  it('escapes a resolved value that contains attribute-breaking characters', () => {
    const out = hydrateArt(IMG('asset:x'), new Map([['x', 'data:image/png,"><script>bad()</script>']]));
    expect(out).not.toContain('<script>');
    expect(out).toContain('&quot;');
  });

  it('replaces every occurrence of a repeated alias', () => {
    const art = IMG('asset:a') + IMG('asset:a');
    const out = hydrateArt(art, new Map([['a', 'data:image/webp;base64,Q']]));
    expect(out).not.toContain('asset:a');
    expect(out.match(/data:image\/webp;base64,Q/g)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/story/artTokens.test.ts`
Expected: FAIL — `Failed to resolve import "./artTokens"`.

- [ ] **Step 3: Write the implementation**

Create `src/story/artTokens.ts`:

```ts
/**
 * artTokens.ts — asset tokens in composed SVG art.
 *
 * Composed art references uploaded images by an opaque alias rather than by
 * bytes or by URL:
 *
 *     <image href="asset:logo" .../>
 *
 * Two constraints meet here. Documents must stay small, so bytes cannot be
 * inlined at authoring time. And an SVG rasterized through `<img>` runs in
 * restricted mode and will NOT fetch external references — an https source
 * renders blank, silently — so bytes MUST be inline at rasterization time.
 * A token plus a late substitution pass satisfies both.
 *
 * Pure string logic: no DOM, no network, no engine. The regex is deliberately
 * bounded to the attribute form and a restricted alias charset, so nothing
 * else in the document can be matched or rewritten.
 */

/** Aliases are document-local names. Kept URL- and attribute-safe. */
export const ASSET_ALIAS_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Matches `href="asset:NAME"` and `xlink:href="asset:NAME"`.
 *
 * Anchored on the attribute name and the opening quote so the literal text
 * `asset:` elsewhere in the document — inside a <text> element, say — is never
 * mistaken for a reference.
 */
const TOKEN_RE = /(\bxlink:href|\bhref)="asset:([A-Za-z0-9_-]{1,64})"/g;

/** 1x1 fully transparent PNG. Stands in for an asset that failed to resolve. */
export const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Escapes the characters that would break out of a double-quoted attribute. */
function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Lists the asset aliases an art string references.
 *
 * @param art — A composed SVG document string.
 * @returns Unique aliases in first-seen order. Empty when the art references
 *   no assets, which is the case for all hand-drawn era scenes.
 */
export function collectAssetRefs(art: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // A /g regex carries lastIndex across calls; a fresh instance keeps this
  // function reentrant.
  const re = new RegExp(TOKEN_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(art)) !== null) {
    const alias = m[2];
    if (seen.has(alias)) continue;
    seen.add(alias);
    out.push(alias);
  }
  return out;
}

/**
 * Replaces every asset token with its resolved `data:` URL.
 *
 * Call immediately before rasterization and discard the result — a hydrated
 * string carries the full image payload and must never be persisted or put
 * back into the document.
 *
 * @param art — A composed SVG document string.
 * @param resolved — Alias to `data:` URL. An alias absent from the map is
 *   replaced with {@link TRANSPARENT_PIXEL}: a gap in the art is recoverable,
 *   a document that fails to parse is not.
 * @returns The art with every token substituted.
 */
export function hydrateArt(art: string, resolved: ReadonlyMap<string, string>): string {
  const re = new RegExp(TOKEN_RE.source, 'g');
  return art.replace(re, (_full, attr: string, alias: string) => {
    const href = resolved.get(alias) ?? TRANSPARENT_PIXEL;
    return `${attr}="${escapeAttr(href)}"`;
  });
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/story/artTokens.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 5: Verify the whole suite and types**

```bash
npm run type-check
npm run test
```

Expected: all pass; existing test count grows by 13.

- [ ] **Step 6: Commit**

```bash
git add src/story/artTokens.ts src/story/artTokens.test.ts
git commit -m "feat(story): asset tokens for composed art

Composed art references uploaded images by an opaque alias rather than by
inlined bytes. hydrateArt swaps in data: URLs immediately before
rasterization, which is required because an SVG loaded through <img> runs in
restricted mode and will not fetch external references.

The regex is anchored on the attribute name so the literal text asset:
elsewhere in a document is never rewritten, and resolved values are
attribute-escaped before insertion."
```

---

## Task 2: `assetHash` — content addressing

**Files:**
- Create: `src/story/assetHash.ts`
- Test: `src/story/assetHash.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `sha256Hex(bytes: ArrayBuffer): Promise<string>` — 64 lowercase hex chars
  - `hexToBase64(hex: string): string` — the form S3's `x-amz-checksum-sha256` header wants
  - `ASSET_ID_RE: RegExp` — `/^[a-f0-9]{64}$/`

- [ ] **Step 1: Write the failing test**

Create `src/story/assetHash.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ASSET_ID_RE, hexToBase64, sha256Hex } from './assetHash';

const bytesOf = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe('sha256Hex', () => {
  // Published NIST vector for the empty input.
  it('hashes empty input to the known vector', async () => {
    await expect(sha256Hex(new ArrayBuffer(0))).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  // Published vector for "abc".
  it('hashes "abc" to the known vector', async () => {
    await expect(sha256Hex(bytesOf('abc'))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is stable across calls', async () => {
    const a = await sha256Hex(bytesOf('same'));
    const b = await sha256Hex(bytesOf('same'));
    expect(a).toBe(b);
  });

  it('produces something ASSET_ID_RE accepts', async () => {
    expect(ASSET_ID_RE.test(await sha256Hex(bytesOf('x')))).toBe(true);
  });
});

describe('hexToBase64', () => {
  it('converts the empty-input digest to its base64 form', () => {
    expect(hexToBase64('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe(
      '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
    );
  });
});

describe('ASSET_ID_RE', () => {
  it('rejects uppercase, wrong length, and non-hex', () => {
    expect(ASSET_ID_RE.test('A'.repeat(64))).toBe(false);
    expect(ASSET_ID_RE.test('a'.repeat(63))).toBe(false);
    expect(ASSET_ID_RE.test('g'.repeat(64))).toBe(false);
  });

  it('rejects a value trying to smuggle a path or scheme', () => {
    expect(ASSET_ID_RE.test('../../etc/passwd')).toBe(false);
    expect(ASSET_ID_RE.test('https://evil.example/x')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/story/assetHash.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/story/assetHash.ts`:

```ts
/**
 * assetHash.ts — content addressing for uploaded assets.
 *
 * An asset's identity is the SHA-256 of its bytes. That makes deduplication
 * automatic and global (the same image uploaded twice is one object), and it
 * makes every asset immutable, which is what lets them be served with a
 * far-future `immutable` cache directive.
 *
 * `crypto.subtle` requires a secure context. The app already requires HTTPS
 * for the camera and the 8th Wall engine, so this adds no new constraint.
 */

/** A valid asset id: exactly 64 lowercase hex characters. */
export const ASSET_ID_RE = /^[a-f0-9]{64}$/;

/**
 * Hashes bytes with SHA-256.
 *
 * @param bytes — The canonical stored bytes, after any compression. Hashing
 *   the compressed form (not the original file) is deliberate: it is what
 *   actually gets stored, so it is what must dedupe.
 * @returns The digest as 64 lowercase hex characters.
 */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Re-encodes a hex digest as base64.
 *
 * S3's `x-amz-checksum-sha256` header takes the digest base64-encoded, not
 * hex, while the object key uses hex. Both forms come from the same digest.
 *
 * @param hex — A hex digest, as produced by {@link sha256Hex}.
 * @returns The same digest, base64-encoded.
 */
export function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return btoa(String.fromCharCode(...bytes));
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/story/assetHash.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/story/assetHash.ts src/story/assetHash.test.ts
git commit -m "feat(story): content-addressed asset ids

Asset identity is the SHA-256 of the stored bytes, which makes dedup
automatic and global and makes every asset immutable — the precondition for
serving them with a far-future immutable cache directive.

Hashes the compressed form rather than the original file, because that is
what actually gets stored and therefore what must dedupe."
```

---

## Task 3: `StoryDoc` v4

**Files:**
- Modify: `src/story/storyDoc.ts`
- Modify: `src/story/storyDoc.test.ts`

**Interfaces:**
- Consumes: `ASSET_ID_RE` from `src/story/assetHash.ts`; `ASSET_ALIAS_RE` from `src/story/artTokens.ts`.
- Produces:
  - `StoryAssetRef { assetId: string; aspect: number; name?: string }`
  - `StoryAssetLegacy { href: string; aspect: number; name?: string }` (v3, retained)
  - `StoryDoc.assets?: Record<string, StoryAssetRef | StoryAssetLegacy>`
  - `STORY_SCHEMA_VERSION = 4`
  - `isAssetRef(a): a is StoryAssetRef` — the discriminator later tasks use

- [ ] **Step 1: Write the failing tests**

Append to `src/story/storyDoc.test.ts`. **The file already has an import block —
merge these imports into it rather than adding a second one**, which would not
compile:

```ts
import { describe, expect, it } from 'vitest';
import { isAssetRef, validateStoryDoc, type StoryDoc } from './storyDoc';

const FALLBACK: StoryDoc = {
  schemaVersion: 4,
  id: 'fallback',
  title: 'Fallback',
  loc: '',
  intro: { title: '', subtitle: '' },
  outro: { title: '', subtitle: '' },
  frames: [{ key: 'f', year: '', label: '', title: '', line: '', washColor: '', art: '<svg/>' }],
};

const SHA = 'a'.repeat(64);
const docWith = (assets: unknown) => ({ ...FALLBACK, assets });

describe('validateStoryDoc — v4 assets', () => {
  it('keeps a well-formed assetId reference', () => {
    const out = validateStoryDoc(docWith({ logo: { assetId: SHA, aspect: 1.5 } }), FALLBACK);
    expect(out.assets?.logo).toEqual({ assetId: SHA, aspect: 1.5 });
  });

  it('still keeps a v3 data: href, so published v3 documents keep rendering', () => {
    const href = 'data:image/webp;base64,AAA';
    const out = validateStoryDoc(docWith({ old: { href, aspect: 1 } }), FALLBACK);
    expect(out.assets?.old).toEqual({ href, aspect: 1 });
  });

  it('drops an assetId that is not 64 lowercase hex', () => {
    expect(validateStoryDoc(docWith({ a: { assetId: 'nope', aspect: 1 } }), FALLBACK).assets)
      .toBeUndefined();
  });

  // The whole security property: a document must not be able to name a host.
  it('drops an assetId carrying a URL or a path traversal', () => {
    expect(validateStoryDoc(docWith({ a: { assetId: 'https://evil.example/x', aspect: 1 } }), FALLBACK).assets)
      .toBeUndefined();
    expect(validateStoryDoc(docWith({ a: { assetId: '../../secret', aspect: 1 } }), FALLBACK).assets)
      .toBeUndefined();
  });

  it('still rejects a non-data: href, as v3 did', () => {
    expect(validateStoryDoc(docWith({ a: { href: 'https://evil.example/x.png', aspect: 1 } }), FALLBACK).assets)
      .toBeUndefined();
  });

  it('drops an entry whose alias is not token-safe', () => {
    const out = validateStoryDoc(docWith({ 'bad alias"': { assetId: SHA, aspect: 1 } }), FALLBACK);
    expect(out.assets).toBeUndefined();
  });

  it('drops a non-positive aspect', () => {
    expect(validateStoryDoc(docWith({ a: { assetId: SHA, aspect: 0 } }), FALLBACK).assets)
      .toBeUndefined();
  });

  it('keeps the good entries and drops only the bad ones', () => {
    const out = validateStoryDoc(
      docWith({ good: { assetId: SHA, aspect: 1 }, bad: { assetId: 'x', aspect: 1 } }),
      FALLBACK,
    );
    expect(Object.keys(out.assets ?? {})).toEqual(['good']);
  });

  it('reports schemaVersion 4 regardless of the input version', () => {
    expect(validateStoryDoc({ ...FALLBACK, schemaVersion: 3 }, FALLBACK).schemaVersion).toBe(4);
  });
});

describe('isAssetRef', () => {
  it('discriminates a v4 reference from a v3 inline asset', () => {
    expect(isAssetRef({ assetId: SHA, aspect: 1 })).toBe(true);
    expect(isAssetRef({ href: 'data:image/png;base64,AA', aspect: 1 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/story/storyDoc.test.ts`
Expected: FAIL — `isAssetRef` is not exported; assetId cases fail.

- [ ] **Step 3: Replace `sanitizeAssets` and the asset types**

In `src/story/storyDoc.ts`, replace the `StoryAsset` interface with:

```ts
/**
 * A v4 asset reference: an opaque content address, never a URL.
 *
 * The document deliberately cannot name a host. `assetId` is 64 hex characters
 * and the base URL comes from build configuration, so a published document —
 * which is untrusted input — has no way to point a viewer's browser anywhere.
 * v3 achieved the same property by permitting only `data:`; this is the same
 * guarantee carried across the move to remote bytes.
 */
export interface StoryAssetRef {
  /** SHA-256 of the stored bytes, 64 lowercase hex characters. */
  assetId: string;
  /** Natural width / height, used to size placements. */
  aspect: number;
  /** Original filename, shown in the studio. */
  name?: string;
}

/**
 * A v3 inline asset. Retained so documents published before the move keep
 * rendering unchanged and forever; nothing new is written in this shape.
 */
export interface StoryAssetLegacy {
  /** Must be a `data:` URL — see the restricted-mode note in artTokens.ts. */
  href: string;
  aspect: number;
  name?: string;
}

export type StoryAsset = StoryAssetRef | StoryAssetLegacy;

/**
 * Narrows an asset to the v4 reference form.
 *
 * @param a — Either asset shape.
 * @returns True when `a` carries an `assetId` and must be resolved remotely.
 */
export function isAssetRef(a: StoryAsset): a is StoryAssetRef {
  return typeof (a as StoryAssetRef).assetId === 'string';
}
```

- [ ] **Step 4: Rewrite `sanitizeAssets` to accept both shapes**

Replace the existing `sanitizeAssets` function body:

```ts
/**
 * Sanitizes the asset map, accepting both schema versions.
 *
 * A published document is untrusted input, so each entry must prove its shape:
 * a v4 entry's `assetId` must be exactly 64 lowercase hex characters — which
 * cannot express a scheme, a host, or a traversal — and a v3 entry's `href`
 * must still be a `data:` URL. The alias (the map key) is checked too, because
 * it is interpolated into an SVG attribute as `asset:<alias>`.
 *
 * Entries are dropped individually rather than failing the map, matching the
 * per-field fallback the rest of this validator uses.
 */
function sanitizeAssets(raw: unknown): Record<string, StoryAsset> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const out: Record<string, StoryAsset> = {};

  for (const [alias, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ASSET_ALIAS_RE.test(alias)) continue;

    const v = bag(value);
    const aspect = num(v.aspect, 0);
    if (aspect <= 0) continue;

    const name = str(v.name, '');
    const assetId = str(v.assetId, '');
    const href = str(v.href, '');

    if (assetId !== '') {
      if (!ASSET_ID_RE.test(assetId)) continue;
      out[alias] = name === '' ? { assetId, aspect } : { assetId, aspect, name };
      continue;
    }

    if (/^data:image\//i.test(href)) {
      out[alias] = name === '' ? { href, aspect } : { href, aspect, name };
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}
```

Add the imports at the top of the file:

```ts
import { ASSET_ID_RE } from './assetHash';
import { ASSET_ALIAS_RE } from './artTokens';
```

And bump the version constant:

```ts
/** Current schema version. Bump only on a breaking shape change. */
export const STORY_SCHEMA_VERSION = 4;
```

Update the `StoryDoc` interface's `schemaVersion` field to `4` and its `assets` field to `Record<string, StoryAsset>`.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/story/storyDoc.test.ts`
Expected: PASS, including every pre-existing v3 case.

- [ ] **Step 6: Verify nothing else broke**

```bash
npm run type-check
npm run test
```

Expected: pass. `type-check` may flag call sites that assumed `asset.href` exists — fix them by narrowing with `isAssetRef`. Do **not** cast.

- [ ] **Step 7: Commit**

```bash
git add src/story/storyDoc.ts src/story/storyDoc.test.ts
git commit -m "feat(story): StoryDoc v4 with content-addressed asset references

Assets are referenced by an opaque 64-hex assetId instead of an inlined
data: URL. The document therefore cannot name a host at all — the same
guarantee v3's data:-only rule provided, carried across the move to remote
bytes, and stronger than storing URLs would have been.

v3 inline assets are still accepted and still validated as data:-only, so
documents published before this change keep rendering unchanged."
```

---

## Task 4: Terraform — fix the lifecycle bug, add prefixes

The existing rule deletes **the whole bucket** after 90 days. It must be fixed before any real asset lands there.

**Files:**
- Modify: `infra/terraform/s3.tf:86-103`
- Modify: `infra/terraform/variables.tf`

**Interfaces:**
- Consumes: nothing.
- Produces: a bucket safe to hold production assets, with `assets/` served `immutable`.

- [ ] **Step 1: Scope the lifecycle rule to `tmp/`**

Replace the `aws_s3_bucket_lifecycle_configuration.assets` resource in `infra/terraform/s3.tf`:

```hcl
# Only scratch objects expire.
#
# This rule previously used `filter {}` — the WHOLE BUCKET — with a 90-day
# expiration, written when this bucket held nothing but disposable testbed
# uploads. Published exhibits reference assets indefinitely, so an unscoped
# expiry would silently delete live content three months after upload.
# Lifetime for assets/ is managed by reference counting instead (see the
# asset_usage table), not by age.
resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    id     = "expire-scratch-only"
    status = "Enabled"

    filter {
      prefix = "tmp/"
    }

    expiration {
      days = 90
    }
  }

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
```

- [ ] **Step 2: Require explicit CORS origins**

In `infra/terraform/variables.tf`, remove the `default = ["*"]` from `cors_allowed_origins` and add a validation:

```hcl
variable "cors_allowed_origins" {
  description = <<-EOT
    Origins allowed to read assets and issue presigned PUT uploads.

    Deliberately has NO default. The viewer fetches asset bytes cross-origin
    in order to convert them to data: URLs, so a wrong or wildcard value here
    is either a broken exhibit or an open bucket. List the Vercel production
    origin and any preview origins that must load assets.
  EOT
  type        = list(string)

  validation {
    condition     = !contains(var.cors_allowed_origins, "*")
    error_message = "Refusing a wildcard CORS origin. List specific origins."
  }
}
```

- [ ] **Step 3: Verify the configuration is valid**

```bash
cd infra/terraform
terraform fmt -check
terraform validate
```

Expected: both pass. `terraform validate` does not need credentials.

- [ ] **Step 4: Review the plan against the live bucket**

```bash
terraform plan -var-file=example.tfvars
```

Expected: shows the lifecycle rule being **replaced**, not the bucket. **If the plan proposes destroying `aws_s3_bucket.assets`, stop and investigate — it must not.**

- [ ] **Step 5: Commit**

```bash
cd ../..
git add infra/terraform/s3.tf infra/terraform/variables.tf
git commit -m "fix(storage): scope the S3 expiration rule to tmp/

The lifecycle rule used filter {} — the whole bucket — with a 90-day
expiration, written when the bucket held only disposable testbed uploads.
Published exhibits reference assets indefinitely, so this would have silently
deleted live content three months after upload.

Assets are now retained by reference counting rather than by age. Also
removes the wildcard default for cors_allowed_origins: the viewer reads asset
bytes cross-origin, so that value is load-bearing and must be stated."
```

---

## Task 5: Server — `story_assets` schema and repo

**Files:**
- Create: `server/migrations/003_story_assets.sql`
- Create: `server/src/db/storyAssetsRepo.ts`

**Interfaces:**
- Consumes: `pg.Pool`.
- Produces:
  - `StoryAssetRow { sha256, owner_id, content_type, byte_size, width, height, is_animated, original_name, committed, created_at }`
  - `StoryAssetsRepo { findBySha, insertPending, markCommitted }`

- [ ] **Step 1: Write the migration**

Create `server/migrations/003_story_assets.sql`:

```sql
-- Content-addressed assets for authored stories.
--
-- NOT the `assets` table from migration 001. That one serves the poster path:
-- uuid primary key, `<owner>/<uuid>.<ext>` storage keys, no content
-- addressing. It is live and must not be disturbed. Unifying the two is
-- deliberately deferred — it would mean rekeying every existing poster object
-- for no benefit here.
create table if not exists story_assets (
  sha256        text primary key,
  owner_id      text not null,
  content_type  text not null,
  byte_size     bigint not null,
  width         int not null,
  height        int not null,
  is_animated   boolean not null default false,
  original_name text,
  -- False between issuing a presigned URL and the client confirming the
  -- upload. Publishing rejects any document referencing an uncommitted asset,
  -- so a failed upload can never produce a story with a missing image.
  committed     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists story_assets_owner_idx on story_assets (owner_id, created_at desc);
```

- [ ] **Step 2: Write the repo**

Create `server/src/db/storyAssetsRepo.ts`:

```ts
import type pg from 'pg';

export interface StoryAssetRow {
  sha256: string;
  owner_id: string;
  content_type: string;
  byte_size: number;
  width: number;
  height: number;
  is_animated: boolean;
  original_name: string | null;
  committed: boolean;
  created_at: string;
}

export interface StoryAssetsRepo {
  findBySha(sha256: string): Promise<StoryAssetRow | null>;
  /** Inserts an uncommitted row, or leaves an existing row untouched. */
  insertPending(row: Omit<StoryAssetRow, 'created_at' | 'committed'>): Promise<void>;
  markCommitted(sha256: string, ownerId: string): Promise<boolean>;
}

export function createStoryAssetsRepo(pool: pg.Pool): StoryAssetsRepo {
  return {
    async findBySha(sha256) {
      const res = await pool.query<StoryAssetRow>(
        'select * from story_assets where sha256 = $1',
        [sha256],
      );
      return res.rows[0] ?? null;
    },

    async insertPending(row) {
      // `do nothing` rather than `do update`: the row is keyed by a content
      // hash, so an existing row already describes these exact bytes. Two
      // uploaders racing the same image must not overwrite each other's
      // metadata.
      await pool.query(
        `insert into story_assets
           (sha256, owner_id, content_type, byte_size, width, height, is_animated, original_name)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (sha256) do nothing`,
        [
          row.sha256,
          row.owner_id,
          row.content_type,
          row.byte_size,
          row.width,
          row.height,
          row.is_animated,
          row.original_name,
        ],
      );
    },

    async markCommitted(sha256, ownerId) {
      const res = await pool.query(
        'update story_assets set committed = true where sha256 = $1 and owner_id = $2',
        [sha256, ownerId],
      );
      return (res.rowCount ?? 0) > 0;
    },
  };
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd ..
git add server/migrations/003_story_assets.sql server/src/db/storyAssetsRepo.ts
git commit -m "feat(storage): story_assets table keyed by content hash

Separate from migration 001's assets table, which serves the poster path with
uuid keys and is live. Unifying them is deferred; it would mean rekeying every
existing poster object for no benefit here.

The committed flag closes the window between issuing a presigned URL and the
bytes actually arriving, so publishing can reject a document that references
an upload which never completed."
```

---

## Task 6: Server — conditional presign

**Files:**
- Modify: `server/src/storage/objectStore.ts`
- Modify: `server/src/storage/objectStore.test.ts`

**Interfaces:**
- Consumes: `AppConfig['s3']`.
- Produces: `ObjectStore.presignPutConditional(key, contentType, sha256Base64): Promise<string>`

- [ ] **Step 1: Write the failing test**

Append to `server/src/storage/objectStore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createObjectStore } from './objectStore';

const cfg = {
  endpoint: 'https://s3.us-east-1.amazonaws.com',
  region: 'us-east-1',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bucket: 'test-bucket',
  publicBaseUrl: 'https://cdn.example',
  forcePathStyle: false,
};

describe('presignPutConditional', () => {
  it('signs both the conditional and the checksum headers', async () => {
    const url = await createObjectStore(cfg).presignPutConditional(
      'assets/abc/full.webp',
      'image/webp',
      '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
    );
    const signed = decodeURIComponent(new URL(url).searchParams.get('X-Amz-SignedHeaders') ?? '');
    // Both must be SIGNED, not merely sent: an unsigned header can be dropped
    // or altered by the client, which would defeat both guarantees.
    expect(signed).toContain('if-none-match');
    expect(signed).toContain('x-amz-checksum-sha256');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd server && npx vitest run src/storage/objectStore.test.ts`
Expected: FAIL — `presignPutConditional is not a function`.

- [ ] **Step 3: Implement it**

In `server/src/storage/objectStore.ts`, extend the interface and the returned object:

```ts
export interface ObjectStore {
  presignPut(key: string, contentType: string): Promise<string>;
  /**
   * Presigns a PUT that S3 will reject unless the object is new AND the bytes
   * hash to the expected value.
   *
   * `If-None-Match: *` makes the write conditional, so a concurrent upload of
   * identical bytes cannot clobber a completed object — S3 answers 412, which
   * the client treats as a successful dedup rather than an error.
   *
   * `x-amz-checksum-sha256` closes an integrity hole specific to content
   * addressing: the client computes the hash, so without this a dishonest
   * client could store bytes X under the key SHA256(Y). Because dedup is
   * global, that would poison the address for every story. Both headers are
   * SIGNED, so the client cannot drop or alter them.
   *
   * @param key — Object key, e.g. `assets/<sha256>/full.webp`.
   * @param contentType — MIME type of the payload.
   * @param sha256Base64 — The expected digest, base64-encoded.
   * @returns A presigned URL valid for 5 minutes.
   */
  presignPutConditional(key: string, contentType: string, sha256Base64: string): Promise<string>;
  publicUrl(key: string): string;
}
```

And in `createObjectStore`'s returned object:

```ts
    async presignPutConditional(key, contentType, sha256Base64) {
      const cmd = new PutObjectCommand({
        Bucket: s3.bucket,
        Key: key,
        ContentType: contentType,
        IfNoneMatch: '*',
        ChecksumSHA256: sha256Base64,
      });
      return getSignedUrl(client, cmd, {
        expiresIn: 300,
        signableHeaders: new Set(['if-none-match', 'x-amz-checksum-sha256']),
      });
    },
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd server && npx vitest run src/storage/objectStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix the fake store in the existing route tests**

`server/src/routes/assets.test.ts` defines a literal `ObjectStore`, which no longer satisfies the interface. Add the new method to that fake:

```ts
  async presignPutConditional(key: string) {
    return `https://store.example/${key}?X-Amz-Signature=abc`;
  },
```

- [ ] **Step 6: Verify the server suite**

```bash
cd server && npm test
```

Expected: all 33 existing tests plus the new one pass.

- [ ] **Step 7: Commit**

```bash
cd ..
git add server/src/storage/objectStore.ts server/src/storage/objectStore.test.ts server/src/routes/assets.test.ts
git commit -m "feat(storage): conditional presigned PUT with SHA-256 checksum

If-None-Match: * makes the upload conditional so concurrent uploads of
identical bytes cannot clobber a completed object; S3 answers 412, which the
client treats as a successful dedup.

x-amz-checksum-sha256 closes an integrity hole specific to content
addressing: the client computes the hash, so without it a dishonest client
could store bytes X under the key SHA256(Y) and — because dedup is global —
poison that address for every story. Both headers are signed, so the client
cannot drop them."
```

---

## Task 7: Server — presign and commit routes

**Files:**
- Create: `server/src/routes/storyAssets.ts`
- Create: `server/src/routes/storyAssets.test.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: `StoryAssetsRepo`, `ObjectStore.presignPutConditional`.
- Produces:
  - `POST /api/story-assets/presign` → `201 { exists: false, uploadUrl, requiredHeaders }` or `200 { exists: true }`
  - `POST /api/story-assets/:sha256/commit` → `204`
  - `registerStoryAssetRoutes(app, { repo, store })`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/storyAssets.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../app';
import type { StoryAssetRow, StoryAssetsRepo } from '../db/storyAssetsRepo';
import type { ObjectStore } from '../storage/objectStore';
import type { AssetsRepo } from '../db/assetsRepo';

const SHA = 'a'.repeat(64);
const OWNER = 'owner-1';

function fakeStoryRepo(): StoryAssetsRepo & { rows: StoryAssetRow[] } {
  const rows: StoryAssetRow[] = [];
  return {
    rows,
    async findBySha(sha) {
      return rows.find((r) => r.sha256 === sha) ?? null;
    },
    async insertPending(row) {
      if (!rows.find((r) => r.sha256 === row.sha256)) {
        rows.push({ ...row, committed: false, created_at: new Date().toISOString() });
      }
    },
    async markCommitted(sha, owner) {
      const r = rows.find((x) => x.sha256 === sha && x.owner_id === owner);
      if (!r) return false;
      r.committed = true;
      return true;
    },
  };
}

const store: ObjectStore = {
  async presignPut(key) {
    return `https://store.example/${key}`;
  },
  async presignPutConditional(key) {
    return `https://store.example/${key}?conditional=1`;
  },
  publicUrl(key) {
    return `https://cdn.example/${key}`;
  },
};

const emptyAssetsRepo: AssetsRepo = {
  async insert() {},
  async listByOwner() {
    return [];
  },
  async deleteById() {},
};

const body = {
  sha256: SHA,
  sha256Base64: 'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=',
  contentType: 'image/webp',
  byteSize: 1234,
  width: 100,
  height: 200,
  isAnimated: false,
  originalName: 'logo.webp',
};

let repo: ReturnType<typeof fakeStoryRepo>;
const app = () => buildApp({ repo: emptyAssetsRepo, storyAssets: repo, store });

const post = (url: string, payload?: unknown, owner: string | null = OWNER) =>
  app().inject({
    method: 'POST',
    url,
    payload,
    headers: owner === null ? {} : { 'x-owner-id': owner },
  });

beforeEach(() => {
  repo = fakeStoryRepo();
});

describe('POST /api/story-assets/presign', () => {
  it('issues a conditional upload URL for an unseen hash', async () => {
    const res = await post('/api/story-assets/presign', body);
    expect(res.statusCode).toBe(201);
    const json = res.json();
    expect(json.exists).toBe(false);
    expect(json.uploadUrl).toContain('assets/' + SHA + '/full.webp');
    expect(json.requiredHeaders['If-None-Match']).toBe('*');
    expect(json.requiredHeaders['x-amz-checksum-sha256']).toBe(body.sha256Base64);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].committed).toBe(false);
  });

  it('reports a dedup hit for an already committed hash, without an upload URL', async () => {
    await post('/api/story-assets/presign', body);
    await post(`/api/story-assets/${SHA}/commit`);

    const res = await post('/api/story-assets/presign', body);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ exists: true });
  });

  // An abandoned upload must not permanently block the same bytes.
  it('re-issues an upload URL when a row exists but was never committed', async () => {
    await post('/api/story-assets/presign', body);
    const res = await post('/api/story-assets/presign', body);
    expect(res.statusCode).toBe(201);
    expect(res.json().exists).toBe(false);
  });

  it('rejects a sha256 that is not 64 lowercase hex', async () => {
    const res = await post('/api/story-assets/presign', { ...body, sha256: 'nope' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a content type outside the allowlist', async () => {
    const res = await post('/api/story-assets/presign', { ...body, contentType: 'image/svg+xml' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a missing owner header', async () => {
    const res = await post('/api/story-assets/presign', body, null);
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/story-assets/:sha256/commit', () => {
  it('marks an asset committed', async () => {
    await post('/api/story-assets/presign', body);
    const res = await post(`/api/story-assets/${SHA}/commit`);
    expect(res.statusCode).toBe(204);
    expect(repo.rows[0].committed).toBe(true);
  });

  it('404s for an unknown hash', async () => {
    const res = await post(`/api/story-assets/${'b'.repeat(64)}/commit`);
    expect(res.statusCode).toBe(404);
  });

  it('404s when another owner tries to commit', async () => {
    await post('/api/story-assets/presign', body);
    const res = await post(`/api/story-assets/${SHA}/commit`, undefined, 'someone-else');
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd server && npx vitest run src/routes/storyAssets.test.ts`
Expected: FAIL — cannot resolve `../db/storyAssetsRepo` route registration; `buildApp` rejects the extra dep.

- [ ] **Step 3: Write the routes**

Create `server/src/routes/storyAssets.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { StoryAssetsRepo } from '../db/storyAssetsRepo.js';
import type { ObjectStore } from '../storage/objectStore.js';

/**
 * Allowed upload types and their storage extensions.
 *
 * `image/svg+xml` is deliberately absent: an SVG served from the public bucket
 * origin would be active content, which is a stored-XSS vector. This mirrors
 * the allowlist the poster route already enforces.
 */
const EXT = {
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/png': 'png',
  'image/jpeg': 'jpg',
} as const;

const SHA256_RE = /^[a-f0-9]{64}$/;
const OWNER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const presignBody = z.object({
  sha256: z.string().regex(SHA256_RE),
  /** Same digest, base64-encoded — the form S3's checksum header takes. */
  sha256Base64: z.string().min(1).max(64),
  contentType: z.enum(Object.keys(EXT) as [keyof typeof EXT, ...(keyof typeof EXT)[]]),
  byteSize: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  isAnimated: z.boolean(),
  originalName: z.string().max(256).nullable().optional(),
});

function ownerOf(req: { headers: Record<string, unknown> }): string | null {
  const v = req.headers['x-owner-id'];
  return typeof v === 'string' && OWNER_ID_RE.test(v) ? v : null;
}

/** Object key for an asset's canonical bytes. */
export function assetKey(sha256: string, contentType: keyof typeof EXT): string {
  return `assets/${sha256}/full.${EXT[contentType]}`;
}

/**
 * Registers the content-addressed asset routes.
 *
 * @param app — The Fastify instance to register on.
 * @param deps — The story-asset repository and the object store.
 */
export function registerStoryAssetRoutes(
  app: FastifyInstance,
  deps: { repo: StoryAssetsRepo; store: ObjectStore },
): void {
  const { repo, store } = deps;

  app.post('/api/story-assets/presign', async (req, reply) => {
    const owner = ownerOf(req);
    if (!owner) return reply.code(400).send({ error: 'missing x-owner-id' });

    const parsed = presignBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const b = parsed.data;

    // A committed row means these exact bytes are already stored. Content
    // addressing makes that a certainty rather than a guess, so the upload
    // can be skipped entirely.
    const existing = await repo.findBySha(b.sha256);
    if (existing?.committed) return reply.code(200).send({ exists: true });

    await repo.insertPending({
      sha256: b.sha256,
      owner_id: owner,
      content_type: b.contentType,
      byte_size: b.byteSize,
      width: b.width,
      height: b.height,
      is_animated: b.isAnimated,
      original_name: b.originalName ?? null,
    });

    const key = assetKey(b.sha256, b.contentType);
    const uploadUrl = await store.presignPutConditional(key, b.contentType, b.sha256Base64);

    return reply.code(201).send({
      exists: false,
      uploadUrl,
      // Returned explicitly because these headers are SIGNED: a client that
      // omits or changes one gets a signature mismatch, not a silent success.
      requiredHeaders: {
        'If-None-Match': '*',
        'x-amz-checksum-sha256': b.sha256Base64,
        'Content-Type': b.contentType,
      },
    });
  });

  app.post('/api/story-assets/:sha256/commit', async (req, reply) => {
    const owner = ownerOf(req);
    if (!owner) return reply.code(400).send({ error: 'missing x-owner-id' });

    const { sha256 } = req.params as { sha256: string };
    if (!SHA256_RE.test(sha256)) return reply.code(400).send({ error: 'invalid sha256' });

    const ok = await repo.markCommitted(sha256, owner);
    if (!ok) return reply.code(404).send({ error: 'unknown asset' });
    return reply.code(204).send();
  });
}
```

- [ ] **Step 4: Register the routes**

In `server/src/app.ts`, extend the deps and register:

```ts
import type { StoryAssetsRepo } from './db/storyAssetsRepo.js';
import { registerStoryAssetRoutes } from './routes/storyAssets.js';

export function buildApp(deps: {
  repo: AssetsRepo;
  storyAssets: StoryAssetsRepo;
  store: ObjectStore;
}): FastifyInstance {
  // ... existing body ...
  registerAssetRoutes(app, deps);
  registerStoryAssetRoutes(app, { repo: deps.storyAssets, store: deps.store });
  return app;
}
```

Update `server/src/server.ts` to construct and pass `createStoryAssetsRepo(pool)`. Update the existing `assets.test.ts` and `spaces.test.ts` `buildApp(...)` calls to include a `storyAssets` stub — the same `fakeStoryRepo()` shape, or a minimal literal.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd server && npm test`
Expected: all pass — 33 existing plus 10 new.

- [ ] **Step 6: Commit**

```bash
cd ..
git add server/src/routes/storyAssets.ts server/src/routes/storyAssets.test.ts server/src/app.ts server/src/server.ts server/src/routes/assets.test.ts server/src/routes/spaces.test.ts
git commit -m "feat(storage): presign and commit routes for content-addressed assets

A committed row proves the exact bytes are already stored, so the upload is
skipped entirely — dedup is a certainty rather than a heuristic. An
uncommitted row re-issues the URL, so an abandoned upload never permanently
blocks those bytes.

Signed headers are returned to the client explicitly: omitting one produces a
signature mismatch rather than a silent success."
```

---

## Task 8: Client — upload on drop

**Files:**
- Create: `src/services/assetApi.ts`
- Test: `src/services/assetApi.test.ts`

**Interfaces:**
- Consumes: `sha256Hex`, `hexToBase64` (Task 2); `getDeviceToken`; `API_BASE_URL`.
- Produces: `uploadStoryAsset(blob: Blob, meta: AssetMeta): Promise<string>` — resolves to the `assetId`.

- [ ] **Step 1: Write the failing test**

Create `src/services/assetApi.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { uploadStoryAsset } from './assetApi';

const meta = { contentType: 'image/webp' as const, width: 10, height: 20, isAnimated: false, originalName: 'a.webp' };
const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => 'owner-1',
    setItem: () => {},
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('uploadStoryAsset', () => {
  it('skips the upload on a dedup hit', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/presign')) {
        return new Response(JSON.stringify({ exists: true }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const id = await uploadStoryAsset(blob(), meta);
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uploads then commits when the asset is new', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? 'GET'} ${u.replace(/^https?:\/\/[^/]+/, '')}`);
      if (u.endsWith('/presign')) {
        return new Response(
          JSON.stringify({
            exists: false,
            uploadUrl: 'https://store.example/assets/x/full.webp',
            requiredHeaders: { 'If-None-Match': '*', 'x-amz-checksum-sha256': 'zz' },
          }),
          { status: 201 },
        );
      }
      if (u.startsWith('https://store.example')) return new Response(null, { status: 200 });
      return new Response(null, { status: 204 });
    }));

    await uploadStoryAsset(blob(), meta);
    expect(calls[0]).toContain('/presign');
    expect(calls[1]).toContain('PUT');
    expect(calls[2]).toContain('/commit');
  });

  // S3 answers 412 when the object already exists. That is a dedup win, not
  // a failure, and must still be committed.
  it('treats a 412 from S3 as success and still commits', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      calls.push(u);
      if (u.endsWith('/presign')) {
        return new Response(
          JSON.stringify({ exists: false, uploadUrl: 'https://store.example/x', requiredHeaders: {} }),
          { status: 201 },
        );
      }
      if (u.startsWith('https://store.example')) return new Response(null, { status: 412 });
      return new Response(null, { status: 204 });
    }));

    await expect(uploadStoryAsset(blob(), meta)).resolves.toMatch(/^[a-f0-9]{64}$/);
    expect(calls.some((c) => c.includes('/commit'))).toBe(true);
  });

  it('throws with a useful message when the upload genuinely fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith('/presign')) {
        return new Response(
          JSON.stringify({ exists: false, uploadUrl: 'https://store.example/x', requiredHeaders: {} }),
          { status: 201 },
        );
      }
      return new Response(null, { status: 500 });
    }));

    await expect(uploadStoryAsset(blob(), meta)).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/services/assetApi.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/services/assetApi.ts`:

```ts
/**
 * assetApi.ts — uploading content-addressed story assets.
 *
 * Uploads happen the moment a file is dropped, not at publish time. That is
 * what keeps the draft free of base64: from the first instant, the document
 * holds only an assetId.
 *
 * The asset's identity is the SHA-256 of the bytes being stored, so uploading
 * the same image twice is a no-op the second time.
 */

import { API_BASE_URL } from '@/utils/constants';
import { getDeviceToken } from '@/utils/deviceToken';
import { hexToBase64, sha256Hex } from '@/story/assetHash';

/** Upload types the server accepts. Mirrors the server-side allowlist. */
export type AssetContentType = 'image/webp' | 'image/gif' | 'image/png' | 'image/jpeg';

export interface AssetMeta {
  contentType: AssetContentType;
  width: number;
  height: number;
  isAnimated: boolean;
  originalName: string;
}

interface PresignResponse {
  exists: boolean;
  uploadUrl?: string;
  requiredHeaders?: Record<string, string>;
}

function authHeaders(): Record<string, string> {
  return { 'x-owner-id': getDeviceToken(), 'content-type': 'application/json' };
}

/**
 * Stores an asset and returns its content address.
 *
 * @param blob — The canonical bytes to store, after compression.
 * @param meta — Dimensions and type, recorded server-side for the studio.
 * @returns The assetId (SHA-256 hex) to record in the document.
 * @throws When the presign, upload, or commit fails for any reason other than
 *   the object already existing.
 */
export async function uploadStoryAsset(blob: Blob, meta: AssetMeta): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const sha256 = await sha256Hex(buffer);
  const sha256Base64 = hexToBase64(sha256);

  const presignRes = await fetch(`${API_BASE_URL}/api/story-assets/presign`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      sha256,
      sha256Base64,
      contentType: meta.contentType,
      byteSize: blob.size,
      width: meta.width,
      height: meta.height,
      isAnimated: meta.isAnimated,
      originalName: meta.originalName,
    }),
  });
  if (!presignRes.ok) throw new Error(`presign failed: ${presignRes.status}`);

  const presign = (await presignRes.json()) as PresignResponse;
  // Already stored. Content addressing makes this a certainty, so there is
  // nothing to upload and nothing to commit.
  if (presign.exists) return sha256;

  if (!presign.uploadUrl) throw new Error('presign returned no upload URL');

  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: presign.requiredHeaders ?? {},
    body: blob,
  });

  // 412 Precondition Failed means If-None-Match: * rejected the write because
  // the object already exists — a race with another uploader of identical
  // bytes. The bytes we wanted are there, so this is success.
  if (!put.ok && put.status !== 412) {
    throw new Error(`upload failed: ${put.status}`);
  }

  const commit = await fetch(`${API_BASE_URL}/api/story-assets/${sha256}/commit`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!commit.ok) throw new Error(`commit failed: ${commit.status}`);

  return sha256;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/services/assetApi.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/assetApi.ts src/services/assetApi.test.ts
git commit -m "feat(upload): content-addressed asset upload on drop

Uploads happen when a file lands, not at publish time, which is what keeps
base64 out of the draft — the document holds only an assetId from the first
instant.

A 412 from S3 means If-None-Match rejected the write because the object
already exists. The bytes are there, so that path commits and succeeds rather
than surfacing an error."
```

---

## Task 8b: Refuse animated GIFs as composed frame assets

Design §2.1. Without this, dropping an animated GIF into a frame produces art
that renders **as its first frame only, silently** — the exact failure
`CLAUDE.md` warns about, arriving through a new door. The existing GIF poster
pipeline is untouched; only *composed frame assets* are restricted.

**Files:**
- Create: `src/studio/assetGuard.ts`
- Test: `src/studio/assetGuard.test.ts`

**Interfaces:**
- Consumes: `decodeGifFrames(buffer: ArrayBuffer): DecodedFrame[]` from `@/utils/gifDecode`.
- Produces: `checkComposable(mimeType: string, buffer: ArrayBuffer): { ok: true } | { ok: false; reason: string }`

- [ ] **Step 1: Write the failing test**

Create `src/studio/assetGuard.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { checkComposable } from './assetGuard';

vi.mock('@/utils/gifDecode', () => ({
  decodeGifFrames: (buf: ArrayBuffer) =>
    // Byte 0 stands in for the frame count in these fixtures.
    new Array(new Uint8Array(buf)[0] ?? 1).fill({}),
}));

const gifWithFrames = (n: number): ArrayBuffer => new Uint8Array([n]).buffer;

describe('checkComposable', () => {
  it('accepts a webp', () => {
    expect(checkComposable('image/webp', new ArrayBuffer(4))).toEqual({ ok: true });
  });

  it('accepts a single-frame gif', () => {
    expect(checkComposable('image/gif', gifWithFrames(1))).toEqual({ ok: true });
  });

  it('rejects an animated gif with a reason a person can act on', () => {
    const result = checkComposable('image/gif', gifWithFrames(12));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/animat/i);
      expect(result.reason.length).toBeGreaterThan(20);
    }
  });

  // A GIF that cannot be decoded must not be assumed safe.
  it('rejects a gif whose frames cannot be counted', async () => {
    vi.resetModules();
    vi.doMock('@/utils/gifDecode', () => ({
      decodeGifFrames: () => {
        throw new Error('corrupt');
      },
    }));
    const { checkComposable: guard } = await import('./assetGuard');
    expect(guard('image/gif', new ArrayBuffer(4)).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/studio/assetGuard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the guard**

Create `src/studio/assetGuard.ts`:

```ts
/**
 * assetGuard.ts — what may be composed into frame art.
 *
 * Composed art is rasterized into a single CanvasTexture, so an animated GIF
 * placed in a frame would render as its first frame and nothing else — with no
 * error. Rather than let that surprise an author, it is refused at upload with
 * an explanation.
 *
 * This restricts COMPOSED FRAME ASSETS only. The poster path's GIF pipeline
 * (gifDecode → gifPlayhead → gifAnimator) is a different render path and is
 * unaffected.
 */

import { decodeGifFrames } from '@/utils/gifDecode';

/** Whether a file may be placed into a frame, and why not if it may not. */
export type ComposableCheck = { ok: true } | { ok: false; reason: string };

/**
 * Decides whether an uploaded file can be composed into frame art.
 *
 * @param mimeType — The processed payload's MIME type.
 * @param buffer — The payload bytes, needed to count GIF frames.
 * @returns `{ ok: true }`, or a refusal carrying a message to show the author.
 */
export function checkComposable(mimeType: string, buffer: ArrayBuffer): ComposableCheck {
  if (mimeType !== 'image/gif') return { ok: true };

  let frames: number;
  try {
    frames = decodeGifFrames(buffer).length;
  } catch {
    // Undecodable: refuse rather than assume it is a harmless still.
    return {
      ok: false,
      reason: 'That GIF could not be read. Try exporting it again, or use a PNG or JPEG instead.',
    };
  }

  if (frames > 1) {
    return {
      ok: false,
      reason:
        'Animated GIFs cannot be placed in a frame — frame art is drawn as a single still image, ' +
        'so only the first frame would ever show. Use a PNG or JPEG, or export one frame of the GIF.',
    };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/studio/assetGuard.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Rewrite the studio upload handler — guard, then upload, then record the id**

This is where Task 8's `uploadStoryAsset` actually gets called. In
`src/studio/StageEditor.tsx`, the handler currently writes
`{ href: processed.dataUrl, aspect, name }` into the document (around line 108).
Replace that whole path:

```ts
import { checkComposable } from './assetGuard';
import { uploadStoryAsset, type AssetContentType } from '@/services/assetApi';

// ...inside the upload handler, after validateAndProcessImage(file):

// The processed payload is what gets stored and hashed — not the original
// file — so the guard and the upload must both see the same bytes.
const blob = await (await fetch(processed.dataUrl)).blob();
const buffer = await blob.arrayBuffer();

const check = checkComposable(processed.mimeType, buffer);
if (!check.ok) {
  setUploadError(check.reason);
  return;
}

let assetId: string;
try {
  assetId = await uploadStoryAsset(blob, {
    contentType: processed.mimeType as AssetContentType,
    width: processed.width,
    height: processed.height,
    isAnimated: false, // animated GIFs were refused above
    originalName: processed.originalName,
  });
} catch (err) {
  setUploadError(err instanceof Error ? err.message : 'Upload failed. Check your connection.');
  return;
}

// The document records only the content address. No bytes ever reach the
// draft, which is what keeps it inside the localStorage budget.
addAsset(aliasFor(processed.originalName), {
  assetId,
  aspect: processed.width / processed.height,
  name: processed.originalName,
});
```

`aliasFor` derives a token-safe alias from the filename — add it alongside the
handler:

```ts
/**
 * Derives a document-local alias from a filename.
 *
 * Must satisfy ASSET_ALIAS_RE, because it is interpolated into art as
 * `asset:<alias>`. A collision is resolved by suffixing, so two files named
 * `logo.png` become `logo` and `logo-2`.
 */
function aliasFor(filename: string, taken: Set<string>): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 56) || 'image';
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
```

Pass `new Set(Object.keys(doc.assets ?? {}))` as `taken`.

- [ ] **Step 6: Confirm no bytes reach the draft**

Upload an image in the studio, then in the browser console:

```js
const d = JSON.parse(localStorage.getItem('arcade.studio.draft'));
console.log(JSON.stringify(d.assets, null, 2));
```

Expected: each entry shows `assetId`, `aspect`, `name` — and **no `href`**. If
an `href` appears, the old inlining path is still live and the size win has not
landed.

- [ ] **Step 7: Verify and commit**

```bash
npm run type-check
npm run lint
npm run test
git add src/studio/assetGuard.ts src/studio/assetGuard.test.ts src/studio/StageEditor.tsx
git commit -m "feat(studio): upload assets on drop, refuse animated GIFs

Uploads now happen when a file lands and the document records only the
content address, so no bytes ever reach the draft — which is what keeps it
inside the localStorage budget.

Animated GIFs are refused for composed frame art: it is rasterized into a
single CanvasTexture, so a GIF would render as its first frame and nothing
else, with no error. Refusing at upload with an explanation beats letting an
author discover it on a phone. The poster path's GIF pipeline is a different
render path and is untouched, and an undecodable GIF is refused rather than
assumed to be a harmless still."
```

---

## Task 9: `assetResolver` — assetId to data URL

**Files:**
- Create: `src/story/assetResolver.ts`
- Test: `src/story/assetResolver.test.ts`

**Interfaces:**
- Consumes: `StoryAsset`, `isAssetRef` (Task 3); `TRANSPARENT_PIXEL` (Task 1).
- Produces:
  - `resolveAssets(assets: Record<string, StoryAsset>): Promise<Map<string, string>>`
  - `clearAssetCache(): void` — tests and teardown only

- [ ] **Step 1: Write the failing test**

Create `src/story/assetResolver.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { clearAssetCache, resolveAssets } from './assetResolver';
import { TRANSPARENT_PIXEL } from './artTokens';

const SHA = 'a'.repeat(64);
const SHA2 = 'b'.repeat(64);

function okResponse(): Response {
  return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }), { status: 200 });
}

beforeEach(() => {
  clearAssetCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveAssets', () => {
  it('resolves a v4 reference to a data URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
    const map = await resolveAssets({ logo: { assetId: SHA, aspect: 1 } });
    expect(map.get('logo')).toMatch(/^data:/);
  });

  it('passes a v3 inline href through without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const href = 'data:image/webp;base64,AAA';
    const map = await resolveAssets({ old: { href, aspect: 1 } });
    expect(map.get('old')).toBe(href);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The whole point of the cache: N frames sharing an asset cost one fetch.
  it('fetches each distinct assetId only once across calls', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await resolveAssets({ a: { assetId: SHA, aspect: 1 } });
    await resolveAssets({ b: { assetId: SHA, aspect: 1 } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches distinct assetIds separately', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    await resolveAssets({ a: { assetId: SHA, aspect: 1 }, b: { assetId: SHA2, aspect: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to a transparent pixel on a network failure, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    const map = await resolveAssets({ logo: { assetId: SHA, aspect: 1 } });
    expect(map.get('logo')).toBe(TRANSPARENT_PIXEL);
  });

  it('falls back to a transparent pixel on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    const map = await resolveAssets({ logo: { assetId: SHA, aspect: 1 } });
    expect(map.get('logo')).toBe(TRANSPARENT_PIXEL);
  });

  it('returns an empty map for a document with no assets', async () => {
    await expect(resolveAssets({})).resolves.toEqual(new Map());
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/story/assetResolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/story/assetResolver.ts`:

```ts
/**
 * assetResolver.ts — turning asset references into inlinable bytes.
 *
 * Composed art is rasterized through `<img>`, which runs SVG in restricted
 * mode: external references are not fetched and render blank. So an asset's
 * bytes have to be present as a `data:` URL at that moment, which means
 * fetching them ourselves and re-encoding.
 *
 * The base URL comes from build configuration, never from the document. That
 * is the whole security property: a published document is untrusted input, and
 * because it carries only a 64-hex content address it has no way to name a
 * host.
 *
 * Every failure resolves to a transparent pixel rather than rejecting. A gap
 * in one frame is recoverable; a rejected promise on the render path is not.
 */

import { isAssetRef, type StoryAsset } from './storyDoc';
import { TRANSPARENT_PIXEL } from './artTokens';

/** Origin serving `assets/`. Empty means same-origin, which is the default. */
const ASSET_BASE_URL: string = import.meta.env.VITE_ASSET_BASE_URL || '';

/**
 * Resolved `data:` URLs keyed by assetId.
 *
 * Bounded because a data: URL holds the whole payload as a string; an
 * unbounded map would grow with every story a session visits. Mirrors the
 * budgeting `posterTextureCache` already applies to textures.
 */
const CACHE_LIMIT = 24;
const cache = new Map<string, string>();

/** Drops every cached asset. For teardown and tests. */
export function clearAssetCache(): void {
  cache.clear();
}

/** Records a resolved asset, evicting the oldest entry when over budget. */
function remember(assetId: string, dataUrl: string): void {
  cache.set(assetId, dataUrl);
  if (cache.size > CACHE_LIMIT) {
    // Map preserves insertion order, so the first key is the oldest.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** Reads a blob as a `data:` URL. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('asset read failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Fetches one asset's bytes and encodes them inline.
 *
 * @param assetId — 64-hex content address, already validated by the document
 *   validator. Interpolated into a path, never into a host.
 * @returns The bytes as a `data:` URL, or {@link TRANSPARENT_PIXEL} on any
 *   failure.
 */
async function fetchAsDataUrl(assetId: string): Promise<string> {
  const base = ASSET_BASE_URL.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/assets/${assetId}/full.webp`, { credentials: 'omit' });
    if (!res.ok) return TRANSPARENT_PIXEL;
    return await blobToDataUrl(await res.blob());
  } catch {
    return TRANSPARENT_PIXEL;
  }
}

/**
 * Resolves every asset a document declares.
 *
 * @param assets — The document's `assets` map. v3 inline entries pass straight
 *   through; v4 references are fetched once each and cached.
 * @returns Alias to `data:` URL, ready for `hydrateArt`.
 */
export async function resolveAssets(
  assets: Record<string, StoryAsset>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  // Fetch each distinct assetId once even when several aliases share it.
  const pending = new Map<string, Promise<string>>();

  for (const [alias, asset] of Object.entries(assets)) {
    if (!isAssetRef(asset)) {
      out.set(alias, asset.href);
      continue;
    }
    const { assetId } = asset;
    const cached = cache.get(assetId);
    if (cached !== undefined) {
      out.set(alias, cached);
      continue;
    }
    if (!pending.has(assetId)) pending.set(assetId, fetchAsDataUrl(assetId));
  }

  const ids = [...pending.keys()];
  const results = await Promise.all(pending.values());
  ids.forEach((id, i) => {
    if (results[i] !== TRANSPARENT_PIXEL) remember(id, results[i]);
  });

  for (const [alias, asset] of Object.entries(assets)) {
    if (!isAssetRef(asset) || out.has(alias)) continue;
    const i = ids.indexOf(asset.assetId);
    out.set(alias, i >= 0 ? results[i] : (cache.get(asset.assetId) ?? TRANSPARENT_PIXEL));
  }

  return out;
}
```

- [ ] **Step 4: Add the env var type**

In `src/vite-env.d.ts`, add to the `ImportMetaEnv` interface:

```ts
  readonly VITE_ASSET_BASE_URL: string;
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run src/story/assetResolver.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/story/assetResolver.ts src/story/assetResolver.test.ts src/vite-env.d.ts
git commit -m "feat(story): resolve asset references to inlinable data URLs

The base URL comes from build configuration, never from the document. That is
the security property: a published document is untrusted input and, carrying
only a 64-hex content address, has no way to name a host.

Distinct assetIds are fetched once and cached under a bound, so N frames
sharing an image cost one request. Every failure resolves to a transparent
pixel rather than rejecting — a gap in one frame is recoverable, a rejected
promise on the render path is not."
```

---

## Task 10: `svgTexture` — blob URL instead of percent-encoding

**Files:**
- Modify: `src/story/svgTexture.ts:110-118`
- Modify: `src/story/svgTexture.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature change — `svgToTexture` and `svgFrame` are unchanged externally.

- [ ] **Step 1: Replace `loadSvgImage`**

In `src/story/svgTexture.ts`, replace the `loadSvgImage` function:

```ts
/**
 * Decodes an SVG string into an HTMLImageElement.
 *
 * Uses a blob: URL rather than `data:image/svg+xml,${encodeURIComponent(svg)}`.
 * Once hydrated art carries base64 image payloads, percent-encoding expands
 * `+`, `/` and `=` three-for-one — roughly 6% on top of base64's 33% — and
 * builds a large intermediate string on the way. A Blob skips both.
 *
 * The `<img>` restricted-mode rules are unchanged by this: they are a property
 * of the image context, not of the URL scheme, so external references still
 * will not load and art must still arrive already hydrated.
 *
 * @param svg — SVG document string, with every asset token already replaced.
 * @returns A decoded, ready-to-draw image.
 */
function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    const done = (fn: () => void) => {
      // Revoke as soon as the image has decoded; the bitmap is retained
      // independently, so holding the URL open would just leak.
      URL.revokeObjectURL(url);
      fn();
    };
    img.onload = () => done(() => resolve(img));
    img.onerror = () => done(() => reject(new Error('SVG decode failed')));
    img.src = url;
  });
}
```

- [ ] **Step 2: Verify the existing tests still pass**

Run: `npx vitest run src/story/svgTexture.test.ts`
Expected: PASS. `svgFrame` is pure string logic and untouched; `svgToTexture` is exercised on device.

- [ ] **Step 3: Verify the whole suite**

```bash
npm run type-check
npm run test
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/story/svgTexture.ts
git commit -m "perf(story): rasterize via blob URL instead of percent-encoded data URL

Once hydrated art carries base64 payloads, encodeURIComponent expands +, /
and = three-for-one — about 6% on top of base64's 33% — and builds a large
intermediate string. A Blob skips both.

Restricted mode is unaffected: it is a property of the image context, not the
URL scheme, so art must still arrive already hydrated."
```

---

## Task 11: Compose adapter — emit tokens

`compose.ts` needs **no logic change**: both `<image href>` sites already take the href from the caller's `images` map. The change is the adapter that builds that map.

**Files:**
- Create: `src/studio/composeImages.ts`
- Test: `src/studio/composeImages.test.ts`
- Modify: `src/story/props/compose.ts` (doc comments only)
- Modify: `src/studio/StageEditor.tsx:68`

**Interfaces:**
- Consumes: `StoryAsset`, `isAssetRef` (Task 3); `ImageAsset` from `src/story/props/compose`.
- Produces: `toComposeImages(assets, resolved?): Record<string, ImageAsset>`

- [ ] **Step 1: Write the failing test**

Create `src/studio/composeImages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toComposeImages } from './composeImages';

const SHA = 'a'.repeat(64);

describe('toComposeImages', () => {
  it('maps a v4 reference to an asset token', () => {
    expect(toComposeImages({ logo: { assetId: SHA, aspect: 1.5 } })).toEqual({
      logo: { href: 'asset:logo', aspect: 1.5 },
    });
  });

  it('passes a v3 inline href through unchanged', () => {
    const href = 'data:image/webp;base64,AAA';
    expect(toComposeImages({ old: { href, aspect: 2 } })).toEqual({
      old: { href, aspect: 2 },
    });
  });

  // The studio's live preview needs real bytes, not a token, because it
  // renders the fragment as DOM rather than composing a persisted document.
  it('uses a resolved data URL when one is supplied', () => {
    const out = toComposeImages(
      { logo: { assetId: SHA, aspect: 1 } },
      new Map([['logo', 'data:image/webp;base64,ZZZ']]),
    );
    expect(out.logo.href).toBe('data:image/webp;base64,ZZZ');
  });

  it('falls back to the token when the alias is not in the resolved map', () => {
    const out = toComposeImages({ logo: { assetId: SHA, aspect: 1 } }, new Map());
    expect(out.logo.href).toBe('asset:logo');
  });

  it('handles an empty map', () => {
    expect(toComposeImages({})).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/studio/composeImages.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the adapter**

Create `src/studio/composeImages.ts`:

```ts
/**
 * composeImages.ts — bridging document assets to the prop composer.
 *
 * `compose()` takes an `images` map of `{ href, aspect }` and interpolates
 * `href` straight into `<image href="...">`. What that href should be depends
 * entirely on where the output is going:
 *
 *   PERSISTED ART  → `asset:<alias>`, a token. The composed SVG is stored in
 *                    the document, so it must not carry bytes.
 *   LIVE PREVIEW   → a real `data:` URL, because the preview needs to display
 *                    something now and is never persisted.
 *
 * One adapter serves both, which keeps `compose()` itself unaware of storage.
 */

import type { ImageAsset } from '@/story/props/compose';
import { isAssetRef, type StoryAsset } from '@/story/storyDoc';

/**
 * Builds the `images` map `compose()` expects.
 *
 * @param assets — The document's asset map.
 * @param resolved — Optional alias to `data:` URL. Supply it for previews that
 *   must render now; omit it when composing art destined for the document.
 * @returns The map to pass as `ComposeOptions.images`.
 */
export function toComposeImages(
  assets: Record<string, StoryAsset>,
  resolved?: ReadonlyMap<string, string>,
): Record<string, ImageAsset> {
  const out: Record<string, ImageAsset> = {};
  for (const [alias, asset] of Object.entries(assets)) {
    // A v3 inline asset already holds its own bytes.
    const href = isAssetRef(asset) ? (resolved?.get(alias) ?? `asset:${alias}`) : asset.href;
    out[alias] = { href, aspect: asset.aspect };
  }
  return out;
}
```

- [ ] **Step 4: Update the composer's doc comment**

In `src/story/props/compose.ts`, replace the `ImageAsset.href` doc comment:

```ts
  /**
   * Image source, interpolated verbatim into `<image href="...">`.
   *
   * For art that will be PERSISTED this must be an `asset:<alias>` token —
   * see @/studio/composeImages. For art rendered as live DOM (the studio
   * preview) it may be a real `data:` or `blob:` URL.
   *
   * It must never be an `https:` URL in art that will be rasterized: an SVG
   * loaded through `<img>` runs in restricted mode and will not fetch external
   * references, so it renders blank rather than erroring.
   */
  href: string;
```

- [ ] **Step 5: Add a hook that supplies resolved bytes to the preview**

The studio has no in-memory map of resolved assets — it needs one, because
`doc.assets` now holds ids rather than bytes and the preview must display
something. Create `src/studio/useResolvedAssets.ts`:

```ts
/**
 * useResolvedAssets — resolved asset bytes for the studio's live preview.
 *
 * The document holds content addresses, but a preview has to show pixels. This
 * fetches them once per distinct asset (assetResolver caches, so revisiting a
 * frame is free) and hands back a map the compose adapter can use.
 *
 * Returns an empty map on the first render and while resolving. That is
 * deliberate: toComposeImages falls back to the `asset:` token, which renders
 * as a transparent gap rather than blocking the editor on a network round
 * trip.
 */

import { useEffect, useState } from 'react';
import { resolveAssets } from '@/story/assetResolver';
import type { StoryAsset } from '@/story/storyDoc';

export function useResolvedAssets(
  assets: Record<string, StoryAsset> | undefined,
): ReadonlyMap<string, string> {
  const [resolved, setResolved] = useState<ReadonlyMap<string, string>>(new Map());

  // Keyed on the asset identities rather than the object reference, so an
  // unrelated document edit does not re-trigger a fetch.
  const key = JSON.stringify(
    Object.entries(assets ?? {}).map(([alias, a]) => [alias, 'assetId' in a ? a.assetId : a.href]),
  );

  useEffect(() => {
    let cancelled = false;
    if (!assets || Object.keys(assets).length === 0) {
      setResolved(new Map());
      return;
    }
    void resolveAssets(assets).then((map) => {
      if (!cancelled) setResolved(map);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the
    // stable identity of `assets`; depending on the object itself would refetch
    // on every keystroke elsewhere in the document.
  }, [key]);

  return resolved;
}
```

- [ ] **Step 6: Wire the adapter into the stage editor**

In `src/studio/StageEditor.tsx`, replace line 68:

```ts
  const previewAssets = useResolvedAssets(doc.assets);
  const images = useMemo(
    () => toComposeImages(doc.assets ?? {}, previewAssets),
    [doc.assets, previewAssets],
  );
```

Add the imports:

```ts
import { toComposeImages } from './composeImages';
import { useResolvedAssets } from './useResolvedAssets';
```

Apply the same two lines in `src/studio/PhonePreview.tsx`, replacing
`const images = doc.assets ?? {}` (line 50) with the resolved form, so the phone
preview shows real pixels too.

**Important:** art that is *persisted* must be composed **without** the resolved
map — `toComposeImages(doc.assets ?? {})` — so it carries tokens rather than
bytes. Only previews pass the second argument. If persisted art ever contains
`data:image` payloads, this distinction has been lost and documents will grow
again.

- [ ] **Step 7: Run the tests and verify they pass**

```bash
npx vitest run src/studio/composeImages.test.ts
npm run type-check
npm run lint
npm run test
```

Expected: pass. Fix any `StageEditor` type errors by narrowing with `isAssetRef` — do not cast.

- [ ] **Step 8: Commit**

```bash
git add src/studio/composeImages.ts src/studio/composeImages.test.ts src/studio/useResolvedAssets.ts src/story/props/compose.ts src/studio/StageEditor.tsx src/studio/PhonePreview.tsx
git commit -m "feat(studio): compose art with asset tokens instead of inlined bytes

compose() needed no logic change — both <image href> sites already take the
href from the caller's images map, so an adapter at the call site is the whole
change.

The same adapter serves the live preview by passing real data: URLs, because
the preview renders as DOM and is never persisted. compose() therefore stays
unaware of storage entirely."
```

---

## Task 12: Hydrate on load

The last link: a fetched document's art still holds tokens, so resolve and substitute before anything rasterizes.

**Files:**
- Modify: `src/services/storyApi.ts`
- Test: `src/services/storyApi.test.ts`

**Interfaces:**
- Consumes: `resolveAssets` (Task 9); `hydrateArt` (Task 1); `validateStoryDoc` (Task 3).
- Produces: `hydrateStoryDoc(doc: StoryDoc): Promise<StoryDoc>`

- [ ] **Step 1: Write the failing test**

Append to `src/services/storyApi.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { hydrateStoryDoc } from './storyApi';
import { clearAssetCache } from '@/story/assetResolver';
import type { StoryDoc } from '@/story/storyDoc';

const SHA = 'a'.repeat(64);

const docWithToken = (): StoryDoc => ({
  schemaVersion: 4,
  id: 'x',
  title: '',
  loc: '',
  intro: { title: '', subtitle: '' },
  outro: { title: '', subtitle: '' },
  frames: [
    { key: 'f1', year: '', label: '', title: '', line: '', washColor: '',
      art: '<svg><image href="asset:logo"/></svg>' },
    { key: 'f2', year: '', label: '', title: '', line: '', washColor: '',
      art: '<svg><image href="asset:logo"/></svg>' },
  ],
  assets: { logo: { assetId: SHA, aspect: 1 } },
});

afterEach(() => {
  clearAssetCache();
  vi.unstubAllGlobals();
});

describe('hydrateStoryDoc', () => {
  it('replaces tokens in every frame with the resolved bytes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(new Blob([new Uint8Array([1])], { type: 'image/webp' }), { status: 200 })));

    const out = await hydrateStoryDoc(docWithToken());
    expect(out.frames[0].art).toMatch(/href="data:/);
    expect(out.frames[1].art).toMatch(/href="data:/);
    expect(out.frames[0].art).not.toContain('asset:logo');
  });

  it('fetches a shared asset once for the whole document', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Blob([new Uint8Array([1])], { type: 'image/webp' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await hydrateStoryDoc(docWithToken());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a document with no assets unchanged', async () => {
    const doc = { ...docWithToken(), assets: undefined };
    const out = await hydrateStoryDoc(doc);
    expect(out).toBe(doc);
  });

  it('leaves art intact when an asset fails to resolve', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })));
    const out = await hydrateStoryDoc(docWithToken());
    // A transparent pixel, not a broken document.
    expect(out.frames[0].art).toContain('data:image/png;base64,');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/services/storyApi.test.ts`
Expected: FAIL — `hydrateStoryDoc` is not exported.

- [ ] **Step 3: Add `hydrateStoryDoc`**

In `src/services/storyApi.ts`, add the imports and the function:

```ts
import { hydrateArt } from '@/story/artTokens';
import { resolveAssets } from '@/story/assetResolver';
import type { StoryDoc } from '@/story/storyDoc';

/**
 * Inlines every referenced asset into the document's art.
 *
 * Call once after loading and before anything rasterizes. The result is
 * render-only: its `art` strings carry full image payloads, so it must never
 * be written back to the draft, persisted, or published.
 *
 * @param doc — A validated document, freshly loaded.
 * @returns A copy whose frames' art is ready for `svgToTexture`. Documents
 *   with no assets — every hand-drawn era scene — are returned untouched.
 */
export async function hydrateStoryDoc(doc: StoryDoc): Promise<StoryDoc> {
  if (!doc.assets || Object.keys(doc.assets).length === 0) return doc;

  const resolved = await resolveAssets(doc.assets);
  return {
    ...doc,
    frames: doc.frames.map((f) => ({ ...f, art: hydrateArt(f.art, resolved) })),
  };
}
```

- [ ] **Step 4: Call it from the load path**

In `src/App.tsx`, extend the story-loading effect so the document is hydrated before it reaches the content store:

```tsx
  useEffect(() => {
    let cancelled = false;
    void loadStoryForLocation(window.location.search)
      .then(async (raw) => {
        if (cancelled || raw === null) return;
        // Validate first: hydration trusts assetId, and only the validator
        // guarantees it is a bare content address.
        const validated = validateStoryDoc(raw, DEFAULT_STORY);
        const hydrated = await hydrateStoryDoc(validated);
        if (cancelled) return;
        useContentStore.getState().load(hydrated);
        debugTelemetry.logEvent('story: loaded authored document');
      })
      .catch((err) => console.warn('Story load failed:', err));
    return () => {
      cancelled = true;
    };
  }, []);
```

Add the imports for `validateStoryDoc`, `DEFAULT_STORY`, and `hydrateStoryDoc`.

- [ ] **Step 5: Run the tests and verify they pass**

```bash
npx vitest run src/services/storyApi.test.ts
npm run type-check
npm run lint
npm run test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/storyApi.ts src/services/storyApi.test.ts src/App.tsx
git commit -m "feat(story): hydrate asset tokens before rasterization

Closes the loop: a fetched document's art carries tokens, which are replaced
with real bytes once, immediately after validation and before anything
rasterizes.

Validation runs first because hydration trusts assetId, and only the validator
guarantees it is a bare content address rather than something that could name
a host. The hydrated document is render-only and must never be persisted."
```

---

## Task 13: End-to-end verification

No new code. This is the gate that proves Plan A worked.

**Files:** none.

**Interfaces:**
- Consumes: everything above.
- Produces: a verified, shippable branch.

- [ ] **Step 1: Full green check**

```bash
npm run type-check
npm run lint
npm run test
cd server && npm test && cd ..
```

Expected: all pass. Frontend test count should be 131 + ~44 new.

- [ ] **Step 2: Confirm the hand-drawn eras are untouched**

```bash
grep -c "<image" src/story/era/*.svg
```

Expected: `0` for every file. The five shipped eras are pure SVG paths with no `<image>`, so they reference no assets and hydration returns them unchanged. **If any file reports a non-zero count, stop** — the shipping story mode is in scope after all and needs a device check before merging.

- [ ] **Step 3: Measure the actual document size reduction**

In the studio, create a story with one uploaded image used in three frames, then compare:

```js
// browser console, on /studio
const d = JSON.parse(localStorage.getItem('arcade.studio.draft'));
console.log('draft KB:', (JSON.stringify(d).length / 1024).toFixed(1));
console.log('assets:', d.assets);
```

Expected: single-digit KB, and every `assets` entry shows `assetId`, **no `href`**. Before this plan the same story would have been several MB. If any entry still carries an `href`, the upload path fell back to inlining and Task 8 is incomplete.

- [ ] **Step 4: Device check — hydrated art renders identically**

Publish the story, open `/?s=<id>` on a phone, and confirm the uploaded image appears in every frame that uses it.

**This is the step that cannot be unit-tested**, because restricted-mode behaviour only appears in a real image context. A blank or missing image here means hydration ran too late or not at all.

Also note the on-screen result of a worst-case frame (largest image, most references) — that is the observation feeding the `data:` URL size-ceiling risk in §14.2 of the design.

- [ ] **Step 5: Open the pull request**

```bash
git push -u origin feat/arcade-storage
gh pr create --draft --base main \
  --title "feat(storage): content-addressed assets, documents shrink MB to KB" \
  --body "Implements Phases 0-3 of docs/arcade-storage-aws-design.md. Publishing still targets Vercel Blob; moving it to S3 is Plan B."
```

---

## Deferred to Plan B (Phases 4–6)

Explicitly **not** in this plan, so nothing here should attempt them:

- Publishing the story artifact to S3 instead of Vercel Blob, with S3-before-RDS ordering.
- The `stories`, `markers`, and `story_markers` tables (§6 notes these are not load-bearing in v1).
- CloudFront, the three CORS requirements and their cold-cache acceptance test (§9), and per-prefix cache-control.
- The `/image-targets/*` Vercel rewrite (§14.1).
- Replacing the IAM user with Vercel OIDC federation (§2.2).
- The `asset_usage` table and reference-counted garbage collection (§7.4).
- The `r1024` display derivative (§5) — Plan A stores and reads `full.webp` only.
- **The `StoryAnchor` field (§8.1).** The design defines its shape so that adding
  it needs no migration, but nothing in Plan A or Plan B reads it — anchoring is
  its own spec, gated on device verification of the four unverified marker
  items. Adding an optional field no code consumes would be speculative; add it
  with the work that uses it.

## Spec coverage

Every section of `docs/arcade-storage-aws-design.md`, and where it lands:

| Spec section | Plan A | Plan B / later |
|---|---|---|
| §2.1 GIF rejection | Task 8b | — |
| §2.2 deployment shape | — | Plan B (CORS, rewrite, OIDC) |
| §5 S3 layout, `assets/` prefix | Task 4, Task 7 | `stories/`, `markers/`, `r1024` |
| §5.1 base URLs | `VITE_ASSET_BASE_URL`, Task 9 | `VITE_STORY_BASE_URL` |
| §6 schema | `story_assets`, Task 5 | `stories`, `asset_usage`, `markers` |
| §7.1 upload on drop | Task 8 | — |
| §7.2 conditional + checksum | Task 6 | — |
| §7.3 `committed` flag | Tasks 5, 7 | publish-time enforcement |
| §7.4 garbage collection | — | Plan B |
| §8.1 v4 schema | Task 3 | `StoryAnchor` (deferred above) |
| §8.2 no off-origin references | Task 3, Task 9 | — |
| §8.3 tokens in art | Tasks 1, 11 | — |
| §8.4 read path | Tasks 9, 12 | CDN in front |
| §8.5 v3 compatibility | Task 3, Task 9 | — |
| §8.6 blob-URL rasterizer | Task 10 | — |
| §9 CORS | — | Plan B |
| §10 security model | Tasks 3, 7, 9 | publish auth unchanged |
| §14.1 fingerprint rewrite | — | Plan B |
| §14.2 iOS size ceiling | Task 13 Step 4 (observation) | `r1024` mitigation |
