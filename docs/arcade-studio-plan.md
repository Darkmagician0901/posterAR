# ARCADE STUDIO — Design

**Status:** Draft for review — 2026-07-21
**Supersedes:** `docs/admin-panel-plan.md` (the `/admin` text-editor direction and its Phase 2 backend)
**Prototype:** `docs/prototypes/arcade-studio-v4.html`

## The constraint that drives everything

The phone experience does not change. Not the tap-to-place flow, not the HUD, not the
diorama tile, not the visual result. ARCADE STUDIO is a desktop authoring surface that
produces exactly the asset the shipped viewer already consumes. Where the prototype and
the viewer disagree, **the studio bends.**

## What the era art actually is (verified 2026-07-21)

`src/story/eraArt.ts:4` claims today's art is "the exact output of the design prototype's
scene builders." **That claim is false and should be corrected in the source comment.**
Measured contents:

| File | viewBox | Builder output present | Reality |
|---|---|---|---|
| `heal.svg` | 330×175 | 3 sunflowers, 6 leaves, 6 seed textures | Builder props + hand-drawn light-ray gradient |
| `alive.svg` | 330×175 | 6 leaves, 1 car body | Part builder, part hand-drawn |
| `wreck.svg` | 330×168 | 2 car bodies | Mostly hand-drawn |
| `toxic.svg` | 330×168 | fence mesh pattern only | Mostly hand-drawn |
| `oil.svg` | 330×168 | none | Entirely hand-authored |

The viewBoxes disagree, so these did not come off one pipeline. Some props were generated
by the builders and pasted into scenes composed and enriched by hand.

**Consequences.** The shipped story's art is preserved by *reference*, not regeneration:
its `StoryDoc` carries the committed SVGs verbatim as `art` with no `props`. That is what
guarantees zero visible change. There is no byte-for-byte regeneration test, because
regeneration would not reproduce these files.

## The animation defect (separate from this work)

The era SVGs reference 16 animation classes — `a-sway`, `a-ripple`, `a-drip`, `a-flutter`,
`a-twinkle`, `a-absorb`, `a-mote`, `a-spore` and others. **None of those keyframes are
defined anywhere.** There is no `<style>` block inside any era SVG and no `a-*` keyframes
in `src/`. Independently, `svgToTexture` rasterizes once via `drawImage`
(`svgTexture.ts:83`) and `storyTile` never re-rasterizes, so even defined keyframes would
render frozen at t=0.

The art was authored for motion that never plays. The prototype animates it correctly
because it renders live DOM, which means the studio's preview is currently a *better*
experience than production.

Not in scope here. Tracked because the fix has an obvious home: the repo already ships a
complete animated-texture pipeline for GIFs (`gifAnimator`, `gifPlayhead`,
`posterTextureCache`), so publish-time frame rendering could drive era art through it.

**The fidelity target for authored stories is therefore static composition richness.**

```
prop builders (shared)
   ├─→ studio stage editor      (live preview while authoring)
   └─→ publish-time composition (one SVG per frame)
                                      ↓
                          StoryDoc JSON  ──→ Vercel Blob
                                      ↓
                          contentStore (fetch + validate + fall back)
                                      ↓
              svgTexture → CanvasTexture → storyTile   ← UNCHANGED
```

## Reconciliation: prototype → shipped viewer

| Prototype feature | Fate | Reason |
|---|---|---|
| Frames rail, inspector, narration editor | Kept | Maps 1:1 to the viewer's era model |
| Stage editor, prop library, drag positioning | Kept | It is the era-art generator for new stories |
| — | **Added: backdrop layer** | `oil.svg` is ~90% full-frame background; no prototype equivalent |
| — | **Added: library set-pieces from shipped art** | Makes flagship fidelity reachable by construction |
| — | **Added: explicit layer order** | Shipped scenes layer deliberately, not by depth sort |
| Top-down map | Kept, re-scoped | Becomes a depth/scale layout aid, not world placement |
| Publish checks, stats, link | Kept | |
| Marker width / wall vs ground / mount height | **Cut** | No image-target runtime; `pipeline.ts:285` configures world tracking only |
| Per-frame audio + TTS + rate | **Cut** | Zero audio subsystem in `src/`; adding it changes the visitor experience |
| Wash color per frame | **Added** | Viewer renders it (`StoryOverlay.tsx:48`); studio had no control |
| `particle` field | **Dropped from schema** | Declared at `storyData.ts:37`, referenced nowhere |

Cut features stay in the vendored prototype for future reference; they are not deleted
from the design space, only from v1.

## Data model

One document, versioned, superseding both the prototype's `arcade:2` export and the
`feat/admin-panel-ui` branch's `ContentDoc`:

```ts
interface StoryDoc {
  schemaVersion: 3;
  id: string;                 // short slug+hash, the published identity
  title: string;
  loc: string;
  intro: { title: string; subtitle: string };
  outro: { title: string; subtitle: string };
  frames: Array<{
    key: string;              // stable id; replaces the fixed EraKey union
    year: string;             // "1951" … "TODAY"
    label: string;            // timeline stop label
    title: string;
    line: string;             // docent narration
    washColor: string;        // CSS color for the era vignette
    props: Array<{
      t: 'lib' | 'img';       // library builder or uploaded image
      k: string;              // builder key or asset id
      x: number; z: number;   // layout position, metres
      h: number;              // height, metres
      f: boolean;             // horizontal flip
      e: number;              // elevation above ground, metres
    }>;
    art?: string;             // composed SVG, filled at publish time
    audio?: never;            // reserved — see Resolved decisions
  }>;
}
```

`frames[].props` is the authored source; `frames[].art` is the derived artefact. The
viewer reads only `art` — it never runs a builder. Keeping `props` in the doc makes a
published story re-editable.

**Frame count becomes variable.** `StoryOverlay.tsx:112` already maps over the era array,
so N stops render without a code change; only the timeline CSS needs a check at higher
counts. `storyStore` loses its `STORY_ERAS` import (`storyStore.ts:15`) and reads length
from the content store.

## Storage

**Vercel Blob**, one integration, one token. The published doc is a few KB because props
are references; even with composed SVGs inlined a five-frame story is well under 100 KB.

Rejected: the plan doc's Postgres + Supabase S3 design. It requires seven env vars and two
provisioned services (`server/src/config.ts:4-10`), none of which are live —
`API_BASE_URL` defaults to `''`, so persistence is currently off entirely. That
architecture is right for user-uploaded poster bytes at volume; it is wrong for moving a
3 KB document.

The existing `server/` asset pipeline stays untouched and unused by this feature. It
becomes relevant again in Phase 4 (custom image uploads).

**External dependency you must provision:** a Vercel Blob store on the `postarr` project,
which sets `BLOB_READ_WRITE_TOKEN`. Everything else I can build and test without it, using
a local filesystem adapter behind the same interface.

## Routing and delivery

- Studio at `/studio`, a lazy chunk gated on desktop, mirroring how the branch gates
  `/admin`. Zero bytes added to the visitor bundle.
- Visitor URL is `/?s=<id>`. No `?s` → the bundled default story, so the current
  production URL keeps working exactly as it does today.
- Publish emits the link plus a printable **QR poster** — reusing `scripts/generate-qr.js`
  — in the slot where the prototype drew the metric marker. Same UI shape, honest meaning.

## Fallback behaviour

The viewer can never be broken by a bad fetch. `contentStore` validates the fetched doc
structurally and falls back **per-field** to the bundled `storyData.ts` values, which stay
in the repo permanently as the typed default. Empty store, malformed JSON, network
failure, half-written publish — all degrade to today's shipped story.

## Phasing

Each phase is independently shippable, type-check and tests green, PR into `main`.

| Phase | Scope | Exit test |
|---|---|---|
| **1 — Schema + viewer rewiring** | `StoryDoc` schema + validator; bundled default carrying the committed SVGs verbatim; `contentStore` with per-field fallback; viewer reads the store instead of `storyData` constants | Production story renders pixel-identically on device; the default doc's `art` strings are byte-equal to `story/era/*.svg` |
| **2 — Composition engine + library** | Prototype builders extracted to `src/story/props/` as pure functions; backdrop layer; ~15–20 set-pieces mined from the shipped SVGs; layer ordering; `composeFrame(props, backdrop) → SVG` | Compose a frame matching `heal.svg`'s density and diff it against the original by eye on device |
| **3 — Studio UI** | `/studio` chunk: frames rail, inspector, stage editor, prop + backdrop pickers, live phone preview, wash-color control; custom image upload; draft in `localStorage` with autosave + undo | Author a 3-frame story on desktop at flagship density |
| **4 — Publish** | Vercel Blob adapter; `POST /api/publish` with the secret check; `/?s=<id>` load path; link + QR poster; publish checks | Author on desktop, hit Publish, scan the QR on a phone, walk the story — no redeploy |
| **5 — Hardening** | Rate limiting, cache headers, chunk-size check, `eraArt.ts` comment correction, docs | |

Phase 1 ships with **no user-visible change at all** — that is the point. It proves the
pipeline before any authoring exists.

Custom image upload moved from the old Phase 4 into Phase 3: the shipped scenes prove that
library props alone cannot reach flagship fidelity, so uploads are core, not a follow-up.

## Disposition of `feat/admin-panel-ui`

The branch's editor UI is superseded by the studio. Three pieces are worth salvaging and
should be cherry-picked rather than rewritten:

- `src/store/contentStore.ts` — the fetch/validate/fallback store, reshaped for `StoryDoc`
- `src/admin/adminDraftStore.ts` — `localStorage` draft with autosave
- The viewer rewiring in `StoryOverlay` / `StoryARExperience` / `storyTile` that reads
  content from a store instead of importing constants

The branch's `ContentDoc` (fixed 5 eras, `washColor` + `particle`, no props) is replaced
by `StoryDoc`. Its `vercel.json` `cleanUrls` fix is still needed — the SPA rewrite that
serves `/admin` is the same one that will serve `/studio`.

## Testing

Follows the repo's existing split: pure logic unit-tested with vitest, engine and canvas
behaviour verified on device.

- Prop builders: snapshot the SVG output; assert the regenerated era SVGs match the
  committed `story/era/*.svg` byte-for-byte (this is the guarantee that the viewer's
  appearance is unchanged)
- `StoryDoc` validator: malformed, partial, wrong-version, and hostile inputs all fall
  back per-field
- Composition: props → SVG produces a parseable document with the expected viewBox
- Publish: blob adapter contract, against the local filesystem adapter
- On device: the Phase 1 and Phase 3 exit tests above

## Resolved decisions (2026-07-21)

**Audio — cut from v1, reinstatable without migration.** `frames[].audio` stays reserved
in the schema so adding it later is additive rather than a version bump. When it returns
it needs an audio subsystem in the viewer (playback, preload) plus one design constraint:
iOS Safari will not start audio without a user gesture, so narration must begin on a tap —
the intro "BEGIN" button or the first NEXT — never automatically on era change. The
prototype's per-frame `auto` flag needs that qualifier when revived.

**Multi-story — one story at a time for v1.** The schema keys by `id` so multiple stories
are representable, but no browser, list, or management UI ships. Publishing overwrites the
single current story.

**Auth — server-checked secret on the write path.**

The asset being protected is the live exhibit, so the gate belongs on the write, not the
route:

- `POST /api/publish` requires `Authorization: Bearer <secret>`, compared with
  `crypto.timingSafeEqual` against `STUDIO_PUBLISH_SECRET` — a server-only env var, never
  in the client bundle. Rate-limited per IP.
- The studio prompts for the secret once per session and holds it in `sessionStorage`.
- `/studio` gets a light client-side gate for UX only. This is **not** a security control
  and must not be described as one. The `feat/admin-panel-ui` branch's
  `VITE_ADMIN_PASSPHRASE` failed precisely here: a `VITE_`-prefixed var is inlined into
  the bundle at build time and is readable by anyone.
- The public read path (`/?s=<id>`) stays unauthenticated by design.

No JWTs, no session store, no expiry. One endpoint, one secret, one constant-time compare.

A second constraint forces the same shape: `BLOB_READ_WRITE_TOKEN` must never reach the
browser, so publishing has to route through a serverless function that holds it. The auth
check rides on an endpoint that must exist regardless.
