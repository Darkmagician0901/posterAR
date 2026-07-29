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
- **No agent runs `terraform apply`, touches an AWS console, or sets a secret.** Those are `docs/arcade-storage-ops-checklist.md`, performed by the repository owner.

## Execution Specification

| Role | Model | Effort | Responsibility |
|---|---|---|---|
| **Coordinator** | Opus 5 | max | Dispatch, review between tasks, resolve cross-task inconsistencies, own merges and any conflicted git operation |
| **Implementer** | Sonnet 5 | high | One task, fresh context, TDD steps as written |
| **Reviewer** | Sonnet 5 | high | Verify the task's tests actually failed before and pass after; check the diff against the task's `Interfaces` block |

**Task 0 is coordinator-only.** It is a merge with a known `CLAUDE.md` conflict; a
fresh subagent has no basis for judging which side of a conflict to keep.

**Do not dispatch a task whose prerequisite ops item is unconfirmed.** An
implementer without AWS access will stub the call or invent credentials, and
both look like progress in a diff.

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
| `src/services/assetApi.ts` | Presign + upload client; dedup and 412 handling. |
| `src/services/assetApi.test.ts` | Tests for the above. |
| `api/_s3.ts` | S3 client, `objectExists`, conditional presign. Vercel function helper. |
| `api/_s3.test.ts` | Tests for the above. |
| `api/story-assets.ts` | `POST /api/story-assets` — dedup check + presign. |
| `api/story-assets.test.ts` | Tests for the above. |
| `src/studio/assetGuard.ts` | Refuses animated GIFs as composed frame assets (§2.1). |
| `src/studio/assetGuard.test.ts` | Tests for the above. |
| `src/studio/composeImages.ts` | Adapter: document assets → `compose()`'s `ImageAsset` map. |
| `src/studio/composeImages.test.ts` | Tests for the above. |
| `src/studio/useResolvedAssets.ts` | Supplies resolved bytes to studio previews only. |

**Modified**

| File | Change |
|---|---|
| `src/story/storyDoc.ts` | v4 types; validator discriminates assets **by shape**, not by `schemaVersion`; `StoryAssetRef`. |
| `src/story/storyDoc.test.ts` | v3-still-works and v4 validation cases. |
| `src/story/svgTexture.ts` | Blob URL instead of percent-encoded data URL. |
| `src/story/props/compose.ts` | Doc comments only — the code already takes hrefs from the caller. |
| `src/services/storyApi.ts` | Hydrate assets after fetching a document. |
| `src/studio/StageEditor.tsx` | Guard uploads, upload on drop, compose via the adapter. |
| `src/studio/PhonePreview.tsx` | Resolve assets for the preview. |
| `src/App.tsx` | Hydrate the loaded document before it reaches the content store. |
| `src/vite-env.d.ts` | Declare `VITE_ASSET_BASE_URL`. |
| `vitest.config.ts` | Add `api/**/*.test.ts` to `include` so the function tests run. |
| `package.json` | Add `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@vercel/functions`. |

**Deliberately NOT modified**

| Path | Why |
|---|---|
| `server/**` | The Fastify server has no deployment target under §2.2, and v1 uses no database (§6). The poster asset path it serves keeps working untouched. Task 6 asserts this with a `git diff` check. |
| `infra/**` | Not on this branch — it exists only on `feat/marker-spaces-testbed`. Configured by hand: `docs/arcade-storage-ops-checklist.md` OPS-1 to OPS-4. |

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

## Task 4: Infrastructure — MOVED TO THE OPS CHECKLIST

**Do not attempt this task in code.** It is `docs/arcade-storage-ops-checklist.md`, items **OPS-1 through OPS-4**, and it is performed manually by the repository owner.

Two reasons:

1. **`infra/terraform/` does not exist on this branch.** It lives only on `feat/marker-spaces-testbed` (PR #40) — not on `main`, not on `feat/story-composition`. The integration branch built in Task 0 therefore has no Terraform to edit. Dragging PR #40 in would also drag in the entire marker testbed, which is out of scope for storage.
2. AWS provisioning, credentials, and console configuration are owned by the repository owner by explicit decision.

**What still gates this plan:** the bucket carries a lifecycle rule that expires **the whole bucket** after 90 days (`infra/terraform/s3.tf:86-103`, `filter {}`). Assets uploaded by Task 8 would be deleted three months later. **OPS-1 must be completed before Task 8 runs against a real bucket.** The exact HCL is in the checklist.

Tasks 5–7 (server code) are unaffected — `server/` **is** on `main` and is present on the integration branch.

- [ ] **Step 1: Confirm OPS-1 is done before proceeding past Task 7**

Ask the repository owner to confirm the lifecycle rule is scoped to `tmp/`. Until then, Tasks 5–7 may be built and unit-tested freely (they never touch a real bucket), but **do not run Task 8 against production AWS**.


---

## Task 5: S3 access for Vercel functions

> **Amended.** Tasks 5–7 originally built Fastify routes backed by a
> `story_assets` Postgres table. In the chosen deployment (§2.2) Fastify has no
> host, and a Vercel function cannot reach RDS — no stable egress address to
> allowlist, and `variables.tf` rightly refuses `0.0.0.0/0`. Rather than work
> around that, **v1 has no database** (§6): S3 answers existence with
> `HeadObject`, atomicity with `If-None-Match: *`, and the metadata was already
> in the document. Three tasks became two, and the `/commit` round trip
> disappeared entirely.

**Files:**
- Create: `api/_s3.ts`
- Test: `api/_s3.test.ts`

**Interfaces:**
- Consumes: env `S3_BUCKET`, `S3_REGION`, and either `AWS_ROLE_ARN` (OIDC) or a static key pair.
- Produces:
  - `BUCKET: string`
  - `getS3(): S3Client`
  - `objectExists(key: string): Promise<boolean>`
  - `presignPutConditional(key: string, contentType: string, sha256Base64: string): Promise<string>`

- [ ] **Step 1: Add the dependencies**

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner @vercel/functions
```

- [ ] **Step 2: Write the failing test**

Create `api/_s3.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';

beforeEach(() => {
  process.env.S3_BUCKET = 'test-bucket';
  process.env.S3_REGION = 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
  process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  delete process.env.AWS_ROLE_ARN;
});

describe('presignPutConditional', () => {
  it('signs both the conditional and the checksum headers', async () => {
    const { presignPutConditional } = await import('./_s3');
    const url = await presignPutConditional(
      'assets/abc/full.webp',
      'image/webp',
      '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
    );
    const signed = decodeURIComponent(new URL(url).searchParams.get('X-Amz-SignedHeaders') ?? '');
    // Both must be SIGNED, not merely sent: an unsigned header can be dropped
    // or altered by the client, which defeats both guarantees.
    expect(signed).toContain('if-none-match');
    expect(signed).toContain('x-amz-checksum-sha256');
  });

  it('targets the configured bucket', async () => {
    const { presignPutConditional } = await import('./_s3');
    const url = await presignPutConditional('assets/abc/full.webp', 'image/webp', 'zz');
    expect(url).toContain('test-bucket');
  });
});
```

- [ ] **Step 3: Run it and verify it fails**

Run: `npx vitest run api/_s3.test.ts`

Expected: FAIL — module not found. If vitest does not collect the file at all,
add `api/**/*.test.ts` to `include` in `vitest.config.ts`; that is part of this
step, not a workaround.

- [ ] **Step 4: Write the module**

Create `api/_s3.ts`:

```ts
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
 *   "missing" — publish uses this to decide whether a document is safe.
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
  return getSignedUrl(getS3(), cmd, {
    expiresIn: 300,
    signableHeaders: new Set(['if-none-match', 'x-amz-checksum-sha256']),
  });
}
```

- [ ] **Step 5: Run it and verify it passes**

Run: `npx vitest run api/_s3.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
git add api/_s3.ts api/_s3.test.ts package.json package-lock.json vitest.config.ts
git commit -m "feat(storage): S3 access helper for Vercel functions

S3 is the whole storage layer for v1 — there is no database. An object's
existence is the record that it uploaded, and because the key is the content
hash, existence means those exact bytes are stored.

If-None-Match: * makes the write conditional so concurrent uploads of identical
bytes cannot clobber a completed object; S3 answers 412, which the client
treats as a successful dedup. x-amz-checksum-sha256 stops a dishonest client
storing bytes X under the key SHA256(Y), which would poison that address for
every story because dedup is global. Both headers are signed.

objectExists treats only a 404 as absent and rethrows everything else: 'we
could not tell' must never be reported as 'missing'."
```

---

## Task 6: FOLDED INTO TASK 5

**Do not implement this task.** `presignPutConditional` originally lived in
`server/src/storage/objectStore.ts` and is now part of `api/_s3.ts` (Task 5),
because the Fastify server has no deployment target under §2.2.

`server/` is otherwise untouched by this plan — the poster asset path continues
to work exactly as it does today.

- [ ] **Step 1: Confirm no server changes were made**

```bash
git diff --stat origin/main -- server/
```

Expected: **empty.** Plan A must not modify `server/`. If it does, work
intended for Task 5 landed in the wrong place.

---

## Task 7: The presign endpoint

**Files:**
- Create: `api/story-assets.ts`
- Test: `api/story-assets.test.ts`

**Interfaces:**
- Consumes: `objectExists`, `presignPutConditional`, `BUCKET` (Task 5).
- Produces: `POST /api/story-assets` → `200 { exists: true }` or `201 { exists: false, uploadUrl, requiredHeaders }`

**There is no commit endpoint.** The object's existence *is* the commit.

- [ ] **Step 1: Write the failing tests**

Create `api/story-assets.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const present = new Set<string>();
const presigned: string[] = [];

vi.mock('./_s3', () => ({
  BUCKET: 'test-bucket',
  async objectExists(key: string) {
    return present.has(key);
  },
  async presignPutConditional(key: string) {
    presigned.push(key);
    return `https://store.example/${key}?X-Amz-Signature=abc`;
  },
}));

const SHA = 'a'.repeat(64);

const body = {
  sha256: SHA,
  sha256Base64: 'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=',
  contentType: 'image/webp',
};

async function post(payload: unknown) {
  const { default: handler } = await import('./story-assets');
  return handler(
    new Request('https://x/api/story-assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

beforeEach(() => {
  present.clear();
  presigned.length = 0;
  process.env.S3_BUCKET = 'test-bucket';
  vi.resetModules();
});

describe('POST /api/story-assets', () => {
  it('issues a conditional upload URL for unseen bytes', async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.exists).toBe(false);
    expect(json.uploadUrl).toContain(`assets/${SHA}/full.webp`);
    expect(json.requiredHeaders['If-None-Match']).toBe('*');
    expect(json.requiredHeaders['x-amz-checksum-sha256']).toBe(body.sha256Base64);
  });

  // The dedup win: the bytes are already stored, so there is nothing to upload
  // and — with no database — nothing to record either.
  it('reports a dedup hit without presigning anything', async () => {
    present.add(`assets/${SHA}/full.webp`);
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ exists: true });
    expect(presigned).toHaveLength(0);
  });

  it('rejects a sha256 that is not 64 lowercase hex', async () => {
    expect((await post({ ...body, sha256: 'nope' })).status).toBe(400);
    expect((await post({ ...body, sha256: 'A'.repeat(64) })).status).toBe(400);
  });

  // An SVG served from the bucket origin would be active content.
  it('rejects a content type outside the allowlist', async () => {
    expect((await post({ ...body, contentType: 'image/svg+xml' })).status).toBe(400);
    expect((await post({ ...body, contentType: 'text/html' })).status).toBe(400);
  });

  it('rejects a body that is not an object', async () => {
    expect((await post('nope')).status).toBe(400);
  });

  it('503s when the bucket is not configured', async () => {
    delete process.env.S3_BUCKET;
    vi.resetModules();
    expect((await post(body)).status).toBe(503);
  });

  it('rejects a non-POST method', async () => {
    const { default: handler } = await import('./story-assets');
    const res = await handler(new Request('https://x/api/story-assets', { method: 'GET' }));
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run api/story-assets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the endpoint**

Create `api/story-assets.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run api/story-assets.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Verify the whole suite**

```bash
npm run type-check && npm run lint && npm run test
```

- [ ] **Step 6: Commit**

```bash
git add api/story-assets.ts api/story-assets.test.ts
git commit -m "feat(storage): presign endpoint for content-addressed assets

Because the key is the SHA-256 of the bytes, 'have I seen these bytes?' is a
HeadObject rather than a database query — a certainty rather than a heuristic.
The endpoint holds no state of its own, so there is no commit endpoint and no
row to reconcile.

image/svg+xml stays off the allowlist: an SVG served from the public bucket
origin is active content and therefore a stored-XSS vector."
```

---

## Task 8: Client — upload on drop

**Files:**
- Create: `src/services/assetApi.ts`
- Test: `src/services/assetApi.test.ts`

**Interfaces:**
- Consumes: `sha256Hex`, `hexToBase64` (Task 2); `API_BASE_URL`.
- Produces:
  - `AssetContentType = 'image/webp' | 'image/gif' | 'image/png' | 'image/jpeg'`
  - `uploadStoryAsset(blob: Blob, contentType: AssetContentType): Promise<string>` — resolves to the assetId

Note the shape: **no owner header and no metadata**. With no database there is
nothing to attribute a row to, and the dimensions and filename the old design
sent were already carried in the document's `StoryAssetRef`.

- [ ] **Step 1: Write the failing test**

Create `src/services/assetApi.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { uploadStoryAsset } from './assetApi';

const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadStoryAsset', () => {
  it('returns the content address without uploading on a dedup hit', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ exists: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const id = await uploadStoryAsset(blob(), 'image/webp');
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    // One call only: the presign request. Nothing is uploaded, and there is no
    // commit step to follow it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uploads with the exact headers the server requires', async () => {
    let putInit: RequestInit | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/story-assets')) {
        return new Response(
          JSON.stringify({
            exists: false,
            uploadUrl: 'https://store.example/assets/x/full.webp',
            requiredHeaders: { 'If-None-Match': '*', 'x-amz-checksum-sha256': 'zz' },
          }),
          { status: 201 },
        );
      }
      putInit = init;
      return new Response(null, { status: 200 });
    }));

    await uploadStoryAsset(blob(), 'image/webp');
    expect(putInit?.method).toBe('PUT');
    // The headers are SIGNED, so dropping one produces a signature mismatch.
    expect((putInit?.headers as Record<string, string>)['If-None-Match']).toBe('*');
    expect((putInit?.headers as Record<string, string>)['x-amz-checksum-sha256']).toBe('zz');
  });

  // S3 answers 412 when If-None-Match rejects the write because the object
  // already exists — a race with another uploader of identical bytes. The
  // bytes we wanted are there, so this is success.
  it('treats a 412 from S3 as success', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/story-assets')) {
        return new Response(
          JSON.stringify({ exists: false, uploadUrl: 'https://store.example/x', requiredHeaders: {} }),
          { status: 201 },
        );
      }
      return new Response(null, { status: 412 });
    }));

    await expect(uploadStoryAsset(blob(), 'image/webp')).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  it('throws with the status when the upload genuinely fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/story-assets')) {
        return new Response(
          JSON.stringify({ exists: false, uploadUrl: 'https://store.example/x', requiredHeaders: {} }),
          { status: 201 },
        );
      }
      return new Response(null, { status: 500 });
    }));

    await expect(uploadStoryAsset(blob(), 'image/webp')).rejects.toThrow(/500/);
  });

  it('throws when the presign request is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 400 })));
    await expect(uploadStoryAsset(blob(), 'image/webp')).rejects.toThrow(/400/);
  });

  it('produces the same id for identical bytes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ exists: true }), { status: 200 })));
    const a = await uploadStoryAsset(blob(), 'image/webp');
    const b = await uploadStoryAsset(blob(), 'image/webp');
    expect(a).toBe(b);
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
 * There is no commit step and no owner header. The asset's identity is the
 * SHA-256 of its bytes, so storing it is idempotent and the stored object is
 * itself the record that it happened — no row to write, nothing to reconcile.
 */

import { API_BASE_URL } from '@/utils/constants';
import { hexToBase64, sha256Hex } from '@/story/assetHash';

/** Upload types the server accepts. Mirrors the server-side allowlist. */
export type AssetContentType = 'image/webp' | 'image/gif' | 'image/png' | 'image/jpeg';

interface PresignResponse {
  exists: boolean;
  uploadUrl?: string;
  requiredHeaders?: Record<string, string>;
}

/**
 * Stores an asset and returns its content address.
 *
 * @param blob — The canonical bytes to store, after compression.
 * @param contentType — MIME type of those bytes.
 * @returns The assetId (SHA-256 hex) to record in the document.
 * @throws When the presign or upload fails for any reason other than the
 *   object already existing.
 */
export async function uploadStoryAsset(
  blob: Blob,
  contentType: AssetContentType,
): Promise<string> {
  const sha256 = await sha256Hex(await blob.arrayBuffer());

  const presignRes = await fetch(`${API_BASE_URL}/api/story-assets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sha256, sha256Base64: hexToBase64(sha256), contentType }),
  });
  if (!presignRes.ok) throw new Error(`presign failed: ${presignRes.status}`);

  const presign = (await presignRes.json()) as PresignResponse;
  // Already stored. Content addressing makes this a certainty rather than a
  // guess, so there is nothing to upload.
  if (presign.exists) return sha256;

  if (!presign.uploadUrl) throw new Error('presign returned no upload URL');

  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    // Sent verbatim: these headers are part of the signature, so altering or
    // dropping one produces a mismatch rather than a silent success.
    headers: presign.requiredHeaders ?? {},
    body: blob,
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

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/services/assetApi.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/assetApi.ts src/services/assetApi.test.ts
git commit -m "feat(upload): content-addressed asset upload on drop

Uploads happen when a file lands, not at publish time, which is what keeps
base64 out of the draft — the document holds only an assetId from the first
instant.

No commit step and no owner header: the asset's identity is the hash of its
bytes, so storing it is idempotent and the stored object is itself the record
that it happened. A 412 means If-None-Match rejected the write because the
object already exists, so those bytes are stored and that path succeeds."
```

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
  assetId = await uploadStoryAsset(blob, processed.mimeType as AssetContentType);
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

Expected: all pass, and **no pre-existing test regresses**. Roughly 65 tests
are added across this plan; the exact figure is not a target — a count that
drifts becomes a false failure signal. What matters is that nothing that passed
before now fails.

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
- Garbage collection (§7.4) — reachability derived by reading `stories/*.json`.
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
| §6 schema | **No database in v1** — S3 is the register (§7.3) | Whole schema, when a management UI exists |
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
