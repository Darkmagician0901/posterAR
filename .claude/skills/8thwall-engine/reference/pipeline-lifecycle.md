---
module: CameraPipelineModule
source: https://www.8thwall.com/docs/api/engine/api/engine/xr8/addcamerapipelinemodule
updated: 2026-07-21
---

# Camera Pipeline Module lifecycle

A camera pipeline module is 8th Wall's plugin unit. It is a plain object with a
unique `name` string plus any subset of the lifecycle callbacks below. XR8 invokes
them as the camera session starts, processes each frame, errors, and shuts down.
Add modules with `XR8.addCameraPipelineModule(s)`; the local shape used by this
repo is `Xr8PipelineModule` in `src/xr8/globals.d.ts`.

## Per-frame invocation order

```
onBeforeRun
  -> onCameraStatusChange   (requesting -> hasStream -> hasVideo | failed)
    -> onStart
      -> onAttach           (once, before the module's first frame)
        -> onProcessGpu -> onProcessCpu -> onUpdate -> onRender   (repeats every frame)
```

`onProcessGpu`/`onProcessCpu` return values are surfaced to later stages as
`processGpuResult.<moduleName>` / `processCpuResult.<moduleName>`, where
`<moduleName>` is that producing module's `name`.

## Callbacks

### `name` (required string)
Unique identifier for the module. XR8 rejects duplicate names.

### `onBeforeRun({})`
Called immediately after `XR8.run()`. If it returns promises, XR8 waits on all of
them before continuing. Use for async setup that must finish before the loop runs.

### `onCameraStatusChange({ status })`
Called as the camera permission request progresses. `status` is one of
`'requesting' | 'hasStream' | 'hasVideo' | 'failed'`.

### `onStart({ canvas, GLctx, computeCtx, ... })`
First callback after `XR8.run()`; the camera session has started. Build your scene
here. Receives the display `canvas` and its `GLctx` (WebGL/WebGL2 rendering context).

### `onAttach({ framework, canvas, GLctx, computeCtx, isWebgl2, orientation, videoWidth, videoHeight, canvasWidth, canvasHeight, status, stream, video, version, imageTargets, config })`
Called once before the module's first frame update — for modules added before OR
after the pipeline is running. Bundles the most recent data from `onStart`,
`onDeviceOrientationChange`, `onCanvasSizeChange`, `onVideoSizeChange`,
`onCameraStatusChange`, and `onAppResourcesLoaded`. Key params: `orientation` (UI
rotation from portrait, one of -90/0/90/180), `config` (the object passed to
`XR8.run()`), `imageTargets` (array of `{imagePath, metadata, name}`).

### `onProcessGpu({ frameStartResult })`
Starts GPU processing for the frame. Return value is passed to `onProcessCpu` and
surfaced as `processGpuResult.<name>`.

### `onProcessCpu({ frameStartResult, processGpuResult })`
Reads GPU results and returns usable CPU-side data, surfaced as
`processCpuResult.<name>`. `frameStartResult` exposes `GLctx` and `cameraTexture`.

```ts
XR8.addCameraPipelineModule({
  name: 'mycamerapipelinemodule',
  onProcessCpu: ({ frameStartResult, processGpuResult }) => {
    const { GLctx, cameraTexture } = frameStartResult
    const { camerapixelarray } = processGpuResult
    return { cpuDataA: 1, cpuDataB: 2 } // provided to onUpdate as processCpu.mycamerapipelinemodule
  },
})
```

### `onUpdate({ processGpuResult, processCpuResult })`
Update the scene before render. Producer data is present as
`processGpuResult.<name>` / `processCpuResult.<name>`.

### `onRender({})`
Called after `onUpdate`; time to issue WebGL draw commands. NOT called when an
external run loop drives `XR8.runPreRender()` / `XR8.runPostRender()` — then the
external loop owns all rendering.

### `onCanvasSizeChange({})`
Called when the display canvas changes size.

### `onVideoSizeChange({})`
Called when the camera video size changes.

### `onDeviceOrientationChange({})`
Called when the device switches landscape/portrait.

### `onException(error)`
Called with the error object when XR8 catches an error in any module.

### `onPaused({})`
Called when `XR8.pause()` is invoked.

### `onResume({})`
Called when `XR8.resume()` is invoked.

### `onDetach({})`
Called after the module's last frame update — when the engine stops or the module
is removed, whichever comes first. Tear down resources here.

### `onRemove({})`
Called when the module is removed from the pipeline.

### `onAppResourcesLoaded({})`
Called when app resources are received from the server.

### `requiredPermissions()`
Return browser capabilities the module needs so the framework can request
permissions before running XR.

## Gotchas

- `onRender` is skipped under an external run loop; do render work in the loop.
- Producer/consumer wiring is by module `name` — a typo silently yields no data.
- This repo installs XR8's own modules (`GlTextureRenderer`, `Threejs`,
  `XrController`, `CanvasScreenshot`, `CameraPixelArray`) plus one custom module;
  see `src/xr8/pipeline.ts`.
