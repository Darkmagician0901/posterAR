/**
 * PosterGallery Component
 *
 * PARKED — the only thing that imports this is ControlPanel, which is itself
 * parked, so nothing reaches it from the running app. That is intentional, not an
 * oversight: the app ships a story-only user panel (StoryARExperience), which has
 * no gallery. What becomes of this component is UNDECIDED —
 * docs/admin-panel-plan.md specifies new /admin/* routes and does not name it, so
 * whether the admin panel imports it, ports from it, or replaces it is an open
 * question. Do NOT delete it as dead code — zero importers here means "not wired
 * up yet", not "unused".
 *
 * Modal grid of selectable posters: the built-in default poster plus every
 * user-uploaded poster from posterStore. Selecting an item makes it the
 * "current" poster used for the next placement; uploaded items can also be
 * deleted from here.
 */

import React from 'react';
import { usePosterStore } from '@/store/posterStore';
import { useUIState } from '@/hooks/useUIState';
import { DEFAULT_POSTER_IMAGE } from '@/utils/constants';
import './PosterGallery.css';

interface PosterGalleryProps {
  /** Closes the gallery; called on backdrop click, ×, or after a selection. */
  onClose: () => void;
}

/**
 * Modal poster picker (see file header). Clicking the dimmed backdrop closes
 * it; clicking a thumbnail selects that poster and closes it.
 */
export const PosterGallery: React.FC<PosterGalleryProps> = ({ onClose }) => {
  const { uploadedPosters, currentPosterImage, setCurrentPosterImage, removeUploadedPoster } =
    usePosterStore();
  const { addToast } = useUIState();

  /**
   * Makes an uploaded poster the current placement image and closes the
   * gallery.
   *
   * @param imageUrl — Data URL of the poster to select.
   */
  const handleSelectPoster = (imageUrl: string) => {
    setCurrentPosterImage(imageUrl);
    addToast({
      type: 'success',
      message: 'Poster selected',
    });
    onClose();
  };

  /**
   * Deletes an uploaded poster after a confirmation prompt.
   *
   * @param id — Store id of the uploaded poster to delete.
   * @param event — Click event; propagation is stopped so the click does not
   *   also bubble to the surrounding thumbnail and select the poster.
   */
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

  /** Selects the built-in default poster and closes the gallery. */
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
          <button className="poster-gallery-close" onClick={onClose} aria-label="Close gallery">
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
              <img src={poster.imageUrl} alt={poster.name} className="poster-gallery-thumbnail" />
              <div className="poster-gallery-label">
                <span className="poster-gallery-name" title={poster.name}>
                  {poster.name.length > 15 ? `${poster.name.substring(0, 12)}...` : poster.name}
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
              <p className="poster-gallery-empty-hint">Upload custom posters to see them here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
