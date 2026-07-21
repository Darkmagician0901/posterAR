---
module: XR8.FaceController
source: https://www.8thwall.com/docs/api/engine/api/engine/facecontroller
updated: 2026-07-21
---

# XR8.FaceController

Front-camera face tracking: a face mesh, per-vertex normals/UVs, and named
attachment points for placing content (glasses, hats). Install its pipeline module
and configure the mesh geometry. Not used by this repo.

## Methods

### `XR8.FaceController.configure(options)`
`configure({ meshGeometry?, coordinates? }): void`

- `meshGeometry: MeshGeometry[]` — which meshes to compute, e.g.
  `[XR8.FaceController.MeshGeometry.FACE]` (also `EYES`, `MOUTH`).
- `coordinates: { mirroredDisplay?, axes? }` — `mirroredDisplay: true` for selfie
  view; `axes: 'LEFT_HANDED' | 'RIGHT_HANDED'`.

```ts
XR8.FaceController.configure({
  meshGeometry: [XR8.FaceController.MeshGeometry.FACE],
  coordinates: { mirroredDisplay: true, axes: 'LEFT_HANDED' },
})
```

### `XR8.FaceController.pipelineModule()`
`pipelineModule(): CameraPipelineModule` — Install to enable face tracking.

### `XR8.FaceController.AttachmentPoints`
Named points (e.g. forehead, nose tip, ears) reported in event `attachmentPoints`,
for anchoring objects to the face.

### `XR8.FaceController.MeshGeometry`
Enum of requestable meshes (`FACE`, etc.) for `configure({ meshGeometry })`.

## Events

Via the world events bus (`facecontroller.*` / `reality.*`):

### `facescanning`
Resources loaded, scanning started. Detail: `maxDetections`, `pointsPerDetection`,
`indices: [{a,b,c}]` (triangles), `uvs: [{u,v}]`.

### `facefound` / `faceupdated`
A face is detected / subsequently tracked. Detail:
- `id: number` — face id.
- `transform: { position:{x,y,z}, rotation:{w,x,y,z}, scale, scaledWidth, scaledHeight, scaledDepth }`.
- `vertices: [{x,y,z}]` — face points relative to transform.
- `normals: [{x,y,z}]` — vertex normals relative to transform.
- `attachmentPoints: { name, position:{x,y,z} }` — named anchors.
- `uvsInCameraFrame: [{u,v}]` — UVs in the camera frame.

### `facelost`
The tracked face left view.

```ts
world.events.addListener(world.events.globalId, 'facecontroller.faceupdated', (e) => {
  positionGlasses(e.attachmentPoints)
})
```

## Gotchas

- Face tracking uses the FRONT camera; it is mutually exclusive with world tracking.
- `vertices`/`normals`/`attachmentPoints` are relative to `transform` — apply the
  transform to place objects in world space.
