# CLAUDE.md — xr-poster

Quick reference for Claude Code sessions. See README.md / ARCHITECTURE.md / TESTING.md for depth.

## Commands

```bash
npm run dev           # Vite dev server — HTTPS, --host (required for camera + 8th Wall)
npm run test          # vitest run — 55 tests, < 1 s
npm run test:watch    # vitest interactive watch
npm run type-check    # tsc --noEmit
npm run build         # tsc && vite build → dist/
```

There is **no lint script**.

## Architecture

`App.tsx` is a 3-branch root:

| Condition | Branch |
|-----------|--------|
| Mobile + secure context (`hasAR8`) | `ARExperience` — live 8th Wall AR |
| Desktop | `DesktopMockMode` — webcam + mouse-look sandbox |
| Otherwise | "AR Not Supported" panel |

On the live path **8th Wall (XR8) owns** the canvas, camera feed, three.js renderer, and render loop. The app registers a custom camera-pipeline module (`onStart` / `onUpdate`) that builds the scene, runs a center-screen hit-test every frame, drives the reticle, and places poster meshes on tap.

- `src/xr/` — engine-AGNOSTIC 3D helpers (reticle, debugTelemetry, desktopMockDriver, posterOrientation)
- `src/xr8/` — 8th Wall (XR8)-SPECIFIC integration (pipeline, hitTestController, posterPlacement, gifAnimator, gifPlayhead, posterTextureCache)

State: **Zustand 4** — `posterStore` (placed + uploaded posters), `useUIState` (overlays, toasts).

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
- **No move/pinch/rotate gestures.** Interaction is tap-to-place + scale slider only. The old gesture stack (`@use-gesture/*`) was removed in the 8th Wall migration.
- **CSP:** `script-src` must allow `https://cdn.jsdelivr.net`. See `vercel.json` / `public/_headers`.
- **engine-binary intentionally has no SRI hash.** Its loader fetches runtime chunks (e.g. `slam.js`) dynamically; a static hash can't cover them. Documented inline in `index.html`.
- **HTTPS (or localhost) required** for camera access and the 8th Wall engine.
- **8th Wall cannot detect walls (vertical surfaces).** World tracking detects only one horizontal ground plane; DETECTED_SURFACE / ESTIMATED_SURFACE hits are always horizontal; FEATURE_POINT hits have no reliable normal. Posters lie flat on the detected surface via `composeFlatPosterMatrix` (`src/xr/posterOrientation.ts`), with the image top pointing away from the viewer. Wall support is deferred to a future "wall-from-floor" technique.

## Testing

Stack: **vitest ^4.1.8** + **happy-dom ^20.9.0** (configured in `vitest.config.ts`).

**9 test files, 55 tests.** Only pure logic is unit-tested (gif timing/decode, upload validation, placement, texture cache, screenshot utilities, canvas reparent regression, flat-poster orientation math). 8th Wall and browser-canvas interactions are exercised via on-device manual testing (see `TESTING.md`).

## Conventions

- **Conventional Commits**: `feat`, `fix`, `chore`, `docs`, `refactor`, `test` with scopes such as `gif`, `ar`, `upload`, `8thwall`, `diag`.
- **Plain three.js only.** Do NOT add `@react-three/*` or `@use-gesture/*` — both were removed in the 8th Wall migration.
- TypeScript strict mode; no `any` without a comment justifying it.
- **No `Co-Authored-By: Claude` trailer** on commits.

## Release workflow

When a unit of work is finished, ship it to Vercel without waiting to be asked, so it can be reviewed by just opening the URL:

1. Verify green first — `npm run type-check` and `npm run test` must pass.
2. **Commit** (Conventional Commits, no Claude co-author trailer).
3. **Push** the branch.
4. **Open/merge a PR into `main`**, resolving any conflicts.

Merging `main` triggers a **production** deploy (Vercel `postarr`); each branch also gets its own preview URL. Because the merge deploys to production, only merge work that is complete and verified — not mid-task or experimental snapshots.
