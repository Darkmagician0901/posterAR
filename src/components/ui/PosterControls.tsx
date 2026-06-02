/**
 * PosterControls Component
 * Controls for selected poster (delete, scale, etc.)
 */

import React, { useState } from 'react';
import { usePosterStore } from '@/store/posterStore';
import { useUIState } from '@/hooks/useUIState';
import { MIN_POSTER_SCALE, MAX_POSTER_SCALE } from '@/utils/constants';
import './PosterControls.css';

/**
 * Controls for the selected poster
 */
export const PosterControls: React.FC = () => {
  const { selectedPosterId, getPosterById, updatePoster, removePoster } = usePosterStore();
  const { addToast } = useUIState();
  const [isExpanded, setIsExpanded] = useState(true);

  const poster = selectedPosterId ? getPosterById(selectedPosterId) : null;

  if (!poster) return null;

  const currentScale = poster.scale[0];
  const aspectRatio = poster.scale[1] / poster.scale[0];

  const handleScaleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newScale = parseFloat(event.target.value);
    const newScaleArray: [number, number, number] = [
      newScale,
      newScale * aspectRatio,
      poster.scale[2],
    ];
    updatePoster(poster.id, { scale: newScaleArray });
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
