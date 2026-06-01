/**
 * pipeline.ts — 8th Wall (XR8) camera-pipeline lifecycle manager.
 *
 * This module wraps the 8th Wall engine binary (with SLAM world-tracking)
 * that is loaded from CDN via a <script> tag in index.html.  It replaces the
 * old WebXR sessionManager and owns:
 *   - waiting for the engine to be ready (`onXr8Ready`)
 *   - building + starting the standard three.js camera pipeline (`runXr8`)
 *   - tearing it down (`stopXr8`)
 *
 * XR8, XRExtras and LandingPage are typed as `any` in globals.d.ts — member
 * access on them is therefore unrestricted by TypeScript, but every optional
 * module is also guarded at runtime before use so a missing CDN bundle cannot
 * throw.
 */

// ---------------------------------------------------------------------------
// onXr8Ready
// ---------------------------------------------------------------------------

/**
 * Register a callback to run once the 8th Wall engine is initialised.
 *
 * If `window.XR8` is already present (e.g. engine fully loaded before this
 * call) the callback is invoked synchronously; otherwise a one-time
 * `'xrloaded'` event listener is added to the window.
 *
 * Safe to call in SSR / Node environments — the guard on `typeof window`
 * prevents any access to browser globals.
 */
export function onXr8Ready(callback: () => void): void {
  if (typeof window === 'undefined') {
    return
  }

  if (window.XR8) {
    callback()
  } else {
    const handler = () => callback()
    window.addEventListener('xrloaded', handler, { once: true })
  }
}

// ---------------------------------------------------------------------------
// runXr8
// ---------------------------------------------------------------------------

export interface Xr8RunOptions {
  canvas: HTMLCanvasElement
  /** Custom camera pipeline modules to append after the standard ones. */
  customModules?: Xr8PipelineModule[]
  /** Desktop/dev: disable SLAM world tracking (no rear camera / no motion). */
  disableWorldTracking?: boolean
}

/**
 * Build the standard 8th Wall three.js camera pipeline and start it.
 *
 * Standard module order follows the official 8th Wall three.js example:
 *   GlTextureRenderer → Threejs → XrController → LandingPage →
 *   FullWindowCanvas → Loading → RuntimeError → ...customModules
 *
 * Each optional module (XRExtras.*, LandingPage.*) is only pushed when its
 * factory function actually exists, so partially-loaded CDN bundles are
 * handled gracefully.
 *
 * World-tracking is configured via `XR8.XrController.configure` (when
 * available) before the pipeline starts, respecting `disableWorldTracking`.
 */
export function runXr8(options: Xr8RunOptions): void {
  const { canvas, customModules = [], disableWorldTracking = false } = options

  const modules: Xr8PipelineModule[] = []

  // Core engine modules — these come from the XR8 binary itself.
  if (typeof XR8?.GlTextureRenderer?.pipelineModule === 'function') {
    modules.push(XR8.GlTextureRenderer.pipelineModule())
  }
  if (typeof XR8?.Threejs?.pipelineModule === 'function') {
    modules.push(XR8.Threejs.pipelineModule())
  }
  if (typeof XR8?.XrController?.pipelineModule === 'function') {
    modules.push(XR8.XrController.pipelineModule())
  }

  // Optional UX / helper modules from XRExtras / LandingPage bundles.
  if (typeof LandingPage?.pipelineModule === 'function') {
    modules.push(LandingPage.pipelineModule())
  }
  if (typeof XRExtras?.FullWindowCanvas?.pipelineModule === 'function') {
    modules.push(XRExtras.FullWindowCanvas.pipelineModule())
  }
  if (typeof XRExtras?.Loading?.pipelineModule === 'function') {
    modules.push(XRExtras.Loading.pipelineModule())
  }
  if (typeof XRExtras?.RuntimeError?.pipelineModule === 'function') {
    modules.push(XRExtras.RuntimeError.pipelineModule())
  }

  // Caller-supplied custom modules go last so they can override / extend.
  modules.push(...customModules)

  XR8.addCameraPipelineModules(modules)

  // Configure world tracking before starting the pipeline.
  if (typeof XR8?.XrController?.configure === 'function') {
    XR8.XrController.configure({ disableWorldTracking: !!disableWorldTracking })
  }

  XR8.run({ canvas })
}

// ---------------------------------------------------------------------------
// stopXr8
// ---------------------------------------------------------------------------

/**
 * Stop the running 8th Wall camera pipeline (e.g. on component unmount or
 * scene teardown).  Uses optional chaining so it is safe to call even if the
 * engine was never started or the global is absent.
 */
export function stopXr8(): void {
  XR8?.stop?.()
}
