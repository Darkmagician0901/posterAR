/**
 * Poster Upload Hook
 *
 * React hook that drives the poster image upload flow: takes a File (from a
 * hidden <input type="file"> or drag-and-drop), validates and compresses it
 * via @/utils/imageUpload, tracks progress/error state for the UI, and shows
 * success/error toasts via useUIState.
 *
 * Main export: usePosterUpload — returns { uploadState, handleFileSelect,
 * handleFileInputChange, resetUpload, fileInputRef, triggerFileInput }.
 *
 * Note: everything runs client-side; "upload" here means decode + compress to
 * a data URL, not a network transfer.
 */

import { useState, useCallback, useRef } from 'react';
import { validateAndProcessImage, ProcessedImage, formatBytes } from '@/utils/imageUpload';
import { useUIState } from './useUIState';

/**
 * Snapshot of the upload flow: in-flight flag, coarse progress (0–100), and
 * the last error message (null when none).
 */
export interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
}

/**
 * Outcome of a single upload attempt. On success, imageUrl is a data URL ready
 * for texturing and processedImage carries the compression details.
 */
export interface UploadResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
  processedImage?: ProcessedImage;
}

/**
 * Value returned by usePosterUpload. Attach fileInputRef to a hidden file
 * input and wire handleFileInputChange to its onChange; triggerFileInput
 * opens the OS file picker programmatically.
 */
export interface UsePosterUploadReturn {
  uploadState: UploadState;
  handleFileSelect: (file: File) => Promise<UploadResult>;
  handleFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<UploadResult | null>;
  resetUpload: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  triggerFileInput: () => void;
}

/**
 * Hook handling poster file selection, validation, client-side compression,
 * and toast feedback. Errors are reported via toasts and the returned
 * UploadResult — the callbacks never throw.
 */
export const usePosterUpload = (): UsePosterUploadReturn => {
  const { addToast } = useUIState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
  });

  /**
   * Reset upload state
   */
  const resetUpload = useCallback(() => {
    setUploadState({
      isUploading: false,
      progress: 0,
      error: null,
    });
  }, []);

  /**
   * Handle file selection and processing
   */
  const handleFileSelect = useCallback(
    async (file: File): Promise<UploadResult> => {
      // Reset state
      setUploadState({
        isUploading: true,
        progress: 0,
        error: null,
      });

      try {
        // Progress values (25/75/100) are synthetic milestones, not real byte
        // progress — compression happens in one awaited call, so we just give
        // the user visible movement before and after it.
        setUploadState((prev) => ({ ...prev, progress: 25 }));

        // Validate and process image (throws with a user-facing message on
        // unsupported format, oversize file, or decode failure).
        const processedImage = await validateAndProcessImage(file);

        setUploadState((prev) => ({ ...prev, progress: 75 }));

        // Complete
        setUploadState({
          isUploading: false,
          progress: 100,
          error: null,
        });

        // Show success toast with compression info
        addToast({
          type: 'success',
          message:
            `Uploaded · ${formatBytes(processedImage.originalBytes)} → ` +
            `${formatBytes(processedImage.compressedBytes)} (` +
            `${processedImage.ratio.toFixed(1)}× smaller, ` +
            `q=${processedImage.quality.toFixed(2)})`,
        });

        return {
          success: true,
          imageUrl: processedImage.dataUrl,
          processedImage,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to upload image';

        setUploadState({
          isUploading: false,
          progress: 0,
          error: errorMessage,
        });

        // Show error toast
        addToast({
          type: 'error',
          message: errorMessage,
        });

        return {
          success: false,
          error: errorMessage,
        };
      }
    },
    [addToast]
  );

  /**
   * Handle file input change event
   */
  const handleFileInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>): Promise<UploadResult | null> => {
      const file = event.target.files?.[0];

      if (!file) {
        return null;
      }

      const result = await handleFileSelect(file);

      // Clear the input's value so picking the SAME file again still fires a
      // change event (browsers skip the event when the value is unchanged).
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      return result;
    },
    [handleFileSelect]
  );

  /**
   * Trigger file input click
   */
  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    uploadState,
    handleFileSelect,
    handleFileInputChange,
    resetUpload,
    fileInputRef,
    triggerFileInput,
  };
};
