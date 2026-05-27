/**
 * debugTelemetry
 *
 * Module-singleton ref-shaped state shared between the AR animation loop
 * (writer) and the DebugHUD / DiagnosticPanel (readers). The HUD samples
 * this at 5 Hz; the loop writes at frame rate. Plain refs + a subscriber
 * callback list keep React out of the 60 fps path.
 */

export type PlaneStability = 'stable' | 'forming' | 'reshaping' | null;

/**
 * Subsystem health rollup — written by each platform path, read by the
 * always-on DiagnosticPanel. Status values map to dot colors:
 *   green  → 'ok' | 'active' | 'tracking' | 'detected'
 *   amber  → 'searching'
 *   red    → 'denied' | 'error' | 'unavailable' | 'unsupported'
 *   gray   → 'idle' | 'unknown'
 */
export type SubsystemStatus =
  | 'ok'
  | 'active'
  | 'tracking'
  | 'detected'
  | 'estimated'
  | 'searching'
  | 'denied'
  | 'error'
  | 'unavailable'
  | 'unsupported'
  | 'idle'
  | 'unknown';

export type PlatformLabel =
  | 'android-webxr'
  | 'ios-fallback'
  | 'desktop-dev'
  | 'desktop-emulator'
  | 'unsupported'
  | 'unknown';

export interface SubsystemsSnapshot {
  webxr: SubsystemStatus;
  session: SubsystemStatus;
  hitTest: SubsystemStatus;
  planes: SubsystemStatus;
  camera: SubsystemStatus;
  motion: SubsystemStatus;
  anchors: SubsystemStatus;
  surface: SubsystemStatus;
  platform: PlatformLabel;
}

export interface TelemetrySnapshot {
  fps: number;
  session: string;
  refSpace: string;
  hitTest: 'horizontal' | 'vertical' | null;
  planesTotal: number | null;
  planesHorizontal: number;
  planesVertical: number;
  anchors: number;
  activePlaneStability: PlaneStability;
  showAllPlanes: boolean;
  hudVisible: boolean;
  subsystems: SubsystemsSnapshot;
}

const initialSubsystems: SubsystemsSnapshot = {
  webxr: 'unknown',
  session: 'idle',
  hitTest: 'idle',
  planes: 'idle',
  camera: 'idle',
  motion: 'idle',
  anchors: 'idle',
  surface: 'idle',
  platform: 'unknown',
};

const initial: TelemetrySnapshot = {
  fps: 0,
  session: 'idle',
  refSpace: '-',
  hitTest: null,
  planesTotal: null,
  planesHorizontal: 0,
  planesVertical: 0,
  anchors: 0,
  activePlaneStability: null,
  showAllPlanes: false,
  hudVisible:
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debug') === '1',
  subsystems: { ...initialSubsystems },
};

let state: TelemetrySnapshot = { ...initial, subsystems: { ...initial.subsystems } };
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((cb) => cb());

let lastFrameTime: number | null = null;
let emaDt = 1000 / 60;
const EMA_ALPHA = 0.1;

export const debugTelemetry = {
  /** Hot path — called from the animation loop. Avoids object spread. */
  write(partial: Partial<TelemetrySnapshot>): void {
    Object.assign(state, partial);
  },

  /** Roll FPS forward from an XRFrame timestamp. */
  tick(timeMs: number): void {
    if (lastFrameTime !== null) {
      const dt = timeMs - lastFrameTime;
      if (dt > 0 && dt < 1000) {
        emaDt = emaDt * (1 - EMA_ALPHA) + dt * EMA_ALPHA;
        state.fps = Math.round(1000 / emaDt);
      }
    }
    lastFrameTime = timeMs;
  },

  /** Cold path — only the HUD calls this, at 5 Hz. */
  read(): TelemetrySnapshot {
    return state;
  },

  /**
   * Update a single subsystem's status. Used by every platform path to
   * report health into the always-on DiagnosticPanel. Notifies subscribers
   * so the panel can re-render on transition (it does not poll subsystems —
   * they change rarely compared to FPS).
   */
  setSubsystem<K extends keyof SubsystemsSnapshot>(
    name: K,
    status: SubsystemsSnapshot[K]
  ): void {
    if (state.subsystems[name] === status) return;
    state.subsystems[name] = status;
    notify();
  },

  /** Used by the HUD toggle button. Mutates state and notifies subscribers. */
  setShowAllPlanes(v: boolean): void {
    state.showAllPlanes = v;
    notify();
  },

  setHudVisible(v: boolean): void {
    state.hudVisible = v;
    notify();
  },

  toggleHud(): void {
    state.hudVisible = !state.hudVisible;
    notify();
  },

  /** Subscribe for HUD visibility / showAllPlanes / subsystems changes (not for FPS). */
  subscribe(cb: () => void): () => void {
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  },

  /**
   * Called on session end. Keeps showAllPlanes, hudVisible, and platform
   * across sessions. Resets ephemeral subsystem states to 'idle' so the
   * panel reflects "session ended" cleanly.
   */
  reset(): void {
    const { showAllPlanes, hudVisible } = state;
    const { platform, webxr } = state.subsystems;
    state = {
      ...initial,
      showAllPlanes,
      hudVisible,
      subsystems: {
        ...initialSubsystems,
        platform,
        webxr,
      },
    };
    lastFrameTime = null;
    emaDt = 1000 / 60;
    notify();
  },
};
