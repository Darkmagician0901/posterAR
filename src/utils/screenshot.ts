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
 *
 * Terminology used throughout:
 *  - data URL: a string like `data:image/jpeg;base64,...` that embeds the
 *    whole image as base64 text — renderable directly in an <img> src.
 *  - object URL: a short `blob:` URL created with URL.createObjectURL that
 *    points at in-memory data; it must be revoked when done, or the blob
 *    stays pinned in memory until the page unloads.
 */

/**
 * Screenshot format options
 */
export type ScreenshotFormat = 'png' | 'jpeg' | 'webp';

/**
 * Options accepted by captureScreenshot.
 */
export interface ScreenshotOptions {
  /** Output encoding; defaults to 'png'. */
  format?: ScreenshotFormat;
  /** Encoder quality 0–1, used by JPEG/WebP only; defaults to 0.92. */
  quality?: number;
  /** Download filename; defaults to a generated timestamped name. */
  filename?: string;
}

/**
 * A captured frame in both renderable (dataUrl) and shareable (blob) form.
 */
export interface ScreenshotResult {
  /** The image as a data URL, for showing in the preview overlay. */
  dataUrl: string;
  /** The same image bytes as a Blob, for download and Web Share. */
  blob: Blob;
  /** Suggested filename for downloads/shares. */
  filename: string;
  /** Pixel size when known. The XR8 path returns a JPEG we never decode. */
  width?: number;
  height?: number;
}

/**
 * Maps a screenshot format to its MIME type string.
 *
 * @param format — One of 'png' | 'jpeg' | 'webp'.
 * @returns The corresponding `image/*` MIME type (defaults to 'image/png').
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
 * Builds a timestamped filename like `xr-poster-2026-06-09-14-30-05.png`
 * so successive screenshots never collide.
 *
 * @param format — File extension to append; defaults to 'png'.
 * @returns The generated filename.
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
 * Locates the WebGL (three.js / XR8) canvas in the document.
 *
 * @returns The single canvas on the page, the first canvas holding a WebGL
 *   context when several exist, or null when none qualifies.
 */
const findThreeCanvas = (): HTMLCanvasElement | null => {
  // Collect every canvas on the page; we don't know the renderer's id here.
  const canvases = document.querySelectorAll('canvas');

  // If only one canvas exists, it must be the renderer's canvas.
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
 * Reads a canvas's current pixels into a data URL.
 *
 * @param canvas — The canvas to read.
 * @param format — Output encoding; defaults to 'png'.
 * @param quality — Encoder quality 0–1 for JPEG/WebP; defaults to 0.92.
 * @returns The encoded image as a data URL.
 * @throws Error when the canvas cannot be read — e.g. it is tainted by
 *   cross-origin content, or the browser rejects toDataURL.
 */
const captureCanvasAsDataUrl = (
  canvas: HTMLCanvasElement,
  format: ScreenshotFormat = 'png',
  quality: number = 0.92,
): string => {
  const mimeType = getMimeType(format);

  try {
    return canvas.toDataURL(mimeType, quality);
  } catch (error) {
    throw new Error(
      `Failed to capture canvas: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};

/**
 * Decodes a raw base64 payload (no `data:` prefix) into a Blob. Hand-rolled
 * atob + Uint8Array rather than fetch(dataUrl) so it also works where fetch
 * does not accept data: URLs (and in happy-dom tests).
 *
 * @param base64 — Base64-encoded bytes, without any `data:...;base64,` prefix.
 * @param mimeType — MIME type to stamp on the resulting Blob.
 * @returns A Blob containing the decoded bytes.
 * @throws DOMException (from atob) when the input is not valid base64.
 */
export const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    array[i] = bytes.charCodeAt(i);
  }
  return new Blob([array], { type: mimeType });
};

/**
 * Prefixes a raw base64 JPEG payload into a renderable data URL.
 *
 * @param base64 — Base64 JPEG bytes without the `data:` prefix.
 * @returns A `data:image/jpeg;base64,...` string usable as an <img> src.
 */
export const base64JpegToDataUrl = (base64: string): string => `data:image/jpeg;base64,${base64}`;

/**
 * Wraps the raw base64 JPEG returned by XR8.CanvasScreenshot.takeScreenshot()
 * (which has NO `data:` prefix) into a ScreenshotResult. Width/height are
 * left undefined — knowing them would require decoding the JPEG.
 *
 * @param base64 — Base64 JPEG payload from the XR8 engine.
 * @param filename — Download filename; defaults to a timestamped name.
 * @returns A {@link ScreenshotResult} with dataUrl + blob built from the payload.
 */
export const screenshotResultFromBase64Jpeg = (
  base64: string,
  filename: string = generateFilename('jpeg'),
): ScreenshotResult => ({
  dataUrl: base64JpegToDataUrl(base64),
  blob: base64ToBlob(base64, 'image/jpeg'),
  filename,
});

/**
 * Wraps a canvas.toDataURL() result (always base64-encoded) into a
 * ScreenshotResult. Used by the desktop mock composite capture.
 *
 * @param dataUrl — The data URL produced by canvas.toDataURL().
 * @param width — Canvas width in pixels.
 * @param height — Canvas height in pixels.
 * @param format — Encoding used when the data URL was produced; defaults to 'jpeg'.
 * @returns A {@link ScreenshotResult} with a freshly generated filename.
 */
export const screenshotResultFromDataUrl = (
  dataUrl: string,
  width: number,
  height: number,
  format: ScreenshotFormat = 'jpeg',
): ScreenshotResult => ({
  dataUrl,
  blob: base64ToBlob(dataUrl.split(',')[1], getMimeType(format)),
  filename: generateFilename(format),
  width,
  height,
});

/**
 * Computes the source-crop rectangle replicating CSS `object-fit: cover`:
 * the largest centered region of a srcW×srcH image that matches the
 * dstW×dstH aspect ratio. Used to composite the cover-fit webcam <video>
 * onto a canvas of the GL canvas's size.
 *
 * @param srcW — Source image width in pixels.
 * @param srcH — Source image height in pixels.
 * @param dstW — Destination width whose aspect ratio must be matched.
 * @param dstH — Destination height whose aspect ratio must be matched.
 * @returns The crop rectangle within the source: `sx`/`sy` top-left corner
 *   and `sw`/`sh` size, in source pixels.
 */
export const computeCoverCrop = (
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
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
 * Converts a data URL to a Blob via the shared base64 decoder.
 *
 * @param dataUrl — A base64 data URL (`data:<mime>;base64,<payload>`).
 * @returns A promise resolving to a Blob of the decoded bytes, typed with the
 *   MIME from the URL header (falls back to application/octet-stream).
 * @throws Rejects when the payload is not valid base64.
 */
const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const [header, payload] = dataUrl.split(',');
  const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  return base64ToBlob(payload, mimeType);
};

/**
 * Captures the WebGL canvas by reading its pixels with toDataURL. Last-resort
 * fallback only — on live AR the frame may be blank (see the
 * preserveDrawingBuffer caveat in the file header).
 *
 * @param options — Optional format / quality / filename overrides
 *   (see {@link ScreenshotOptions} for defaults).
 * @returns A promise resolving to the {@link ScreenshotResult}, with
 *   width/height taken from the canvas.
 * @throws Rejects when no WebGL canvas is found in the document, or when the
 *   canvas pixels cannot be read.
 */
export const captureScreenshot = async (
  options: ScreenshotOptions = {},
): Promise<ScreenshotResult> => {
  const { format = 'png', quality = 0.92, filename = generateFilename(format) } = options;

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
 * Triggers a browser download of the capture via a temporary <a download>
 * element. Uses an object URL for the blob rather than the data URL — large
 * data: hrefs are unreliable on iOS Safari. The object URL is revoked in a
 * `finally` so the blob's memory is released even on failure.
 *
 * @param result — The captured screenshot to download (blob + filename used).
 * @throws Error with context when the DOM manipulation (create/click/remove
 *   the link) fails.
 */
export const downloadScreenshot = (result: ScreenshotResult): void => {
  const objectUrl = URL.createObjectURL(result.blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = result.filename;

    // The link must be attached to the document for click() to start a
    // download in Firefox; detached links work in Chrome but not everywhere.
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    throw new Error(
      `Failed to download screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

/** Outcome of a shareScreenshot call — `canceled` must stay toast-silent. */
export type ShareOutcome = 'shared' | 'canceled' | 'unsupported' | 'failed';

/**
 * Shares a captured screenshot via the Web Share API (the native share sheet
 * on mobile). Never throws or rejects — every outcome maps to a ShareOutcome.
 *
 * @param result — The captured screenshot; its blob is wrapped in a File for
 *   the share payload.
 * @param title — Share-sheet title; defaults to 'XR Poster Screenshot'.
 * @returns A promise resolving to 'shared' when the share sheet completed,
 *   'canceled' when the user dismissed it, 'unsupported' when the API or
 *   file payloads are unavailable, or 'failed' on any other error.
 */
export const shareScreenshot = async (
  result: ScreenshotResult,
  title: string = 'XR Poster Screenshot',
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
 * Checks for Web Share API availability.
 *
 * @returns True when both navigator.share and navigator.canShare exist (we
 *   need canShare to test file-payload support before sharing).
 */
export const isShareSupported = (): boolean => {
  return typeof navigator.share !== 'undefined' && typeof navigator.canShare !== 'undefined';
};
