/**
 * useArLoadProgress
 *
 * Derives a 0–100 loading-progress value + stage label for the AR startup
 * window (from the "Start AR" tap until the camera scene is live). This is the
 * slow phase on mobile — the 8th Wall engine + SLAM WASM download, then camera
 * start. A `<script>`-loaded WASM gives no byte-level progress, so we map the
 * load-timing milestones recorded in debugTelemetry to discrete stage targets
 * and "trickle" smoothly toward each stage's soft cap while it is pending
 * (NProgress-style), so the bar keeps moving during the opaque WASM wait.
 *
 * Progress is monotonic — it never goes backwards.
 */

import { useEffect, useRef, useState } from 'react';
import { debugTelemetry } from '@/xr/debugTelemetry';

export interface ArLoadProgress {
  /** 0–100, rounded. */
  percent: number;
  label: string;
}

interface Stage {
  /** Hard floor once this stage is reached. */
  target: number;
  /** Soft ceiling the trickle eases toward while waiting for the next stage. */
  cap: number;
  label: string;
}

/** Pick the current stage from the telemetry milestones. */
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

const EASE = 0.06;
const TICK_MS = 120;

export function useArLoadProgress(active: boolean): ArLoadProgress {
  const [progress, setProgress] = useState<ArLoadProgress>({
    percent: 0,
    label: 'Preparing…',
  });
  const percentRef = useRef(0);

  useEffect(() => {
    if (!active) {
      percentRef.current = 0;
      setProgress({ percent: 0, label: 'Preparing…' });
      return;
    }

    const id = setInterval(() => {
      const { target, cap, label } = stageFor();
      // Snap up to the stage floor, then ease toward its cap (monotonic).
      const base = Math.max(percentRef.current, target);
      const next = Math.min(cap, base + (cap - base) * EASE);
      percentRef.current = next;
      setProgress({ percent: Math.round(next), label });
    }, TICK_MS);

    return () => clearInterval(id);
  }, [active]);

  return progress;
}
