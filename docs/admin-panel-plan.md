# Admin Panel — Planning Document

**Status:** PLANNING ONLY — no implementation has started. Deliverable of the 2026-07-08 planning session.

**Goal:** a single-admin panel for the "THE GROUND REMEMBERS" WebAR experience (this repo, deployed on Vercel as `postarr`) that can (1) edit all user-facing text, (2) upload/replace/delete image assets, (3) assign assets to placement slots, and (4) publish changes to the live experience **without a redeploy**.

---

## 1. Code-review findings

### 1.1 Where user-facing text lives today

All of it is **hardcoded in the client bundle**. There is no datastore for text.

| Content | Location |
|---|---|
| The entire narrative: 5 eras (year, title, timeline label, docent line, wash color, particle motif) | `src/story/storyData.ts:41-87` (`STORY_ERAS`) |
| Intro card (title/subtitle) and outro card | `src/story/storyData.ts:90-99` (`STORY_INTRO`, `STORY_OUTRO`) |
| Scan prompts ("MOVE PHONE TO FIND THE GROUND", "TAP THE GROUND TO PLACE"), kicker ("DEMO EXPERIENCE"), nav buttons ("NEXT ›", "FINISH", "WALK IT AGAIN", "PLACE SOMEWHERE ELSE") | JSX literals in `src/components/story/StoryOverlay.tsx:59-142` |
| App title/subtitle/loading | `src/utils/constants.ts:38-42` (`UI_TEXT`) |
| Misc copy (unsupported-device panel, desktop mock, gallery, toasts, diagnostics) | scattered JSX literals across `src/App.tsx`, `src/components/ui/*` |

`storyData.ts` is deliberately pure data (no engine/DOM imports) — it is already shaped like a content document, which makes externalizing it cheap.

### 1.2 Where assets live and how they are referenced/positioned

Two very different asset paths exist:

**Story era art (the thing an admin would manage).** Five transparent pixel-art SVGs in `src/story/era/*.svg`, imported with Vite's `?raw` suffix (`src/story/eraArt.ts:14-18`) so they are **inlined into the JS bundle at build time** — changing one requires a rebuild + redeploy. At runtime each SVG is rasterized to a `CanvasTexture` (`src/story/svgTexture.ts`, longest axis 1024 px) and mapped onto a single ground-plane "diorama tile" (`src/xr8/storyTile.ts`, fixed width `TILE_WIDTH_M = 0.9` m, height from the art's aspect ratio).

**User-uploaded posters (already dynamic).** The repo already has a working presigned-upload backend: a Fastify API in `server/` (routes in `server/src/routes/assets.ts`) storing metadata in Postgres (`server/migrations/001_assets.sql`) and bytes in Supabase's S3-compatible storage (`server/src/config.ts`, `server/src/storage/objectStore.ts`). The client service is `src/services/posterApi.ts`; the gallery hydrates on boot (`src/App.tsx:136-143`). Persistence is feature-flagged off when `VITE_API_BASE_URL` is empty (`src/utils/constants.ts:51`). "Ownership" is a per-device localStorage token (`x-owner-id` header) — **this is identification, not authentication**.

**Positioning:** nothing has persistent world coordinates. The end user taps to plant the tile at the runtime reticle pose (`StoryARExperience.tsx` → `composeFlatPosterMatrix`); 8th Wall SLAM keeps it stable **within that session only**. There is no VPS/geo-anchoring.

### 1.3 What must change for no-redeploy edits

1. **Text:** move `STORY_ERAS`/`STORY_INTRO`/`STORY_OUTRO` + the overlay's HUD copy into a small JSON content document fetched at boot, with the current hardcoded values kept as a bundled fallback (offline/API-down resilience — same "degrade gracefully" principle the upload path already follows).
2. **Era art:** reference art by URL in that content document; the texture loader gains a "load image from URL → CanvasTexture" path beside the existing bundled-SVG path. Bundled SVGs remain the per-slot default/fallback.
3. **A write path + publish state:** an authenticated admin API that edits a draft document and publishes it; the public client only ever reads the published version.
4. **Nothing else.** CSP is already compatible (`connect-src 'self' https:`, `img-src 'self' data: blob: https:` in `vercel.json:34` and `public/_headers`), and the Vercel SPA rewrite already routes any path (e.g. `/admin`) to `index.html`.

### 1.4 Critique of the current storage/architecture choice

The session brief's assumption ("assets in S3, content hardcoded in components") is **half right**. Reality is a hybrid:

- **Content-in-TypeScript was the right call for what this was** — a code-driven demo with one author who redeploys anyway. It gives type safety, tests, and zero runtime failure modes. It only became wrong the moment "non-developer edits words" became a requirement — which is exactly now.
- **The asset backend is already the right architecture** (presigned PUT, metadata in Postgres, adapter-isolated storage/DB, graceful client fallback). It would be a mistake to introduce a CMS (Contentful/Sanity), a new BaaS, or Vercel Blob/Edge Config beside it: the repo already owns a Postgres + S3-compatible store and a typed API for exactly this shape of problem. The minimal viable move is to **extend this backend with one content table and a handful of admin routes**, not to add a service.
- **One genuine architectural doubt to resolve first (Open Question 1):** the Fastify server has a Dockerfile but no evidence in the repo of an actual production host, and there is no `.env` in the checkout — `VITE_API_BASE_URL` lives (or doesn't) only in Vercel project settings. If the API isn't actually deployed, running an always-on container *just for this* is the wrong cost profile; the same route logic (the `assetsRepo`/`objectStore` adapters are plain functions) should instead be mounted as Vercel serverless functions in the existing Vercel project, still talking to the same Supabase Postgres + storage. Either way the client-facing API surface below is identical.
- **Pre-existing defect the admin work will inherit:** `DELETE /api/assets/:id` deletes only the DB row (`server/src/routes/assets.ts:76-82`); the storage object is orphaned. Admin delete must fix this (Phase 3).

### 1.5 Requirements the code review contradicts (flags)

1. **"Visual in-browser scene editor" and "numeric transform fields" are both incoherent for this app.** There are no persistent world coordinates to edit — every placement is anchored to a runtime tap on whatever floor the visitor is standing on. The only placement model that means anything is **slot-based**: predefined anchor slots (today: the 5 era slots on the one diorama tile) into which the admin assigns art, plus scalar knobs like tile width. The plan below assumes slot-based placement.
2. **GLB / 3D models and audio are out of scope for v1.** The engine layer renders exactly one textured plane (`storyTile.ts`) and the poster planes; there is no model loader, no animation mixer, no audio system. Supporting GLB is a new engine subsystem, not an admin-panel feature. Supported types: **PNG, JPEG, WebP, GIF** — matching the server's existing allowlist.
3. **SVG uploads conflict with a deliberate security decision.** The upload allowlist excludes `image/svg+xml` specifically as a stored-XSS vector (comment at `server/src/routes/assets.ts:6-11`), yet the current era art *is* SVG. Recommendation: admin era-art uploads are **raster with alpha (PNG/WebP)** — visually equivalent at the tile's 1024 px raster size — and the bundled SVGs stay as defaults. (Alternative if vector is required: rasterize SVG client-side at upload time and store the PNG.)
4. **"There is currently no auth" is confirmed** — the `x-owner-id` device token is not auth and must not gate admin routes.

---

## 2. Proposed content data model and where it lives

One versioned JSON document ("content doc"), stored as **JSONB in the existing Postgres**, two rows: `draft` and `published`.

```sql
-- server/migrations/002_content.sql
create table if not exists content_docs (
  state      text primary key check (state in ('draft', 'published')),
  doc        jsonb not null,
  version    int not null,             -- monotonically increasing on publish
  updated_at timestamptz not null default now()
);
```

TypeScript shape (client + server share it; mirrors `storyData.ts` so migration is mechanical):

```ts
interface ContentDoc {
  schemaVersion: 1;
  intro: { kicker: string; title: string; subtitle: string };
  outro: { title: string; subtitle: string; replayLabel: string; resetLabel: string };
  eras: Array<{
    key: string;                  // stable slot id ('wreck' | 'oil' | ...)
    year: string; title: string; label: string; line: string;
    washColor: string;            // CSS color
    particle: 'rust' | 'oil' | 'ash' | 'pollen' | 'firefly';
    artAssetUrl: string | null;   // null → bundled default SVG for this slot
  }>;
  ui: {
    scanPrompt: string; tapPrompt: string;
    backLabel: string; nextLabel: string; finishLabel: string;
    loading: string;
  };
  settings: { tileWidthM: number };   // replaces TILE_WIDTH_M constant
}
```

Design decisions:

- **Slots are fixed at 5 eras for v1** (add/remove/reorder eras is deferred — it touches timeline layout, typewriter pacing, and era-keyed art fallbacks; see Open Question 4).
- Era art is referenced by URL inside the doc; the bytes live in the **existing Supabase storage bucket** under an `admin/` key prefix, metadata in the existing `assets` table with `owner_id = 'admin'`.
- The client validates the fetched doc (cheap structural check, unit-tested like `imageUpload` validation) and **falls back to the bundled `storyData.ts` values** on any failure — the experience can never be broken by a bad fetch, an empty DB, or a half-published doc.
- Colors/particles stay in the doc but get dropdown/palette editors, not free text.

## 3. Storage/architecture decision + alternatives rejected

**Decision: extend the existing backend (Postgres + Supabase storage + the presign pattern) with a content table and admin routes. Add zero new storage services.** The only open variable is where the API code *runs* (Open Question 1):

- **1a — Fastify server is already deployed:** add the routes to `server/` (smallest delta, code already structured for it).
- **1b — it is not deployed:** mount the same handlers as **Vercel serverless functions** (`api/` directory) inside the existing Vercel project, importing the same `assetsRepo`/`objectStore`/content-repo adapter modules. No new external service to operate, no always-on container. *Recommended if 1a is false.*

**Alternatives considered and rejected:**

| Alternative | Why rejected |
|---|---|
| Headless CMS (Sanity/Contentful/Strapi) | New vendor, new auth, new content model DSL, webhook/CDN complexity — for one editor and ~40 fields. Massive overweight. |
| Vercel Edge Config for the content doc | Read path is excellent, but writes go through the Vercel REST API with its own token management; asset bytes still need object storage; splits state across two systems when Postgres already holds asset metadata. |
| Vercel Blob for everything (doc + assets) | Duplicates the existing Supabase storage + `assets` table; two object stores to reason about; the repo's stated migration path (Supabase-now → AWS-later, `docs/superpowers/plans/2026-06-25-asset-persistence-phase1.md`) argues for keeping storage behind the existing adapter. |
| Supabase JS SDK / PostgREST + RLS directly from the admin panel | Violates the repo's explicit portability constraint ("data access via `pg` + S3 API only", same plan doc); RLS is multi-tenant machinery for a single-admin app. |
| JSON file in the repo, edited via GitHub API + redeploy | Simple, but every edit is a ~1-minute build — fails the core "no redeploy" requirement and makes preview awkward. |

**User-side performance guarantees (constraint from the brief):**

- The content doc is < 10 KB; fetched in parallel with the 8th Wall engine download (which dominates boot); bundled fallback means the fetch is never blocking.
- Published GET is CDN-cacheable: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` (visitors get edits within ~a minute; origin sees ~1 req/min).
- Era art: capped like posters (WebP/PNG, longest axis 2048 px), and the client **prefetches all 5 era images once the tile is placed** so era transitions stay instant (today's inlined SVGs are instant; remote art must not regress this).
- The admin panel ships as a **lazy-loaded chunk** behind a `location.pathname.startsWith('/admin')` branch in `main.tsx` — zero bytes added to the visitor bundle.

## 4. Admin panel routes/screens and API surface

### Screens (SPA under `/admin`, same Vite app, lazy chunk; desktop-oriented, no AR/engine code)

| Route | Screen |
|---|---|
| `/admin` | Login (password → token). All other screens redirect here without a valid token. |
| `/admin/story` | Story editor: intro/outro cards + 5 era cards (year, title, label, narration textarea with character count, wash-color picker, particle dropdown). |
| `/admin/art` | Art slots: 5 era slots showing current art (or "bundled default"), upload/replace (PNG/JPEG/WebP/GIF), "reset to default", delete. |
| `/admin/copy` | HUD/UI copy: scan prompts, nav button labels, loading text. |
| `/admin/settings` | `tileWidthM` slider (with sane bounds, e.g. 0.4–2.0 m). |
| Persistent header | **Preview** (opens the live experience with the draft doc) · **Publish** (confirm dialog, shows draft-vs-published field diff) · unsaved-changes indicator. |

### API surface

**Public (no auth, CDN-cached):**
- `GET /api/content` → `{ version, doc }` — the published doc. 404 until first publish (client falls back to bundled content).

**Admin (all under `Authorization: Bearer <token>`):**
- `POST /api/admin/login` `{ password }` → `{ token, expiresAt }` — rate-limited.
- `GET /api/admin/content` → `{ draft, published }` (draft seeded from published, or from defaults).
- `PUT /api/admin/content` `{ doc }` → save draft (server-side schema validation, 400 on mismatch).
- `POST /api/admin/content/publish` → copy draft → published, `version + 1`.
- `POST /api/admin/assets` → presign PUT (reuses the existing flow with `owner_id='admin'`, `admin/` key prefix, same content-type allowlist).
- `GET /api/admin/assets` → list admin assets.
- `DELETE /api/admin/assets/:id` → delete DB row **and** storage object (fixing the existing orphan bug for the admin path).

**Draft preview:** publish-gated flow (not immediate). The Preview button opens `/?preview=<short-lived signed token>`; the app fetches `GET /api/content?state=draft` with that token. Draft responses are `Cache-Control: no-store`.

## 5. Auth approach

Single-admin, deliberately minimal (per the brief — no RBAC, no user table):

- `ADMIN_PASSWORD` and `ADMIN_TOKEN_SECRET` as API env vars (Vercel/host env settings, never in the repo).
- Login compares password constant-time (`crypto.timingSafeEqual`), rate-limited (e.g. 5 attempts/min/IP), returns an HMAC-signed expiring token (~12 h) — stateless, no session store.
- Token kept in `sessionStorage` by the admin SPA; sent as `Bearer` on every admin call.
- Preview tokens: same HMAC scheme, shorter expiry (~15 min), scope-limited to draft reads.
- HTTPS is already enforced platform-wide.

## 6. Migration plan for existing hardcoded content

1. **Keep `storyData.ts` forever as the typed default/fallback** — it stops being the source of truth but remains the offline safety net (and the type definitions the ContentDoc schema derives from).
2. **Seed script** (`server/src/db/seedContent.ts` or a one-shot admin route): builds a ContentDoc from the bundled defaults (`artAssetUrl: null` everywhere) and inserts it as both draft and published. Idempotent — refuses to overwrite a newer version.
3. **Client content loader** (`src/services/contentApi.ts` + a small `contentStore`): fetch → validate → deep-merge over bundled defaults (missing/invalid fields fall back per-field, not all-or-nothing).
4. **Consumer rewiring, mechanical:** `StoryOverlay`, `storyStore`, `StoryARExperience`, `storyTile` read from the content store instead of importing `storyData` constants directly. `eraArt.ts` grows a `resolveEraArt(key, url)` that prefers the URL and falls back to the bundled SVG.
5. Copy explicitly **left hardcoded** (not visitor-facing story content): diagnostics/debug HUD, error boundary, desktop-mock instructions, unsupported-device panel, and the legacy `ARExperience` poster branch (retained but not the live path). See Open Question 3.

## 7. Phased implementation plan

Each phase is independently shippable and follows the repo's release workflow (type-check + tests green → PR → merge → Vercel deploy). Estimates assume the existing codebase conventions (vitest for pure logic, manual on-device AR testing).

| Phase | Scope | Effort (rough) |
|---|---|---|
| **0 — Infra confirmation (blocking)** | Resolve Open Question 1: check Vercel env for `VITE_API_BASE_URL`; confirm Supabase project + bucket exist; pick API host (1a extend Fastify / 1b Vercel functions). No product code. | ~0.5 day |
| **1 — Smallest end-to-end slice** | `content_docs` migration + seed; `GET /api/content`; `POST /api/admin/login`; `PUT` draft + publish for **one field (intro title)**; barebones `/admin` (login + one input + Publish); client loads intro title from published doc with fallback. **Exit test: change the intro title in the panel, reload the live URL on a phone, see the new title — no redeploy.** | 1.5–2 days |
| **2 — Full text model + draft/preview** | Complete ContentDoc schema (eras, outro, HUD copy, settings); story/copy/settings screens; draft-vs-published diff on Publish; signed preview links; client-side validation tests. | 2–3 days |
| **3 — Era art management** | `/admin/art` slots; presigned admin uploads (raster allowlist); URL→CanvasTexture loader with bundled-SVG fallback; prefetch-all-eras-on-place; DELETE that also removes the storage object. On-device AR verification of art swaps. | 2–3 days |
| **4 — Hardening + docs** | Rate limiting, cache-header tuning, `tileWidthM` bounds enforcement, admin-chunk size check, update `CLAUDE.md`/`ARCHITECTURE.md`/`TESTING.md`, post-deploy checklist. | 1–1.5 days |

Total: roughly **7–10 working days**, front-loaded so Phase 1 alone already delivers "edit words without a redeploy".

## 8. Open questions requiring your decision

1. **Is the Fastify API deployed anywhere today, and is `VITE_API_BASE_URL` set in the Vercel project?** Decides API hosting: extend `server/` (1a) vs. Vercel serverless functions over the same Supabase resources (1b, my recommendation if nothing is deployed). Nothing in the repo answers this.
2. **Publish model — confirm explicit draft → preview → publish** (assumed here, since this is a public installation and the brief's placeholder was unfilled). If you'd rather have edits go live immediately, Phase 2 shrinks by ~1 day and preview tokens disappear.
3. **Text scope:** is story + HUD copy (Section 6, item 5 exclusions) the right boundary, or must diagnostics/desktop-mock/unsupported-panel copy be editable too?
4. **Era count:** fixed 5 slots for v1 (assumed), or is add/remove/reorder eras a requirement? (Meaningful extra work: timeline UI, art-slot lifecycle, key management.)
5. **Era art format:** OK to require raster (PNG/WebP with alpha) for admin uploads, keeping bundled SVGs as defaults (my recommendation, per the XSS flag in §1.5)? Or do you need SVG upload (then: client-side rasterize-on-upload)?
6. **Auth:** is the single shared password + signed token approach acceptable, or do you want to piggyback on an existing provider (e.g. Vercel/GitHub OAuth)? The design assumes the former.
7. **GLB/audio:** confirmed out of scope for v1 (per §1.5 flag 2)?
