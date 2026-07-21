---
module: XR8.CameraPixelArray
source: https://www.8thwall.com/docs/api/engine/api/engine/camerapixelarray
updated: 2026-07-21
---

# XR8.CameraPixelArray

Exposes the camera texture as a CPU-readable pixel array for image processing
(custom CV, ambient sampling, etc.). Add its pipeline module, then read the output
in a later module's `onProcessCpu`/`onUpdate`. Repo usage: `src/xr8/ambientProbe.ts`
(samples a downsampled RGBA frame to estimate room color).

## Methods

### `XR8.CameraPixelArray.pipelineModule(options)`
`pipelineModule(options?): CameraPipelineModule`

Provides the camera texture as RGBA (or grayscale) pixels. Options:
- `luminance: boolean` (default `false`) — output single-channel grayscale instead
  of RGBA.
- `maxDimension: number` (optional) — longest output dimension in pixels; the other
  axis scales proportionally (no crop/distortion). Preferred for downsampling.
- `width: number` / `height: number` (optional) — explicit output size; ignored if
  `maxDimension` is set. Default: camera feed texture size.

Output object, surfaced as `processGpuResult.camerapixelarray`:
- `rows: number` — output height in pixels.
- `cols: number` — output width in pixels.
- `rowBytes: number` — bytes per row.
- `pixels: Uint8Array` — pixel data (RGBA stride 4, or 1 byte/px when `luminance`).
- `srcTex: texture` — source texture for the returned pixels.

```ts
XR8.addCameraPipelineModule(XR8.CameraPixelArray.pipelineModule({ maxDimension: 120 }))
XR8.addCameraPipelineModule({
  name: 'mycamerapipelinemodule',
  onProcessCpu: ({ processGpuResult }) => {
    const { camerapixelarray } = processGpuResult
    if (!camerapixelarray?.pixels) return
    const { rows, cols, rowBytes, pixels } = camerapixelarray
    // ...process pixels (RGBA stride 4)...
  },
})
```

## Gotchas

- Older CDN bundles may lack `CameraPixelArray`; feature-detect
  `typeof XR8?.CameraPixelArray?.pipelineModule === 'function'` before use (repo
  does this in `ambientProbe.ts`).
- Output appears under `processGpuResult.camerapixelarray` (the module's fixed name),
  regardless of your consuming module's name.
