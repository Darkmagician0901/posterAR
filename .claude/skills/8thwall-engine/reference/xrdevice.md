---
module: XR8.XrDevice
source: https://www.8thwall.com/docs/api/engine/api/engine/xrdevice
updated: 2026-07-21
---

# XR8.XrDevice

Reports device/browser AR compatibility and a best-effort device estimate. Use it
to gate the AR experience and to explain *why* a device is unsupported. This repo
does its own detection in `src/utils/deviceDetection.ts`, but `XrDevice` is the
engine-native source of truth.

## Methods

### `XR8.XrDevice.isDeviceBrowserCompatible(options)`
`isDeviceBrowserCompatible({ allowedDevices? }): boolean`

Best-effort estimate of whether this device+browser can run 8th Wall Web. If
`false`, `incompatibleReasons()` explains why. `allowedDevices` restricts to a
device class from `XR8.XrConfig.device()` (e.g. `MOBILE`).

```ts
if (!XR8.XrDevice.isDeviceBrowserCompatible({ allowedDevices: XR8.XrConfig.device().MOBILE })) {
  showUnsupported(XR8.XrDevice.incompatibleReasons())
}
```

### `XR8.XrDevice.incompatibleReasons(options)`
`incompatibleReasons({ allowedDevices? }): IncompatibilityReasons[]`

Array of reasons the device/browser is unsupported. Empty unless
`isDeviceBrowserCompatible()` returned `false`.

### `XR8.XrDevice.incompatibleReasonDetails(options)`
`incompatibleReasonDetails({ allowedDevices? }): { inAppBrowser, inAppBrowserType }`

Extra hints (e.g. `inAppBrowser: 'Twitter'`) for tailoring error UI. Treat as a
hint, not authoritative.

### `XR8.XrDevice.deviceEstimate()`
`deviceEstimate(): object`

Best-effort make/model estimate from user agent and other signals. Not reliable —
do not branch critical logic on it.

### `XR8.XrDevice.IncompatibilityReasons`
Enum of the possible incompatibility reasons returned by `incompatibleReasons()`.

## Related: `XR8.XrConfig`

`XR8.XrConfig.device()` returns device-class constants (e.g. `MOBILE`) for the
`allowedDevices` params above. `XR8.XrConfig.camera({ direction })` selects the
camera (`FRONT`/`BACK`) when passed to `XR8.run()`.

## Gotchas

- All `XrDevice` results are estimates — use for UX gating, not security or
  correctness decisions.
