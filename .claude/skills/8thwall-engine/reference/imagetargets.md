---
module: ImageTargets
source: https://www.8thwall.com/docs/api/engine/api/engine/xrcontroller/configure
updated: 2026-08-17
---

# Image Targets

Image-target detection is driven through `XR8.XrController` (not a separate global):
supply the target fingerprints, then listen for `reality.image*` events to attach
content.

**This file is hand-maintained, not generated.** `npm run build:8thwall-docs`
refreshes `INDEX.md` and `symbols.json` but does not rewrite this page.

## Configure

Pass fingerprint documents to `XR8.XrController.configure({ imageTargetData })`.
The list can be changed at runtime and REPLACES the currently active set.

```ts
XR8.XrController.configure({ imageTargetData: [targetA, targetB] })
```

An earlier revision of this page documented `configure({ imageTargets: ['name'] })`
— a bare list of names. **That is the retired hosted API**, where images were
uploaded to the 8th Wall console and the engine fetched the fingerprints by name.
There is no 8th Wall server any more, so a name alone resolves to nothing. Each
entry must now be the full document.

### The document shape

`@8thwall/image-target-cli` writes this JSON to disk, but nothing requires it to
come from a file — the CLI performs **no feature extraction** (its PLANAR path is
a crop, a resize, and a grayscale), and the fingerprint is computed on the device
at `configure` time. So the document can be built at runtime. This repo does
exactly that in `src/markers/markerTarget.ts`; see `docs/marker-layer-design.md`
§3.5 for why building it beats storing it.

```ts
interface ImageTargetData {
  imagePath: string                      // resolved relative to the PAGE url
  metadata: null                         // the CLI emits the literal value
  name: string                           // echoed back on every image* event
  type: 'PLANAR'
  properties: { top, left, width, height, isRotated, originalWidth, originalHeight }
  resources: { luminanceImage: string }
  created: number
  updated: number
}
```

`imagePath` resolves **relative to the page URL**, and the engine's handling of an
absolute cross-origin path is **undocumented**. Serve the luminance PNGs
same-origin via a host rewrite rather than pointing at a CDN domain — see
`docs/arcade-architecture.md` §10.2.

## Events

Subscribe via the world events bus:
`world.events.addListener(world.events.globalId, 'reality.imagefound', (e) => { ... })`.

### `reality.imagefound`
Fired when a target is first detected/tracked.

### `reality.imageupdated`
Fired **continuously** while the target is tracked, not once.

### `reality.imagelost`
Fired when a tracked target leaves view.

All three carry the same detail shape:
- `name: string` — the image's name, as given in the target document.
- `type: 'FLAT' | 'CYLINDRICAL' | 'CONICAL'`.
- `position: {x, y, z}` — world position of the target.
- `rotation: {w, x, y, z}` — world orientation quaternion.
- `scale: number` — scale factor to apply to attached objects.
- `properties: ImagePropertiesObject` — extra target properties.
- FLAT only: `scaledWidth`, `scaledHeight` (dimensions in scene when ×`scale`).
- CYLINDRICAL/CONICAL only: `height`, `radiusTop`, `radiusBottom`,
  `arcStartRadians`, `arcLengthRadians`.

```ts
world.events.addListener(world.events.globalId, 'reality.imagefound', (e) => {
  attachContentTo(e.name, e.position, e.rotation, e.scale)
})
```

The marker pose arrives in the **same world frame as SLAM**, which is what makes
anchoring content to it valid.

## Gotchas

- Setting `imageTargetData` replaces the active set — include every target you
  still want on each call.
- **Roughly 10 simultaneous targets** is the practical ceiling. Cap the set
  rather than discovering the limit on a visitor's phone.
- Set `name` to something machine-chosen and unique (this repo uses the marker's
  content hash). Two markers cannot then collide on a human-typed label, and an
  `imagefound` keys straight into a lookup with no second indirection.
- Image targets are distinct from ground-plane hit-testing
  (`XrController.hitTest`), and unlike hit-testing they are not confined to a
  horizontal plane.
