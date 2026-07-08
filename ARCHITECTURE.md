# Architecture — XR Poster

Technical architecture of the XR Poster web app. This describes the **current**
implementation, which uses the **8th Wall (XR8)** WebAR engine driving a plain
**three.js** scene. (The project previously used the WebXR Device API with
`@react-three/fiber`/`@react-three/xr`; that stack has been removed — see
[`CHANGELOG.md`](CHANGELOG.md).)

---

## 1. Goals & constraints

- **No app install** — AR runs in the mobile browser.
- **Stable world-tracking** — 8th Wall SLAM keeps placed posters anchored
  without WebXR anchors or per-frame correction.
- **Fast, observable startup** — the engine + SLAM WASM download dominates
  time-to-AR (especially on iOS), so startup is instrumented end-to-end and a
  determinate loading bar + diagnostic panel surface progress and failures.
- **Develop without a phone** — a desktop webcam "mock" mode exercises the same
  reticle/placement code from a laptop.
- **Static delivery** — the app builds to a static SPA (`dist/`) deployable to
  any CDN/static host.

---

## 2. High-level shape

```
┌──────────────────────────── Browser (mobile) ─────────────────────────────┐
│                                                                            │
│  index.html                                                                │
│   ├─ <script> 8th Wall engine-binary (xr.js + SLAM WASM)  ── from jsDelivr │
│   ├─ <script> xrextras, landing-page (optional helpers)                    │
│   ├─ window.__xr8diag  (per-script load/error diagnostics)                 │
│   └─ <script type=module> /src/main.tsx                                    │
│                                                                            │
│  React app (src/)                                                          │
│   App.tsx ── detectXRSupport() ──▶ one of 3 branches                       │
│     ├─ hasAR8  → <StoryARExperience>          (8th Wall owns the canvas)    │
│     ├─ desktop → <DesktopMockMode>            (raw three.js + webcam)       │
│     └─ else    → "AR Not Supported" panel                                  │
│                                                                            │
│   Always mounted: <DiagnosticPanel> <Toast> <InstructionsOverlay>          │
│                                                                            │
│  8th Wall engine (XR8 global)                                              │
│   owns: camera feed · three.js renderer · render loop · SLAM tracking      │
│   app registers a custom camera-pipeline module (onStart/onUpdate)         │
└────────────────────────────────────────────────────────────────────────────┘
```

The app code never calls `renderer.render()` on the live path — the
`XR8.Threejs` pipeline module renders each frame. The app only *builds the
scene* and *reacts to frames*.

---

## 3. Startup & capability branching

`App.tsx`:

1. On mount, marks `appMounted` telemetry and calls `detectXRSupport()`
   (`utils/deviceDetection.ts`). Detection is **non-prompting** — it checks for
   the `getUserMedia` API, gyroscope, UA platform, and secure context, but does
   **not** open a camera stream (opening one during detection was the main cause
   of slow first paint on iOS). 8th Wall itself prompts for the camera at
   "Start AR".
2. Seeds the Diagnostic Panel with platform-level facts (engine `loading` vs.
   `unsupported`, camera, motion, platform label).
3. A second effect polls `window.__xr8diag` (set by `index.html`) for ~30 s and
   mirrors per-script load state into telemetry, distinguishing a **fatal**
   engine-script failure from a **non-fatal** optional-helper failure.
4. Renders the branch:
   - **`hasAR8`** (`isMobile && hasCamera && secureContext`) → `StoryARExperience`.
   - **`isDesktop`** → `DesktopMockMode`.
   - else → the unsupported panel with a device-info table.

---

## 4. Engine loading & diagnostics

`index.html` loads three pinned 8th Wall scripts from jsDelivr in order
(engine-binary → xrextras → landing-page) and records each one's outcome into
`window.__xr8diag` via `onload`/`onerror`, plus a global `error` listener for
WASM/SIMD failures.

`src/xr8/pipeline.ts` owns the engine lifecycle:

- **`onXr8Ready(cb)`** — runs `cb` immediately if `window.XR8` already exists,
  otherwise on the one-shot `xrloaded` event. Marks `engineReady` telemetry.
- **Engine watchdog** — while waiting for `xrloaded`, polls `__xr8diag` to mirror
  script state, and after 15 s flips `engine` to `error` with a concrete reason
  (blocked/slow network vs. "loaded but never initialized → unsupported iOS").
  Without this the loading bar would hang forever at the pre-engine cap.
- **`runXr8({ canvas, customModules, disableWorldTracking })`** — exposes
  `window.THREE` (the `XR8.Threejs` module reads three from the global), then
  assembles the standard pipeline in 8th Wall's documented order
  (`GlTextureRenderer → Threejs → XrController → LandingPage → FullWindowCanvas
  → Loading → RuntimeError`), appends a tracking-telemetry listener module and
  any caller modules, configures world-tracking, and calls `XR8.run({ canvas })`.
  Every optional module is **guarded** (`typeof …pipelineModule === 'function'`)
  so a partially-loaded CDN bundle can't throw.
- **`stopXr8()`** — optional-chained `XR8?.stop?.()`.

---

## 5. Live AR pipeline (`components/ar/StoryARExperience.tsx`)

The shipped live-AR path is **`StoryARExperience`** — "THE GROUND REMEMBERS", a
5-era story/diorama mode. Instead of placing many user posters, it plants
**one** diorama tile (`StoryTile`, `src/xr8/storyTile.ts`) on the detected
ground and swaps that tile's texture as the user steps through the eras via
the `StoryOverlay` HUD (`src/components/story/StoryOverlay.tsx`).
`StoryARExperience` is a plain `React.FC` with **no props**;
all of its state comes from `useUIState`, `useArLoadProgress`, and
`useStoryStore` (`src/store/storyStore.ts`).

On "Start AR" (`startSession()`), the component calls `onXr8Ready(() =>
runXr8({ canvas, customModules: [sceneModule] }))`. The custom `sceneModule`:

**`onStart`** (once, when the engine is ready):
- Gets `{ scene, camera }` from `XR8.Threejs.xrScene()`.
- Adds lighting, a `sceneRoot` Group, and the reticle (`createReticle`). The
  reticle's head-locked "scanner" ring is added as a **child of the camera**
  so it follows the view with no tracking math.
- Constructs a `StoryTile(sceneRoot)` — the single swappable diorama mesh.
- Registers `touchstart`/`mousedown` on the canvas → `placeStory()`.
- Sets session/engine/hit-test telemetry and hides the loading screen.

**`onUpdate`** (every frame):
- Runs `readReticlePose()` and drives the reticle into `tracking` (until the
  diorama is placed, after which the reticle is hidden — the user is just
  looking around) or `searching`.
- Calls `tile.tick(deltaMs)` (currently a no-op; reserved for animated era
  textures).
- Caches the last reticle matrix for the next placement and ticks telemetry.

**`placeStory()`** (on the first tap only — later taps are a no-op once
placed): reads the last cached reticle matrix and the camera world position
from `XR8.Threejs.xrScene().camera.position`, then calls
`composeFlatPosterMatrix(matrix, cameraPos)` (`src/xr/posterOrientation.ts`)
to build a flat-on-surface transform — the tile's facing axis (+Z) coincides
with the surface normal, and the art's top edge points away from the viewer.
The resulting matrix is passed to `tile.place(...)`, and `useStoryStore` is
marked `placed`.

**`handleExitAR()`**: `stopXr8()`, `tile.clear()`, remove listeners, reset
refs + telemetry, reset the story store.

The DOM UI (`Header`, `LoadingScreen`, `DebugHUD`, `StoryOverlay`) is ordinary
React layered over the engine canvas with `position: fixed` + `z-index` — there
is no WebXR `dom-overlay`.

> **Retained legacy: `components/ar/ARExperience.tsx`.** The original
> multi-poster placement UI (many user-uploaded posters, `PosterControls`
> scale/rotation sliders, `ControlPanel`, `PosterGallery`) still exists in the
> tree and still compiles, but **`App.tsx` no longer mounts it** — the live
> branch renders `StoryARExperience` instead. It is kept intentionally (not
> deleted) rather than actively maintained; its `ARExperienceProps` (`mode`,
> `onSessionStart`, `onSessionEnd`) and the `posterStore`-driven placement flow
> described in older revisions of this doc apply only to that inactive
> component, not to the shipped live path.

---

## 6. The `xr8/` layer (8th Wall integration)

| File | Responsibility |
|------|----------------|
| `pipeline.ts` | Engine lifecycle, pipeline assembly, watchdog, tracking telemetry (§4) |
| `hitTestController.ts` | `readReticlePose()` — one center-screen `XR8.XrController.hitTest(0.5, 0.5, [...])` per frame; prefers `DETECTED_SURFACE > ESTIMATED_SURFACE > FEATURE_POINT`; composes a world `Matrix4` and a `vertical` flag from the hit quaternion. Returns the **real** hit pose (always a horizontal surface — 8th Wall detects only one ground plane; vertical/wall surfaces are not supported; see §13). Reuses module-scoped temporaries to avoid GC. |
| `posterPlacement.ts` | `PosterPlacement` class — `place/setScale/setRotation/remove/clear/size/list/tick`. Each poster is a `Group` (with `matrixAutoUpdate = false`, matrix set from the **composed flat matrix** passed in) containing a textured `PlaneGeometry` mesh that faces local +Z; `setRotation` spins it in-plane about the surface normal. Materials are `transparent` (honor PNG/GIF alpha) and tinted by the ambient color (see `ambientProbe.ts` below). `tick(deltaMs)` forwards elapsed time to each poster's `PosterAnimator` so GIFs animate. **No position `update()`** — SLAM keeps the world frame stable. |
| `ambientProbe.ts` | `estimateAmbient(pixels, opts?)` (pure, unit-tested) reduces a downsampled camera frame to a smoothed `{r,g,b}` ambient color; `getAmbientColor()` reads `XR8.CameraPixelArray` and feeds it. Applied to poster materials so they track room brightness/color cast instead of glowing at full brightness. |
| `canvasScreenshot.ts` | `isXr8ScreenshotAvailable()` / `takeXr8Photo()` — engine-composited camera+scene capture via the XR8 screenshot module (reliable live-AR capture; see the screenshot caveat in §13). |
| `posterTextureCache.ts` | URL-keyed, refcounted shared texture/animator cache (`acquirePosterTexture` / `releasePosterTexture`). Enforces a global 64 MB animation-byte budget across all distinct animated GIFs; GIFs that would exceed the remaining budget fall back to a static frame-0 texture. Textures are disposed on the last release, including on the placement error rollback path. |
| `gifAnimator.ts` | `createPosterTexture(url, { animationByteBudget })` — decodes a GIF URL into a `three.CanvasTexture` + `PosterAnimator` (or a static texture on fallback). `PosterAnimator.tick(deltaMs)` advances the `GifPlayhead` and repaints the canvas each frame. |
| `gifPlayhead.ts` | Pure frame-timing math — given the GIF frame-delay table and elapsed ms, computes the current frame index with correct loop wrap. No DOM or three.js dependency. |
| `storyTile.ts` | `StoryTile` class — the single AR-anchored diorama mesh used by `StoryARExperience` (`place/setTexture/tick/clear`). Where `PosterPlacement` manages many opaque posters, this plants **one** transparent (`alphaTest`) tile once via the composed flat matrix and swaps its texture per story era; laid flat the same way as posters, via `composeFlatPosterMatrix`. |
| `globals.d.ts` | Ambient typings: `Xr8HitResult`, `Xr8PipelineModule`, and the `XR8`/`XRExtras`/`LandingPage` globals (deliberately `any` — full engine typings are out of scope). |

---

## 6a. Animated GIF poster pipeline

```
Upload (imageUpload.ts)
  ├─ GIF:     preserved as-is (data: URL) — max 8 MB; NOT flattened to WebP
  └─ non-GIF: compressed to WebP <2 MB, longest axis ≤ 2048 px (floor 512)

placePoster() calls acquirePosterTexture(url):
  posterTextureCache.ts  ──  refcounted shared cache
    ├─ hit?  → bump refs, return cached texture + animator
    └─ miss? → createPosterTexture(url, { animationByteBudget: remaining })
                 gifAnimator.ts
                   ├─ GIF? → gifDecode.ts (gifuct-js adapter)
                   │            reads GIF dimensions from header
                   │            decodes data: URL without fetch (ArrayBuffer direct)
                   │          → gifPlayhead.ts (pure frame-timing math)
                   │          → CanvasTexture  +  PosterAnimator
                   │            (graceful static fallback if decode fails OR over budget)
                   └─ non-GIF → TextureLoader → static Texture

onUpdate (every frame):
  placement.tick(deltaMs)
    └─ per poster: PosterAnimator.tick(deltaMs)
         GifPlayhead → current frame index
         paint frame to canvas → CanvasTexture.needsUpdate = true

releasePosterTexture(url) on remove / error rollback:
  refs-- → zero? → texture.dispose() + animator.dispose() + budget freed
```

The `gifDecode.ts` module is a typed adapter over `gifuct-js`. It reads the
GIF canvas dimensions from the logical-screen descriptor and decodes frames
from a raw `ArrayBuffer`, so data: URLs never trigger a `fetch()` call.

Source files: `src/utils/gifDecode.ts`, `src/xr8/gifPlayhead.ts`,
`src/xr8/gifAnimator.ts`, `src/xr8/posterTextureCache.ts`.

---

## 7. The `xr/` layer (engine-agnostic helpers)

| File | Responsibility |
|------|----------------|
| `reticle.ts` | `createReticle()` → a tracking ring (on-surface, matrix driven by hit pose) + a head-locked "scanner" ring that pulses while `searching`. Tints cyan/green for vertical/horizontal. Used by both the live and mock paths. |
| `posterOrientation.ts` | `composeFlatPosterMatrix(hitMatrix, cameraPos?)` — pure function that rebuilds a hit-test pose so a `PlaneGeometry` (which faces local +Z) lies **flat on the detected surface** (facing = surface normal) with the image's top edge pointing away from the viewer. Uses `Matrix4.makeBasis` with `Vector3` cross products to construct a right-handed basis; falls back to the hit pose's own in-plane axis when camera position is unavailable. No 8th Wall / browser globals; fully unit-testable. |
| `debugTelemetry.ts` | Module singleton shared between the frame loop (writer) and the DebugHUD / DiagnosticPanel (readers). Plain refs + a subscriber list keep React out of the 60 fps path; `setSubsystem` notifies only on transition. Tracks subsystem health, a freeform note, FPS (EMA), a load-timing track (`appMounted → supportDetected → engineReady → pipelineRun → firstFrame → firstTracking`), and a tap→place breadcrumb log for diagnosing placement failures. |
| `desktopMockDriver.ts` | `installDesktopMockDriver()` — mouse-drag → camera quaternion (mimics device orientation). Used only by `DesktopMockMode`. |

---

## 8. Desktop mock mode (`components/ar/DesktopMockMode.tsx`)

A development sandbox that does **not** use the 8th Wall engine. It runs its own
`WebGLRenderer` (alpha) over a fullscreen `<video>` webcam feed, installs the
mock driver (mouse-drag look), and each frame fakes a floor hit-test pose 1.5 m
ahead / 0.3 m down so the **same** `createReticle` + `PosterPlacement` code can
be exercised. "Place poster" mirrors the live path through `posterStore`.

---

## 9. State management

Zustand stores, no Provider:

- **`store/posterStore.ts`** — `posters` (placed, capped at `maxPosters`),
  `uploadedPosters` (gallery), `currentPosterImage`, `selectedPosterId`, plus
  actions. `App.tsx` hydrates `uploadedPosters` from the server on load when
  asset persistence is enabled (see §12, Security). The mirroring of store mutations into
  the three.js scene via a subscription set up in `onStart` — described for
  `PosterPlacement` in §5's older revisions — is wired up in the **retained
  legacy `ARExperience`**, not in the live `StoryARExperience`. The
  authoritative world transform of a placed poster is the three.js group
  matrix in `PosterPlacement`, **not** the store fields.
- **`store/storyStore.ts`** — narrative state for the live "THE GROUND
  REMEMBERS" path: `phase` (`scanning`/`ready`/`placed`/`outro`), `eraIndex`,
  `placed`, plus navigation actions (`place/next/prev/jumpTo/reset`).
  `StoryARExperience` reads/writes it directly (not via React props); the 2D
  `StoryOverlay` HUD reads it to drive the title card, narration, and
  timeline.
- **`hooks/useUIState.ts`** — overlay visibility, active modal, and the toast
  queue (auto-dismiss after `duration` ms).

---

## 10. Image upload (`utils/imageUpload.ts`)

`validateAndProcessImage(file)` validates type/size, then branches on format:

- **GIF** — preserved as-is (data: URL). `createImageBitmap` + canvas flatten
  would collapse animation to a single frame, so GIFs bypass compression
  entirely. Max accepted size is 8 MB (tighter than the 50 MB general cap).
  `readGifSize` (from `gifDecode.ts`) reads the canvas dimensions from the
  GIF header without a full decode.
- **Non-GIF** — decodes via `createImageBitmap` (with an `HTMLImageElement`
  fallback), then iteratively shrinks dimensions (longest axis ≤ 2048, floor 512)
  and WebP quality (0.92 → 0.5) until the encoded blob fits the 2 MB wire
  target — returning the best blob even if over budget rather than failing.

`usePosterUpload` wraps both paths with progress state + toasts; the result is
stored as an uploaded poster.

---

## 11. Diagnostics & observability

- **DiagnosticPanel** (`src/components/ui/DiagnosticPanel.tsx`, always mounted)
  — collapsed pill (worst-status dot + platform) / expanded subsystem list +
  load-timing + context-sensitive hint. Subscribes to telemetry; 1 Hz heartbeat
  for transient states; dismiss state in `sessionStorage`. Surfaces
  poster-placement errors on-device as they occur.
- **DebugHUD** (`src/components/ui/DebugHUD.tsx`) — FPS + key subsystems +
  timing; toggled in-app (on-demand button) or via `?debug=1` query parameter.
- **Tap→place breadcrumbs** — `debugTelemetry.logEvent()` records each step of
  the placement flow (tap received → texture acquired → `placement.place` called
  → success/failure) so that the full trace is visible in the DebugHUD when a
  placement fails silently on-device.
- **useArLoadProgress** — maps telemetry milestones to discrete stage targets and
  "trickles" monotonically toward each soft cap, since `<script>`-loaded WASM
  gives no byte-level progress. Freezes and shows the diagnostic note if the
  engine errors.

---

## 12. Security

- **CSP** (`vercel.json`, `public/_headers`) allows `https://cdn.jsdelivr.net`
  in `script-src` (the engine CDN) plus `blob:`/`data:` for textures and
  workers; `frame-src 'none'`.
- **SRI** — `xrextras`/`landing-page` are pinned with `integrity` hashes;
  `engine-binary` intentionally omits SRI because its loader fetches runtime
  chunks (`slam.js`) dynamically that a static hash cannot cover (rationale
  documented inline in `index.html`).
- **Client-only data by default** — image processing and screenshots are
  entirely client-side; nothing is uploaded **when `VITE_API_BASE_URL` is not
  configured**. When it is set (`isPersistenceEnabled()` in
  `src/services/posterApi.ts`), uploaded assets are persisted via `POST
  /api/assets` (metadata) followed by a `PUT` to a signed upload URL, and
  `App.tsx` hydrates previously-uploaded posters from that server API on load.
- HTTPS enforced in production; HSTS preload.

---

## 13. Known limitations & design decisions

- **No WebXR anchors / per-frame anchor update.** SLAM stability makes them
  unnecessary; `PosterPlacement` has no `update()` by design.
- **No vertical surface (wall) detection.** 8th Wall world-tracking detects only
  one horizontal ground plane. `DETECTED_SURFACE` / `ESTIMATED_SURFACE` hits are
  always horizontal; `FEATURE_POINT` hits carry no reliable surface normal. The
  `vertical` flag in `readReticlePose()` is computed from the hit quaternion but
  true wall placement is not currently implemented. (An app-side plane-fitting
  approach — RANSAC/PCA over a hit-test grid — was merged and then reverted after
  on-device testing found it unstable; it is being reworked on the preserved
  `feat/general-surface-detection` branch.)
- **Screenshot may be blank on live AR.** The engine renderer lacks
  `preserveDrawingBuffer`; `toDataURL()` outside the render loop can read an
  empty frame. Documented in `utils/screenshot.ts`.
- **No move/pinch/twist gestures.** Placement is tap-based; resize and in-plane
  rotation are sliders. Free-hand manipulation belonged to the removed gesture stack.
- **iOS needs WebAssembly SIMD** (Safari 16.4+) or the engine won't initialize;
  the watchdog reports this explicitly.

---

## 14. Testing

Automated unit/integration tests run under **Vitest** with a **happy-dom**
environment (`vitest.config.ts`, `include: ['src/**/*.{test,spec}.{ts,tsx}']`).
**17 test files, 86 test cases** cover the GIF pipeline, poster/story
placement, upload validation, ambient color, hit-testing, and persistence
logic:

| File | Coverage |
|------|----------|
| `src/utils/gifDecode.test.ts` | GIF header parsing, data: URL decode, error paths |
| `src/utils/imageUpload.test.ts` | Validation, GIF pass-through, WebP compression |
| `src/utils/screenshot.test.ts` | Screenshot utility behavior |
| `src/utils/deviceToken.test.ts` | Device-token generation/persistence |
| `src/xr/posterOrientation.test.ts` | `composeFlatPosterMatrix` flat-orientation math |
| `src/xr8/gifPlayhead.test.ts` | Frame-timing math, loop wrap |
| `src/xr8/gifAnimator.test.ts` | `createPosterTexture` branching, static fallback |
| `src/xr8/posterTextureCache.test.ts` | Refcount, budget enforcement, dispose |
| `src/xr8/posterPlacement.test.ts` | `place/remove/tick/clear` |
| `src/xr8/hitTestController.test.ts` | `readReticlePose()` hit-priority + matrix composition |
| `src/xr8/ambientProbe.test.ts` | `estimateAmbient` color-estimation math |
| `src/components/ar/arCanvasReparent.test.tsx` | Canvas reparent regression |
| `src/store/posterStore.hydrate.test.ts` | Hydrating uploaded posters from the asset API |
| `src/store/storyStore.test.ts` | Story phase/era transitions |
| `src/story/svgTexture.test.ts` | SVG-to-texture rasterization for story eras |
| `src/services/posterApi.test.ts` | Asset-persistence API client (`persistAsset`/`listAssets`) |
| `src/hooks/usePosterUpload.persist.test.ts` | Upload flow with persistence enabled |

A separate `server/` test suite (`server/src/config.test.ts`,
`server/src/routes/assets.test.ts`, `server/src/storage/objectStore.test.ts`)
exists outside the root Vitest `include` glob and is **not** run by `npm run
test`.

```
npm run test        # vitest run (CI) — 17 test files, 86 tests
npm run test:watch  # vitest (interactive watch)
```

---

## 15. Build & deployment

`npm run build` → `tsc && vite build` → `dist/`. Vite emits three chunks
(`index`, `vendor`, `three`); the 8th Wall engine is loaded at runtime from CDN
and is not part of the bundle graph. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for
platform specifics (Vercel, Netlify, Cloudflare Pages, Docker) and
[`TECH_STACK.md`](TECH_STACK.md) for the dependency reference.

---

**Last updated:** 2026-06-23
