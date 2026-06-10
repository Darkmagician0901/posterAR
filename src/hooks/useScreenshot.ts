/**
 * Screenshot Hook
 *
 * React hook wrapping the screenshot utilities (@/utils/screenshot) with UI
 * state: a capture-in-progress flag, the last captured result, and success /
 * error toasts via useUIState.
 *
 * Main export: useScreenshot — returns { screenshotState, captureScreenshot,
 * shareLastScreenshot, canShare, resetScreenshot }.
 *
 * Error handling: every helper that can throw (captureAndDownload,
 * shareScreenshot — both async, so even synchronous throws inside them become
 * promise rejections) is awaited inside a try/catch that surfaces the message
 * through an error toast. validateCanvas/isShareSupported report failures via
 * return values rather than throwing.
 *
 * Note: on the live 8th Wall path the captured frame can be blank because the
 * engine's canvas has no preserveDrawingBuffer — see @/utils/screenshot.
 */

import { useState, useCallback } from 'react';
import {
  captureAndDownload,
  shareScreenshot,
  isShareSupported,
  validateCanvas,
  ScreenshotOptions,
  ScreenshotResult,
} from '@/utils/screenshot';
import { useUIState } from './useUIState';

/**
 * Snapshot of the hook's capture status: whether a capture is in flight, the
 * last error message (null when none), and the most recent successful result.
 */
export interface ScreenshotState {
  isCapturing: boolean;
  error: string | null;
  lastScreenshot: ScreenshotResult | null;
}

/**
 * Value returned by useScreenshot. The two action callbacks resolve to true on
 * success and false on any failure (errors are reported via toasts, not thrown).
 */
export interface UseScreenshotReturn {
  screenshotState: ScreenshotState;
  captureScreenshot: (options?: ScreenshotOptions) => Promise<boolean>;
  shareLastScreenshot: () => Promise<boolean>;
  canShare: boolean;
  resetScreenshot: () => void;
}

/**
 * Hook providing capture-and-download plus Web Share of the AR canvas,
 * with toast feedback and capture state for the UI.
 */
export const useScreenshot = (): UseScreenshotReturn => {
  const { addToast } = useUIState();
  
  const [screenshotState, setScreenshotState] = useState<ScreenshotState>({
    isCapturing: false,
    error: null,
    lastScreenshot: null,
  });

  const canShare = isShareSupported();

  /**
   * Reset screenshot state
   */
  const resetScreenshot = useCallback(() => {
    setScreenshotState({
      isCapturing: false,
      error: null,
      lastScreenshot: null,
    });
  }, []);

  /**
   * Capture screenshot and download
   */
  const captureScreenshot = useCallback(
    async (options: ScreenshotOptions = {}): Promise<boolean> => {
      // Validate canvas first. validateCanvas never throws — it reports
      // problems via { valid, error } — so it is safe outside the try below.
      const validation = validateCanvas();
      if (!validation.valid) {
        const errorMessage = validation.error || 'Cannot capture screenshot';
        
        setScreenshotState({
          isCapturing: false,
          error: errorMessage,
          lastScreenshot: null,
        });

        addToast({
          type: 'error',
          message: errorMessage,
        });

        return false;
      }

      // Start capturing
      setScreenshotState({
        isCapturing: true,
        error: null,
        lastScreenshot: null,
      });

      try {
        // Capture and download
        const result = await captureAndDownload(options);

        // Update state
        setScreenshotState({
          isCapturing: false,
          error: null,
          lastScreenshot: result,
        });

        // Show success toast
        addToast({
          type: 'success',
          message: 'Screenshot saved successfully!',
        });

        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to capture screenshot';

        setScreenshotState({
          isCapturing: false,
          error: errorMessage,
          lastScreenshot: null,
        });

        // Show error toast
        addToast({
          type: 'error',
          message: errorMessage,
        });

        return false;
      }
    },
    [addToast]
  );

  /**
   * Share last screenshot using Web Share API
   */
  const shareLastScreenshot = useCallback(async (): Promise<boolean> => {
    if (!screenshotState.lastScreenshot) {
      addToast({
        type: 'error',
        message: 'No screenshot to share',
      });
      return false;
    }

    if (!canShare) {
      addToast({
        type: 'error',
        message: 'Sharing is not supported on this device',
      });
      return false;
    }

    try {
      // shareScreenshot resolves false (it does not throw) when the user
      // dismisses the native share sheet — so a cancel shows no error toast.
      const shared = await shareScreenshot(screenshotState.lastScreenshot);

      if (shared) {
        addToast({
          type: 'success',
          message: 'Screenshot shared successfully!',
        });
      }

      return shared;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to share screenshot';
      
      addToast({
        type: 'error',
        message: errorMessage,
      });

      return false;
    }
  }, [screenshotState.lastScreenshot, canShare, addToast]);

  return {
    screenshotState,
    captureScreenshot,
    shareLastScreenshot,
    canShare,
    resetScreenshot,
  };
};
