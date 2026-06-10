/**
 * Screenshot Utility
 *
 * Captures the live WebGL canvas as an image (data URL → Blob), then downloads
 * and/or shares it. Used by useScreenshot.
 *
 * ⚠️ 8th Wall caveat: on the live mobile path the canvas (id="camerafeed") is
 * owned by the XR8 engine, whose WebGLRenderer is created without
 * `preserveDrawingBuffer: true`. Reading it with `toDataURL()` outside the
 * render loop can yield an empty/black frame because the drawing buffer is
 * cleared after compositing. Capturing the camera+scene reliably requires
 * grabbing the pixels inside an engine `onRender`/`onUpdate` callback (or
 * enabling preserveDrawingBuffer). The desktop mock path uses its own renderer
 * and is unaffected.
 *
 * Main exports: captureScreenshot, captureAndDownload, downloadScreenshot,
 * shareScreenshot, isShareSupported, validateCanvas, generateFilename.
 * No external dependencies — DOM + Web Share API only.
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
 * Build a timestamped filename like `xr-poster-2026-06-09-14-30-05.png`
 * so successive screenshots never collide.
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
  
  // Try to find canvas with WebGL context. getContext() returns the
  // ALREADY-CREATED context for a canvas (or null if the canvas was
  // initialized with a different type), so this probe is non-destructive.
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
 * Convert data URL to Blob.
 * fetch() accepts data: URLs, which lets the browser do the base64 decoding
 * for us instead of hand-rolling atob + Uint8Array conversion.
 */
const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  return await response.blob();
};

/**
 * Capture the WebGL canvas as { dataUrl, blob, filename, width, height }.
 * Throws if no canvas is found or the canvas cannot be read (see the
 * preserveDrawingBuffer caveat in the file header).
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
 * Trigger a browser download of the data URL via a temporary <a download>
 * element. Throws an Error with context if the DOM manipulation fails.
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
 * Convenience wrapper: capture the canvas, then immediately download the
 * result. Returns the capture so callers can also share it later.
 */
export const captureAndDownload = async (
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> => {
  const result = await captureScreenshot(options);
  downloadScreenshot(result.dataUrl, result.filename);
  return result;
};

/**
 * Share a captured screenshot via the Web Share API. Resolves true only when
 * the share sheet was opened and completed; resolves false (never throws) when
 * the API is missing, files can't be shared, or the user cancels.
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

    // canShare() guards against platforms that expose navigator.share but
    // reject file payloads (e.g. some desktop browsers) — calling share()
    // there would throw instead of opening a share sheet.
    if (navigator.canShare(shareData)) {
      await navigator.share(shareData);
      return true;
    }

    return false;
  } catch (error) {
    // navigator.share rejects with AbortError when the user dismisses the
    // share sheet — treat cancellation the same as any failure: log + false.
    console.error('Share failed:', error);
    return false;
  }
};

/**
 * True when both navigator.share and navigator.canShare exist (we need
 * canShare to test file-payload support before sharing).
 */
export const isShareSupported = (): boolean => {
  return typeof navigator.share !== 'undefined' && typeof navigator.canShare !== 'undefined';
};

/**
 * Pre-capture sanity check: a WebGL canvas exists and has non-zero size.
 * Reports failure via the return value — never throws.
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
