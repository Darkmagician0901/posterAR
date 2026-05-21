/**
 * Poster Upload Hook
 * Handles file upload, validation, and processing
 */

import { useState, useCallback, useRef } from 'react';
import { validateAndProcessImage, ProcessedImage } from '@/utils/imageUpload';
import { useUIState } from './useUIState';

/**
 * Upload state
 */
export interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
}

/**
 * Upload result
 */
export interface UploadResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
  processedImage?: ProcessedImage;
}

/**
 * Hook return type
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
 * Custom hook for poster upload functionality
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
        // Update progress
        setUploadState((prev) => ({ ...prev, progress: 25 }));

        // Validate and process image
        const processedImage = await validateAndProcessImage(file);

        // Update progress
        setUploadState((prev) => ({ ...prev, progress: 75 }));

        // Simulate final processing delay
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Complete
        setUploadState({
          isUploading: false,
          progress: 100,
          error: null,
        });

        // Show success toast
        addToast({
          type: 'success',
          message: `Image uploaded successfully!`,
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

      // Reset file input
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

// Made with Bob