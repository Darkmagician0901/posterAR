# WebXR → 8th Wall (Open Source) Migration — Design

**Date:** 2026-06-01
**Branch:** `worktree-8thwall-migration`
**Status:** Approved for implementation (4 key forks confirmed with user)

## Goal

Replace the app's WebXR (`navigator.xr` `immersive-ar`) AR pipeline with the
now-open-source **8th Wall** web engine (`XR8`). 8th Wall was open-sourced by
Niantic under MIT in Feb 2026; the SLAM engine binary is free for commercial
use (binary-only license) and is distributed via CDN/npm. Unlike WebXR, 8th
Wall runs on **iOS Safari**, so it covers the platforms the current app needs
two separate code paths for (Android WebXR + an iOS TFJS fallback).

## Confirmed decisions

1. **Full replace.** 8th Wall becomes the single AR pipeline on all devices.
   All `navigator.xr` code is removed.
2. **Use the free SLAM engine binary** (`@8thwall/engine-binary`, loaded with
   `data-preload-chunks="slam"`). Gives real world tracking + stable poster
   placement on all devices including iOS. Not MIT (binary-only), but free and
   requires no app key / login.
3. **Remove the iOS TFJS segmentation fallback** entirely
   (`IOSARFallback`, `IOSSegmentationDriver`, `IOSSurfaceMesh`, `segmenter`,
   `surfaceLifter`, `imuStabilizer`, and the `@tensorflow*` deps). 8th Wall
   covers iOS natively.
4. **Keep a desktop mock**, but rewrite it XR8-free (the current one depends on
   the iOS segmentation pieces being deleted).

## Target SDK facts (verified against the 8thwall/8thwall source + threejs example)

**Loading** — three `<script>` tags in `index.html` set globals `XR8`,
`XRExtras`, `LandingPage`:

```html
<script src="https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1/dist/xr.js"
        async crossorigin="anonymous" data-preload-chunks="slam"></script>
<script src="https://cdn.jsdelivr.net/npm/@8thwall/xrextras@1/dist/xrextras.js"
        crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/@8thwall/landing-page@1/dist/landing-page.js"
        crossorigin="anonymous"></script>
```

**Lifecycle** (from `threejs-world-effects-example/src/app.js`):

```js
const onxrloaded = () => {
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),     // draws camera feed
    XR8.Threejs.pipelineModule(),               // creates a three.js scene/camera/renderer
    XR8.XrController.pipelineModule(),           // SLAM world tracking
    LandingPage.pipelineModule(),                // unsupported-browser screen
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    initScenePipelineModule(),                   // our custom module
  ])
  XR8.run({ canvas })
}
window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
```

**Scene** — `XR8.Threejs.xrScene()` → `{ scene, camera, renderer }`. SLAM
drives `camera` each frame. In `onStart`, call
`XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion })`.
`XR8.XrController.recenter()` resets the origin.

**Hit test** (from `reality/app/xr/js/src/tracking-controller.ts`):

```js
XR8.XrController.hitTest(x, y, includedTypes)
// x, y: normalized screen coords in [0,1] (center = 0.5, 0.5)
// includedTypes: Array<'FEATURE_POINT'|'ESTIMATED_SURFACE'|'DETECTED_SURFACE'>
// returns: Array<{ type, position:{x,y,z}, rotation:{x,y,z,w}, distance }>
//          coordinates are in three.js world space
```

**No anchors.** 8th Wall has no `XRAnchor` API. Objects placed at a world
transform stay put because SLAM keeps the scene coordinate frame stable. Poster
"anchoring" becomes: place a mesh at `hitTest` `position`/`rotation`, leave it.

**Pipeline module shape** — `{ name, onStart({canvas}), onUpdate(), onRender(), ... }`.
Custom logic (reticle, placement) runs from `onUpdate`/`onRender`.

## Architecture mapping

### Removed (WebXR + iOS TFJS)
- `src/xr/sessionManager.ts`, `hitTest.ts`, `anchorManager.ts`,
  `planeRenderer.ts`, `syntheticSurfaceMesh.ts`, `surfaceLifter.ts`,
  `imuStabilizer.ts`, `segmenter.ts`
- `src/components/ar/IOSARFallback.tsx`, `IOSSegmentationDriver.tsx`,
  `IOSSurfaceMesh.tsx`, `PosterMesh.tsx` (if WebXR-only)
- Deps: `webxr-polyfill`, `@react-three/xr`, `@tensorflow/tfjs`,
  `@tensorflow-models/deeplab`. (`@react-three/fiber`/`drei` only if the new
  desktop mock no longer needs them — see T6.)
- WebXR `Navigator`/`XR*` augmentation in `src/vite-env.d.ts`.

### New / rewritten
- **`index.html`** — add the three CDN script tags.
- **`src/xr8/globals.d.ts`** — ambient types for `window.XR8`, `XRExtras`,
  `LandingPage`, the pipeline-module shape, and the `hitTest` result type.
- **`src/xr8/pipeline.ts`** — builds the camera-pipeline module array, runs
  `XR8.run`/`XR8.stop`, exposes `isXr8Compatible()` and an `onReady` hook.
- **`src/xr8/scene.ts`** — `initScenePipelineModule()`: lights, scene root,
  `updateCameraProjectionMatrix`, recenter-on-tap.
- **`src/xr8/hitTestController.ts`** — wraps `XR8.XrController.hitTest`, returns
  a reticle pose (compose `Matrix4` from position+quaternion), prefers
  DETECTED_SURFACE > ESTIMATED_SURFACE > FEATURE_POINT, derives vertical-ness
  from the rotation's up axis (same `|m[5]| < 0.5` test as today).
- **`src/xr8/posterPlacement.ts`** — replaces `AnchorManager`. Holds poster
  meshes at fixed world transforms; integrates with `posterStore`
  (add/remove/scale). Same "no `position.set()` after placement" discipline,
  but the matrix comes from the hit pose once, not from an anchor each frame.
- **`src/xr/reticle.ts`** — reused; `setPose` adapted to accept a composed
  matrix (no behavioral change). The head-locked "searching" scanner becomes a
  child of `XR8.Threejs.xrScene().camera`.
- **`src/xr/debugTelemetry.ts`** — reused; subsystem schema kept but relabeled:
  `webxr`→ engine readiness, `anchors`→ world-tracking, `planes`→ surfaces.
  Segmentation/stabilizer rows dropped from `SubsystemsSnapshot`.
- **`src/components/ar/ARExperience.tsx`** — rewritten as the XR8 host: owns the
  `<canvas id="camerafeed">`, registers pipeline modules, wires reticle +
  placement + store + telemetry from a custom pipeline module, and renders the
  React UI overlay as ordinary DOM on top of the canvas (no WebXR `dom-overlay`).
- **`src/components/ar/DesktopMockMode.tsx`** — rewritten XR8-free: webcam feed
  + raw three.js scene + `desktopMockDriver` (mouse→camera quaternion) + a fake
  center hit pose so reticle/placement code can be exercised without a phone.
- **`src/utils/deviceDetection.ts`** — drop `immersive-ar` checks; add
  `isXr8Compatible()` (mobile + camera) and keep camera/gyro/platform helpers.
- **`src/types/index.ts`** — `ARMode.WEBXR`→`ARMode.AR8`; refresh `XRSupport`
  (`hasWebXR`→`hasAR8`, drop iOS-fallback/emulator flags).
- **`src/App.tsx`** — branches collapse to: compatible (mobile) → `ARExperience`;
  desktop → `DesktopMockMode`; otherwise → unsupported message (8th Wall's
  `LandingPage` also covers in-experience unsupported detection).

## Data flow (runtime)

```
index.html scripts → window.XR8 ready ("xrloaded")
  → ARExperience: XR8.addCameraPipelineModules([... , customModule]); XR8.run({canvas})
    → GlTextureRenderer draws camera feed to canvas
    → XR8.Threejs creates {scene,camera,renderer}; XrController(SLAM) drives camera
    → customModule.onStart: grab xrScene, add lights/reticle/sceneRoot, updateCameraProjectionMatrix
    → customModule.onUpdate (per frame):
        hit = XR8.XrController.hitTest(0.5,0.5,[DETECTED,ESTIMATED,FEATURE])
        update reticle pose/mode; posterPlacement.update(); debugTelemetry.write()
    → user taps "place" → posterPlacement.place(reticlePose, texture) → mesh added at world transform
  → exit → XR8.stop(); dispose scene
```

## Error handling
- Engine not loaded / incompatible browser → `LandingPage` module shows the
  built-in unsupported screen; `App.tsx` also guards the desktop branch.
- Camera permission denied → `XR8` raises a runtime error caught by
  `XRExtras.RuntimeError.pipelineModule()`; surface a toast as well.
- `hitTest` empty → reticle enters "searching" mode (existing behavior).

## Testing / verification
- Static: `npm run type-check` (tsc `--noEmit`) and `npm run build`
  (`tsc && vite build`) must pass. This is the verifiable bar in this
  environment.
- Runtime device testing (real camera/SLAM on a phone) is **out of scope here**
  — it requires HTTPS on a physical device and cannot be exercised headless.
  The desktop mock provides a partial visual check of reticle/placement logic.

## Build sequence (Opus coordinates; Sonnet subagents implement)
- **Wave 1 — foundation (parallel, disjoint files):**
  - T1: `index.html` scripts + `main.tsx` (drop polyfill init) + `src/xr8/globals.d.ts`.
  - T2: `deviceDetection.ts` + `types/index.ts` + `App.tsx` branch rework.
- **Wave 2 — engine layer (parallel, depends on T1 types):**
  - T3: `src/xr8/pipeline.ts` + `src/xr8/scene.ts`.
  - T4: `src/xr8/hitTestController.ts` + `src/xr8/posterPlacement.ts` + reticle adaptation.
- **Wave 3 — integration (depends on Wave 2):**
  - T5: rewrite `ARExperience.tsx`.
  - T6: rewrite `DesktopMockMode.tsx` (XR8-free).
- **Wave 4 — cleanup:**
  - T7: delete dead files, prune `package.json` deps, relabel telemetry
    subsystems, update doc/README references to WebXR.
- **Verify (Opus):** `type-check` + `build`; fix fallout; commit; push.
