---
module: XR8.GlTextureRenderer
source: https://www.8thwall.com/docs/api/engine/api/engine/gltexturerenderer
updated: 2026-07-21
---

# XR8.GlTextureRenderer

Draws the camera feed (or an arbitrary texture) to the canvas, optionally through
custom shaders. Usually the first render module in the pipeline so the feed sits
behind the 3D scene. Repo usage: `src/xr8/pipeline.ts`.

## Methods

### `XR8.GlTextureRenderer.pipelineModule(params)`
`pipelineModule(params?): CameraPipelineModule`

Creates the module that draws the camera feed to the canvas. All params optional:
- `vertexSource: string` (default: no-op vertex shader) — custom vertex shader.
- `fragmentSource: string` (default: no-op fragment shader) — custom fragment
  shader (e.g. color grading, filters).
- `toTexture: WebGLTexture` (default: the canvas) — render target; omit to draw to
  the canvas.
- `flipY: boolean` (default `false`) — flip rendering vertically.

```ts
XR8.addCameraPipelineModule(XR8.GlTextureRenderer.pipelineModule())
```

### `XR8.GlTextureRenderer.configure(params)`
`configure({ vertexSource?, fragmentSource?, toTexture?, flipY?, mirroredDisplay? }): void`

Reconfigure the renderer. Same params as `pipelineModule` plus
`mirroredDisplay: boolean` (default `false`) — flip left/right (selfie view).

## Gotchas

- Custom `fragmentSource` is the supported hook for full-screen camera-feed effects.
- Order matters: add this before `Threejs.pipelineModule()` so the feed renders
  behind the scene.
