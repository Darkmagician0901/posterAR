/**
 * pipeline.ts — 8th Wall (XR8) camera-pipeline lifecycle manager.
 *
 * This module wraps the 8th Wall engine binary that is loaded from CDN via a
 * <script> tag in index.html. The engine provides SLAM world-tracking
 * (SLAM = Simultaneous Localization And Mapping — the computer-vision
 * technique that works out where the phone is in the room, and keeps virtual
 * objects pinned in place, using only the camera and motion sensors). It
 * replaces the old WebXR sessionManager and owns:
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

import * as THREE from 'three';
import { debugTelemetry, SubsystemStatus } from '@/xr/debugTelemetry';
import { createAmbientProbeModules } from '@/xr8/ambientProbe';

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
 *
 * @param callback — Invoked exactly once, as soon as the engine global
 *   (`window.XR8`) is available. Called synchronously if the engine already
 *   loaded; otherwise called from the one-time `'xrloaded'` listener.
 */
export function onXr8Ready(callback: () => void): void {
  if (typeof window === 'undefined') {
    return;
  }

  const ready = () => {
    debugTelemetry.mark('engineReady');
    debugTelemetry.setSubsystem('engine', 'ready');
    callback();
  };

  if (window.XR8) {
    ready();
  } else {
    window.addEventListener('xrloaded', ready, { once: true });
    startEngineWatchdog();
  }
}

// ---------------------------------------------------------------------------
// engine watchdog — surfaces WHY the engine didn't start
// ---------------------------------------------------------------------------

/** Shape of `window.__xr8diag`, written by inline <script> hooks in index.html. */
interface Xr8Diag {
  engine?: 'pending' | 'loaded' | 'error';
  xrextras?: 'pending' | 'loaded' | 'error';
  landingPage?: 'pending' | 'loaded' | 'error';
  error?: string | null;
}

/**
 * Maps a script-tag load state to the diagnostic panel's status vocabulary.
 *
 * @param s — Load state of one <script> tag ('pending' | 'loaded' | 'error'),
 *   or undefined when the inline diagnostics never recorded it.
 * @returns The matching SubsystemStatus ('ready', 'error', or 'loading').
 */
const scriptStatus = (s: Xr8Diag['engine']): SubsystemStatus =>
  s === 'loaded' ? 'ready' : s === 'error' ? 'error' : 'loading';

/**
 * Polls the index.html load-diagnostics once per second while we wait for the
 * `xrloaded` event, so the diagnostic panel shows per-script load state.
 *
 * After 15 seconds with no engine, flips the `engine` subsystem to 'error'
 * with a concrete reason. Without this, the app's loading progress bar would
 * sit forever at the value it is capped at until the engine arrives (the
 * "pre-engine cap"), with no explanation — the symptom seen on older iOS.
 */
function startEngineWatchdog(): void {
  const STEP_MS = 1000;
  const LIMIT_MS = 15000;
  let waited = 0;

  const id = setInterval(() => {
    const diag: Xr8Diag = (window as unknown as { __xr8diag?: Xr8Diag }).__xr8diag ?? {};

    debugTelemetry.setSubsystem('engineScript', scriptStatus(diag.engine));
    const helpers =
      diag.xrextras === 'error' || diag.landingPage === 'error'
        ? 'error'
        : diag.xrextras === 'loaded' && diag.landingPage === 'loaded'
          ? 'ready'
          : 'loading';
    debugTelemetry.setSubsystem('helpers', helpers as SubsystemStatus);

    // Engine became ready in the meantime — the 'xrloaded' handler took over.
    if (window.XR8) {
      clearInterval(id);
      return;
    }

    waited += STEP_MS;
    if (waited >= LIMIT_MS) {
      clearInterval(id);
      // Note reflects the ENGINE state only — optional helpers (xrextras /
      // landing-page) failing is reported separately and is non-fatal.
      let note: string;
      if (diag.engine === 'error') {
        note = 'Engine script failed to load (network, CORS, or blocked) — AR cannot start.';
      } else if (diag.engine !== 'loaded') {
        note = 'Engine script still downloading after 15s — slow or blocked network.';
      } else {
        note =
          'Engine loaded but never initialized (no xrloaded). Likely unsupported: needs iOS 16.4+ / WebAssembly SIMD.';
      }
      debugTelemetry.setSubsystem('engine', 'error');
      debugTelemetry.setNote(note);
    }
  }, STEP_MS);
}

// ---------------------------------------------------------------------------
// world-tracking telemetry module
// ---------------------------------------------------------------------------

/**
 * Maps an 8th Wall `reality.trackingstatus` event payload to a subsystem status.
 * The engine reports statuses like 'NORMAL' | 'LIMITED' | 'NOT_AVAILABLE';
 * we read defensively (status or reason fields) and default to 'limited'.
 *
 * @param detail — The `detail` field of the engine event. Typed `unknown`
 *   because the engine globals are untyped; only `.status` / `.reason` string
 *   fields are read, and any unrecognized shape falls through to 'limited'.
 * @returns The telemetry status: 'normal', 'notavailable', or 'limited'.
 */
function trackingStatusToSubsystem(detail: unknown): SubsystemStatus {
  const raw =
    (detail as { status?: string; reason?: string } | undefined)?.status ??
    (detail as { status?: string; reason?: string } | undefined)?.reason ??
    '';
  switch (String(raw).toUpperCase()) {
    case 'NORMAL':
      return 'normal';
    case 'NOT_AVAILABLE':
    case 'UNAVAILABLE':
      return 'notavailable';
    case 'LIMITED':
    default:
      return 'limited';
  }
}

/**
 * Builds a pipeline module that mirrors SLAM tracking quality into telemetry.
 *
 * A "camera pipeline module" is the engine's plugin unit: an object with a
 * name plus optional lifecycle callbacks and event listeners that XR8 calls
 * as the camera runs. This one is listener-only — it draws nothing and has
 * no per-frame work; it just reacts to `reality.trackingstatus` events.
 *
 * @returns The module to pass to `XR8.addCameraPipelineModules`.
 */
function trackingTelemetryModule(): Xr8PipelineModule {
  return {
    name: 'xrposter-tracking-telemetry',
    listeners: [
      {
        event: 'reality.trackingstatus',
        process: ({ detail }: { detail: unknown }) => {
          const status = trackingStatusToSubsystem(detail);
          debugTelemetry.setSubsystem('worldTracking', status);
          if (status === 'normal') debugTelemetry.mark('firstTracking');
        },
      },
    ],
  } as unknown as Xr8PipelineModule;
}

// ---------------------------------------------------------------------------
// runXr8
// ---------------------------------------------------------------------------

/** Options for {@link runXr8}. The canvas is handed to (and owned by) XR8. */
export interface Xr8RunOptions {
  /** Canvas the engine renders camera + scene into. XR8 takes ownership. */
  canvas: HTMLCanvasElement;
  /** Custom camera pipeline modules to append after the standard ones. */
  customModules?: Xr8PipelineModule[];
  /** Desktop/dev: disable SLAM world tracking (no rear camera / no motion). */
  disableWorldTracking?: boolean;
  /**
   * Image-target fingerprints to watch for, built by `markerTargetData`.
   *
   * Passed straight through to `XR8.XrController.configure`. Setting this
   * REPLACES the engine's active target set, so it must always carry every
   * target still wanted — which is why it is configured once from the whole
   * exhibit rather than accumulated per detection.
   *
   * Omitted or empty means no image tracking, and the app behaves exactly as
   * it did before markers existed.
   */
  imageTargetData?: unknown[];
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
 *
 * @param options — Canvas to render into (ownership transfers to XR8), any
 *   custom pipeline modules to append, and the world-tracking toggle. See
 *   {@link Xr8RunOptions}.
 */
export function runXr8(options: Xr8RunOptions): void {
  const {
    canvas,
    customModules = [],
    disableWorldTracking = false,
    imageTargetData = [],
  } = options;

  // XR8.Threejs.pipelineModule() reads the three.js library from the global
  // window.THREE and throws "THREE does not exist but is required" if it is
  // unset. Our app imports three as an ES module, so expose it here before the
  // Threejs module is registered.
  if (typeof window !== 'undefined') {
    (window as unknown as { THREE?: typeof THREE }).THREE = THREE;
  }

  const modules: Xr8PipelineModule[] = [];

  // Core engine modules — these come from the XR8 binary itself.
  if (typeof XR8?.GlTextureRenderer?.pipelineModule === 'function') {
    modules.push(XR8.GlTextureRenderer.pipelineModule());
  }
  if (typeof XR8?.Threejs?.pipelineModule === 'function') {
    modules.push(XR8.Threejs.pipelineModule());
  }
  if (typeof XR8?.XrController?.pipelineModule === 'function') {
    modules.push(XR8.XrController.pipelineModule());
  }
  // Frame capture for the photo feature — see @/xr8/canvasScreenshot.
  if (typeof XR8?.CanvasScreenshot?.pipelineModule === 'function') {
    modules.push(XR8.CanvasScreenshot.pipelineModule());
  }

  // Ambient light probe — samples the camera feed to tint posters. Returns
  // [] when XR8.CameraPixelArray is unavailable, so this is a safe spread.
  modules.push(...createAmbientProbeModules());

  // Optional UX / helper modules from XRExtras / LandingPage bundles.
  if (typeof LandingPage?.pipelineModule === 'function') {
    modules.push(LandingPage.pipelineModule());
  }
  if (typeof XRExtras?.FullWindowCanvas?.pipelineModule === 'function') {
    modules.push(XRExtras.FullWindowCanvas.pipelineModule());
  }
  if (typeof XRExtras?.Loading?.pipelineModule === 'function') {
    modules.push(XRExtras.Loading.pipelineModule());
  }
  if (typeof XRExtras?.RuntimeError?.pipelineModule === 'function') {
    modules.push(XRExtras.RuntimeError.pipelineModule());
  }

  // World-tracking → telemetry bridge (listener-only).
  modules.push(trackingTelemetryModule());

  // Caller-supplied custom modules go last so they can override / extend.
  modules.push(...customModules);

  XR8.addCameraPipelineModules(modules);

  // Configure world tracking — and image targets — before starting the
  // pipeline. Both go in ONE configure call: the engine treats each call as
  // the complete configuration, so a second call to add targets would drop the
  // world-tracking setting made by the first.
  if (typeof XR8?.XrController?.configure === 'function') {
    const config: Record<string, unknown> = { disableWorldTracking: !!disableWorldTracking };
    // Only named when there is something to track. Passing an empty array
    // would still be a declaration that image tracking is on, and the engine
    // would do detection work for a set that can never match.
    if (imageTargetData.length > 0) {
      config.imageTargetData = imageTargetData;
      debugTelemetry.logEvent(`marker: watching ${imageTargetData.length} picture(s)`);
    }
    XR8.XrController.configure(config);
  }

  debugTelemetry.mark('pipelineRun');
  XR8.run({ canvas });
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
  XR8?.stop?.();
}
