---
name: 8thwall-engine
description: Use when implementing, debugging, or reviewing anything that touches the 8th Wall Web engine (the XR8 global) in this repo — camera pipeline modules and their lifecycle, world tracking / hit-tests (XrController), the three.js scene (XR8.Threejs), camera-feed rendering (GlTextureRenderer), CPU pixels (CameraPixelArray), screenshots (CanvasScreenshot), video (MediaRecorder), device/permission gating (XrDevice/XrPermissions), image targets, or face tracking. Provides a curated, cache-friendly XR8 API reference with in-repo usage cross-links.
---

# 8th Wall engine (XR8) API reference

A local, curated reference for the 8th Wall Web engine, structured so you load
**only** what a task needs. Prefer this over web fetches or memory — the engine is
a CDN global (`XR8`) typed loosely as `any` in `src/xr8/globals.d.ts`, so the
compiler will NOT catch a wrong signature.

## How to use this skill (navigation contract)

Follow these steps instead of reading everything:

1. **Pick the module** from the map below (or `INDEX.md`).
2. **For a specific symbol**, look it up in `INDEX.md` / `symbols.json` and read
   **only its cited line range** in the reference file — e.g. `Read` lines 30–58 of
   `reference/xrcontroller.md`, not the whole file. Each symbol entry also lists
   `localUsage` — where this repo already calls it (a real example to copy).
3. **Only read a whole `reference/<module>.md`** when surveying an unfamiliar module.
4. **If a symbol is missing**, fall back to Context7 `/websites/8thwall_api_engine`
   (a live query — cache-hostile, so use sparingly), then add the gap to the
   reference file and re-run `npm run build:8thwall-docs`.

`INDEX.md` and `symbols.json` are generated — never hand-edit them. Edit
`reference/*.md`, then regenerate.

## Module map

<!-- BEGIN GENERATED MODULE MAP -->

| Module | Reference file | Symbols |
| --- | --- | --- |
| `XR8.CameraPixelArray` | `reference/camerapixelarray.md` | 1 |
| `XR8.CanvasScreenshot` | `reference/canvasscreenshot.md` | 2 |
| `XR8.FaceController` | `reference/facecontroller.md` | 7 |
| `XR8.GlTextureRenderer` | `reference/gltexturerenderer.md` | 2 |
| `ImageTargets` | `reference/imagetargets.md` | 3 |
| `XR8.LayersController` | `reference/layerscontroller.md` | 1 |
| `XR8.MediaRecorder` | `reference/mediarecorder.md` | 5 |
| `CameraPipelineModule` | `reference/pipeline-lifecycle.md` | 19 |
| `XR8.Threejs` | `reference/threejs.md` | 3 |
| `XR8` | `reference/xr8-core.md` | 16 |
| `XR8.XrController` | `reference/xrcontroller.md` | 5 |
| `XR8.XrDevice` | `reference/xrdevice.md` | 5 |
| `XR8.XrPermissions` | `reference/xrpermissions.md` | 1 |

<!-- END GENERATED MODULE MAP -->

## Repo-specific facts (do not re-derive)

- 8th Wall **owns** the canvas, camera feed, three.js renderer, and render loop on
  the live path. The app registers a custom pipeline module (`onStart` / `onUpdate`)
  — see `src/xr8/pipeline.ts`.
- **Only one horizontal ground plane** is detectable; there is NO wall/vertical
  detection. `hitTest` types are always horizontal. See CLAUDE.md "Gotchas".
- Live-AR **screenshots must go through `CanvasScreenshot`** — the canvas has no
  `preserveDrawingBuffer`.
- Feature-detect optional modules (`CameraPixelArray`, `CanvasScreenshot`) before
  use; older CDN bundles may lack them.

## Maintenance

- Reference prose is curated from Context7 `/websites/8thwall_api_engine`.
- `scripts/build-8thwall-docs.mjs` (run via `npm run build:8thwall-docs`) parses the
  reference files + this repo's `src/**` with tree-sitter to regenerate `INDEX.md`,
  `symbols.json` (with in-repo `localUsage`), and the module map above. It fails the
  build if any example doesn't parse or any line range is invalid.
