---
module: XR8.Threejs
source: https://www.8thwall.com/docs/api/engine/api/engine/threejs
updated: 2026-07-21
---

# XR8.Threejs

Creates and owns a three.js `scene`, `camera`, and `renderer`, and drives the
camera from `XrController`'s 6DoF pose each frame. Install its pipeline module
AFTER `XrController` and `GlTextureRenderer`, then read the scene in your own
module's `onStart`.

## Methods

### `XR8.Threejs.pipelineModule()`
`pipelineModule(): CameraPipelineModule`

Creates the module that builds the three.js scene/camera/renderer and syncs the
camera to the tracked pose. Repo usage: `src/xr8/pipeline.ts`.

```ts
XR8.addCameraPipelineModule(XR8.XrController.pipelineModule())
XR8.addCameraPipelineModule(XR8.GlTextureRenderer.pipelineModule())
XR8.addCameraPipelineModule(XR8.Threejs.pipelineModule())
XR8.addCameraPipelineModule({
  name: 'myawesomeapp',
  onStart: () => {
    const { scene, camera } = XR8.Threejs.xrScene()
    XR8.XrController.updateCameraProjectionMatrix({
      origin: camera.position,
      facing: camera.quaternion,
    })
  },
  onUpdate: () => { /* mutate scene each frame */ },
})
```

### `XR8.Threejs.xrScene()`
`xrScene(): { scene, camera, renderer, cameraTexture?, layerScenes? }`

Handle to the three.js scene graph. `scene`/`camera`/`renderer` are standard
three.js objects. `cameraTexture` (a three.js `Texture` of the camera feed cropped
to canvas) is present only after `configure({ renderCameraTexture: true })`.
`layerScenes` is a `Record<string, {scene, camera}>` enabled via
`configure({ layerScenes: ['sky'] })`. Repo usage: `src/components/ar/StoryARExperience.tsx`.

### `XR8.Threejs.configure(options)`
`configure({ renderCameraTexture?: boolean, layerScenes?: string[] }): void`

Opt into extra outputs: `renderCameraTexture` populates `xrScene().cameraTexture`;
`layerScenes` populates `xrScene().layerScenes` (e.g. sky layer, only visible where
that layer is detected in the feed).

```ts
XR8.Threejs.configure({ renderCameraTexture: true })
const { cameraTexture } = XR8.Threejs.xrScene()
```

## Gotchas

- The scene exists only after `Threejs.pipelineModule().onStart()` has run — access
  `xrScene()` from a module installed AFTER `Threejs.pipelineModule()`.
- 8th Wall owns the renderer and render loop; do not create your own WebGLRenderer.
