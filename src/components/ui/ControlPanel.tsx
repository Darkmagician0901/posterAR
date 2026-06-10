/**
 * ControlPanel — floating toolbar shown while an AR session is active.
 *
 * Buttons: clear all posters, screenshot, upload an image (hidden <input
 * type="file">), open the poster gallery, show instructions, and toggle the
 * debug HUD. Owns the gallery's open/closed state locally; everything else is
 * delegated to posterStore, useUIState, usePosterUpload and useScreenshot.
 *
 * Exports: ControlPanel.
 */

import React, { useState } from 'react';
import { usePosterStore } from '@/store/posterStore';
import { useUIState } from '@/hooks/useUIState';
import { usePosterUpload } from '@/hooks/usePosterUpload';
import { useScreenshot } from '@/hooks/useScreenshot';
import { debugTelemetry } from '@/xr/debugTelemetry';
import { PosterGallery } from './PosterGallery';
import { PhotoPreview } from './PhotoPreview';
import './ControlPanel.css';

interface ControlPanelProps {
  /** The panel renders nothing until the AR (or mock) session is running. */
  isARActive: boolean;
}

/**
 * Floating AR toolbar (clear / photo / upload / gallery / help / debug).
 * Returns null when `isARActive` is false.
 */
export const ControlPanel: React.FC<ControlPanelProps> = ({ isARActive }) => {
  const { clearPosters, posters, addUploadedPoster } = usePosterStore();
  const { addToast, setShowInstructions } = useUIState();
  const { uploadState, handleFileInputChange, fileInputRef, triggerFileInput } = usePosterUpload();
  const {
    photo,
    isCapturing,
    isSharing,
    canShare,
    capturePhoto,
    savePhoto,
    sharePhoto,
    closePreview,
  } = useScreenshot();
  const [showGallery, setShowGallery] = useState(false);

  const handleReset = () => {
    if (posters.length === 0) {
      addToast({
        type: 'info',
        message: 'No posters to clear',
      });
      return;
    }

    if (window.confirm('Are you sure you want to clear all posters?')) {
      clearPosters();
      addToast({
        type: 'success',
        message: 'All posters cleared',
      });
    }
  };

  const handleScreenshot = async () => {
    await capturePhoto();
  };

  const handleUploadClick = () => {
    triggerFileInput();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const result = await handleFileInputChange(event);
    
    if (result?.success && result.processedImage) {
      // Add to uploaded posters store. The `!` is safe: usePosterUpload always
      // sets imageUrl when success && processedImage are both present.
      addUploadedPoster({
        imageUrl: result.imageUrl!,
        name: result.processedImage.originalName,
        width: result.processedImage.width,
        height: result.processedImage.height,
      });
      
      // Show gallery after successful upload
      setShowGallery(true);
    }
  };

  const handleInfo = () => {
    setShowInstructions(true);
  };

  const handleGalleryClick = () => {
    setShowGallery(true);
  };

  if (!isARActive) return null;

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      {/* Control Panel */}
      <div className="control-panel" role="toolbar" aria-label="AR Controls">
        <button
          className="control-button control-button-reset"
          onClick={handleReset}
          aria-label="Clear all posters"
          title="Clear All"
        >
          <span className="control-icon">🗑️</span>
          <span className="control-label">Clear</span>
        </button>

        <button
          className="control-button control-button-screenshot"
          onClick={handleScreenshot}
          disabled={isCapturing}
          aria-label="Take photo"
          title="Photo"
        >
          <span className="control-icon">
            {isCapturing ? '⏳' : '📷'}
          </span>
          <span className="control-label">Photo</span>
        </button>

        <button
          className="control-button control-button-upload"
          onClick={handleUploadClick}
          disabled={uploadState.isUploading}
          aria-label="Upload poster"
          title="Upload"
        >
          <span className="control-icon">
            {uploadState.isUploading ? '⏳' : '📤'}
          </span>
          <span className="control-label">Upload</span>
        </button>

        <button
          className="control-button control-button-gallery"
          onClick={handleGalleryClick}
          aria-label="Show poster gallery"
          title="Gallery"
        >
          <span className="control-icon">🖼️</span>
          <span className="control-label">Gallery</span>
        </button>

        <button
          className="control-button control-button-info"
          onClick={handleInfo}
          aria-label="Show instructions"
          title="Help"
        >
          <span className="control-icon">ℹ️</span>
          <span className="control-label">Help</span>
        </button>

        <button
          className="control-button control-button-debug"
          onClick={() => debugTelemetry.toggleHud()}
          aria-label="Toggle debug HUD"
          title="Debug"
        >
          <span className="control-icon">🛠️</span>
          <span className="control-label">Debug</span>
        </button>
      </div>

      {/* Poster Gallery Modal */}
      {showGallery && <PosterGallery onClose={() => setShowGallery(false)} />}

      {/* Photo Preview Modal */}
      {photo && (
        <PhotoPreview
          photo={photo}
          canShare={canShare}
          isSharing={isSharing}
          onSave={savePhoto}
          onShare={() => void sharePhoto()}
          onClose={closePreview}
        />
      )}
    </>
  );
};
