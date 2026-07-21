---
module: XR8.XrPermissions
source: https://www.8thwall.com/docs/api/engine/api/engine/xrpermissions
updated: 2026-07-21
---

# XR8.XrPermissions

Enumerates the browser capabilities a pipeline module can declare via its
`requiredPermissions()` callback, so the framework can request them before running.

## Methods

### `XR8.XrPermissions.permissions()`
`permissions(): { CAMERA, DEVICE_MOTION, DEVICE_ORIENTATION, DEVICE_GPS, MICROPHONE }`

Returns the permission-constant enum:
- `CAMERA` = `'camera'` — camera access.
- `DEVICE_MOTION` = `'devicemotion'` — accelerometer.
- `DEVICE_ORIENTATION` = `'deviceorientation'` — gyroscope.
- `DEVICE_GPS` = `'geolocation'` — GPS location.
- `MICROPHONE` = `'microphone'` — microphone.

```ts
const P = XR8.XrPermissions.permissions()
XR8.addCameraPipelineModule({
  name: 'needs-motion',
  requiredPermissions: () => [P.CAMERA, P.DEVICE_MOTION],
})
```

## Gotchas

- Declaring a permission via `requiredPermissions()` lets the framework prompt for
  it; it does not itself grant access.
