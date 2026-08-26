# Architecture — XR Poster

Technical architecture of the XR Poster web app. This describes the **current**
implementation, which uses the **8th Wall (XR8)** WebAR engine driving a plain
**three.js** scene. (The project previously used the WebXR Device API with
`@react-three/fiber`/`@react-three/xr`; that stack has been removed — see
[`CHANGELOG.md`](CHANGELOG.md).)

---

## 0. Where to start reading

The app has two halves that meet at one file.

**Viewing** — a visitor opens `/`, the camera starts, they tap the ground, and
walk a story. Read §3 (startup), §5 (the AR pipeline), §6 (the 8th Wall layer).

**Authoring** — someone opens `/studio` on a desktop, builds a story, and
publishes it. Read §9a (the content layer), §9b (composition), §9c (publishing).

**The file where they meet is `src/story/storyDoc.ts`.** It defines `StoryDoc`,
the document the studio writes and the viewer reads. If you only read one file
to understand this codebase, read that one.

If you are here because someone said the app is hard-coded, read **§12a**, which
maps exactly what is data, what is code, and why the line falls where it does.

A five-minute orientation:

1. `src/story/storyDoc.ts` — the contract between authoring and viewing
2. `src/store/contentStore.ts` — where the active story lives at runtime
3. `src/components/story/StoryOverlay.tsx` — everything a visitor reads
4. `src/story/props/compose.ts` — how staged props become a picture
5. `src/studio/StudioApp.tsx` — the authoring shell

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
│   main.tsx ── path === '/studio' ? <StudioApp> : <App>                     │
│     └─ StudioApp is a lazy chunk: 0 bytes in the visitor bundle            │
│                                                                            │
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
- **`store/contentStore.ts`** — holds the `StoryDoc` currently being rendered.
  Owns *what the story is*; `storyStore` owns *where in it the visitor stands*.
  Starts as the bundled default; `load()` swaps in a fetched or drafted
  document after validation.
- **`studio/studioDraftStore.ts`** — the document being *authored*, plus the
  selected frame and an undo history. Separate from `contentStore` so editing
  never disturbs a live preview. Mirrors every change to `localStorage`.
- **`hooks/useUIState.ts`** — overlay visibility, active modal, and the toast
  queue (auto-dismiss after `duration` ms).

---

## 9a. The content layer

The story is **data**, not constants. This is the seam that makes authoring
possible, and it is worth understanding before changing anything above it.

```
                    ┌──────────────── authoring (/studio) ────────────────┐
                    │  studioDraftStore ──▶ localStorage  (?draft=1)      │
                    │        │                                            │
                    │        ├─ StageEditor ──▶ composeFrame(props) ─┐    │
                    │        └─ Inspector (copy, wash, cards)        │    │
                    │                                    frame.art ◀─┘    │
                    │        │                                            │
                    │        └─ PublishDialog ──▶ POST /api/publish       │
                    └─────────────────────────────────┬───────────────────┘
                                                      ▼
                                           S3: stories/<id>.json
                                                      │
                    ┌───────────────── viewing (/) ────┼───────────────────┐
                    │  storyApi.loadStoryForLocation() ◀┘                  │
                    │        │  ?s=<id>   published                        │
                    │        │  ?draft=1  local draft                      │
                    │        │  neither   bundled default                  │
                    │        ▼                                            │
                    │  validateStoryDoc(raw, DEFAULT_STORY)  per-field     │
                    │        ▼                                            │
                    │  contentStore.doc                                    │
                    │    ├─▶ StoryOverlay   copy, timeline, wash           │
                    │    ├─▶ storyStore     frame count, bounds            │
                    │    └─▶ StoryARExperience ─▶ svgToTexture ─▶ StoryTile│
                    └──────────────────────────────────────────────────────┘
```

**`StoryDoc` (`story/storyDoc.ts`)** is the contract between the two halves.
A document holds its copy, an ordered list of frames, and an optional map of
uploaded assets. Each frame carries:

- `art` — a complete SVG document string. **This is the only thing the viewer
  reads.** It is what gets rasterized onto the diorama tile.
- `props` — the staged composition `art` was generated from. The viewer ignores
  it; it exists so a published story stays re-editable.

That split is deliberate. Derived output is stored alongside its source, so the
renderer stays dumb (it never runs a builder) and the editor stays lossless.

**Validation is per-field, never all-or-nothing.** `validateStoryDoc` falls back
to the bundled default one field at a time, drops frames with unusable art, and
restricts asset URLs to `data:image/`. A malformed document degrades to a
working experience rather than a blank one — every load path in this app is
written so a visitor cannot end up staring at nothing.

**Uploaded images must be `data:` URLs.** An SVG loaded through `<img>` — which
is how `svgTexture` rasterizes — runs in restricted mode and will not fetch
external references. An `https://` source renders blank with no error. Publish
inlines asset bytes for this reason, which is also why documents can get large.

---

## 9b. Composition (`story/props/`)

`composeFrame(props, options)` turns staged props into one SVG document, using
the perspective model ported from the design prototype: props further back are
drawn smaller and higher up the frame, painted far-to-near so nearer props
overlap, each with a contact shadow that fades as it is lifted.

- **`builders.ts`** — 13 pure functions returning SVG fragments, drawn in a
  330×200 space with the ground line at y=141. No DOM, no measurement.
- **`library.ts`** — pairs each builder with a display name, a default height in
  metres, and its **measured bounding box**. Those boxes were obtained once by
  running every builder in a real browser and calling `getBBox()`. They are
  baked in as constants so composition stays pure and unit-testable. **If a
  builder's geometry changes, the box must be re-measured** — nothing detects
  this automatically.
- **`compose.ts`** — the composer itself, plus `backdropImage()` for full-bleed
  uploaded backgrounds.

Metres here are **scene-fiction metres**, not AR metres. The diorama tile is
rendered at a fixed real-world width (`TILE_WIDTH_M`), so `ppm` is an artistic
framing choice, not a physical scale.

---

## 9c. Publishing (`api/publish.ts`)

The only authenticated endpoint. It exists because two things require a server:
AWS credentials must never reach a browser, and the live exhibit needs a gate so
that finding `/studio` is not the same as being able to overwrite what visitors
see.

- Auth is a shared secret compared with `timingSafeEqual` against
  `STUDIO_PUBLISH_SECRET`, rate-limited per instance.
- The document is validated **against an empty document, not the bundled
  default** — otherwise a malformed payload would silently publish the demo
  story over the exhibit.
- Written to a deterministic path (`stories/<id>.json`) in the S3 bucket, so
  `/?s=<id>` resolves without a lookup table and republishing replaces rather
  than orphaning.
- Every declared asset must already exist in the bucket — both `assetId` and,
  when present, `r1024Id` — probed with the one shared key builder in
  `src/story/assetStorage.ts`. A missing object would otherwise surface as a
  silent transparent gap on every visitor's device.
- Reads are unauthenticated and bypass the function entirely — visitors fetch
  `stories/<id>.json` straight from CloudFront (or the bucket origin). The gate
  is on the write, where the asset is.

Required environment: `S3_BUCKET`, `S3_REGION`, `STUDIO_PUBLISH_SECRET`,
`STORY_PUBLIC_BASE_URL`, AWS credentials (`AWS_ROLE_ARN` via Vercel OIDC, or a
static key pair), and client-side `VITE_STORY_BASE_URL` / `VITE_ASSET_BASE_URL`.
A missing bucket or secret produces a 503 naming the specific one rather than a
vague failure; the two client-side origins are build-time, so `PublishDialog`
names whichever is unset after a successful publish. See `.env.example`.

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

- **CSP** (`customHttp.yml`, `public/_headers`) allows `https://cdn.jsdelivr.net`
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

## 12a. What is data, what is code, and why

A fair question about this codebase is "how much of it is hard-coded?" The
honest answer is that **content is data and the system is code**, and the line
between them was drawn deliberately. This section says where that line is, so
the next person can tell a value they are meant to change from one they are not.

### Data — changeable without a deploy

| What | Where | Changed by |
|---|---|---|
| Story copy: title, intro/outro cards, per-frame year, label, title, narration | `StoryDoc` | The studio, then publish |
| Frame count and order | `StoryDoc.frames` | The studio |
| Era mood colour | `StoryDoc.frames[].washColor` | The studio |
| Diorama art | `StoryDoc.frames[].art` | Composed from props, or uploaded |
| Uploaded images | `StoryDoc.assets` | The studio |

Everything above travels in one JSON document, is fetched at runtime, and is
edited without touching the repo. **This was not true before**: until recently
the whole story was a TypeScript constant (`STORY_ERAS`) and the art was five
SVG files inlined at build time. That migration is what most of the recent work
was for.

### Code — changeable only by editing and deploying

| What | Where | Why it is code |
|---|---|---|
| Diorama physical size | `TILE_WIDTH_M`, `xr8/storyTile.ts` | One value that defines how the experience feels in a room. Belongs in a settings surface eventually; not yet built. |
| Composition frame + perspective | `COMPOSE_DEFAULTS`, depth coefficient `0.16` | The visual language of the diorama. Changing it changes every story at once, which is a design decision, not an authoring one. |
| Prop library and its geometry | `story/props/builders.ts`, `library.ts` | Each prop is drawing code. Authors extend the vocabulary by uploading art, not by editing builders. |
| Texture raster size | `RASTER_MAX`, `story/svgTexture.ts` | Memory/quality tradeoff on mobile. |
| Narration typing speed | `CHAR_INTERVAL_MS`, `useStoryTypewriter.ts` | Pacing, shared by the viewer and the studio preview. |
| Wash colour presets | `WASHES`, `studio/Inspector.tsx` | An arbitrary wash is far easier to get wrong than right; the palette is the guardrail. |
| Scan prompts, button labels, HUD chrome | JSX literals in `StoryOverlay.tsx` | Interface vocabulary, not story content. Deliberately excluded — see below. |
| Studio chrome and layout | `studio/studio.css` | It is a tool, not a product surface. |

### Where the line was drawn, and why

**Story content is data because non-developers need to change it.** That is the
entire premise of the studio.

**Interface copy is code because it is not story content.** "TAP THE GROUND TO
PLACE" belongs to the app, not to any one story, and making it editable would
let an author break the instructions that get a visitor into the experience.

**The prop library is code because props are drawings.** Making them data would
mean inventing a drawing format — a large project with no clear payoff, given
authors can already upload arbitrary artwork.

**The tile size and composition constants are the weakest part of this line.**
They are genuinely tuning values that a designer might want to adjust, and they
currently require a code change. A settings surface for them was planned and
deferred. If you are looking for the next useful thing to build, it is that.

### Values that must be changed in more than one place

These are the traps. Nothing enforces them; they are documented here because
they will be missed otherwise.

- **Narration typography** is duplicated between `StoryOverlay.css`
  (`.story-narration`) and `studio/studio.css` (`.st-bubble`). Both carry a
  comment saying so. If they drift, the studio preview stops telling the truth.
- **The depth model** (`0.16` coefficient, ground rise) exists in both
  `story/props/compose.ts` and `studio/stageGeometry.ts`. A test in
  `stageGeometry.test.ts` asserts they agree — if you change one, that test
  fails, which is the intended safety net.
- **Prop bounding boxes** in `library.ts` are measured constants. Editing a
  builder's geometry invalidates them silently.

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
**68 test files, 664 test cases** cover the GIF pipeline, poster/story
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
npm run test        # vitest run (CI) — 68 test files, 664 tests
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
