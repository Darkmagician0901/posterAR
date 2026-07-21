---
module: ImageTargets
source: https://www.8thwall.com/docs/api/engine/api/engine/xrcontroller/configure
updated: 2026-07-21
---

# Image Targets

Image-target detection is driven through `XR8.XrController` (not a separate global):
configure the target names, then listen for `reality.image*` events to attach content.
Not used by this repo (near-neighbor for a marker-triggered feature).

## Configure

Pass target names to `XR8.XrController.configure({ imageTargets })`. The list can be
changed at runtime and REPLACES the currently active set.

```ts
XR8.XrController.configure({ imageTargets: ['my-poster', 'business-card'] })
```

## Events

Subscribe via the world events bus:
`world.events.addListener(world.events.globalId, 'reality.imagefound', (e) => { ... })`.

### `reality.imagefound`
Fired when a target is first detected/tracked.

### `reality.imageupdated`
Fired when a tracked target's position, rotation, or scale changes.

### `reality.imagelost`
Fired when a tracked target leaves view.

All three carry the same detail shape:
- `name: string` — the image's name.
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

## Gotchas

- Setting `imageTargets` replaces the active set — include every target you still
  want each call.
- Image targets are distinct from ground-plane hit-testing (`XrController.hitTest`).
