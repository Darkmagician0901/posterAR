/**
 * Screenshot Utility
 *
 * Captures the live WebGL canvas as an image (data URL → Blob), then downloads
 * and/or shares it. Used by useScreenshot.
 *
 * ⚠️ 8th Wall caveat: on the live mobile path the canvas (id="camerafeed") is
 * owned by the XR8 engine, whose WebGLRenderer is created without
 * `preserveDrawingBuffer: true`. Reading it with `toDataURL()` outside the
 * render loop yields an empty/black frame. Capture therefore branches:
 *  - live AR  → XR8.CanvasScreenshot via @/xr8/canvasScreenshot (the engine
 *    grabs the composited camera+scene frame inside its own render loop);
 *  - desktop mock → DesktopMockMode composites its webcam <video> + GL canvas
 *    onto a 2D canvas right after a synchronous render.
 * `captureScreenshot` below (raw toDataURL) remains only as a last-resort
 * fallback when the engine screenshot module is unavailable.
 *
 * Main exports: captureScreenshot, downloadScreenshot, shareScreenshot,
 * base64ToBlob, base64JpegToDataUrl, screenshotResultFromBase64Jpeg,
 * computeCoverCrop, isShareSupported, generateFilename.
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
  /** Pixel size when known. The XR8 path returns a JPEG we never decode. */
  width?: number;
  height?: number;
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
 * Decode a raw base64 payload (no `data:` prefix) into a Blob. Hand-rolled
 * atob + Uint8Array rather than fetch(dataUrl) so it also works where fetch
 * does not accept data: URLs (and in happy-dom tests).
 */
export const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    array[i] = bytes.charCodeAt(i);
  }
  return new Blob([array], { type: mimeType });
};

/** Prefix a raw base64 JPEG payload into a renderable data: URL. */
export const base64JpegToDataUrl = (base64: string): string =>
  `data:image/jpeg;base64,${base64}`;

/**
 * Wrap the raw base64 JPEG returned by XR8.CanvasScreenshot.takeScreenshot()
 * (which has NO `data:` prefix) into a ScreenshotResult. Width/height are
 * left undefined — knowing them would require decoding the JPEG.
 */
export const screenshotResultFromBase64Jpeg = (
  base64: string,
  filename: string = generateFilename('jpeg')
): ScreenshotResult => ({
  dataUrl: base64JpegToDataUrl(base64),
  blob: base64ToBlob(base64, 'image/jpeg'),
  filename,
});

/**
 * Wrap a canvas.toDataURL() result (always base64-encoded) into a
 * ScreenshotResult. Used by the desktop mock composite capture.
 */
export const screenshotResultFromDataUrl = (
  dataUrl: string,
  width: number,
  height: number,
  format: ScreenshotFormat = 'jpeg'
): ScreenshotResult => ({
  dataUrl,
  blob: base64ToBlob(dataUrl.split(',')[1], getMimeType(format)),
  filename: generateFilename(format),
  width,
  height,
});

/**
 * Source-crop rectangle replicating CSS `object-fit: cover`: the largest
 * centered region of a srcW×srcH image that matches the dstW×dstH aspect
 * ratio. Used to composite the cover-fit webcam <video> onto a canvas of the
 * GL canvas's size.
 */
export const computeCoverCrop = (
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): { sx: number; sy: number; sw: number; sh: number } => {
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  if (srcAspect > dstAspect) {
    // Source is wider — crop left/right.
    const sw = srcH * dstAspect;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  // Source is taller (or equal) — crop top/bottom.
  const sh = srcW / dstAspect;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
};

/**
 * Convert data URL to Blob via the shared base64 decoder.
 */
const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const [header, payload] = dataUrl.split(',');
  const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  return base64ToBlob(payload, mimeType);
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
 * Trigger a browser download of the capture via a temporary <a download>
 * element. Uses an object URL for the blob rather than the data URL — large
 * data: hrefs are unreliable on iOS Safari. Throws an Error with context if
 * the DOM manipulation fails.
 */
export const downloadScreenshot = (result: ScreenshotResult): void => {
  const objectUrl = URL.createObjectURL(result.blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = result.filename;

    // Append to body (required for Firefox)
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    throw new Error(`Failed to download screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

/** Outcome of a shareScreenshot call — `canceled` must stay toast-silent. */
export type ShareOutcome = 'shared' | 'canceled' | 'unsupported' | 'failed';

/**
 * Share a captured screenshot via the Web Share API. Never throws:
 * 'shared' when the share sheet completed, 'canceled' when the user dismissed
 * it, 'unsupported' when the API or file payloads are unavailable, 'failed'
 * on any other error.
 */
export const shareScreenshot = async (
  result: ScreenshotResult,
  title: string = 'XR Poster Screenshot'
): Promise<ShareOutcome> => {
  if (!navigator.share || !navigator.canShare) {
    return 'unsupported';
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
    if (!navigator.canShare(shareData)) {
      return 'unsupported';
    }

    await navigator.share(shareData);
    return 'shared';
  } catch (error) {
    // navigator.share rejects with AbortError when the user dismisses the
    // share sheet — a cancel is a normal outcome, not an error.
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'canceled';
    }
    console.error('Share failed:', error);
    return 'failed';
  }
};

/**
 * True when both navigator.share and navigator.canShare exist (we need
 * canShare to test file-payload support before sharing).
 */
export const isShareSupported = (): boolean => {
  return typeof navigator.share !== 'undefined' && typeof navigator.canShare !== 'undefined';
};
