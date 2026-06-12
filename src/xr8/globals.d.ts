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
  /**
   * A single result from XR8.XrController.hitTest(x, y, includedTypes) — one
   * real-world surface the screen-point ray intersected.
   */
  interface Xr8HitResult {
    /**
     * Result confidence, best first: DETECTED_SURFACE (a surface the engine
     * has confirmed) > ESTIMATED_SURFACE (a guess) > FEATURE_POINT (a single
     * tracked point).
     */
    type: 'FEATURE_POINT' | 'ESTIMATED_SURFACE' | 'DETECTED_SURFACE' | 'UNSPECIFIED'
    /** Hit point in world space, in metres. */
    position: { x: number; y: number; z: number }
    /** Surface orientation as a quaternion (4-number rotation). */
    rotation: { x: number; y: number; z: number; w: number }
    /** Distance from the camera to the hit point, in metres. */
    distance: number
  }

  /**
   * Camera pipeline module shape (the subset we use). A pipeline module is
   * the engine's plugin unit: XR8 calls the lifecycle callbacks below as the
   * camera session starts, renders frames, errors, and shuts down.
   */
  interface Xr8PipelineModule {
    /** Unique module name (the engine rejects duplicate names). */
    name: string
    /** Called once when the camera session starts; receives the canvas. */
    onStart?: (args: { canvas: HTMLCanvasElement; GLctx?: WebGLRenderingContext }) => void
    /** Called every frame before rendering — per-frame logic goes here. */
    onUpdate?: (args: Record<string, unknown>) => void
    /** Called every frame at render time. */
    onRender?: (args: Record<string, unknown>) => void
    /** Called when the engine catches an error in any module. */
    onException?: (error: unknown) => void
    /** Called when the module is removed or the session stops. */
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
