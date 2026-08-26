/**
 * debugTelemetry
 *
 * A single module-level mutable state object shared between the AR animation
 * loop (writer) and the DebugHUD / DiagnosticPanel (readers). The HUD samples
 * this at 5 Hz; the loop writes at frame rate. Writers mutate the object in
 * place (no React state, no object copies) and readers poll or subscribe via
 * a plain callback list — this keeps React's re-render machinery entirely
 * out of the 60 fps render path.
 *
 * This is the 8th Wall (XR8) telemetry model. The old WebXR/TFJS schema
 * (planes, anchors, segmenter, stabilizer, refSpace) has been replaced by
 * 8th Wall subsystems (engine, worldTracking) plus a load-timing track used
 * to diagnose slow startup. Slow startup matters most on iOS, where
 * downloading the engine plus its SLAM WASM binary (SLAM = the camera-based
 * world-tracking system; WASM = WebAssembly, the compiled binary format it
 * ships as) dominates the time until the first AR frame.
 */

/**
 * Subsystem health rollup — written by each path, read by the always-on
 * DiagnosticPanel. Status values map to dot colors:
 *   green  → 'ok' | 'active' | 'ready' | 'tracking' | 'detected' | 'estimated' | 'normal'
 *   amber  → 'searching' | 'loading' | 'limited'
 *   red    → 'denied' | 'error' | 'unavailable' | 'unsupported' | 'notavailable'
 *   gray   → 'idle' | 'unknown'
 */
export type SubsystemStatus =
  | 'ok'
  | 'active'
  | 'ready'
  | 'tracking'
  | 'detected'
  | 'estimated'
  | 'normal'
  | 'searching'
  | 'loading'
  | 'limited'
  | 'denied'
  | 'error'
  | 'unavailable'
  | 'unsupported'
  | 'notavailable'
  | 'idle'
  | 'unknown';

/** Coarse device/browser classification shown in the diagnostic panel. */
export type PlatformLabel =
  'ios-safari' | 'android-chrome' | 'mobile-web' | 'desktop-mock' | 'unsupported' | 'unknown';

export interface SubsystemsSnapshot {
  /** 8th Wall engine (xr.js + SLAM WASM) ready state (xrloaded fired). */
  engine: SubsystemStatus;
  /** engine-binary <script> network load outcome (loaded vs blocked/404). */
  engineScript: SubsystemStatus;
  /** xrextras + landing-page <script> load outcome. */
  helpers: SubsystemStatus;
  /** Camera pipeline running (XR8.run). */
  session: SubsystemStatus;
  /** Camera permission / feed. */
  camera: SubsystemStatus;
  /** Device-motion permission (iOS gates this behind a gesture). */
  motion: SubsystemStatus;
  /** SLAM world-tracking quality (reality.trackingstatus). */
  worldTracking: SubsystemStatus;
  /** Center-screen hit-test / reticle lock. */
  hitTest: SubsystemStatus;
  /** Image-marker detection: 'searching' while hunting, 'tracking' in view. */
  imageTarget: SubsystemStatus;
  /** Surface under the reticle (estimated vs detected). */
  surface: SubsystemStatus;
  /** Desktop webcam mock sandbox. */
  desktopMock: SubsystemStatus;
  platform: PlatformLabel;
}

/**
 * Load-timing track. Each stage stores ms since page navigation start
 * (performance.now()), or null until reached. Used to answer "why is the
 * first AR frame slow?" — the gap between stages localizes the cost.
 */
export type LoadStage =
  'appMounted' | 'supportDetected' | 'engineReady' | 'pipelineRun' | 'firstFrame' | 'firstTracking';

/** Per-stage timestamps (ms since navigation start), null until reached. */
export type LoadTiming = Record<LoadStage, number | null>;

// ---------------------------------------------------------------------------
// TEMPORARY — tap→place breadcrumb log. Removed / refined once GIF fix lands.
// ---------------------------------------------------------------------------

/** A single timestamped placement breadcrumb entry. */
export interface BreadcrumbEntry {
  /** ms since navigation start (performance.now()). */
  t: number;
  msg: string;
}

/** Max entries kept in the ring buffer. */
const BREADCRUMB_MAX = 20;

/** The full mutable telemetry state read by the HUD / diagnostic panel. */
export interface TelemetrySnapshot {
  fps: number;
  /** Current hit orientation, or null when not tracking. */
  hitTest: 'horizontal' | 'vertical' | null;
  /** Number of posters currently placed. */
  posters: number;
  /** Freeform diagnostic message (e.g. why the engine failed to start). */
  note: string | null;
  hudVisible: boolean;
  timing: LoadTiming;
  subsystems: SubsystemsSnapshot;
  /** TEMPORARY: ring-buffered breadcrumbs for the tap→place diagnostic path. */
  breadcrumbs: BreadcrumbEntry[];
}

const initialSubsystems: SubsystemsSnapshot = {
  engine: 'idle',
  engineScript: 'idle',
  helpers: 'idle',
  session: 'idle',
  camera: 'idle',
  motion: 'idle',
  worldTracking: 'idle',
  hitTest: 'idle',
  imageTarget: 'idle',
  surface: 'idle',
  desktopMock: 'idle',
  platform: 'unknown',
};

const initialTiming: LoadTiming = {
  appMounted: null,
  supportDetected: null,
  engineReady: null,
  pipelineRun: null,
  firstFrame: null,
  firstTracking: null,
};

const initial: TelemetrySnapshot = {
  fps: 0,
  hitTest: null,
  posters: 0,
  note: null,
  hudVisible:
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debug') === '1',
  timing: { ...initialTiming },
  subsystems: { ...initialSubsystems },
  // TEMPORARY: starts empty; populated by placement breadcrumbs.
  breadcrumbs: [],
};

let state: TelemetrySnapshot = {
  ...initial,
  timing: { ...initial.timing },
  subsystems: { ...initial.subsystems },
};
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((cb) => cb());

let lastFrameTime: number | null = null;
// FPS is derived from an EMA (exponential moving average) of the per-frame
// delta time: a running average where each new sample only nudges the value
// by EMA_ALPHA (10%). That smooths out single-frame spikes so the readout
// doesn't flicker. Seeded at the 60 fps frame time (1000/60 ms).
let emaDt = 1000 / 60;
const EMA_ALPHA = 0.1;

/**
 * Module-singleton telemetry store. Hot-path writers (write/tick) mutate
 * state in place with no notifications; cold-path setters notify subscribers
 * only on real transitions so React re-renders stay rare.
 */
export const debugTelemetry = {
  /**
   * Hot path — called from the animation loop every frame. Mutates state in
   * place (no object spread, no subscriber notification) to stay cheap.
   *
   * @param partial — Fields of the snapshot to overwrite (e.g. fps, hitTest,
   *   posters). Unmentioned fields are left untouched.
   */
  write(partial: Partial<TelemetrySnapshot>): void {
    Object.assign(state, partial);
  },

  /**
   * Rolls the FPS estimate forward from a frame timestamp. Call once per
   * frame from the render loop.
   *
   * @param timeMs — Frame timestamp in milliseconds (performance.now()).
   */
  tick(timeMs: number): void {
    if (lastFrameTime !== null) {
      const dt = timeMs - lastFrameTime;
      // Ignore gaps of 1 s or more: a backgrounded tab pauses
      // requestAnimationFrame entirely, and feeding that huge gap into the
      // moving average would crater the FPS readout for many frames after
      // the tab comes back.
      if (dt > 0 && dt < 1000) {
        emaDt = emaDt * (1 - EMA_ALPHA) + dt * EMA_ALPHA;
        state.fps = Math.round(1000 / emaDt);
      }
    }
    lastFrameTime = timeMs;
  },

  /**
   * Records the first time a load stage is reached (ms since navigation
   * start). Idempotent — later calls for the same stage are ignored, so
   * `mark('firstFrame')` can be called every frame safely.
   *
   * @param stage — The load stage that was just reached (see {@link LoadStage}).
   */
  mark(stage: LoadStage): void {
    if (state.timing[stage] !== null) return;
    state.timing[stage] = typeof performance !== 'undefined' ? Math.round(performance.now()) : 0;
    notify();
  },

  /**
   * Cold path — only the HUD/panel calls this.
   *
   * @returns The live state object (NOT a copy — do not mutate it).
   */
  read(): TelemetrySnapshot {
    return state;
  },

  /**
   * Updates a single subsystem's status. Notifies subscribers only on a real
   * transition so the panel re-renders rarely.
   *
   * @param name — Which subsystem to update (key of SubsystemsSnapshot).
   * @param status — Its new status; a no-op when unchanged.
   */
  setSubsystem<K extends keyof SubsystemsSnapshot>(name: K, status: SubsystemsSnapshot[K]): void {
    if (state.subsystems[name] === status) return;
    state.subsystems[name] = status;
    notify();
  },

  /**
   * Sets the freeform diagnostic note shown on the panel. Notifies
   * subscribers only when the note actually changes.
   *
   * @param note — The message to show, or null to clear it.
   */
  setNote(note: string | null): void {
    if (state.note === note) return;
    state.note = note;
    notify();
  },

  /**
   * Shows or hides the debug HUD. Notifies subscribers.
   *
   * @param v — True to show the HUD, false to hide it.
   */
  setHudVisible(v: boolean): void {
    state.hudVisible = v;
    notify();
  },

  /** Flips HUD visibility (bound to the hidden debug gesture). */
  toggleHud(): void {
    state.hudVisible = !state.hudVisible;
    notify();
  },

  /**
   * Subscribes to HUD visibility / subsystem / timing changes. Per-frame
   * writes (write/tick, e.g. FPS) deliberately do NOT notify.
   *
   * @param cb — Called (with no arguments) after each notifying change;
   *   read() inside the callback to get the new state.
   * @returns An unsubscribe function — call it to remove the callback.
   */
  subscribe(cb: () => void): () => void {
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  },

  // ---------------------------------------------------------------------------
  // TEMPORARY — breadcrumb helpers for the tap→place diagnostic path.
  // Remove / refine once the GIF placement bug is fixed.
  // ---------------------------------------------------------------------------

  /**
   * Appends a timestamped diagnostic message to the breadcrumb ring buffer
   * (a fixed-size list where, once full, adding a new entry drops the
   * oldest). Notifies subscribers so the HUD refreshes within its 200 ms
   * polling interval.
   *
   * @param msg — Short human-readable description of the event.
   */
  logEvent(msg: string): void {
    const entry: BreadcrumbEntry = {
      t: typeof performance !== 'undefined' ? Math.round(performance.now()) : 0,
      msg,
    };
    if (state.breadcrumbs.length >= BREADCRUMB_MAX) {
      state.breadcrumbs = [...state.breadcrumbs.slice(1), entry];
    } else {
      state.breadcrumbs = [...state.breadcrumbs, entry];
    }
    notify();
  },

  /** Wipes all breadcrumbs (e.g. on session reset). Notifies subscribers. */
  clearEvents(): void {
    if (state.breadcrumbs.length === 0) return;
    state.breadcrumbs = [];
    notify();
  },

  /**
   * Called on session end. Preserves hudVisible, platform, engine readiness,
   * and the load-timing track (a one-time startup measurement). Resets the
   * ephemeral per-session subsystems to 'idle'.
   */
  reset(): void {
    const { hudVisible, timing } = state;
    const { platform, engine } = state.subsystems;
    state = {
      ...initial,
      hudVisible,
      timing: { ...timing },
      subsystems: {
        ...initialSubsystems,
        platform,
        engine,
      },
      breadcrumbs: [],
    };
    lastFrameTime = null;
    emaDt = 1000 / 60;
    notify();
  },
};
