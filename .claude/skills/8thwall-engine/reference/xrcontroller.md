---
module: XR8.XrController
source: https://www.8thwall.com/docs/api/engine/api/engine/xrcontroller
updated: 2026-07-21
---

# XR8.XrController

Provides 6DoF world tracking (SLAM) and the interfaces for configuring it, running
hit-tests against the real world, recentering, and matching the virtual camera to
the device camera. Install its pipeline module for tracking to run.

## Methods

### `XR8.XrController.configure(options)`
`configure(options): void`

Configures what processing `XrController` performs (has performance implications).
Some options (notably `disableWorldTracking`) must be set BEFORE
`XR8.XrController.pipelineModule()` and `XR8.run()` and cannot change while running.

Options:
- `disableWorldTracking: boolean` (default `false`) — turn off SLAM for efficiency;
  set before `run()`. This repo toggles it for the desktop/mock path.
- `enableLighting: boolean` (default `false`) — surface lighting as
  `processCpuResult.reality.lighting`.
- `enableWorldPoints: boolean` (default `false`) — surface `reality.worldPoints`.
- `enableVps: boolean` (default `false`) — look for Project Locations + mesh;
  overrides `scale` and `disableWorldTracking`.
- `imageTargets: string[]` (default `[]`) — names of image targets to detect;
  modifiable at runtime; replaces the active set. See `imagetargets.md`.
- `scale: 'responsive' | 'absolute'` (default `'responsive'`) — `responsive` puts
  frame-1 camera at the origin; `absolute` returns metres.
- `leftHandedAxes: boolean` (default `false`) — use left-handed coordinates.
- `mirroredDisplay: boolean` (default `false`) — flip left/right in output.
- `projectWayspots: string[]` (default `[]`) — subset of Project Locations to
  localize against.

```ts
XR8.XrController.configure({ disableWorldTracking: true })
XR8.run({ canvas: document.getElementById('camerafeed') })
```

### `XR8.XrController.hitTest(x, y, includedTypes)`
`hitTest(x: number, y: number, includedTypes: string[]): Xr8HitResult[]`

Estimate the 3D world position of a point on the camera feed. `x`/`y` are
normalized screen coordinates in `[0,1]` (top-left origin). `includedTypes` filters
result kinds: `'FEATURE_POINT'`, `'ESTIMATED_SURFACE'`, `'DETECTED_SURFACE'`.
Each result is `{ type, position:{x,y,z}, rotation:{x,y,z,w}, distance }` (metres).
Repo usage: `src/xr8/hitTestController.ts`; result type is `Xr8HitResult` in
`src/xr8/globals.d.ts`.

```ts
const [hit] = XR8.XrController.hitTest(0.5, 0.5, ['DETECTED_SURFACE'])
if (hit) placePoster(hit.position, hit.rotation)
```

### `XR8.XrController.updateCameraProjectionMatrix(params)`
`updateCameraProjectionMatrix({ origin, facing, cam }): void`

Reset the scene's display geometry and the camera's starting pose. `origin`
(`{x,y,z}`) and `facing` (quaternion `{w,x,y,z}`) define where the camera sits and
looks at session start; `cam` carries clip planes / pixel rect for correct overlay.
Repo usage: `src/components/ar/StoryARExperience.tsx`.

### `XR8.XrController.recenter()`
`recenter(): void`

Reposition the camera to the origin/facing from `updateCameraProjectionMatrix` and
restart tracking. In A-Frame the equivalent is `scene.emit('recenter', {origin, facing})`.

### `XR8.XrController.pipelineModule()`
`pipelineModule(): CameraPipelineModule`

Creates the tracking pipeline module. Once installed it receives camera-start,
processing, and state-change callbacks and computes the camera pose. Add it via
`XR8.addCameraPipelineModules([...])` (repo: `src/xr8/pipeline.ts`).

## Events / reality data

With the pipeline module installed, per-frame data arrives as
`processCpuResult.reality` in `onUpdate` (e.g. `reality.lighting`,
`reality.worldPoints` when enabled). Tracking-status and image events surface here.

## Gotchas

- `disableWorldTracking: true` must precede `pipelineModule()` and `run()` and is
  immutable while running.
- `hitTest` coordinates are normalized `[0,1]`, NOT pixels.
- 8th Wall detects only ONE horizontal ground plane; there is no vertical/wall
  detection — see this repo's CLAUDE.md "Gotchas".
