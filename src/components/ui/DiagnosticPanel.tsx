/**
 * DiagnosticPanel
 *
 * Always-on subsystem health panel. Mounts at app root so it is present on
 * every branch (iOS Safari, Android Chrome, desktop mock, unsupported). Also
 * surfaces the startup load-timing track for diagnosing slow time-to-AR.
 *
 * Two visual states:
 *   - Collapsed: a small pill in top-left showing platform + a single dot
 *     in the worst current color (red > amber > green > gray).
 *   - Expanded: vertical list of subsystem rows with a colored dot, name
 *     and status chip.
 *
 * Data source: `debugTelemetry` singleton. We do NOT poll subsystem state
 * at frame rate — we subscribe for change notifications (subsystem setters
 * call `notify()` only on transition) so the panel re-renders rarely.
 */

import React, { useEffect, useState } from 'react';
import {
  debugTelemetry,
  SubsystemStatus,
  SubsystemsSnapshot,
  PlatformLabel,
  LoadStage,
  LoadTiming,
} from '@/xr/debugTelemetry';
import './DiagnosticPanel.css';

const DISMISS_KEY = 'xrposter:diagnostic-dismissed';

type DotColor = 'green' | 'amber' | 'red' | 'gray';

/**
 * Maps a subsystem status string onto the four traffic-light dot colors.
 *
 * @param s — Subsystem status reported by debugTelemetry.
 * @returns 'green' for healthy states, 'amber' for in-progress states,
 *   'red' for failures, 'gray' for idle/unknown.
 */
const statusColor = (s: SubsystemStatus): DotColor => {
  switch (s) {
    case 'ok':
    case 'active':
    case 'tracking':
    case 'detected':
    case 'estimated':
    case 'ready':
    case 'normal':
      return 'green';
    case 'searching':
    case 'loading':
    case 'limited':
      return 'amber';
    case 'denied':
    case 'error':
    case 'unavailable':
    case 'unsupported':
    case 'notavailable':
      return 'red';
    case 'idle':
    case 'unknown':
    default:
      return 'gray';
  }
};

/**
 * Returns the human-readable platform name for the collapsed pill.
 *
 * @param p — Platform label set by App.tsx after capability detection.
 * @returns Display string such as "iOS · Safari"; "Detecting…" before the
 *   platform is known.
 */
const platformLabel = (p: PlatformLabel): string => {
  switch (p) {
    case 'ios-safari':
      return 'iOS · Safari';
    case 'android-chrome':
      return 'Android · Chrome';
    case 'mobile-web':
      return 'Mobile · Web';
    case 'desktop-mock':
      return 'Desktop · Mock';
    case 'unsupported':
      return 'Unsupported device';
    default:
      return 'Detecting…';
  }
};

/**
 * Formats a millisecond value for display.
 *
 * @param v — Elapsed milliseconds, or null when the stage hasn't happened yet.
 * @returns "<n> ms", or an em-dash for null.
 */
const ms = (v: number | null): string => (v === null ? '—' : `${v} ms`);

const TIMING_ROWS: { key: LoadStage; label: string }[] = [
  { key: 'appMounted', label: 'App mount' },
  { key: 'supportDetected', label: 'Support detect' },
  { key: 'engineReady', label: 'Engine ready' },
  { key: 'pipelineRun', label: 'Pipeline run' },
  { key: 'firstFrame', label: 'First frame' },
  { key: 'firstTracking', label: 'First tracking' },
];

/**
 * Finds the largest recorded timing value, i.e. the effective time-to-AR so
 * far (each stage records milliseconds since page load).
 *
 * @param t — Load-timing snapshot from debugTelemetry.
 * @returns The largest non-null stage time in ms, or null when no stage has
 *   been recorded yet.
 */
const slowestStage = (t: LoadTiming): number | null => {
  const vals = Object.values(t).filter((v): v is number => v !== null);
  return vals.length ? Math.max(...vals) : null;
};

/**
 * Subsystem rows we render and the order we render them in. Some rows are
 * only meaningful on certain platforms — we still show them, but they sit
 * at 'idle' / 'unavailable' so the user sees the full inventory.
 */
const ROWS: { key: keyof Omit<SubsystemsSnapshot, 'platform'>; label: string }[] = [
  { key: 'engine', label: 'Engine (XR8)' },
  { key: 'engineScript', label: 'Engine script' },
  { key: 'helpers', label: 'Helpers (xrextras)' },
  { key: 'session', label: 'Session' },
  { key: 'camera', label: 'Camera' },
  { key: 'motion', label: 'Motion' },
  { key: 'worldTracking', label: 'World tracking' },
  { key: 'hitTest', label: 'Hit-test' },
  { key: 'surface', label: 'Surface' },
  { key: 'desktopMock', label: 'Desktop mock' },
];

/**
 * Picks the color of the single status dot on the collapsed pill.
 *
 * @param subs — Current subsystem snapshot from debugTelemetry.
 * @returns The most severe color present across all rows (red > amber >
 *   green); gray only when every subsystem is idle/unknown.
 */
const worstColor = (subs: SubsystemsSnapshot): DotColor => {
  const order: DotColor[] = ['red', 'amber', 'green', 'gray'];
  for (const target of order) {
    for (const row of ROWS) {
      if (statusColor(subs[row.key]) === target) {
        // Skip gray when scanning for "worst" — we want a green dot once
        // anything is healthy, not gray just because some optional sensor
        // is idle.
        if (target === 'gray') continue;
        return target;
      }
    }
  }
  return 'gray';
};

/**
 * Picks the single most actionable user-facing hint for the current state.
 * Checks are ordered by severity: hard blockers (unsupported device, denied
 * permissions, engine failure) before transient/progress states.
 *
 * @param subs — Current subsystem snapshot from debugTelemetry.
 * @returns The hint to show under the subsystem rows, or null when no hint
 *   applies.
 */
const hint = (subs: SubsystemsSnapshot): string | null => {
  if (subs.platform === 'unsupported') {
    return 'No mobile AR-capable browser detected. Use iOS Safari or Android Chrome.';
  }
  if (subs.camera === 'denied') return 'Allow camera access, then reload.';
  if (subs.motion === 'denied') return 'Allow motion access on the start screen (iOS).';
  if (subs.engine === 'error') {
    return '8th Wall engine failed to load. Check your connection or browser support.';
  }
  if (subs.engine === 'loading') {
    return 'Loading 8th Wall engine + SLAM — first visit downloads several MB (slowest on iOS/cellular).';
  }
  if (subs.desktopMock === 'active') {
    return 'Desktop mock — drag the canvas to rotate the view; the reticle/placement code runs against your webcam.';
  }
  if (subs.session === 'idle') return 'Tap "Start AR" to begin.';
  if (subs.worldTracking === 'limited') {
    return 'SLAM stabilizing — move the phone slowly across textured surfaces.';
  }
  if (subs.worldTracking === 'notavailable') {
    return 'World tracking unavailable on this device/session.';
  }
  if (subs.hitTest === 'searching') {
    return 'Point at a surface 0.5–2 m away and move the phone slowly.';
  }
  if (subs.surface === 'estimated' && subs.hitTest === 'tracking') {
    return 'Placing on an estimated surface at the reticle (no detected plane yet).';
  }
  return null;
};

/**
 * Subsystem health panel (see file header). Dismissal persists for the tab
 * via sessionStorage; a small "?" pill restores it.
 */
export const DiagnosticPanel: React.FC = () => {
  const [snapshot, setSnapshot] = useState(() => debugTelemetry.read().subsystems);
  const [timing, setTiming] = useState<LoadTiming>(() => debugTelemetry.read().timing);
  const [note, setNote] = useState<string | null>(() => debugTelemetry.read().note);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage?.getItem(DISMISS_KEY) === '1';
  });

  useEffect(() => {
    const refresh = () => {
      setSnapshot({ ...debugTelemetry.read().subsystems });
      setTiming({ ...debugTelemetry.read().timing });
      setNote(debugTelemetry.read().note);
    };
    const unsub = debugTelemetry.subscribe(refresh);
    // 1 Hz heartbeat so transient states (e.g. 'searching' updates) still
    // surface even if no setter notifies. Cheap.
    const id = setInterval(refresh, 1000);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, []);

  if (dismissed) {
    return (
      <button
        className="diagnostic-pill diagnostic-pill-restore"
        onClick={() => {
          setDismissed(false);
          window.sessionStorage?.removeItem(DISMISS_KEY);
        }}
        aria-label="Show diagnostic panel"
        title="Show diagnostic panel"
      >
        ?
      </button>
    );
  }

  const dot = worstColor(snapshot);
  const platform = platformLabel(snapshot.platform);
  const message = hint(snapshot);

  return (
    <div className={`diagnostic-panel diagnostic-panel-${expanded ? 'expanded' : 'collapsed'}`}>
      <button
        className="diagnostic-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={`diagnostic-dot diagnostic-dot-${dot}`} aria-hidden="true" />
        <span className="diagnostic-platform">{platform}</span>
        <span className="diagnostic-caret" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <div className="diagnostic-body">
          {note && <div className="diagnostic-note">{note}</div>}
          {ROWS.map(({ key, label }) => {
            const status = snapshot[key];
            const color = statusColor(status);
            return (
              <div className="diagnostic-row" key={key}>
                <span className={`diagnostic-dot diagnostic-dot-${color}`} aria-hidden="true" />
                <span className="diagnostic-label">{label}</span>
                <span className={`diagnostic-status diagnostic-status-${color}`}>{status}</span>
              </div>
            );
          })}

          <div className="diagnostic-section">
            <span>Load timing</span>
            <span>{ms(slowestStage(timing))}</span>
          </div>
          {TIMING_ROWS.map(({ key, label }) => (
            <div className="diagnostic-row diagnostic-row-timing" key={key}>
              <span className="diagnostic-label">{label}</span>
              <span className="diagnostic-timing-value">{ms(timing[key])}</span>
            </div>
          ))}

          {message && <div className="diagnostic-hint">{message}</div>}

          <button
            className="diagnostic-dismiss"
            onClick={(e) => {
              e.stopPropagation();
              setDismissed(true);
              window.sessionStorage?.setItem(DISMISS_KEY, '1');
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};
