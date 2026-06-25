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
 * a data URL, not a network transfer. (A data URL is a string of the form
 * `data:image/webp;base64,...` that embeds the whole file as base64 text, so
 * the image can be stored and rendered with no server round-trip.)
 */

import { useState, useCallback, useRef } from 'react';
import { validateAndProcessImage, ProcessedImage, formatBytes } from '@/utils/imageUpload';
import { persistAsset, isPersistenceEnabled } from '@/services/posterApi';
import { useUIState } from './useUIState';

/**
 * Snapshot of the upload flow: in-flight flag, coarse progress (0–100), and
 * the last error message (null when none).
 */
export interface UploadState {
  /** True while validation + compression are running. */
  isUploading: boolean;
  /** Coarse progress percentage, 0–100 (synthetic milestones, not real bytes). */
  progress: number;
  /** User-facing message from the last failed attempt, or null when none. */
  error: string | null;
}

/**
 * Outcome of a single upload attempt. On success, imageUrl is a data URL ready
 * for texturing and processedImage carries the compression details.
 */
export interface UploadResult {
  /** True when validation + processing succeeded. */
  success: boolean;
  /** Data URL of the processed image; present only on success. */
  imageUrl?: string;
  /** User-facing failure message; present only on failure. */
  error?: string;
  /** Dimensions and compression statistics; present only on success. */
  processedImage?: ProcessedImage;
}

/**
 * Value returned by usePosterUpload. Attach fileInputRef to a hidden file
 * input and wire handleFileInputChange to its onChange; triggerFileInput
 * opens the OS file picker programmatically.
 */
export interface UsePosterUploadReturn {
  /** Current snapshot of the in-flight/finished upload. */
  uploadState: UploadState;
  /** Validates and processes a File directly (e.g. from drag-and-drop). */
  handleFileSelect: (file: File) => Promise<UploadResult>;
  /** onChange handler for the hidden file input; null when no file was picked. */
  handleFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<UploadResult | null>;
  /** Clears progress and error back to the idle state. */
  resetUpload: () => void;
  /** Ref to attach to the hidden <input type="file"> element. */
  fileInputRef: React.RefObject<HTMLInputElement>;
  /** Opens the OS file picker by clicking the hidden input. */
  triggerFileInput: () => void;
}

/**
 * Decodes a `data:<mime>;base64,<data>` URL into a Blob WITHOUT fetch
 * (happy-dom's fetch does not reliably support data: URLs in tests).
 *
 * @param dataUrl — A base64 data URL (e.g. from ProcessedImage.dataUrl).
 * @returns A Blob carrying the decoded bytes with the URL's MIME type.
 */
const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, b64] = dataUrl.split(',', 2);
  const mime = header.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

/**
 * Best-effort persistence of a processed image to the backend. Converts the
 * processed data URL back to a Blob and uploads it. Returns the remote URL on
 * success, or null when persistence is disabled or fails (never throws — the
 * in-session data URL keeps working either way).
 *
 * @param processed — Output of validateAndProcessImage.
 * @returns Remote asset URL, or null.
 */
export const persistProcessedImage = async (
  processed: ProcessedImage,
): Promise<string | null> => {
  if (!isPersistenceEnabled()) return null;
  try {
    const blob = dataUrlToBlob(processed.dataUrl);
    const asset = await persistAsset({
      id: crypto.randomUUID(),
      blob,
      contentType: processed.mimeType,
      isAnimated: processed.mimeType === 'image/gif',
      width: processed.width,
      height: processed.height,
      originalName: processed.originalName,
    });
    return asset.url;
  } catch (err) {
    console.warn('Asset persistence failed (continuing with local copy):', err);
    return null;
  }
};

/**
 * Hook handling poster file selection, validation, client-side compression,
 * and toast feedback. Errors are reported via toasts and the returned
 * UploadResult — the callbacks never throw.
 *
 * @returns A {@link UsePosterUploadReturn} — `uploadState` (progress/error
 *   snapshot), `handleFileSelect` / `handleFileInputChange` upload entry
 *   points, `resetUpload`, plus `fileInputRef` / `triggerFileInput` for
 *   wiring the hidden file input.
 */
export const usePosterUpload = (): UsePosterUploadReturn => {
  const { addToast } = useUIState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
  });

  /** Resets `uploadState` to idle (not uploading, 0 %, no error). */
  const resetUpload = useCallback(() => {
    setUploadState({
      isUploading: false,
      progress: 0,
      error: null,
    });
  }, []);

  /**
   * Validates and compresses a selected file, updating progress state and
   * showing a success or error toast.
   *
   * @param file — The image File chosen by the user (any source: input,
   *   drag-and-drop, paste).
   * @returns A promise resolving to an {@link UploadResult}; never rejects —
   *   validation/processing errors are converted into `{ success: false }`.
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

        // Best-effort: persist to backend so the asset survives refresh. The
        // return value (remote URL) is currently informational; the gallery is
        // re-hydrated from the server on next startup.
        await persistProcessedImage(processedImage);

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
   * Adapter for the hidden file input's onChange event: extracts the first
   * selected file, runs the upload flow, then clears the input.
   *
   * @param event — The change event fired by the <input type="file">.
   * @returns A promise resolving to the {@link UploadResult}, or null when
   *   the user closed the picker without choosing a file.
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

  /** Programmatically clicks the hidden file input to open the OS picker. */
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
