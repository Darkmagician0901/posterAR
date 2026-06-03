/**
 * Image Upload Utility
 * Validates input up to 50MB, compresses on the client to <2MB wire size,
 * normalizes output to image/webp, and reports the compression ratio.
 * Animated GIFs bypass compression and are stored as-is.
 */

import { readGifSize } from '@/utils/gifDecode';

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

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  file?: File;
}

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

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

/**
 * Iteratively shrink dimensions and quality until the WebP payload fits under
 * TARGET_WIRE_SIZE. Returns the best blob produced (last iteration if nothing
 * meets the budget — better an over-budget WebP than failing the upload).
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
      quality = Math.max(MIN_QUALITY, quality - 0.1);
      blob = await canvasToWebp(canvas, quality);
      continue;
    }

    const longest = Math.max(width, height);
    if (longest <= MIN_IMAGE_DIMENSION) break;
    const next = Math.max(MIN_IMAGE_DIMENSION, Math.round(longest * 0.8));
    const scale = next / longest;
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    quality = INITIAL_QUALITY;
    canvas = drawToCanvas(source, width, height);
    blob = await canvasToWebp(canvas, quality);
  }

  return { blob, width, height, quality };
};

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

export const validateAndProcessImage = async (file: File): Promise<ProcessedImage> => {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  return processImage(file);
};

export const createPreviewUrl = (file: File): string => URL.createObjectURL(file);
export const revokePreviewUrl = (url: string): void => URL.revokeObjectURL(url);

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};
