/**
 * DiagnosticPanel
 *
 * Always-on subsystem health panel. Mounts at app root so it is present on
 * every branch (Android WebXR, iOS fallback, desktop dev, unsupported).
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
} from '@/xr/debugTelemetry';
import './DiagnosticPanel.css';

const DISMISS_KEY = 'xrposter:diagnostic-dismissed';

type DotColor = 'green' | 'amber' | 'red' | 'gray';

const statusColor = (s: SubsystemStatus): DotColor => {
  switch (s) {
    case 'ok':
    case 'active':
    case 'tracking':
    case 'detected':
    case 'estimated':
    case 'ready':
    case 'anchored':
      return 'green';
    case 'searching':
    case 'loading':
    case 'inferring':
    case 'drifting':
      return 'amber';
    case 'denied':
    case 'error':
    case 'unavailable':
    case 'unsupported':
      return 'red';
    case 'idle':
    case 'unknown':
    default:
      return 'gray';
  }
};

const platformLabel = (p: PlatformLabel): string => {
  switch (p) {
    case 'android-webxr': return 'Android · WebXR';
    case 'ios-fallback':  return 'iOS · Camera+Motion';
    case 'desktop-dev':   return 'Desktop · Dev';
    case 'desktop-emulator': return 'Desktop · WebXR Emulator';
    case 'unsupported':   return 'Unsupported device';
    default:              return 'Detecting…';
  }
};

/**
 * Subsystem rows we render and the order we render them in. Some rows are
 * only meaningful on certain platforms — we still show them, but they sit
 * at 'idle' / 'unavailable' so the user sees the full inventory.
 */
const ROWS: { key: keyof Omit<SubsystemsSnapshot, 'platform'>; label: string }[] = [
  { key: 'webxr',       label: 'WebXR' },
  { key: 'session',     label: 'Session' },
  { key: 'hitTest',     label: 'Hit-test' },
  { key: 'planes',      label: 'Planes' },
  { key: 'surface',     label: 'Surface' },
  { key: 'anchors',     label: 'Anchors' },
  { key: 'camera',      label: 'Camera' },
  { key: 'motion',      label: 'Motion' },
  { key: 'segmenter',   label: 'Segmenter' },
  { key: 'stabilizer',  label: 'Stabilizer' },
  { key: 'desktopMock', label: 'Desktop mock' },
];

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

const hint = (subs: SubsystemsSnapshot): string | null => {
  if (subs.platform === 'unsupported') {
    return 'No AR-capable APIs detected. Try Android Chrome or iOS Safari.';
  }
  if (subs.camera === 'denied') return 'Allow camera access in browser settings, then reload.';
  if (subs.motion === 'denied') return 'Allow motion access on the start screen.';
  if (subs.webxr === 'unsupported' && subs.platform === 'ios-fallback') {
    return 'iOS has no WebXR. Using camera+gyroscope estimated floor.';
  }
  // Active desktop-mock or in-flight segmentation takes precedence over the
  // generic "WebXR unsupported" message — the user already knows that's why
  // they're in this branch.
  if (subs.desktopMock === 'active') {
    return 'Drag the canvas to rotate the virtual camera; webcam frames drive segmentation.';
  }
  if (subs.segmenter === 'loading') {
    return 'Downloading segmentation model (~10 MB) — first run only.';
  }
  if (subs.segmenter === 'error') {
    return 'TensorFlow.js segmentation could not start. Falling back to estimated floor.';
  }
  if (subs.segmenter === 'ready' && subs.stabilizer === 'drifting') {
    return 'Camera moved a lot since the last detection — re-scan slowly to re-anchor.';
  }
  if (subs.segmenter === 'ready' && subs.stabilizer === 'idle') {
    return 'Model ready. Point camera at a wall or floor to detect a surface.';
  }
  if (subs.webxr === 'unsupported') return 'WebXR immersive-ar not available in this browser.';
  if (subs.session === 'idle') return 'Tap "Start AR" to begin.';
  if (subs.hitTest === 'searching') return 'Point at a flat surface 0.5–2 m away and move the phone slowly.';
  if (subs.hitTest === 'unavailable') return 'Hit-test feature not granted — the session may have been requested without it.';
  if (subs.planes === 'unavailable' && subs.hitTest === 'tracking') {
    return 'No plane-detection (e.g. WebXR Emulator). Showing synthetic surface at hit pose.';
  }
  return null;
};

export const DiagnosticPanel: React.FC = () => {
  const [snapshot, setSnapshot] = useState(() => debugTelemetry.read().subsystems);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage?.getItem(DISMISS_KEY) === '1';
  });

  useEffect(() => {
    const refresh = () => setSnapshot({ ...debugTelemetry.read().subsystems });
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
        <span className="diagnostic-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="diagnostic-body">
          {ROWS.map(({ key, label }) => {
            const status = snapshot[key];
            const color = statusColor(status);
            return (
              <div className="diagnostic-row" key={key}>
                <span className={`diagnostic-dot diagnostic-dot-${color}`} aria-hidden="true" />
                <span className="diagnostic-label">{label}</span>
                <span className={`diagnostic-status diagnostic-status-${color}`}>
                  {status}
                </span>
              </div>
            );
          })}

          {message && (
            <div className="diagnostic-hint">{message}</div>
          )}

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
