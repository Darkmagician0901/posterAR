/**
 * PosterGallery Component
 * Displays uploaded posters in a grid layout
 */

import React from 'react';
import { usePosterStore } from '@/store/posterStore';
import { useUIState } from '@/hooks/useUIState';
import { DEFAULT_POSTER_IMAGE } from '@/utils/constants';
import './PosterGallery.css';

interface PosterGalleryProps {
  onClose: () => void;
}

/**
 * Poster gallery component
 */
export const PosterGallery: React.FC<PosterGalleryProps> = ({ onClose }) => {
  const {
    uploadedPosters,
    currentPosterImage,
    setCurrentPosterImage,
    removeUploadedPoster,
  } = usePosterStore();
  const { addToast } = useUIState();

  const handleSelectPoster = (imageUrl: string) => {
    setCurrentPosterImage(imageUrl);
    addToast({
      type: 'success',
      message: 'Poster selected',
    });
    onClose();
  };

  const handleDeletePoster = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();

    if (window.confirm('Are you sure you want to delete this poster?')) {
      removeUploadedPoster(id);
      addToast({
        type: 'success',
        message: 'Poster deleted',
      });
    }
  };

  const handleSelectDefault = () => {
    setCurrentPosterImage(DEFAULT_POSTER_IMAGE);
    addToast({
      type: 'success',
      message: 'Default poster selected',
    });
    onClose();
  };

  return (
    <div className="poster-gallery-overlay" onClick={onClose}>
      <div className="poster-gallery" onClick={(e) => e.stopPropagation()}>
        <div className="poster-gallery-header">
          <h2>Select Poster</h2>
          <button
            className="poster-gallery-close"
            onClick={onClose}
            aria-label="Close gallery"
          >
            ×
          </button>
        </div>

        <div className="poster-gallery-content">
          {/* Default poster */}
          <div
            className={`poster-gallery-item ${
              currentPosterImage === DEFAULT_POSTER_IMAGE ? 'selected' : ''
            }`}
            onClick={handleSelectDefault}
          >
            <img
              src={DEFAULT_POSTER_IMAGE}
              alt="Default poster"
              className="poster-gallery-thumbnail"
            />
            <div className="poster-gallery-label">
              <span className="poster-gallery-name">Default</span>
              {currentPosterImage === DEFAULT_POSTER_IMAGE && (
                <span className="poster-gallery-badge">✓</span>
              )}
            </div>
          </div>

          {/* Uploaded posters */}
          {uploadedPosters.map((poster) => (
            <div
              key={poster.id}
              className={`poster-gallery-item ${
                currentPosterImage === poster.imageUrl ? 'selected' : ''
              }`}
              onClick={() => handleSelectPoster(poster.imageUrl)}
            >
              <img
                src={poster.imageUrl}
                alt={poster.name}
                className="poster-gallery-thumbnail"
              />
              <div className="poster-gallery-label">
                <span className="poster-gallery-name" title={poster.name}>
                  {poster.name.length > 15
                    ? `${poster.name.substring(0, 12)}...`
                    : poster.name}
                </span>
                {currentPosterImage === poster.imageUrl && (
                  <span className="poster-gallery-badge">✓</span>
                )}
              </div>
              <button
                className="poster-gallery-delete"
                onClick={(e) => handleDeletePoster(poster.id, e)}
                aria-label="Delete poster"
                title="Delete"
              >
                🗑️
              </button>
            </div>
          ))}

          {/* Empty state */}
          {uploadedPosters.length === 0 && (
            <div className="poster-gallery-empty">
              <p>No uploaded posters yet</p>
              <p className="poster-gallery-empty-hint">
                Upload custom posters to see them here
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
