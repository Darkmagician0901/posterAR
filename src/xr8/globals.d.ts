/**
 * globals.d.ts — ambient typings for the 8th Wall engine globals.
 *
 * The engine (XR8), XRExtras helpers, and LandingPage module are loaded via
 * CDN <script> tags in index.html, not npm — so they exist only as runtime
 * globals. This file declares them for TypeScript, plus the two structural
 * shapes the app actually relies on: `Xr8HitResult` (hit-test output) and
 * `Xr8PipelineModule` (the lifecycle-callback object passed to
 * `XR8.addCameraPipelineModules`). No values are exported; `export {}` only
 * makes this file a module so `declare global` is allowed.
 */
export {}

declare global {
  /** A single result from XR8.XrController.hitTest(x, y, includedTypes). */
  interface Xr8HitResult {
    type: 'FEATURE_POINT' | 'ESTIMATED_SURFACE' | 'DETECTED_SURFACE' | 'UNSPECIFIED'
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number; w: number }
    distance: number
  }

  /** Camera pipeline module shape (subset we use). */
  interface Xr8PipelineModule {
    name: string
    onStart?: (args: { canvas: HTMLCanvasElement; GLctx?: WebGLRenderingContext }) => void
    onUpdate?: (args: Record<string, unknown>) => void
    onRender?: (args: Record<string, unknown>) => void
    onException?: (error: unknown) => void
    onDetach?: (args: Record<string, unknown>) => void
    [key: string]: unknown
  }

  // The engine attaches these globals. Typed loosely as `any` on purpose —
  // full engine typings are out of scope and would fight the migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XR8: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XRExtras: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LandingPage: any

  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    XR8?: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    XRExtras?: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    LandingPage?: any
  }
}
