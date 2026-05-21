/**
 * Screenshot Hook
 * Handles screenshot capture and download functionality
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
 * Screenshot state
 */
export interface ScreenshotState {
  isCapturing: boolean;
  error: string | null;
  lastScreenshot: ScreenshotResult | null;
}

/**
 * Hook return type
 */
export interface UseScreenshotReturn {
  screenshotState: ScreenshotState;
  captureScreenshot: (options?: ScreenshotOptions) => Promise<boolean>;
  shareLastScreenshot: () => Promise<boolean>;
  canShare: boolean;
  resetScreenshot: () => void;
}

/**
 * Custom hook for screenshot functionality
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
      // Validate canvas first
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

// Made with Bob