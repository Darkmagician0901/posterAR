---
module: XR8.LayersController
source: https://www.8thwall.com/docs/api/engine/api/engine/layerscontroller
updated: 2026-07-21
---

# XR8.LayersController

Configures semantic layers (e.g. `sky`) used with Sky/segmentation effects. Pairs
with `XR8.Threejs.configure({ layerScenes: ['sky'] })`, which exposes per-layer
scenes via `xrScene().layerScenes`. Not used by this repo.

## Methods

### `XR8.LayersController.configure(options)`
`configure({ layers }): void`

`layers` maps a layer name to its options:
- `invertLayerMask: boolean` — invert where the layer's content is visible (e.g.
  show a cube everywhere EXCEPT the sky).
- `edgeSmoothness: number` — softness of the layer mask edge (0–1).

```ts
XR8.LayersController.configure({ layers: { sky: { invertLayerMask: true, edgeSmoothness: 0.8 } } })
XR8.Threejs.configure({ layerScenes: ['sky'] })
const { layerScenes } = XR8.Threejs.xrScene()
createSkyScene(layerScenes.sky.scene, layerScenes.sky.camera)
```

## Gotchas

- Content added to a layer scene is visible only where that layer is detected in the
  feed (unless `invertLayerMask` is set).
