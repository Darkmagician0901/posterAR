/**
 * Image Upload Utility
 *
 * Validates input up to 50MB, compresses non-GIF input on the client to <2MB
 * wire size, normalizes that output to image/webp, and reports the compression
 * ratio. Animated GIFs bypass compression and are stored as-is (max 8MB).
 *
 * Terminology:
 *  - "wire size" — the encoded byte size of the payload as it would travel
 *    over the network or sit in storage, as opposed to the (much larger)
 *    decoded pixel size in memory.
 *  - "data URL" — a `data:image/...;base64,...` string embedding the whole
 *    file as text; the app stores and renders posters from these directly.
 */

import { readGifSize } from '@/utils/gifDecode';

/** MIME types accepted by validateImageFile. */
export const SUPPORTED_FORMATS = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
];

/** Max accepted source file size — 50 MB. */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Max accepted GIF size — 8 MB. GIFs are stored uncompressed, so cap tighter. */
export const MAX_GIF_SIZE = 8 * 1024 * 1024;

/** Wire-size target after compression — 2 MB. */
export const TARGET_WIRE_SIZE = 2 * 1024 * 1024;

/** Hard cap for decoded image dimensions on the longest axis. */
export const MAX_IMAGE_DIMENSION = 2048;

/** Lower bound the compressor will not go below when shrinking. */
export const MIN_IMAGE_DIMENSION = 512;

/** Initial WebP quality; reduced iteratively until the target is met. */
const INITIAL_QUALITY = 0.92;
const MIN_QUALITY = 0.5;
/** How much quality drops per compression attempt (0.92 → 0.82 → …). */
const QUALITY_STEP = 0.1;
/** Dimension shrink factor applied once quality bottoms out (20% per pass). */
const DIMENSION_SCALE_STEP = 0.8;

/** Result of validateImageFile — either { valid: true, file } or an error. */
export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  file?: File;
}

/** Output of processImage: the final payload plus compression statistics. */
export interface ProcessedImage {
  dataUrl: string;
  width: number;
  height: number;
  /** Compressed payload size in bytes (WebP). */
  compressedBytes: number;
  /** Original file size in bytes. */
  originalBytes: number;
  /** originalBytes / compressedBytes — e.g. 8.4 means 8.4x smaller. */
  ratio: number;
  /** Final quality value used. */
  quality: number;
  /** MIME of the compressed payload (always image/webp). */
  mimeType: string;
  originalName: string;
}

/**
 * Validates format and size limits (GIFs have a tighter 8 MB cap because they
 * are stored uncompressed).
 *
 * Note on `file.type`: the browser fills it from the file *extension* (or the
 * picker's metadata), not by sniffing the actual bytes, so this check is a
 * UX convenience, not a security boundary. A mislabeled file gets caught
 * later anyway, when decoding it in processImage fails.
 *
 * @param file — The candidate file from the picker or drag-and-drop.
 * @returns `{ valid: true, file }` on success, or `{ valid: false, error }`
 *   with a user-facing message. Never throws.
 */
export const validateImageFile = (file: File): ImageValidationResult => {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!SUPPORTED_FORMATS.includes(file.type)) {
    return {
      valid: false,
      error: 'Unsupported format. Use PNG, JPEG, WebP, or GIF.',
    };
  }

  if (file.type === 'image/gif' && file.size > MAX_GIF_SIZE) {
    return {
      valid: false,
      error: `Animated GIF too large — keep it under 8 MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      error: `File exceeds ${sizeMB}MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
    };
  }

  return { valid: true, file };
};

/**
 * Decodes a File into a drawable source. Prefers createImageBitmap (faster,
 * off-main-thread decode) but falls back to an HTMLImageElement because some
 * browsers (notably older Safari) lack it or fail on certain inputs.
 *
 * The fallback loads the file through an object URL — a short `blob:` URL
 * created with URL.createObjectURL that points at the file's bytes in memory.
 * @param file — The image file to decode.
 * @returns A promise resolving to an ImageBitmap, or an HTMLImageElement on
 *   the fallback path.
 * @throws Rejects with "Failed to decode image" when the fallback
 *   HTMLImageElement cannot decode the file (corrupt or mislabeled bytes).
 */
const loadImageBitmap = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to HTMLImageElement.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    // Revoke the object URL on BOTH paths — each createObjectURL pins the
    // file in memory until revoked or the page unloads.
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };
    img.src = url;
  });
};

/**
 * Scales (width, height) down proportionally so the longest side ≤ maxDim.
 *
 * @param width — Source width in pixels.
 * @param height — Source height in pixels.
 * @param maxDim — Maximum allowed size of the longest side.
 * @returns The scaled (rounded) dimensions; unchanged when already in budget.
 */
const fitWithin = (
  width: number,
  height: number,
  maxDim: number
): { width: number; height: number } => {
  const longest = Math.max(width, height);
  if (longest <= maxDim) {
    return { width, height };
  }
  const scale = maxDim / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
};

/**
 * Draws the decoded image onto a fresh canvas at the given size (this is
 * where any down-scaling actually happens, with high-quality smoothing).
 *
 * @param source — Decoded image to draw.
 * @param width — Target canvas width in pixels.
 * @param height — Target canvas height in pixels.
 * @returns The canvas containing the resized image.
 * @throws Error when a 2D context cannot be created.
 */
const drawToCanvas = (
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
};

/**
 * Encodes a canvas to a WebP Blob. canvas.toBlob is callback-based and may
 * invoke the callback with null (e.g. canvas too large or encoding failed)
 * rather than throwing — we convert that to a rejected promise.
 *
 * @param canvas — The canvas whose pixels should be encoded.
 * @param quality — WebP encoder quality, 0–1.
 * @returns A promise resolving to the encoded WebP Blob.
 * @throws Rejects with "toBlob returned null" when encoding fails.
 */
const canvasToWebp = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('toBlob returned null'));
        resolve(blob);
      },
      'image/webp',
      quality
    );
  });

/**
 * Reads a Blob as a base64 data URL. FileReader is event-based, so we wrap it
 * in a promise; readAsDataURL guarantees `result` is a string, hence the cast.
 *
 * @param blob — The blob to read.
 * @returns A promise resolving to the blob's contents as a data URL.
 * @throws Rejects with "Failed to read blob" on a FileReader error.
 */
const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });

/**
 * Same as blobToDataUrl but for an unmodified File (used for GIF passthrough).
 *
 * @param file — The file to read as-is, byte for byte.
 * @returns A promise resolving to the file's contents as a data URL.
 * @throws Rejects with "Failed to read file" on a FileReader error.
 */
const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

/**
 * Iteratively shrinks dimensions and quality until the WebP payload fits
 * under TARGET_WIRE_SIZE.
 *
 * Strategy: lower quality first (cheap — re-encode only), and only when
 * quality bottoms out at MIN_QUALITY shrink the canvas by DIMENSION_SCALE_STEP
 * and restart quality from INITIAL_QUALITY. The loop terminates because each
 * pass either lowers quality or shrinks dimensions until MIN_IMAGE_DIMENSION.
 *
 * @param source — Decoded image to compress.
 * @param origW — Source width in pixels (before any scaling).
 * @param origH — Source height in pixels (before any scaling).
 * @returns A promise resolving to the best blob produced plus the final
 *   width/height/quality. If nothing meets the budget, the last attempt is
 *   returned anyway — better an over-budget WebP than failing the upload.
 * @throws Rejects when canvas creation or WebP encoding fails.
 */
const compressToTarget = async (
  source: ImageBitmap | HTMLImageElement,
  origW: number,
  origH: number
): Promise<{ blob: Blob; width: number; height: number; quality: number }> => {
  let { width, height } = fitWithin(origW, origH, MAX_IMAGE_DIMENSION);
  let quality = INITIAL_QUALITY;
  let canvas = drawToCanvas(source, width, height);
  let blob = await canvasToWebp(canvas, quality);

  while (blob.size > TARGET_WIRE_SIZE) {
    if (quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP);
      blob = await canvasToWebp(canvas, quality);
      continue;
    }

    // Quality is at the floor — give up only once dimensions hit the floor too.
    const longest = Math.max(width, height);
    if (longest <= MIN_IMAGE_DIMENSION) break;
    const next = Math.max(MIN_IMAGE_DIMENSION, Math.round(longest * DIMENSION_SCALE_STEP));
    const scale = next / longest;
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    quality = INITIAL_QUALITY;
    canvas = drawToCanvas(source, width, height);
    blob = await canvasToWebp(canvas, quality);
  }

  return { blob, width, height, quality };
};

/**
 * Decodes + compresses a (pre-validated) image file to a WebP data URL, or
 * passes GIFs through untouched.
 *
 * @param file — The image file; callers should validate it first (see
 *   validateAndProcessImage for the combined entry point).
 * @returns A promise resolving to the {@link ProcessedImage} payload with
 *   compression statistics (ratio/quality are 1 for the GIF passthrough).
 * @throws Rejects when the file cannot be decoded (corrupt or mislabeled
 *   bytes), when WebP encoding fails, or — for GIFs — when the header cannot
 *   be parsed.
 */
export const processImage = async (file: File): Promise<ProcessedImage> => {
  // Animated GIFs must NOT be flattened: createImageBitmap + canvas.toBlob
  // would collapse them to a single static frame. Keep the original bytes and
  // let the renderer decode/animate them.
  if (file.type === 'image/gif') {
    const buffer = await file.arrayBuffer();
    const { width, height } = readGifSize(buffer);
    const dataUrl = await fileToDataUrl(file);
    return {
      dataUrl,
      width,
      height,
      compressedBytes: file.size,
      originalBytes: file.size,
      ratio: 1,
      quality: 1,
      mimeType: 'image/gif',
      originalName: file.name,
    };
  }

  const source = await loadImageBitmap(file);
  const srcW = 'width' in source ? source.width : (source as HTMLImageElement).naturalWidth;
  const srcH = 'height' in source ? source.height : (source as HTMLImageElement).naturalHeight;

  const { blob, width, height, quality } = await compressToTarget(source, srcW, srcH);

  if ('close' in source && typeof source.close === 'function') {
    source.close();
  }

  const dataUrl = await blobToDataUrl(blob);

  return {
    dataUrl,
    width,
    height,
    compressedBytes: blob.size,
    originalBytes: file.size,
    ratio: file.size / Math.max(1, blob.size),
    quality,
    mimeType: 'image/webp',
    originalName: file.name,
  };
};

/**
 * One-call entry point used by the upload hook: validate, then process.
 *
 * @param file — The image file selected by the user.
 * @returns A promise resolving to the {@link ProcessedImage} (see processImage).
 * @throws Rejects with a user-facing Error message when validation fails
 *   (unsupported format or oversize file), and propagates processImage's
 *   decode/encode rejections.
 */
export const validateAndProcessImage = async (file: File): Promise<ProcessedImage> => {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  return processImage(file);
};

/**
 * Formats a byte count for display.
 *
 * @param bytes — Raw byte count.
 * @returns A human-readable string: "512 B", "12.3 KB", or "1.25 MB".
 */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};
