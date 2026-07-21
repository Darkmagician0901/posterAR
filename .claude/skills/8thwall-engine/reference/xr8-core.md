---
module: XR8
source: https://www.8thwall.com/docs/api/engine/api/engine/xr8
updated: 2026-07-21
---

# XR8 (core)

The global entry point to the 8th Wall Web engine. Loaded from CDN as a runtime
global (see `index.html`), not npm. Owns WebAssembly init, the camera pipeline
module list, and the session run loop. Typical startup: register modules, then
`XR8.run({ canvas })`.

## Methods

### `XR8.run(config)`
`run(config: { canvas: HTMLCanvasElement, ... }): void`

Open the camera and start the camera run loop. `config` is forwarded to every
module's `onAttach` as `config`. Repo usage: `src/xr8/pipeline.ts`.

```ts
const onxrloaded = () => {
  XR8.addCameraPipelineModules([XR8.GlTextureRenderer.pipelineModule()])
  XR8.run({ canvas: document.getElementById('camerafeed') })
}
window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
```

### `XR8.stop()`
`stop(): void` — Stop the session; closes the camera feed and stops motion tracking.

### `XR8.pause()`
`pause(): void` — Pause the session; camera feed stops and device motion is not
tracked. Fires each module's `onPaused`.

### `XR8.resume()`
`resume(): void` — Resume a paused session. Fires each module's `onResume`.

### `XR8.isPaused()`
`isPaused(): boolean` — Whether the session is currently paused.

```ts
if (!XR8.isPaused()) { XR8.pause() } else { XR8.resume() }
```

### `XR8.addCameraPipelineModule(module)`
`addCameraPipelineModule(module: CameraPipelineModule): void` — Add one module that
will receive lifecycle callbacks. See `pipeline-lifecycle.md`.

### `XR8.addCameraPipelineModules(modules)`
`addCameraPipelineModules(modules: CameraPipelineModule[]): void` — Add many, in
order. Convenience wrapper over `addCameraPipelineModule`.

### `XR8.removeCameraPipelineModule(module)`
`removeCameraPipelineModule(module): void` — Remove a single module.

### `XR8.removeCameraPipelineModules(modules)`
`removeCameraPipelineModules(modules): void` — Remove many. Accepts module names.

```ts
XR8.removeCameraPipelineModules(['threejsrenderer', 'reality'])
```

### `XR8.clearCameraPipelineModules()`
`clearCameraPipelineModules(): void` — Remove all modules from the loop.

### `XR8.initialize()`
`initialize(): Promise<void>` — Resolves once the engine WebAssembly is initialized.

### `XR8.isInitialized()`
`isInitialized(): boolean` — Whether the engine WebAssembly is initialized.

### `XR8.requiredPermissions()`
`requiredPermissions(): string[]` — Permissions required by the loaded modules.

### `XR8.runPreRender()`
`runPreRender(): void` — Run lifecycle updates that must happen before rendering.
For apps supplying their own run loop (then `onRender` is not called).

### `XR8.runPostRender()`
`runPostRender(): void` — Run lifecycle updates that happen after rendering.

### `XR8.version()`
`version(): string` — The engine version string, e.g. `14.0.8.949`.

## Namespaced modules (see their own reference files)

`XR8.XrController` (world tracking) · `XR8.Threejs` (three.js scene) ·
`XR8.GlTextureRenderer` (camera-feed draw) · `XR8.CameraPixelArray` (CPU pixels) ·
`XR8.CanvasScreenshot` (screenshots) · `XR8.MediaRecorder` (video capture) ·
`XR8.XrDevice` (device/compat info) · `XR8.XrPermissions` (permission constants).

## Gotchas

- Call XR8 methods only after the engine has loaded — gate on
  `window.XR8 || addEventListener('xrloaded', …)`.
- The engine is a CDN global; it is typed loosely as `any` in `src/xr8/globals.d.ts`.
