/**
 * DebugHUD
 *
 * Toggleable overlay that samples debugTelemetry at 5 Hz. Lives outside the
 * 60 FPS render path — never re-renders the React tree from frame data.
 *
 * Shows live 8th Wall subsystem state plus the startup load-timing track,
 * which is the quickest way to see where time-to-AR goes (notably the engine
 * + SLAM WASM download on iOS).
 */

import React, { useEffect, useState } from 'react';
import { debugTelemetry, TelemetrySnapshot, LoadStage } from '@/xr/debugTelemetry';
import './DebugHUD.css';

const ms = (v: number | null): string => (v === null ? '—' : `${v} ms`);

const TIMING_ROWS: { key: LoadStage; label: string }[] = [
  { key: 'appMounted', label: 'App mount' },
  { key: 'supportDetected', label: 'Detect' },
  { key: 'engineReady', label: 'Engine ready' },
  { key: 'pipelineRun', label: 'Pipeline run' },
  { key: 'firstFrame', label: 'First frame' },
  { key: 'firstTracking', label: 'First track' },
];

export const DebugHUD: React.FC = () => {
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(() =>
    debugTelemetry.read()
  );
  const [, forceVisibility] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSnapshot({ ...debugTelemetry.read() });
    }, 200);
    const unsub = debugTelemetry.subscribe(() => forceVisibility((n) => n + 1));
    return () => {
      clearInterval(id);
      unsub();
    };
  }, []);

  if (!snapshot.hudVisible) return null;

  const subs = snapshot.subsystems;

  return (
    <div className="debug-hud" role="status" aria-label="Debug telemetry">
      <div className="debug-hud-row">
        <span>FPS</span>
        <span>{snapshot.fps}</span>
      </div>
      <div className="debug-hud-row">
        <span>Engine</span>
        <span>{subs.engine}</span>
      </div>
      <div className="debug-hud-row">
        <span>World track</span>
        <span>{subs.worldTracking}</span>
      </div>
      <div className="debug-hud-row">
        <span>Hit-test</span>
        <span>{snapshot.hitTest ?? '—'}</span>
      </div>
      <div className="debug-hud-row">
        <span>Surface</span>
        <span>{subs.surface}</span>
      </div>
      <div className="debug-hud-row">
        <span>Posters</span>
        <span>{snapshot.posters}</span>
      </div>

      <div className="debug-hud-section">Load timing</div>
      {TIMING_ROWS.map(({ key, label }) => (
        <div className="debug-hud-row" key={key}>
          <span>{label}</span>
          <span>{ms(snapshot.timing[key])}</span>
        </div>
      ))}
    </div>
  );
};
