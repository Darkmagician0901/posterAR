/**
 * Screenshot Utility
 * Captures Three.js canvas as image and handles download
 */

/**
 * Screenshot format options
 */
export type ScreenshotFormat = 'png' | 'jpeg' | 'webp';

/**
 * Screenshot options
 */
export interface ScreenshotOptions {
  format?: ScreenshotFormat;
  quality?: number; // 0-1 for JPEG/WebP
  filename?: string;
}

/**
 * Screenshot result
 */
export interface ScreenshotResult {
  dataUrl: string;
  blob: Blob;
  filename: string;
  width: number;
  height: number;
}

/**
 * Get MIME type from format
 */
const getMimeType = (format: ScreenshotFormat): string => {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'png':
    default:
      return 'image/png';
  }
};

/**
 * Generate filename with timestamp
 */
export const generateFilename = (format: ScreenshotFormat = 'png'): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `xr-poster-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.${format}`;
};

/**
 * Find Three.js canvas element
 */
const findThreeCanvas = (): HTMLCanvasElement | null => {
  // Try to find canvas by common selectors
  const canvases = document.querySelectorAll('canvas');
  
  // If only one canvas, assume it's the Three.js canvas
  if (canvases.length === 1) {
    return canvases[0];
  }
  
  // Try to find canvas with WebGL context
  for (const canvas of Array.from(canvases)) {
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (gl) {
      return canvas;
    }
  }
  
  return null;
};

/**
 * Capture canvas as data URL
 */
const captureCanvasAsDataUrl = (
  canvas: HTMLCanvasElement,
  format: ScreenshotFormat = 'png',
  quality: number = 0.92
): string => {
  const mimeType = getMimeType(format);
  
  try {
    return canvas.toDataURL(mimeType, quality);
  } catch (error) {
    throw new Error(`Failed to capture canvas: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Convert data URL to Blob
 */
const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  return await response.blob();
};

/**
 * Capture screenshot from Three.js canvas
 */
export const captureScreenshot = async (
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> => {
  const {
    format = 'png',
    quality = 0.92,
    filename = generateFilename(format),
  } = options;

  // Find canvas
  const canvas = findThreeCanvas();
  if (!canvas) {
    throw new Error('Three.js canvas not found');
  }

  // Capture as data URL
  const dataUrl = captureCanvasAsDataUrl(canvas, format, quality);

  // Convert to blob
  const blob = await dataUrlToBlob(dataUrl);

  return {
    dataUrl,
    blob,
    filename,
    width: canvas.width,
    height: canvas.height,
  };
};

/**
 * Download screenshot to device
 */
export const downloadScreenshot = (
  dataUrl: string,
  filename: string
): void => {
  try {
    // Create temporary anchor element
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    
    // Append to body (required for Firefox)
    document.body.appendChild(link);
    
    // Trigger download
    link.click();
    
    // Clean up
    document.body.removeChild(link);
  } catch (error) {
    throw new Error(`Failed to download screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Capture and download screenshot
 */
export const captureAndDownload = async (
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> => {
  const result = await captureScreenshot(options);
  downloadScreenshot(result.dataUrl, result.filename);
  return result;
};

/**
 * Share screenshot using Web Share API (if supported)
 */
export const shareScreenshot = async (
  result: ScreenshotResult,
  title: string = 'XR Poster Screenshot'
): Promise<boolean> => {
  // Check if Web Share API is supported
  if (!navigator.share || !navigator.canShare) {
    return false;
  }

  try {
    const file = new File([result.blob], result.filename, {
      type: result.blob.type,
    });

    const shareData = {
      title,
      text: 'Check out my AR poster!',
      files: [file],
    };

    // Check if can share files
    if (navigator.canShare(shareData)) {
      await navigator.share(shareData);
      return true;
    }

    return false;
  } catch (error) {
    // User cancelled or error occurred
    console.error('Share failed:', error);
    return false;
  }
};

/**
 * Check if Web Share API is available
 */
export const isShareSupported = (): boolean => {
  return typeof navigator.share !== 'undefined' && typeof navigator.canShare !== 'undefined';
};

/**
 * Validate canvas for screenshot
 */
export const validateCanvas = (): { valid: boolean; error?: string } => {
  const canvas = findThreeCanvas();
  
  if (!canvas) {
    return { valid: false, error: 'Canvas not found' };
  }

  if (canvas.width === 0 || canvas.height === 0) {
    return { valid: false, error: 'Canvas has invalid dimensions' };
  }

  return { valid: true };
};

// Made with Bob