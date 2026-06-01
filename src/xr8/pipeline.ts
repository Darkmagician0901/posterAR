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
 *
 * It also feeds the diagnostic panel's load-timing track: `engineReady` is
 * marked when the engine global appears, `pipelineRun` when the camera loop
 * starts, and `worldTracking` / `firstTracking` are driven from the engine's
 * `reality.trackingstatus` events.
 */

import { debugTelemetry, SubsystemStatus } from '@/xr/debugTelemetry'

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

  const ready = () => {
    debugTelemetry.mark('engineReady')
    debugTelemetry.setSubsystem('engine', 'ready')
    callback()
  }

  if (window.XR8) {
    ready()
  } else {
    window.addEventListener('xrloaded', ready, { once: true })
    startEngineWatchdog()
  }
}

// ---------------------------------------------------------------------------
// engine watchdog — surfaces WHY the engine didn't start
// ---------------------------------------------------------------------------

interface Xr8Diag {
  engine?: 'pending' | 'loaded' | 'error'
  xrextras?: 'pending' | 'loaded' | 'error'
  landingPage?: 'pending' | 'loaded' | 'error'
  error?: string | null
}

const scriptStatus = (s: Xr8Diag['engine']): SubsystemStatus =>
  s === 'loaded' ? 'ready' : s === 'error' ? 'error' : 'loading'

/**
 * While we wait for `xrloaded`, poll the index.html load-diagnostics so the
 * panel shows per-script load state, and after a timeout flip `engine` to
 * 'error' with a concrete reason — otherwise the loading bar would hang at the
 * pre-engine cap forever (the symptom seen on older iOS).
 */
function startEngineWatchdog(): void {
  const STEP_MS = 1000
  const LIMIT_MS = 15000
  let waited = 0

  const id = setInterval(() => {
    const diag: Xr8Diag = (window as unknown as { __xr8diag?: Xr8Diag }).__xr8diag ?? {}

    debugTelemetry.setSubsystem('engineScript', scriptStatus(diag.engine))
    const helpers =
      diag.xrextras === 'error' || diag.landingPage === 'error'
        ? 'error'
        : diag.xrextras === 'loaded' && diag.landingPage === 'loaded'
          ? 'ready'
          : 'loading'
    debugTelemetry.setSubsystem('helpers', helpers as SubsystemStatus)

    // Engine became ready in the meantime — the 'xrloaded' handler took over.
    if (window.XR8) {
      clearInterval(id)
      return
    }

    waited += STEP_MS
    if (waited >= LIMIT_MS) {
      clearInterval(id)
      let note: string
      if (diag.error) {
        note = `Engine error: ${diag.error}`
      } else if (diag.engine === 'error') {
        note = 'Engine script failed to load (network, CORS, or blocked).'
      } else if (diag.engine !== 'loaded') {
        note = 'Engine script still downloading after 15s — slow or blocked network.'
      } else {
        note =
          'Engine loaded but never initialized (no xrloaded). Likely unsupported: needs iOS 16.4+ / WebAssembly SIMD.'
      }
      debugTelemetry.setSubsystem('engine', 'error')
      debugTelemetry.setNote(note)
    }
  }, STEP_MS)
}

// ---------------------------------------------------------------------------
// world-tracking telemetry module
// ---------------------------------------------------------------------------

/**
 * Maps an 8th Wall `reality.trackingstatus` payload to a subsystem status.
 * The engine reports statuses like 'NORMAL' | 'LIMITED' | 'NOT_AVAILABLE';
 * we read defensively (status or reason fields) and default to 'limited'.
 */
function trackingStatusToSubsystem(detail: unknown): SubsystemStatus {
  const raw =
    (detail as { status?: string; reason?: string } | undefined)?.status ??
    (detail as { status?: string; reason?: string } | undefined)?.reason ??
    ''
  switch (String(raw).toUpperCase()) {
    case 'NORMAL':
      return 'normal'
    case 'NOT_AVAILABLE':
    case 'UNAVAILABLE':
      return 'notavailable'
    case 'LIMITED':
    default:
      return 'limited'
  }
}

/** A listener-only pipeline module that mirrors SLAM tracking into telemetry. */
function trackingTelemetryModule(): Xr8PipelineModule {
  return {
    name: 'xrposter-tracking-telemetry',
    listeners: [
      {
        event: 'reality.trackingstatus',
        process: ({ detail }: { detail: unknown }) => {
          const status = trackingStatusToSubsystem(detail)
          debugTelemetry.setSubsystem('worldTracking', status)
          if (status === 'normal') debugTelemetry.mark('firstTracking')
        },
      },
    ],
  } as unknown as Xr8PipelineModule
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

  // World-tracking → telemetry bridge (listener-only).
  modules.push(trackingTelemetryModule())

  // Caller-supplied custom modules go last so they can override / extend.
  modules.push(...customModules)

  XR8.addCameraPipelineModules(modules)

  // Configure world tracking before starting the pipeline.
  if (typeof XR8?.XrController?.configure === 'function') {
    XR8.XrController.configure({ disableWorldTracking: !!disableWorldTracking })
  }

  debugTelemetry.mark('pipelineRun')
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
