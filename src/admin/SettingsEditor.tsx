/**
 * SettingsEditor — scene knobs. Phase 1: only the diorama tile width.
 */

import React from 'react';
import { useAdminDraftStore } from './adminDraftStore';
import { TILE_WIDTH_MIN_M, TILE_WIDTH_MAX_M } from '@/content/contentDoc';

export const SettingsEditor: React.FC = () => {
  const { draft, setTileWidthM } = useAdminDraftStore();
  const width = draft.settings.tileWidthM;

  return (
    <section className="admin-card">
      <h2>Scene settings</h2>
      <div className="admin-field">
        <label htmlFor="tile-width">
          Diorama tile width — {width.toFixed(2)} m
        </label>
        <input
          id="tile-width"
          type="range"
          min={TILE_WIDTH_MIN_M}
          max={TILE_WIDTH_MAX_M}
          step={0.05}
          value={width}
          onChange={(e) => setTileWidthM(Number(e.target.value))}
        />
        <span className="admin-field-hint">
          Applies when the story is (re)placed. Bounds {TILE_WIDTH_MIN_M}–{TILE_WIDTH_MAX_M} m.
        </span>
      </div>
    </section>
  );
};
