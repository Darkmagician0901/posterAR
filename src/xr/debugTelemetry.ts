/**
 * debugTelemetry
 *
 * Module-singleton ref-shaped state shared between the AR animation loop
 * (writer) and the DebugHUD (reader). The HUD samples this at 5 Hz; the
 * loop writes at frame rate. Plain refs + a subscriber callback list keep
 * React out of the 60 fps path.
 */

export type PlaneStability = 'stable' | 'forming' | 'reshaping' | null;

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
}

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
};

let state: TelemetrySnapshot = { ...initial };
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

  /** Subscribe for HUD visibility / showAllPlanes changes (not for FPS). */
  subscribe(cb: () => void): () => void {
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  },

  /** Called on session end. Keeps showAllPlanes / hudVisible across sessions. */
  reset(): void {
    const { showAllPlanes, hudVisible } = state;
    state = { ...initial, showAllPlanes, hudVisible };
    lastFrameTime = null;
    emaDt = 1000 / 60;
    notify();
  },
};
