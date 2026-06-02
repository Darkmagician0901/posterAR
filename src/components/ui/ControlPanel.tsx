/**
 * ControlPanel Component
 * Floating control panel with action buttons
 */

import React, { useState } from 'react';
import { usePosterStore } from '@/store/posterStore';
import { useUIState } from '@/hooks/useUIState';
import { usePosterUpload } from '@/hooks/usePosterUpload';
import { useScreenshot } from '@/hooks/useScreenshot';
import { debugTelemetry } from '@/xr/debugTelemetry';
import { PosterGallery } from './PosterGallery';
import './ControlPanel.css';

interface ControlPanelProps {
  isARActive: boolean;
}

/**
 * Control panel with action buttons
 */
export const ControlPanel: React.FC<ControlPanelProps> = ({ isARActive }) => {
  const { clearPosters, posters, addUploadedPoster } = usePosterStore();
  const { addToast, setShowInstructions } = useUIState();
  const { uploadState, handleFileInputChange, fileInputRef, triggerFileInput } = usePosterUpload();
  const { screenshotState, captureScreenshot } = useScreenshot();
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
    await captureScreenshot({ format: 'png' });
  };

  const handleUploadClick = () => {
    triggerFileInput();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const result = await handleFileInputChange(event);
    
    if (result?.success && result.processedImage) {
      // Add to uploaded posters store
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
        accept="image/png,image/jpeg,image/jpg,image/webp"
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
          disabled={screenshotState.isCapturing}
          aria-label="Take screenshot"
          title="Screenshot"
        >
          <span className="control-icon">
            {screenshotState.isCapturing ? '⏳' : '📷'}
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
    </>
  );
};
