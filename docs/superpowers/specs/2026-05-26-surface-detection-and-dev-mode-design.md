# Surface Detection Visualization + Desktop Dev Mode — Design

**Date:** 2026-05-26
**Status:** Draft, awaiting review
**Repo:** `Darkmagician0901/posterAR`
**Branch baseline:** `main` @ `ee9522d`

## Problem

Two unrelated symptoms surfaced in the same conversation, both rooted in feedback-deficiency in the AR pipeline:

1. **No visible surface detection.** The current build only renders a small ring reticle at the hit-test point. There is no indication that ARCore is finding planes, how stable they are, or which surface a tap would land on. Users (including the developer) cannot tell whether "surface detection isn't working" means *the API returned nothing*, *the API returned a tentative plane*, or *the UI just doesn't show anything*.
2. **Desktop browsers are gated out.** `App.tsx` shows an "AR Not Supported" wall to any browser that returns `false` from `navigator.xr.isSessionSupported('immersive-ar')`. This blocks development on a PC, where the bulk of UI / upload / gallery work is done.

This spec covers both, plus a debug HUD that makes the AR pipeline observable on real devices.

## Goals

- **Visualize the active detected surface.** The plane the reticle is currently sitting on gets a polygon outline + ~25% translucent fill, color-coded by orientation, with a small label showing its tracking stability.
- **Honest stability signal.** WebXR plane-detection does not expose a confidence value. Surface the closest honest proxies (plane age, change rate, lastChangedTime flash) so the user can tell when a plane is reliable.
- **Allow desktop development.** Drop the "AR Not Supported" wall on desktop; route to the same `ARExperience` UI with a dev-mode banner. The `Start AR` button stays enabled when the WebXR Emulator extension is detected; otherwise it shows a tooltip explaining why.
- **Diagnose-on-device.** A toggleable debug HUD shows FPS, session info, hit-test status, plane count, anchor count. Available on both desktop and the live phone.
- **Zero new heavyweight dependencies.** No YOLO, no OpenCV.js, no MediaPipe.

## Non-Goals

- No CV-based surface detection fallback. (~5 MB JS for a problem WebXR already solves on ARCore devices; iOS is on a separate fallback path anyway.)
- No persistence of placed posters across sessions.
- No multi-user / shared AR.
- No cloud anchors.
- No real `confidence` value reported as a percentage — there is no such number in the WebXR API.
- No changes to the existing `IOSARFallback` interaction model.

## Approach: WebXR `plane-detection` + dev-mode UI gate

`immersive-ar` already lists `plane-detection` as an optional feature in `sessionManager.ts`. When granted, `frame.detectedPlanes` is a `Set<XRPlane>` each frame, each carrying:

- `planeSpace: XRSpace` — `frame.getPose(planeSpace, localSpace)` gives the pose
- `polygon: DOMPointReadOnly[]` — convex hull, in plane-local coordinates
- `orientation: 'horizontal' | 'vertical'`
- `lastChangedTime: number`

A new `PlaneRenderer` consumes this and renders **the single plane the reticle currently rests on**. Other detected planes exist in the cache but are not drawn unless a debug toggle ("Show all planes") is on. Stability is communicated by a small label color (green / amber / red) plus a HUD counter.

The desktop dev mode is a UI gate change only — the AR session code is identical. When `navigator.xr.isSessionSupported('immersive-ar')` returns true on a desktop UA, that's the WebXR API Emulator (Mozilla / Immersive Web) doing its job, and the existing pipeline runs against it as-is.

## Architecture

### New files

```
src/xr/planeRenderer.ts        - manages active-plane mesh; caches per XRPlane
src/xr/debugTelemetry.ts       - module-singleton ref shape, written by anim loop
src/components/ui/DebugHUD.tsx - toggleable overlay reading debugTelemetry at 5Hz
```

### Modified files

```
src/components/ar/ARExperience.tsx    - wire PlaneRenderer + telemetry into anim loop;
                                        accept mode='dev'|'live' prop
src/components/ui/ControlPanel.tsx    - add HUD toggle button (ⓘ)
src/App.tsx                           - drop desktop wall; route desktop to
                                        ARExperience mode='dev' with banner
src/utils/deviceDetection.ts          - add isDesktop() and isWebXREmulator() helpers
```

### Frame loop (single source of truth: `ARExperience.tsx`)

```
renderer.xr.setAnimationLoop((time, frame) => {
  if (!frame || !localSpace) return;

  // 1. Hit-test (existing).
  const hitPose = hitTestSource
    ? readHitTestPose(frame, hitTestSource, localSpace)
    : null;
  if (hitPose) {
    reticle.setPose(hitPose.matrix);
    reticle.setVertical(hitPose.vertical);
    lastReticleMatrix = hitPose.matrix;
  } else {
    reticle.setVisible(false);
    lastReticleMatrix = null;
  }

  // 2. Anchors (existing).
  anchorManager.update(frame, localSpace);

  // 3. Planes (new).
  planeRenderer.update({
    planes: frame.detectedPlanes,           // Set<XRPlane> or undefined
    activePlaneHit: hitPose,                // for geometric match
    localSpace,
    showAll: debugTelemetry.showAllPlanes,
  });

  // 4. Telemetry (new).
  debugTelemetry.write({
    fps: rollingFps(time),                  // 1000 / EMA(frame_dt, alpha=0.1)
    session: 'immersive-ar' + (isEmulatorSession ? ' (emulator)' : ''),
    refSpace: 'local',
    hitTest: hitPose ? (hitPose.vertical ? 'vertical' : 'horizontal') : null,
    planesTotal: frame.detectedPlanes?.size ?? null,
    planesByOrientation: countByOrientation(frame.detectedPlanes),
    anchors: anchorManager.size(),
    activePlaneStability: planeRenderer.getActiveStability(),
  });

  // 5. Render.
  renderer.render(scene, camera);
});
```

### PlaneRenderer behavior

- Maintains `cache: Map<XRPlane, PlaneRecord>` where `PlaneRecord = { mesh, lastChangedTime, firstSeen, changeRateEMA }`.
- Each `update()` call:
  1. Drops cache entries for planes not in the incoming Set (disposes geometry + material).
  2. For each plane in the Set: if missing from cache, build a `Mesh` (LineLoop outline + triangulated fill) from `plane.polygon`. If `plane.lastChangedTime` increased, rebuild geometry and update `changeRateEMA`.
  3. Compute `activePlane`: scan the cache, project `activePlaneHit.matrix`'s translation into each plane's local frame, find the plane whose polygon contains that point and whose normal-distance is ≤ 2 cm. If none match, `activePlane = null`.
  4. For each cached plane: set `mesh.visible = (plane === activePlane) || showAll`. Active plane uses full opacity + label; passive (showAll) uses 30% opacity outline only, no fill, no label.
  5. For each visible plane, set `mesh.matrix` from `frame.getPose(plane.planeSpace, localSpace).transform.matrix`. `mesh.matrixAutoUpdate = false`.

### Stability label

A `THREE.Sprite` anchored at the active plane's polygon centroid (computed in plane-local space, transformed by the plane's pose matrix each frame). The sprite's texture is a small canvas-rendered string ("stable" / "forming" / "reshaping") so we don't depend on DOM-overlay layout coordinates. Color reflects:

| State | Trigger | Color |
|---|---|---|
| Stable | age > 5 s AND changeRateEMA < 0.5 Hz | `#22c55e` |
| Forming | age < 2 s OR changeRateEMA ≥ 0.5 Hz | `#f59e0b` |
| Reshaping | `lastChangedTime` updated this frame | `#ef4444` (briefly, ~250 ms) |

Color choice for the plane fill follows orientation, not stability: green (`#22c55e` @ 25%) for horizontal, cyan (`#06b6d4` @ 25%) for vertical. Stability is conveyed by the label only — avoids the label color and fill color fighting each other.

### Debug HUD

Toggled by either:
- The "ⓘ" button in `ControlPanel` (works in DOM overlay during a live session and on desktop dev mode), OR
- `?debug=1` in the URL (initial state on load).

Layout:
```
┌─────────────────────────────┐
│ FPS:       60               │
│ Session:   immersive-ar     │
│            (emulator)       │
│ RefSpace:  local            │
│ Hit-test:  ✓ vertical       │
│ Planes:    3 (2H, 1V)       │
│ Anchors:   1                │
│ Active:    stable           │
│ [ ] Show all planes         │
└─────────────────────────────┘
```

Reads from `debugTelemetry` every 200 ms (5 Hz, not 60 FPS — avoid React re-renders on the hot loop). State stored as plain refs in a singleton module so the animation loop can write without going through React.

### Desktop dev mode

`App.tsx` routing change:

```
if (xrSupport?.hasWebXR)              → ARExperience mode='live'
else if (xrSupport?.hasIOSFallback)   → IOSARFallback (unchanged)
else if (isDesktop())                 → ARExperience mode='dev' + DevBanner
else (mobile, no AR, no iOS path)     → "AR Not Supported" wall (unchanged)
```

`mode='dev'` differences from `mode='live'`:
- Renders a `<DevBanner />` at the top with the WebXR Emulator install link.
- `Start AR` button: enabled iff `isWebXREmulator()` is true; otherwise greyed with tooltip "Install the WebXR API Emulator extension to mock an AR session".
- HUD defaults to visible (`?debug=1` implicit).
- No other behavioral differences — the AR session, plane renderer, anchor manager, tap-to-place all run identically.

### Detection helpers (deviceDetection.ts additions)

```ts
export const isDesktop = (): boolean =>
  !isMobile() && !isIOS() && !isAndroid();

// Async, awaited once during initial detection in App.tsx. Result is stored
// on the XRSupport object so per-frame code can read it synchronously.
export const detectWebXREmulator = async (): Promise<boolean> => {
  if (!isDesktop()) return false;
  return await checkWebXRSupport();
};
```

The XRSupport object grows a `hasWebXREmulator: boolean` field. ARExperience captures `isEmulatorSession = xrSupport.hasWebXREmulator` once at session start; the animation loop reads it synchronously. `checkWebXRSupport` already returns `navigator.xr?.isSessionSupported('immersive-ar')`.

## Data flow

```
session start ─► requestSession({ required: [hit-test, anchors, dom-overlay],
                                   optional: [plane-detection, light-estimation,
                                              local-floor] })
                ► localSpace = session.requestReferenceSpace('local')
                ► hitTestSource = session.requestHitTestSource({ space: viewer })

each frame  ─►  hitTest                 ─► reticle pose, lastReticleMatrix
            ─►  anchorManager.update    ─► poster meshes (existing)
            ─►  planeRenderer.update    ─► active plane mesh + stability
            ─►  debugTelemetry.write    ─► HUD reads at 5 Hz
            ─►  renderer.render(scene, camera)

on `select` ─►  if lastReticleMatrix: anchorManager.createAnchor(...) (existing)

session end ─►  setAnimationLoop(null)
            ─►  anchorManager.clear()
            ─►  planeRenderer.dispose()
            ─►  debugTelemetry.reset()
            ─►  renderer.dispose()
```

## State boundaries

| State | Lives in | Lifetime |
|---|---|---|
| Plane mesh cache | `PlaneRenderer` instance | Session (cleared on `session.end`) |
| Anchor records | `AnchorManager` instance | Session |
| Reticle matrix | Closure in animation loop | Frame |
| `debugTelemetry` refs | Module singleton | App lifetime; reset on session end |
| Posters (logical) | Zustand `posterStore` | App lifetime |
| Toast / loading | Zustand `useUIState` | App lifetime |

`PlaneRenderer` does not touch the poster store — planes are visualization only.

## Error handling

| Failure | Behavior |
|---|---|
| `requiredFeatures` rejected at `requestSession` | Toast "AR start failed: ${msg}". UI stays on Start button. No silent fallback. (Existing.) |
| `optionalFeatures` not granted (plane-detection denied) | `PlaneRenderer.update` no-ops; HUD shows "Planes: n/a". Reticle still works. |
| Hit-test source request fails | Toast "Hit-test feature unavailable"; reticle hidden, session continues so dev-mode UI is still reachable. |
| `createAnchor` throws | Toast "Failed to place poster"; rollback the optimistic `posterStore.addPoster`. (Existing.) |
| `plane.polygon` malformed / triangulation fails | Log + skip this plane. Treat as not-detected until next `lastChangedTime` bump. Do not crash the loop. |
| WebXR Emulator installed but session denied (emulator's "Enable AR" toggle off) | Toast directs user to the emulator panel's enable switch. |

## Testing

No unit test infra exists in this repo. Testing is manual + checklist, gated by:

1. **Build gate.** `npm run type-check && npm run build` must pass before commit.
2. **Desktop dev-mode smoke** (Chrome + WebXR API Emulator extension):
   - Start AR succeeds → emulator panel shows session
   - Reticle tracks the emulator's fake hit-test ray
   - Tap places an anchor; emulator confirms
   - HUD updates at ~5 Hz; FPS reads in the 50–60 range
   - "Show all planes" toggle reveals every plane in the emulator scene
3. **Android device smoke** (Chrome 90+ on an ARCore-supported phone):
   - Point at a wall → cyan outline + label within ~5 s
   - Label transitions Forming → Stable as ARCore confirms
   - Tap places poster on wall; poster stays put when walking around
   - Move to floor → outline switches to green
   - Delete poster → mesh disappears
4. **iOS smoke** (Safari on iPhone): unchanged — verify `IOSARFallback` still works and is unaffected.
5. **Negative test**: Firefox desktop with no extension → lands in dev mode with greyed-out "Start AR" + tooltip, NOT the wall.

## Risks

- **Polygon triangulation** for non-convex planes — WebXR planes are convex per the spec, but Chrome occasionally emits self-intersecting polygons in early-detection frames. Mitigation: validate winding/area; skip on degenerate input.
- **`detectedPlanes` undefined when `plane-detection` is denied or unsupported** — handle as a normal `null` branch, not an exception.
- **Performance** with `Show all planes` on in a complex scene — bound the cache to e.g. 32 planes; ARCore rarely exceeds 10.
- **Active-plane geometric match** can falsely select a coplanar but separate plane (two walls in line). Acceptable for v1; revisit if it visibly bothers the user.

## Out-of-scope follow-ups (future work, not this spec)

- Persisted anchors across sessions (Cloud Anchors or local serialization).
- Plane mesh shader-based shimmer to convey stability without a text label.
- iOS path benefiting from a CV planar detector to give some surface feedback (currently a fixed-distance drop).
- Snap-to-plane orientation: rotate the placed poster so its normal matches the plane's normal exactly.

## File-level checklist (for the implementation plan)

- [ ] `src/xr/planeRenderer.ts` — new, ~200 lines
- [ ] `src/xr/debugTelemetry.ts` — new, ~50 lines
- [ ] `src/components/ui/DebugHUD.tsx` (+`.css`) — new
- [ ] `src/components/ar/ARExperience.tsx` — wire renderer + telemetry; accept `mode` prop
- [ ] `src/components/ui/ControlPanel.tsx` — HUD toggle button
- [ ] `src/App.tsx` — desktop dev-mode branch + `<DevBanner />`
- [ ] `src/components/ui/DevBanner.tsx` (+`.css`) — new
- [ ] `src/utils/deviceDetection.ts` — `isDesktop`, `isWebXREmulator`
- [ ] No changes to `posterStore`, `anchorManager`, `hitTest`, `sessionManager`, `IOSARFallback`, `useGestures`, `PosterMesh`.
