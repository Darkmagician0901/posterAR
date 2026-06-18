/**
 * PosterControls — collapsible panel for the currently selected poster.
 *
 * Renders only while posterStore has a selectedPosterId. Offers a scale
 * slider (bounded by MIN/MAX_POSTER_SCALE), an in-plane rotation slider
 * (bounded by MIN/MAX_POSTER_ROTATION_DEG), and a delete button. There are no
 * move/pinch/twist gestures in this app — the sliders are the live
 * adjustments.
 *
 * Exports: PosterControls.
 */

import React, { useState } from 'react';
import { usePosterStore } from '@/store/posterStore';
import { useUIState } from '@/hooks/useUIState';
import {
  MIN_POSTER_SCALE,
  MAX_POSTER_SCALE,
  MIN_POSTER_ROTATION_DEG,
  MAX_POSTER_ROTATION_DEG,
} from '@/utils/constants';
import './PosterControls.css';

/**
 * Scale, rotation, and delete controls for the selected poster. Returns null
 * when no poster is selected.
 */
export const PosterControls: React.FC = () => {
  const { selectedPosterId, getPosterById, updatePoster, removePoster } = usePosterStore();
  const { addToast } = useUIState();
  const [isExpanded, setIsExpanded] = useState(true);

  const poster = selectedPosterId ? getPosterById(selectedPosterId) : null;

  if (!poster) return null;

  // The slider drives the width (scale[0]); height follows via the poster's
  // existing height/width ratio so the image never stretches. Depth is fixed.
  const currentScale = poster.scale[0];
  const aspectRatio = poster.scale[1] / poster.scale[0];

  /**
   * Applies a new scale from the slider to the selected poster.
   *
   * @param event — Slider change event; its value is the new width scale.
   */
  const handleScaleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newScale = parseFloat(event.target.value);
    const newScaleArray: [number, number, number] = [
      newScale,
      newScale * aspectRatio,
      poster.scale[2],
    ];
    updatePoster(poster.id, { scale: newScaleArray });
  };

  // The rotation slider spins the poster within its surface plane (about the
  // surface normal). Stored as radians in rotation[2]; shown/edited in degrees
  // at the UI boundary. 0° means "as placed".
  const currentRotationDeg = Math.round((poster.rotation[2] * 180) / Math.PI);

  /**
   * Applies a new in-plane rotation from the slider to the selected poster.
   *
   * @param event — Slider change event; its value is the new angle in degrees.
   */
  const handleRotationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const deg = parseFloat(event.target.value);
    const radians = (deg * Math.PI) / 180;
    const newRotation: [number, number, number] = [
      poster.rotation[0],
      poster.rotation[1],
      radians,
    ];
    updatePoster(poster.id, { rotation: newRotation });
  };

  const handleDelete = () => {
    if (window.confirm('Delete this poster?')) {
      removePoster(poster.id);
      addToast({
        type: 'success',
        message: 'Poster deleted',
      });
    }
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={`poster-controls ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {/* Header */}
      <div className="poster-controls-header">
        <span className="poster-controls-title">Poster Controls</span>
        <button
          className="poster-controls-toggle"
          onClick={toggleExpanded}
          aria-label={isExpanded ? 'Collapse controls' : 'Expand controls'}
        >
          {isExpanded ? '▼' : '▲'}
        </button>
      </div>

      {/* Controls content */}
      {isExpanded && (
        <div className="poster-controls-content">
          {/* Scale slider */}
          <div className="poster-control-group">
            <label htmlFor="poster-scale" className="poster-control-label">
              Scale: {currentScale.toFixed(2)}x
            </label>
            <input
              id="poster-scale"
              type="range"
              min={MIN_POSTER_SCALE}
              max={MAX_POSTER_SCALE}
              step="0.1"
              value={currentScale}
              onChange={handleScaleChange}
              className="poster-scale-slider"
              aria-label="Adjust poster scale"
            />
            <div className="poster-scale-labels">
              <span>{MIN_POSTER_SCALE}x</span>
              <span>{MAX_POSTER_SCALE}x</span>
            </div>
          </div>

          {/* Rotation slider (in-plane spin about the surface normal) */}
          <div className="poster-control-group">
            <label htmlFor="poster-rotation" className="poster-control-label">
              Rotation: {currentRotationDeg}°
            </label>
            <input
              id="poster-rotation"
              type="range"
              min={MIN_POSTER_ROTATION_DEG}
              max={MAX_POSTER_ROTATION_DEG}
              step="1"
              value={currentRotationDeg}
              onChange={handleRotationChange}
              className="poster-scale-slider"
              aria-label="Adjust poster rotation"
            />
            <div className="poster-scale-labels">
              <span>{MIN_POSTER_ROTATION_DEG}°</span>
              <span>{MAX_POSTER_ROTATION_DEG}°</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="poster-control-actions">
            <button
              className="poster-control-button poster-control-button-delete"
              onClick={handleDelete}
              aria-label="Delete poster"
              title="Delete"
            >
              <span className="button-icon">🗑️</span>
              <span className="button-label">Delete</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
