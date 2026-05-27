# Findings — current XR pipeline state

## What's already implemented (and good)

### `src/xr/reticle.ts`
- Green ring (`RingGeometry(0.07, 0.1, 32)`) rotated to lie flat on horizontal surfaces.
- `matrixAutoUpdate = false`, matrix rewritten from hit-test pose every frame.
- Colors switch to cyan for vertical surfaces.
- **Limitation**: when `setVisible(false)` is called (no hit), there is no
  visual fallback — the user sees nothing.

### `src/xr/planeRenderer.ts`
- Builds per-plane Group with outline (LineLoop), fill (Mesh), label (Sprite).
- Renders ONE active plane at a time unless `showAll` toggle is on.
- Active plane chosen by point-to-plane normal distance + polygon bounding sphere.
- Stability label: `forming` (amber), `stable` (green), `reshaping` (red).
- **Limitation**: only fires when `frame.detectedPlanes` is defined and contains
  geometry. Many WebXR sessions (including the WebXR API Emulator) don't expose
  `plane-detection` at all, so this code never lights up.
- **Limitation**: active match drops the moment the hit pose moves slightly
  off the polygon's bounding sphere — visible blink during normal scanning.

### `src/xr/hitTest.ts`
- Single hit-test source rooted at viewer space (correct — moves with camera).
- Iterates results, prefers vertical-normal hits.
- **Failure modes** (silent today):
  - `session.requestHitTestSource` missing → returns null, logs to console only.
  - `getHitTestResults` throws → returns null.
  - Zero results → returns null.

### `src/xr/debugTelemetry.ts`
- Module-singleton with hot-path-safe write (`Object.assign`, no spread).
- FPS via EMA on frame dt.
- HUD visibility gated by `?debug=1` URL param OR `mode==='dev'`.
- Subscriber list for the small set of fields the HUD listens to reactively
  (showAllPlanes, hudVisible).

### `src/components/ui/DebugHUD.tsx`
- Samples telemetry at 5 Hz via `setInterval(..., 200)`.
- Rows: FPS, Session, RefSpace, Hit-test, Planes, Anchors, Active stability.
- "Show all planes" checkbox.

### `src/components/ar/ARExperience.tsx`
- Direct three.js + WebXR (no R3F for the AR session).
- `requestARSession` with required: hit-test/anchors/dom-overlay; optional:
  plane-detection/light-estimation/local-floor.
- Frame loop: hit-test → reticle pose → anchor update → plane update → telemetry write.
- **DebugHUD is mounted inside ARExperience JSX** — only on Android WebXR path.

### `src/components/ar/IOSARFallback.tsx`
- Camera via `getUserMedia({ facingMode: 'environment' })`.
- `DeviceOrientationEvent` → quaternion → camera slerp.
- `FloorGrid` at `y = -1.5` (assumed head height).
- `GroundReticle` raycasts camera forward → floor.
- **No DebugHUD here.** User has zero feedback if camera or motion permission fails silently.

## What's missing (causing the user's symptoms)

| Symptom | Likely cause | Where to fix |
|---|---|---|
| "I see no reticle" | Hit-test source null OR zero results; reticle becomes invisible; HUD off by default. | Reticle scanning fallback + Diagnostic panel always-on. |
| "Photos can't localize" | Without a hit pose, `onSelect` no-ops (`lastReticleMatrix === null`). | Same fix — make hit-test status visible. |
| "I need to know which functions are down on all devices" | DebugHUD only on Android path, gated behind URL param. | New DiagnosticPanel mounted at root, no gating. |
| "Tracking mesh stuck to primary surface" | planeRenderer requires `frame.detectedPlanes`; most sessions don't expose it. | Synthetic mesh at hit pose as fallback. |

## Platform compatibility constraints

- **Android Chrome 90+ on ARCore device**: full WebXR immersive-ar with
  hit-test + anchors. `plane-detection` available on ARCore but optional
  feature only. `dom-overlay` works.
- **iOS Safari (any version, any iPhone)**: NO WebXR immersive-ar (Apple has
  not shipped it). The existing IOSARFallback is the right approach — keep
  it, just wire its state into the diagnostic panel.
- **WebXR API Emulator (Chrome extension on desktop)**: provides
  immersive-ar with hit-test, but does NOT emit `detectedPlanes`. This is
  precisely the case the synthetic surface mesh handles.
- **Quest Browser / Oculus**: technically WebXR-capable; not a target for
  this poster app, but our session requirements (camera see-through, DOM
  overlay) won't work cleanly. Fall through to "unsupported" branch.

## Browser API caveats relevant to the diagnostic panel

- `DeviceOrientationEvent.requestPermission` exists on iOS 13+ only — feature-detect.
- `navigator.xr.isSessionSupported('immersive-ar')` can throw — already wrapped.
- `frame.detectedPlanes` is on a non-standard extension; check existence not just truthiness.
- `navigator.permissions.query({ name: 'camera' })` exists on Chromium but not
  Safari — can't rely on it; we infer camera state from getUserMedia outcome.

## Decision: keep `debugTelemetry` singleton as the source of truth

Alternative: Zustand store. Rejected — telemetry writes happen 60×/sec from
the XR animation loop and we deliberately keep them out of React reconciliation.
The 5-Hz reader pattern is correct and lightweight.
