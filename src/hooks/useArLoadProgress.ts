/**
 * useArLoadProgress
 *
 * Derives a 0–100 loading-progress value + stage label for the AR startup
 * window (from the "Start AR" tap until the camera scene is live). This is the
 * slow phase on mobile — the 8th Wall engine + SLAM WASM download, then camera
 * start. A `<script>`-loaded WASM gives no byte-level progress, so we map the
 * load-timing milestones recorded in debugTelemetry to discrete stage targets
 * and "trickle" smoothly toward each stage's soft cap while it is pending —
 * the same fake-but-reassuring crawl the NProgress loading-bar library made
 * popular — so the bar keeps moving during the opaque WASM wait.
 *
 * Progress is monotonic — it never goes backwards.
 */

import { useEffect, useRef, useState } from 'react';
import { debugTelemetry } from '@/xr/debugTelemetry';

/** Progress snapshot consumed by the AR loading overlay. */
export interface ArLoadProgress {
  /** 0–100, rounded. */
  percent: number;
  /** Human-readable stage name (e.g. "Downloading AR engine…"). */
  label: string;
  /** True when the engine failed/stalled — the bar should stop and show why. */
  error: boolean;
}

interface Stage {
  /** Hard floor once this stage is reached. */
  target: number;
  /** Soft ceiling the trickle eases toward while waiting for the next stage. */
  cap: number;
  label: string;
}

/**
 * Picks the current loading stage from the telemetry milestones.
 *
 * @returns The {@link Stage} whose milestone has most recently been reached
 *   (checked from latest to earliest, so the furthest stage wins).
 */
const stageFor = (): Stage => {
  const { subsystems, timing } = debugTelemetry.read();
  const { engine, session } = subsystems;
  const { engineReady, pipelineRun, firstFrame } = timing;

  if (firstFrame !== null || session === 'active') {
    return { target: 100, cap: 100, label: 'Ready' };
  }
  if (pipelineRun !== null) {
    return { target: 80, cap: 94, label: 'Initializing camera…' };
  }
  if (engine === 'ready' || engineReady !== null) {
    return { target: 60, cap: 74, label: 'Starting camera…' };
  }
  return { target: 8, cap: 55, label: 'Downloading AR engine…' };
};

/**
 * Trickle speed: on each tick the bar moves this fraction of the distance
 * still remaining to the stage cap. Because the step is a fraction of the
 * *remaining* gap, movement is fast at first and slows as it approaches the
 * cap without ever quite reaching it (exponential easing) — the bar visibly
 * keeps crawling during the opaque WASM download but can't hit 100% early.
 */
const EASE = 0.06;
/** Polling interval — telemetry has no change events, so we sample it on a timer. */
const TICK_MS = 120;

/**
 * Polls debugTelemetry while `active` and returns a smoothed, monotonic
 * progress value + stage label for the AR startup overlay. Resets to 0 /
 * "Preparing…" whenever `active` goes false.
 *
 * @param active — True while the AR loading overlay is showing; starts the
 *   polling timer when true and resets/stops it when false.
 * @returns The current {@link ArLoadProgress} — `percent` (0–100, never
 *   decreasing while active), `label` (stage name or error note), and
 *   `error` (true when the engine failed and the bar should freeze).
 */
export function useArLoadProgress(active: boolean): ArLoadProgress {
  const [progress, setProgress] = useState<ArLoadProgress>({
    percent: 0,
    label: 'Preparing…',
    error: false,
  });
  const percentRef = useRef(0);

  useEffect(() => {
    if (!active) {
      percentRef.current = 0;
      setProgress({ percent: 0, label: 'Preparing…', error: false });
      return;
    }

    const id = setInterval(() => {
      const snap = debugTelemetry.read();

      // Engine failed/stalled — freeze the bar and show the diagnostic note.
      if (snap.subsystems.engine === 'error') {
        setProgress({
          percent: Math.round(percentRef.current),
          label: snap.note ?? 'AR engine failed to load',
          error: true,
        });
        return;
      }

      const { target, cap, label } = stageFor();
      // Snap up to the stage floor, then ease toward its cap (monotonic).
      const base = Math.max(percentRef.current, target);
      const next = Math.min(cap, base + (cap - base) * EASE);
      percentRef.current = next;
      setProgress({ percent: Math.round(next), label, error: false });
    }, TICK_MS);

    return () => clearInterval(id);
  }, [active]);

  return progress;
}
