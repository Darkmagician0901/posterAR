/**
 * MarkerHUD — the marker testbed's on-screen instrument panel and controls.
 *
 * Top half is the measurement readout (frame rate, detection latency, jitter,
 * re-acquisition drift); bottom half is the only interaction the testbed has:
 * a distance slider, an anchoring-mode toggle, and add/remove.
 *
 * Live numbers are POLLED at 5 Hz through a getter rather than pushed in as
 * props. The values change every frame, and rendering them as React state
 * would drag the whole component tree into the 60 fps render path — the exact
 * cost this HUD exists to measure.
 */

import React, { useEffect, useState } from 'react';
import { MAX_MARKER_DISTANCE, MIN_MARKER_DISTANCE } from '@/utils/constants';
import { distanceFromMarker } from '@/xr/markerRelativeTransform';
import { useSpaceStore } from '@/store/spaceStore';
import type { MarkerStatus } from '@/xr8/imageTargetController';
import './MarkerHUD.css';

/** Where the most recent persistence attempt got to. */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'disabled';

/** Everything the readout shows, sampled fresh on each poll. */
export interface TestbedStatus {
  fps: number;
  /** Health of the active marker, or null before the first detection. */
  marker: MarkerStatus | null;
  /** Asset jump on the last re-acquisition, in millimetres. */
  reacquireDriftMm: number | null;
  /** Assets currently rendered. */
  placedCount: number;
  /** Fingerprints handed to the engine. */
  configuredCount: number;
}

interface MarkerHUDProps {
  /** Samples live status; called at 5 Hz. */
  getStatus: () => TestbedStatus;
  /** True in FOLLOW mode (pose re-derived every frame), false in LATCH. */
  follow: boolean;
  onToggleFollow: () => void;
  onAddAsset: () => void;
  onRemoveSelected: () => void;
  /**
   * Called as the slider moves.
   *
   * @param distance — New distance from the marker, in metres.
   */
  onDistanceChange: (distance: number) => void;
  saveState: SaveState;
}

/** Formats a number, or an em-dash when it isn't available yet. */
const num = (v: number | null | undefined, digits: number, unit: string): string =>
  v === null || v === undefined ? '—' : `${v.toFixed(digits)} ${unit}`;

/** Save-state labels; 'disabled' explains itself rather than looking broken. */
const SAVE_LABEL: Record<SaveState, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
  disabled: 'Local only (no API configured)',
};

export const MarkerHUD: React.FC<MarkerHUDProps> = ({
  getStatus,
  follow,
  onToggleFollow,
  onAddAsset,
  onRemoveSelected,
  onDistanceChange,
  saveState,
}) => {
  const [status, setStatus] = useState<TestbedStatus>(getStatus);
  const selectedAssetId = useSpaceStore((s) => s.selectedAssetId);
  const spaces = useSpaceStore((s) => s.spaces);
  const activeMarker = useSpaceStore((s) => s.activeMarker);

  useEffect(() => {
    const id = setInterval(() => setStatus(getStatus()), 200);
    return () => clearInterval(id);
  }, [getStatus]);

  const space = activeMarker ? spaces[activeMarker] : undefined;
  const selected = space?.assets.find((a) => a.id === selectedAssetId) ?? null;
  const distance = selected ? distanceFromMarker(selected.local) : 0;

  const marker = status.marker;
  const metrics = marker?.metrics;

  return (
    <div className="marker-hud">
      <div className="marker-hud-readout">
        <div className="marker-hud-row">
          <span>Marker</span>
          <span className={marker?.visible ? 'marker-hud-ok' : 'marker-hud-warn'}>
            {marker ? `${marker.name} ${marker.visible ? '● tracking' : '○ lost'}` : 'searching…'}
          </span>
        </div>
        <div className="marker-hud-row">
          <span>FPS</span>
          <span>{status.fps}</span>
        </div>
        <div className="marker-hud-row">
          <span>Detect latency</span>
          <span>
            {marker?.detectionLatencyMs != null ? `${marker.detectionLatencyMs} ms` : '—'}
          </span>
        </div>
        <div className="marker-hud-row">
          <span>Marker updates</span>
          <span>{num(metrics?.updateHz, 1, 'Hz')}</span>
        </div>
        <div className="marker-hud-row">
          <span>Pos jitter (RMS)</span>
          <span>{num(metrics?.positionJitterMm, 2, 'mm')}</span>
        </div>
        <div className="marker-hud-row">
          <span>Pos jitter (peak)</span>
          <span>{num(metrics?.positionPeakMm, 2, 'mm')}</span>
        </div>
        <div className="marker-hud-row">
          <span>Rot jitter (RMS)</span>
          <span>{num(metrics?.rotationJitterDeg, 2, '°')}</span>
        </div>
        <div className="marker-hud-row">
          <span>Re-acquire drift</span>
          <span>{num(status.reacquireDriftMm, 1, 'mm')}</span>
        </div>
        <div className="marker-hud-row">
          <span>Assets</span>
          <span>
            {status.placedCount} placed · {status.configuredCount} marker(s)
          </span>
        </div>
      </div>

      <div className="marker-hud-controls">
        <label className="marker-hud-slider">
          <span>
            Distance from marker
            <strong>{selected ? `${distance.toFixed(2)} m` : '—'}</strong>
          </span>
          <input
            type="range"
            min={MIN_MARKER_DISTANCE}
            max={MAX_MARKER_DISTANCE}
            step={0.01}
            value={distance}
            disabled={!selected}
            onChange={(e) => onDistanceChange(Number(e.target.value))}
            aria-label="Distance from marker in metres"
          />
        </label>

        <div className="marker-hud-buttons">
          <button type="button" onClick={onAddAsset}>
            + Asset
          </button>
          <button type="button" onClick={onRemoveSelected} disabled={!selected}>
            Remove
          </button>
          <button
            type="button"
            onClick={onToggleFollow}
            title={
              follow
                ? 'Pose re-derived from the marker every frame'
                : 'Pose latched once, then held by SLAM'
            }
          >
            {follow ? 'Mode: Follow' : 'Mode: Latch'}
          </button>
        </div>

        {space && space.assets.length > 1 && (
          <div className="marker-hud-assets">
            {space.assets.map((a, i) => (
              <button
                type="button"
                key={a.id}
                className={a.id === selectedAssetId ? 'is-selected' : ''}
                onClick={() => useSpaceStore.getState().selectAsset(a.id)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}

        {SAVE_LABEL[saveState] && (
          <div className={`marker-hud-save marker-hud-save-${saveState}`}>
            {SAVE_LABEL[saveState]}
          </div>
        )}
      </div>
    </div>
  );
};
