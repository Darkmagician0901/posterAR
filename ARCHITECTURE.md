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
│     ├─ hasAR8  → <ARExperience mode="live">   (8th Wall owns the canvas)    │
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
   - **`hasAR8`** (`isMobile && hasCamera && secureContext`) → `ARExperience`.
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

## 5. Live AR pipeline (`components/ar/ARExperience.tsx`)

On "Start AR", the component calls `onXr8Ready(() => runXr8({ canvas,
customModules: [sceneModule] }))`. The custom `sceneModule`:

**`onStart`** (once, when the engine is ready):
- Gets `{ scene, camera }` from `XR8.Threejs.xrScene()`.
- Adds lighting, a `sceneRoot` Group (holds placed posters), and the reticle
  (`createReticle`). The reticle's head-locked "scanner" ring is added as a
  **child of the camera** so it follows the view with no tracking math.
- Constructs a `PosterPlacement(sceneRoot)`.
- Subscribes to `posterStore`: store deletions/scale-changes are mirrored into
  the three.js scene (removed posters → `placement.remove`, scale diffs →
  `placement.setScale`). This is the bridge between React state and the scene.
- Registers `touchstart`/`mousedown` on the canvas → `placePoster()`.
- Sets session/engine/camera/hit-test telemetry and hides the loading screen.

**`onUpdate`** (every frame):
- Marks `firstFrame`, runs `readReticlePose()`, and drives the reticle into
  `tracking` (with the pose matrix + horizontal/vertical tint) or `searching`.
- Caches the last reticle matrix for the next placement, updates FPS + hit-test
  telemetry. No allocation in the hot path beyond the pose `Float32Array`.

**`placePoster()`** (on tap): loads/caches the current poster texture, computes
aspect, calls `posterStore.addPoster(...)` (which enforces `maxPosters` and
auto-selects), then `placement.place(matrix, texture, aspect, id)`. On any
failure the store entry is rolled back.

**`handleExitAR()`**: `stopXr8()`, unsubscribe the store, `placement.clear()`,
remove listeners, reset refs + telemetry.

The DOM UI (control panel, poster controls, loading screen, HUD) is ordinary
React layered over the engine canvas with `position: fixed` + `z-index` — there
is no WebXR `dom-overlay`.

---

## 6. The `xr8/` layer (8th Wall integration)

| File | Responsibility |
|------|----------------|
| `pipeline.ts` | Engine lifecycle, pipeline assembly, watchdog, tracking telemetry (§4) |
| `hitTestController.ts` | `readReticlePose()` — one center-screen `XR8.XrController.hitTest(0.5, 0.5, [...])` per frame; prefers `DETECTED_SURFACE > ESTIMATED_SURFACE > FEATURE_POINT`; composes a world `Matrix4` and a `vertical` flag (wall vs. floor) from the hit quaternion. Reuses module-scoped temporaries to avoid GC. |
| `posterPlacement.ts` | `PosterPlacement` class — `place/setScale/remove/clear/size/list`. Each poster is a `Group` (with `matrixAutoUpdate = false`, matrix set from the hit pose) containing a textured `PlaneGeometry` mesh. **No `update()`** — SLAM keeps the world frame stable, so a placed transform simply stays put. |
| `globals.d.ts` | Ambient typings: `Xr8HitResult`, `Xr8PipelineModule`, and the `XR8`/`XRExtras`/`LandingPage` globals (deliberately `any` — full engine typings are out of scope). |

---

## 7. The `xr/` layer (engine-agnostic helpers)

| File | Responsibility |
|------|----------------|
| `reticle.ts` | `createReticle()` → a tracking ring (on-surface, matrix driven by hit pose) + a head-locked "scanner" ring that pulses while `searching`. Tints cyan/green for vertical/horizontal. Used by both the live and mock paths. |
| `debugTelemetry.ts` | Module singleton shared between the frame loop (writer) and the HUD/panel (readers). Plain refs + a subscriber list keep React out of the 60 fps path; `setSubsystem` notifies only on transition. Tracks subsystem health, a freeform note, FPS (EMA), and a load-timing track (`appMounted → supportDetected → engineReady → pipelineRun → firstFrame → firstTracking`). |
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

Two Zustand stores, no Provider:

- **`store/posterStore.ts`** — `posters` (placed, capped at `maxPosters`),
  `uploadedPosters` (gallery), `currentPosterImage`, `selectedPosterId`, plus
  actions. The scene mirrors store mutations via the subscription set up in
  `ARExperience.onStart`. The authoritative world transform of a placed poster
  is the three.js group matrix in `PosterPlacement`, **not** the store fields.
- **`hooks/useUIState.ts`** — overlay visibility, active modal, and the toast
  queue (auto-dismiss after `duration` ms).

---

## 10. Image upload (`utils/imageUpload.ts`)

`validateAndProcessImage(file)`: validates type/size (≤ 50 MB), decodes via
`createImageBitmap` (with an `HTMLImageElement` fallback), then iteratively
shrinks dimensions (longest axis ≤ 2048, floor 512) and WebP quality (0.92 → 0.5)
until the encoded blob fits the 2 MB wire target — returning the best blob even
if over budget rather than failing the upload. `usePosterUpload` wraps this with
progress state + toasts; the result is stored as an uploaded poster.

---

## 11. Diagnostics & observability

- **DiagnosticPanel** (always mounted) — collapsed pill (worst-status dot +
  platform) / expanded subsystem list + load-timing + context-sensitive hint.
  Subscribes to telemetry; 1 Hz heartbeat for transient states; dismiss state in
  `sessionStorage`.
- **DebugHUD** — FPS + key subsystems + timing; toggled in-app or via `?debug=1`.
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
- **Client-only data** — image processing and screenshots are entirely
  client-side; nothing is uploaded.
- HTTPS enforced in production; HSTS preload.

---

## 13. Known limitations & design decisions

- **No WebXR anchors / per-frame anchor update.** SLAM stability makes them
  unnecessary; `PosterPlacement` has no `update()` by design.
- **Screenshot may be blank on live AR.** The engine renderer lacks
  `preserveDrawingBuffer`; `toDataURL()` outside the render loop can read an
  empty frame. Documented in `utils/screenshot.ts`.
- **No move/pinch/rotate gestures.** Placement is tap-based; resize is a slider.
  Free-hand manipulation belonged to the removed gesture stack.
- **iOS needs WebAssembly SIMD** (Safari 16.4+) or the engine won't initialize;
  the watchdog reports this explicitly.

---

## 14. Build & deployment

`npm run build` → `tsc && vite build` → `dist/`. Vite emits three chunks
(`index`, `vendor`, `three`); the 8th Wall engine is loaded at runtime from CDN
and is not part of the bundle graph. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for
platform specifics (Vercel, Netlify, Cloudflare Pages, Docker) and
[`TECH_STACK.md`](TECH_STACK.md) for the dependency reference.

---

**Last updated:** 2026-06-02
