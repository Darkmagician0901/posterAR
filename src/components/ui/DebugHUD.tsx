/**
 * DebugHUD
 *
 * Toggleable overlay that samples debugTelemetry at 5 Hz. Lives outside the
 * 60 FPS render path — never re-renders the React tree from frame data.
 *
 * Shows live 8th Wall subsystem state plus the startup load-timing track,
 * which is the quickest way to see where time-to-AR goes. The dominant cost
 * is usually the download of the engine plus its SLAM module (SLAM =
 * "Simultaneous Localization and Mapping", the surface-tracking system,
 * shipped as WebAssembly) — slowest on iOS over cellular.
 *
 * TEMPORARY additions (removed/refined once GIF placement fix lands):
 *   - Always-visible 🐞 toggle chip so the panel can be opened on demand
 *     even when nothing has errored.
 *   - Breadcrumb log block showing the tap→place pipeline trace.
 */

import React, { useEffect, useState } from 'react';
import { debugTelemetry, TelemetrySnapshot, LoadStage } from '@/xr/debugTelemetry';
import './DebugHUD.css';

/**
 * Formats a millisecond value for display.
 *
 * @param v — Elapsed milliseconds, or null when the stage hasn't happened yet.
 * @returns "<n> ms", or an em-dash for null.
 */
const ms = (v: number | null): string => (v === null ? '—' : `${v} ms`);

const TIMING_ROWS: { key: LoadStage; label: string }[] = [
  { key: 'appMounted', label: 'App mount' },
  { key: 'supportDetected', label: 'Detect' },
  { key: 'engineReady', label: 'Engine ready' },
  { key: 'pipelineRun', label: 'Pipeline run' },
  { key: 'firstFrame', label: 'First frame' },
  { key: 'firstTracking', label: 'First track' },
];

/** Telemetry overlay toggled by the 🐞 chip; samples debugTelemetry at 5 Hz. */
export const DebugHUD: React.FC = () => {
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(() =>
    debugTelemetry.read()
  );
  const [, forceVisibility] = useState(0);

  useEffect(() => {
    // Two update paths: a 200 ms poll that refreshes the displayed snapshot,
    // plus a subscription that forces an extra render whenever telemetry
    // reports a state transition (e.g. the HUD visibility toggle).
    const id = setInterval(() => {
      setSnapshot({ ...debugTelemetry.read() });
    }, 200);
    const unsub = debugTelemetry.subscribe(() => forceVisibility((n) => n + 1));
    return () => {
      clearInterval(id);
      unsub();
    };
  }, []);

  const subs = snapshot.subsystems;

  // TEMPORARY: format breadcrumb log as a copyable plain-text block.
  const breadcrumbText =
    snapshot.breadcrumbs.length > 0
      ? snapshot.breadcrumbs.map((e) => `+${e.t}ms ${e.msg}`).join('\n')
      : null;

  return (
    <>
      {/* TEMPORARY: always-visible 🐞 chip — tapping opens/closes the panel at
          any time without requiring an error to occur first. Fixed position,
          high z-index, never hidden, tappable on mobile (44px tap target). */}
      <button
        type="button"
        className="debug-hud-toggle"
        aria-label={snapshot.hudVisible ? 'Hide debug HUD' : 'Show debug HUD'}
        onClick={() => debugTelemetry.toggleHud()}
      >
        🐞
      </button>

      {snapshot.hudVisible && (
        <div className="debug-hud" role="status" aria-label="Debug telemetry">
          {/* TEMPORARY: breadcrumb log for the tap→place diagnostic path. */}
          {breadcrumbText && (
            <div className="debug-hud-note debug-hud-crumbs">
              <div className="debug-hud-note-head">
                <span>Tap trace</span>
                <button
                  type="button"
                  className="debug-hud-copy"
                  onClick={() => {
                    void navigator.clipboard?.writeText(breadcrumbText);
                  }}
                >
                  Copy
                </button>
              </div>
              <pre className="debug-hud-note-body debug-hud-crumbs-body">
                {breadcrumbText}
              </pre>
            </div>
          )}

          {snapshot.note && (
            <div className="debug-hud-note">
              <div className="debug-hud-note-head">
                <span>Last error</span>
                <button
                  type="button"
                  className="debug-hud-copy"
                  onClick={() => {
                    void navigator.clipboard?.writeText(snapshot.note ?? '');
                  }}
                >
                  Copy
                </button>
              </div>
              <pre className="debug-hud-note-body">{snapshot.note}</pre>
            </div>
          )}

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
      )}
    </>
  );
};
