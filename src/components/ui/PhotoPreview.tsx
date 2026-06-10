/**
 * PhotoPreview — full-screen overlay shown after a photo capture.
 *
 * Displays the captured AR photo with Save (download) and Share (Web Share
 * API) actions. Purely presentational: capture/save/share live in
 * useScreenshot; this component only renders the result and forwards clicks.
 * The overlay sits above the AR canvas, so taps here can never fall through
 * and place a poster.
 *
 * Exports: PhotoPreview.
 */

import React from 'react';
import { ScreenshotResult } from '@/utils/screenshot';
import './PhotoPreview.css';

interface PhotoPreviewProps {
  photo: ScreenshotResult;
  /** Hide the Share button on platforms without Web Share file support. */
  canShare: boolean;
  isSharing?: boolean;
  onSave: () => void;
  onShare: () => void;
  onClose: () => void;
}

/**
 * Photo preview modal with Save / Share / Close. Clicking the dimmed
 * backdrop closes it (same pattern as PosterGallery).
 */
export const PhotoPreview: React.FC<PhotoPreviewProps> = ({
  photo,
  canShare,
  isSharing = false,
  onSave,
  onShare,
  onClose,
}) => {
  return (
    <div className="photo-preview-overlay" onClick={onClose}>
      <div
        className="photo-preview"
        role="dialog"
        aria-modal="true"
        aria-label="Photo preview"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="photo-preview-header">
          <h2>Photo</h2>
          <button
            className="photo-preview-close"
            onClick={onClose}
            aria-label="Close photo preview"
          >
            ×
          </button>
        </div>

        <img
          className="photo-preview-image"
          src={photo.dataUrl}
          alt="Captured AR scene"
        />

        <div className="photo-preview-actions">
          <button
            className="photo-preview-button photo-preview-save"
            onClick={onSave}
            aria-label="Save photo"
          >
            💾 Save
          </button>
          {canShare && (
            <button
              className="photo-preview-button photo-preview-share"
              onClick={onShare}
              disabled={isSharing}
              aria-label="Share photo"
            >
              {isSharing ? '⏳ Sharing…' : '📤 Share'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
