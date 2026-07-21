---
module: XR8.CanvasScreenshot
source: https://www.8thwall.com/docs/api/engine/api/engine/canvasscreenshot
updated: 2026-07-21
---

# XR8.CanvasScreenshot

Captures the composited frame (camera feed + 3D scene) from inside the render loop
and returns it as a base64 JPEG. Needed because the XR8 canvas has no
`preserveDrawingBuffer`, so a plain `canvas.toDataURL()` outside the loop reads an
empty frame. Repo usage: `src/xr8/canvasScreenshot.ts`, `src/utils/screenshot.ts`.

## Methods

### `XR8.CanvasScreenshot.pipelineModule()`
`pipelineModule(): CameraPipelineModule`

Adds the module that can grab the composited frame. Install it in the pipeline
before taking screenshots.

```ts
XR8.addCameraPipelineModule(XR8.CanvasScreenshot.pipelineModule())
```

### `XR8.CanvasScreenshot.takeScreenshot()`
`takeScreenshot(): Promise<string>`

Resolves to a base64-encoded JPEG (no data-URL prefix). Prefix it yourself for an
`<img>` src.

```ts
XR8.CanvasScreenshot.takeScreenshot().then(
  (data) => { img.src = 'data:image/jpeg;base64,' + data },
  (error) => { console.log(error) },
)
```

## Legacy alias

Older docs/examples use `XR8.canvasScreenshot().cameraPipelineModule()` and
`XR8.canvasScreenshot().takeScreenshot()`. Prefer the `XR8.CanvasScreenshot.*`
form above.

## Gotchas

- Screenshots must go through this module on live AR — reading the canvas directly
  yields a blank image (no `preserveDrawingBuffer`). The desktop mock path in this
  repo captures differently; see `src/components/ar/DesktopMockMode.tsx`.
- Feature-detect `typeof window.XR8?.CanvasScreenshot?.takeScreenshot === 'function'`
  before use (repo does this in `canvasScreenshot.ts`).
