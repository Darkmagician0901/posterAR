# Task Plan — Surface-Tracking Reticle + Universal Diagnostic Panel

## Goal

Fix the "no reticle visible → can't localize → can't place posters" problem,
and add a cross-platform diagnostic panel that tells the user *which subsystem
is failing* on every device (Android WebXR, iOS Safari fallback, desktop dev).

Add a YOLO-style highlighted "tracking mesh" that sticks to the primary
detected surface, falling back gracefully when plane-detection is unavailable.

## Goal Statement (quote-back test)

> When a user opens the app on any device, they always see a status panel
> reporting whether the camera, motion sensors, WebXR session, hit-test, and
> plane-detection subsystems are working. When surface tracking IS working
> they see a clearly highlighted green mesh on the detected surface plus a
> tracking reticle. When surface tracking is partially working they see a
> visual indicator at the hit pose. When it's completely broken the panel
> explains which capability is missing and what to do.

## Current State Analysis (see findings.md)

The app already has a lot of the right pieces:
- `src/xr/reticle.ts` — ring reticle, pose-driven each frame.
- `src/xr/planeRenderer.ts` — full plane outline + fill + stability label,
  active-plane matching by normal-distance test. Active plane glows green/cyan.
- `src/xr/debugTelemetry.ts` — singleton telemetry bus, 60 FPS writer / 5 Hz reader.
- `src/components/ui/DebugHUD.tsx` — overlay showing FPS, session, hitTest,
  plane counts, anchors, stability, "show all planes" toggle.
- `src/components/ar/IOSARFallback.tsx` — separate iOS path with FloorGrid +
  GroundReticle (estimated floor, no real plane detection).

The gaps the user is hitting:
1. **HUD is hidden by default** — only visible with `?debug=1` URL param or in `mode='dev'`.
2. **HUD is only mounted on the Android WebXR path** — iOS fallback has none.
3. **"hit-test null" failure mode is invisible** — when `requestHitTestSource`
   returns null OR when `frame.getHitTestResults` returns empty every frame,
   the reticle calls `setVisible(false)` and the user sees nothing, no hint.
4. **No "searching for surface" indicator** — on a frame with no hits, screen is empty.
5. **No subsystem health rollup** — the user needs to read multiple HUD rows
   and infer; they want a clear `WebXR ✓ / Hit-test ✗ / Planes —` summary.

## Phases

### Phase 1 — Design the diagnostic panel — Status: complete

Pre-implementation: produced the design in this plan. See "Design" below.

### Phase 2 — Extend `debugTelemetry` with subsystem health — Status: complete

Add a `subsystems` field to `TelemetrySnapshot`:
```
subsystems: {
  webxr:     'ok' | 'unsupported' | 'unknown';
  session:   'active' | 'idle' | 'error' | 'unsupported';
  hitTest:   'tracking' | 'searching' | 'unavailable' | 'idle';
  planes:    'detected' | 'searching' | 'unavailable' | 'idle';
  camera:    'ok' | 'denied' | 'unavailable' | 'idle';
  motion:    'ok' | 'denied' | 'unavailable' | 'idle';
  anchors:   'ok' | 'unavailable' | 'idle';
  platform:  'android-webxr' | 'ios-fallback' | 'desktop-dev' | 'unsupported';
}
```

Write setters from each code path:
- `App.tsx` writes `platform` after `detectXRSupport()`.
- `ARExperience.tsx` writes `webxr`, `session`, `hitTest`, `planes`, `anchors`.
- `IOSARFallback.tsx` writes `camera`, `motion`.

Each subsystem keeps its existing detailed row in the HUD, plus contributes a
row in a new "Status" section.

### Phase 3 — Create `DiagnosticPanel` component — Status: complete

New file: `src/components/ui/DiagnosticPanel.tsx` + `.css`.

- Mounts at app root inside `MainLayout` so it's present on **all** branches
  (Android WebXR, iOS fallback, desktop dev, unsupported).
- Subscribes to `debugTelemetry` (same 5 Hz pattern as DebugHUD).
- Two visual states:
  - **Collapsed** (default): a small pill in top-left showing platform + a
    single colored dot (green if all green; yellow if any "searching"; red if
    any "unavailable"/"denied"/"error"). Tap to expand.
  - **Expanded**: a vertical list of subsystem rows with icon + name + status
    chip. Each row's icon color encodes status.
- Visible by default on **all** devices, regardless of `?debug=1`. Can be
  dismissed by user (persisted to `sessionStorage`), with a small "(?)" handle
  to bring it back.
- The existing `DebugHUD` stays as the deep telemetry view (FPS, plane counts,
  toggles), still gated by `?debug=1` / dev mode.

### Phase 4 — "Searching" reticle fallback — Status: complete

In `reticle.ts`, add a second mode: when hit-test is active but no surface is
hit, render a head-locked "scanning" reticle in front of the camera (1 m
ahead) with a slowly pulsing outline. Visually communicates "we're looking,
move the phone around."

Driver lives in `ARExperience.tsx`:
- If `hitPose` present → existing surface-locked behavior.
- Else if `hitTestSource` present → scanning mode (camera-locked).
- Else → hidden, panel shows "hit-test unavailable".

### Phase 5 — Force the tracking mesh to appear — Status: complete

The plane mesh already exists in `planeRenderer.ts` but only shows when
plane-detection returns ≥1 polygon AND the active-match heuristic picks it.
Two fixes:

a. **Stickier active match**: keep showing the previously-active plane for
   ~500 ms after the hit pose stops landing on it, so brief tracking jitter
   doesn't make the mesh blink off.

b. **Synthetic mesh fallback**: when `frame.detectedPlanes` is undefined
   (ARCore session without plane-detection feature), draw a 60 cm × 60 cm
   semi-transparent green grid quad **at the hit pose**, oriented to the
   hit's normal. This gives the YOLO-style "this is the surface we found"
   visual even without real plane data. Implemented in a new tiny class
   `SyntheticSurfaceMesh` and wired into the `planeRenderer.update` flow.

### Phase 6 — Wire iOS path into the same diagnostic flow — Status: complete

`IOSARFallback.tsx` writes to `debugTelemetry`:
- `camera`: ok / denied / unavailable
- `motion`: ok / denied / unavailable (use the `DeviceOrientationEvent.requestPermission` result)
- `platform`: 'ios-fallback'
- A "surface" pseudo-subsystem: `tracking` when the floor reticle has a hit, `searching` otherwise.

### Phase 7 — Cross-platform smoke checks — Status: complete (build clean; visual checks pending on real devices)

- Desktop dev mode (no emulator): panel should show `platform: desktop-dev`,
  `webxr: ok` (Chrome flag) OR `webxr: unsupported`. No camera/motion required.
- Desktop with WebXR API Emulator: full Android-equivalent path. Plane mesh
  should appear at emulator's hit pose.
- iOS Safari: panel mounts, `webxr: unsupported`, `camera + motion` populated
  after grant. Synthetic mesh = the existing FloorGrid; report as `planes: estimated`.
- Android Chrome (real device): full hit-test + planes path. Synthetic mesh
  not engaged when real planes present.

### Phase 8 — Verification — Status: complete (tsc + vite build pass; dev server running)

- `npm run build` succeeds.
- `npm run dev` and visually confirm:
  - Diagnostic panel mounts before AR session starts.
  - On desktop without emulator, panel reports correctly.
  - With WebXR API Emulator, hit-test transitions panel from "searching" → "tracking".
  - Synthetic mesh appears in emulator (which doesn't expose plane-detection).

## Design — Diagnostic Panel mockup

```
┌──────────────────────────────────┐
│ ● Android · WebXR     [collapse] │  ← collapsed: single pill, dot = worst
├──────────────────────────────────┤
│ ◯ WebXR        ok                │
│ ◯ Session      active            │
│ ● Hit-test     searching         │  ← amber = looking
│ ◯ Planes       detected (3H/0V)  │
│ ◯ Anchors      ok                │
│ ─                                │
│ Move phone left/right, point at   │
│ a flat surface 0.5-2 m away.      │
└──────────────────────────────────┘
```

Colors:
- ● Green: 'ok' / 'active' / 'tracking' / 'detected'
- ● Amber: 'searching'
- ● Red:   'denied' / 'error' / 'unavailable'
- ◌ Gray:  'idle' / 'unknown'

## Better-options the user asked for

| Option | Verdict |
|---|---|
| Replace home-built panel with `lil-gui` / `dat.gui` | No. Extra dep, doesn't fit our UX (we want a non-dev-looking diagnostic UI, not a knob panel). |
| Use React DevTools or in-page console panel | No. Doesn't survive AR DOM-overlay context and isn't readable on mobile. |
| Use Three.js Inspector | No. Same problem — desktop dev-tools-style UI. |
| Stick with `debugTelemetry` singleton + a thin React reader | **Yes.** Already battle-tested in this codebase, zero new deps, works inside DOM overlay. |
| Synthetic mesh from hit normal vs. waiting for plane-detection | **Yes for fallback.** Plane-detection has spotty support and we lose nothing by also drawing a normal-aligned quad at the hit pose. |
| Bigger ring + outer glow for reticle | Nice-to-have, low effort, throw it in Phase 4. |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|

## Files affected (planned)

- `src/xr/debugTelemetry.ts` — add `subsystems` to snapshot + setters
- `src/xr/reticle.ts` — add scanning mode + camera-locked path
- `src/xr/planeRenderer.ts` — sticky active match + integrate synthetic mesh
- `src/xr/syntheticSurfaceMesh.ts` — new, fallback when `detectedPlanes` undefined
- `src/components/ui/DiagnosticPanel.tsx` — new
- `src/components/ui/DiagnosticPanel.css` — new
- `src/components/ar/ARExperience.tsx` — write subsystem states
- `src/components/ar/IOSARFallback.tsx` — write subsystem states
- `src/App.tsx` — mount `<DiagnosticPanel />` at root, write platform state
