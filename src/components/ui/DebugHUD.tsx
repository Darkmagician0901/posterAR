/**
 * DebugHUD
 *
 * Toggleable overlay that samples debugTelemetry at 5 Hz. Lives outside the
 * 60 FPS render path — never re-renders the React tree from frame data.
 */

import React, { useEffect, useState } from 'react';
import { debugTelemetry, TelemetrySnapshot } from '@/xr/debugTelemetry';
import './DebugHUD.css';

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

  return (
    <div className="debug-hud" role="status" aria-label="Debug telemetry">
      <div className="debug-hud-row">
        <span>FPS</span>
        <span>{snapshot.fps}</span>
      </div>
      <div className="debug-hud-row">
        <span>Session</span>
        <span>{snapshot.session}</span>
      </div>
      <div className="debug-hud-row">
        <span>RefSpace</span>
        <span>{snapshot.refSpace}</span>
      </div>
      <div className="debug-hud-row">
        <span>Hit-test</span>
        <span>{snapshot.hitTest ?? '—'}</span>
      </div>
      <div className="debug-hud-row">
        <span>Planes</span>
        <span>
          {snapshot.planesTotal === null
            ? 'n/a'
            : `${snapshot.planesTotal} (${snapshot.planesHorizontal}H, ${snapshot.planesVertical}V)`}
        </span>
      </div>
      <div className="debug-hud-row">
        <span>Anchors</span>
        <span>{snapshot.anchors}</span>
      </div>
      <div className="debug-hud-row">
        <span>Active</span>
        <span className={`debug-stability debug-stability-${snapshot.activePlaneStability ?? 'none'}`}>
          {snapshot.activePlaneStability ?? '—'}
        </span>
      </div>
      <label className="debug-hud-toggle">
        <input
          type="checkbox"
          checked={snapshot.showAllPlanes}
          onChange={(e) => debugTelemetry.setShowAllPlanes(e.target.checked)}
        />
        Show all planes
      </label>
    </div>
  );
};
