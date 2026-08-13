# CLAUDE.md — xr-poster

Quick reference for Claude Code sessions. See README.md / ARCHITECTURE.md / TESTING.md for depth, and FRONTEND_INTEGRATION.md for the UI/designer handoff surface (stores, hooks, components).

## Commands

```bash
npm run dev           # Vite dev server — HTTPS, --host (required for camera + 8th Wall)
npm run test          # vitest run — 407 tests, < 3 s
npm run test:watch    # vitest interactive watch
npm run type-check    # tsc --noEmit
npm run lint          # eslint src server/src
npm run build         # tsc && vite build → dist/
```

## Architecture

`App.tsx` is a 3-branch root:

| Condition | Branch |
|-----------|--------|
| Mobile + secure context (`hasAR8`) | `StoryARExperience` — live 8th Wall AR |
| Desktop | `DesktopMockMode` — webcam + mouse-look sandbox |
| Otherwise | "AR Not Supported" panel |

`StoryARExperience` is a 5-era "THE GROUND REMEMBERS" story/diorama mode — it's what ships. `ARExperience` still exists but is retained legacy (unused, not wired into `App.tsx`).

On the live path **8th Wall (XR8) owns** the canvas, camera feed, three.js renderer, and render loop. The app registers a custom camera-pipeline module (`onStart` / `onUpdate`) that builds the scene, runs a center-screen hit-test every frame, drives the reticle, and places poster meshes on tap.

- `src/xr/` — engine-AGNOSTIC 3D helpers (reticle, debugTelemetry, desktopMockDriver, posterOrientation)
- `src/xr8/` — 8th Wall (XR8)-SPECIFIC integration (pipeline, hitTestController, posterPlacement, ambientProbe, canvasScreenshot, gifAnimator, gifPlayhead, posterTextureCache, storyTile)

State: **Zustand 4** — `contentStore` (*what* the story is: the active `StoryDoc`), `storyStore` (*where in it* the visitor stands: phase + frame index), `posterStore` (placed + uploaded posters), `useUIState` (overlays, toasts).

## Story content

The story is data, not constants. `src/story/storyDoc.ts` defines `StoryDoc` (frames, copy, per-frame `art` SVG + optional authored `props`) and a validator that falls back **per field**. `src/story/defaultStory.ts` derives the shipped story from `storyData.ts` + the committed `era/*.svg`, carried **verbatim** — that is what guarantees the visitor experience is unchanged. `storyData.ts` and `era/*.svg` stay permanently as the typed default and offline fallback.

The era SVGs are hand-composed, **not** regenerable from prop builders, and their animation classes have no keyframes so the art is static in AR. See `docs/arcade-studio-plan.md`.

## GIF Pipeline

```
gifDecode.ts  →  gifPlayhead.ts  →  gifAnimator.ts  →  CanvasTexture (three.js)
                                                           ↑
                                          posterTextureCache.ts
                                          (refcounts shared animators;
                                           enforces memory budget;
                                           graceful static fallback on decode failure)
```

GIFs are decoded from data: URLs without fetch. `posterTextureCache` releases acquired textures on the placement error path.

## Gotchas

- **GIFs must stay GIFs.** They are uploaded uncompressed (max 8 MB) and decoded per-frame to a `CanvasTexture`. Never flatten a GIF to WebP — that collapses all frames to one.
- **Non-GIF images** are compressed client-side to WebP (≤ 2 MB wire, longest axis ≤ 2048 px, input cap 50 MB).
- **Screenshots on live AR can be blank.** The XR8 canvas has no `preserveDrawingBuffer`; `canvas.toDataURL()` outside the render loop reads an empty frame. Desktop mock is unaffected.
- **No move/pinch/twist gestures.** Interaction is tap-to-place + **scale & rotation sliders** (on the auto-selected poster) + delete. The old gesture stack (`@use-gesture/*`) was removed in the 8th Wall migration.
- **Placed posters are ambient-tinted.** `ambientProbe` samples the camera feed (no native 8th Wall light estimation) and multiplies an approximate room color into each poster's material; posters also honor PNG/GIF alpha. Pure math (`estimateAmbient`) is unit-tested; engine wiring reads `XR8.CameraPixelArray`.
- **The SPA rewrite must use AWS's extension-excluding regex, not a bare `/<*>` catch-all.** The working configuration (verified end-to-end 2026-08-13) is exactly two rules, in this order:
  1. `/api/<*>` → `https://<function-url>/api/<*>` at status **200** — no slash between `.on.aws` and `/api/`, or the router receives `//api/...` and 404s.
  2. `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>` → `/index.html` at status **200** — [AWS's documented SPA rule](https://docs.aws.amazon.com/amplify/latest/userguide/redirect-rewrite-examples.html). Keep `webp` in that list; uploaded images are WebP.

  Why not the simpler forms: a bare `/<*>` → `/index.html` at **200** rewrites unconditionally and swallows `/assets/*.js`, so every script returns `index.html` and the app dies with a MIME-type error. At **404-200** it doesn't swallow assets, but extensionless routes still break — Amplify's clean-URL handling runs first, redirecting `/studio` → `/studio/`, looking for `/studio/index.html`, and returning **HTTP 404** with the app's HTML as the body. The regex sidesteps both by matching extensionless paths directly. Order matters separately: the catch-all first swallows every API call and returns `index.html` to a caller expecting JSON. Both rules live in the Amplify console, not in the repo — read them back with `aws amplify get-app --app-id <id> --query "app.customRules"`. (The same class of bug bit this project before, via `cleanUrls` on the previous host.)
- **A bad deploy poisons `/assets/` URLs for a year, and redeploying does NOT fix it.** `customHttp.yml` marks them `immutable, max-age=31536000` — correct, because Vite hashes filenames by content. But `immutable` tells browsers not to revalidate even on reload, so if the server ever answers one of those URLs with wrong content, that response sticks. Unchanged source rebuilds to the same hash, so the fix requests the same poisoned URL. There is no remote cure for a visitor's phone. **Verify a deploy by content type, not by whether a page appears** — `curl -o /dev/null -w "%{content_type}" <origin>/assets/<hashed>.js` must say `text/javascript` — and do it before sharing the URL or printing a QR code. Locally, Ctrl+Shift+R or DevTools → Application → Clear site data.
- **The Lambda function URL's auth type must be `NONE`.** `AWS_IAM` is the console default, and Amplify's rewrite cannot SigV4-sign, so the proxy gets `403 {"Message":null}` from the origin. Also: the target must have no slash between the function URL and `/api/`, or the router receives `//api/...` and 404s.
- **CSP:** `script-src` must allow `https://cdn.jsdelivr.net`. Amplify serves headers from **`customHttp.yml`** — it ignores `public/_headers`, which is retained only for Cloudflare/Docker.
- **engine-binary intentionally has no SRI hash.** Its loader fetches runtime chunks (e.g. `slam.js`) dynamically; a static hash can't cover them. Documented inline in `index.html`.
- **HTTPS (or localhost) required** for camera access and the 8th Wall engine.
- **8th Wall cannot detect walls (vertical surfaces).** World tracking detects only one horizontal ground plane; DETECTED_SURFACE / ESTIMATED_SURFACE hits are always horizontal; FEATURE_POINT hits have no reliable normal. Posters lie flat on the detected surface via `composeFlatPosterMatrix` (`src/xr/posterOrientation.ts`), with the image top pointing away from the viewer. Wall support is deferred to a future "wall-from-floor" technique.

## Testing

Stack: **vitest ^4.1.8** + **happy-dom ^20.9.0** (configured in `vitest.config.ts`).

**46 test files, 407 tests.** Only pure logic is unit-tested (gif timing/decode, upload validation, placement, texture cache, screenshot utilities, canvas reparent regression, flat-poster orientation math, ambient-color estimation, story state, StoryDoc validation, default-story provenance, content store, SVG-texture generation, asset persistence & upload hydration, device-token). 8th Wall and browser-canvas interactions are exercised via on-device manual testing (see `TESTING.md`).

## Conventions

- **Commit messages: one plain, readable sentence** — imperative mood, capitalized, no trailing period, and **no `feat:`/`fix:` prefix or scope**. Write it so a human skimming the GitHub history (including a non-engineer, e.g. a recruiter) understands what changed and why it matters. One line only; no body. E.g. `Add a draggable 3D phone preview so authors can look around a scene`.
- **Plain three.js only.** Do NOT add `@react-three/*` or `@use-gesture/*` — both were removed in the 8th Wall migration.
- TypeScript strict mode; no `any` without a comment justifying it.
- **No `Co-Authored-By: Claude` trailer** on commits.

## Release workflow

When a unit of work is finished, ship it without waiting to be asked, so it can be reviewed by just opening the URL:

1. Verify green first — `npm run type-check` and `npm run test` must pass.
2. **Commit** (one plain readable sentence per the Conventions above; no Claude co-author trailer).
3. **Push** the branch.
4. **Open/merge a PR into `main`**, resolving any conflicts.

Hosting is **AWS Amplify**, which builds from the connected branch on every push; each branch also gets its own URL. Because merging deploys to production, only merge work that is complete and verified — not mid-task or experimental snapshots.

The API is **not** deployed by Amplify. It is a separate Lambda (`npm run build:lambda` → upload `dist-lambda.zip`), reached through an Amplify rewrite. Frontend and API therefore ship independently — a push redeploys the site but leaves the function untouched.

**Images are blank on branch-preview URLs.** The bucket's CORS rule can only name origins that exist, and preview subdomains are minted per branch. Expected, not a bug.
