/**
 * Screenshot Hook
 *
 * React hook driving the photo flow: capture → preview overlay → save/share.
 *
 * Capture branches by environment:
 *  - live 8th Wall → takeXr8Photo() (engine-composited camera + scene frame);
 *  - desktop mock  → caller passes its own `capture` (video + GL composite);
 *  - last resort   → raw captureScreenshot() toDataURL fallback (may miss the
 *    camera feed on live AR — see @/utils/screenshot header).
 *
 * A successful capture sets `photo`, which the consumer renders as a
 * <PhotoPreview>. Save downloads the blob; Share uses the Web Share API and
 * stays silent when the user cancels the native sheet. Errors surface as
 * toasts via useUIState; the action callbacks resolve true/false and never
 * throw.
 *
 * Main export: useScreenshot — returns { photo, isCapturing, isSharing,
 * canShare, capturePhoto, savePhoto, sharePhoto, closePreview }.
 */

import { useState, useCallback } from 'react';
import {
  captureScreenshot,
  downloadScreenshot,
  shareScreenshot,
  isShareSupported,
  ScreenshotResult,
} from '@/utils/screenshot';
import { isXr8ScreenshotAvailable, takeXr8Photo } from '@/xr8/canvasScreenshot';
import { useUIState } from './useUIState';

export interface UseScreenshotOptions {
  /**
   * Override the capture implementation (the desktop mock passes its
   * video+GL compositor). Default: XR8 engine capture, falling back to the
   * legacy raw-canvas read when the engine module is unavailable.
   */
  capture?: () => Promise<ScreenshotResult>;
}

/**
 * Value returned by useScreenshot. A non-null `photo` means the preview
 * overlay should be open. Action callbacks resolve true on success and false
 * on any failure (errors are reported via toasts, not thrown).
 */
export interface UseScreenshotReturn {
  photo: ScreenshotResult | null;
  isCapturing: boolean;
  isSharing: boolean;
  canShare: boolean;
  capturePhoto: () => Promise<boolean>;
  savePhoto: () => void;
  sharePhoto: () => Promise<boolean>;
  closePreview: () => void;
}

/** Default capture for the live path; see the file header for the branches. */
const defaultCapture = (): Promise<ScreenshotResult> =>
  isXr8ScreenshotAvailable()
    ? takeXr8Photo()
    : captureScreenshot({ format: 'jpeg' });

/**
 * Hook providing capture-to-preview plus save/download and Web Share of the
 * AR scene, with toast feedback and in-flight flags for the UI.
 */
export const useScreenshot = (
  options: UseScreenshotOptions = {}
): UseScreenshotReturn => {
  const { capture = defaultCapture } = options;
  const { addToast } = useUIState();

  const [photo, setPhoto] = useState<ScreenshotResult | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const canShare = isShareSupported();

  const capturePhoto = useCallback(async (): Promise<boolean> => {
    setIsCapturing(true);
    try {
      const result = await capture();
      // Opening the preview is the success feedback — no toast needed.
      setPhoto(result);
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to capture photo';
      addToast({ type: 'error', message });
      return false;
    } finally {
      setIsCapturing(false);
    }
  }, [capture, addToast]);

  const savePhoto = useCallback((): void => {
    if (!photo) return;
    try {
      downloadScreenshot(photo);
      addToast({ type: 'success', message: 'Photo saved' });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save photo';
      addToast({ type: 'error', message });
    }
  }, [photo, addToast]);

  const sharePhoto = useCallback(async (): Promise<boolean> => {
    if (!photo) return false;
    setIsSharing(true);
    try {
      // shareScreenshot never throws — it reports via ShareOutcome.
      const outcome = await shareScreenshot(photo);
      switch (outcome) {
        case 'shared':
          addToast({ type: 'success', message: 'Photo shared' });
          return true;
        case 'canceled':
          // User dismissed the native sheet — not an error, no toast.
          return false;
        case 'unsupported':
          addToast({
            type: 'error',
            message: 'Sharing is not supported on this device',
          });
          return false;
        case 'failed':
        default:
          addToast({ type: 'error', message: 'Failed to share photo' });
          return false;
      }
    } finally {
      setIsSharing(false);
    }
  }, [photo, addToast]);

  const closePreview = useCallback((): void => {
    setPhoto(null);
  }, []);

  return {
    photo,
    isCapturing,
    isSharing,
    canShare,
    capturePhoto,
    savePhoto,
    sharePhoto,
    closePreview,
  };
};
