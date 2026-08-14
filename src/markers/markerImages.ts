/**
 * markerImages.ts — the pixel half of marker fingerprint generation.
 *
 * Produces the two PNGs a marker needs, from a source photo and the crop
 * rectangle {@link ../markers/markerCrop} computed for it:
 *
 * - the **luminance** image (480x640 grayscale), which is what the tracker
 *   matches camera frames against;
 * - the **thumbnail** (263x350 colour), shown in the Studio library and as the
 *   viewer's scan hint.
 *
 * This is a port of the PLANAR path of `@8thwall/image-target-cli@1.0.0` (MIT),
 * which does a crop, a resize, and a grayscale with `sharp` — there is no
 * feature extraction anywhere in it, so a canvas reproduces it faithfully. See
 * `docs/marker-layer-design.md` §1 and §4.
 *
 * Deliberately NOT unit-tested. Per `docs/arcade-architecture.md` §12, browser
 * canvas work is verified on device; happy-dom has no real rasterizer, so a
 * test here would assert against a stub rather than against pixels. The
 * arithmetic this file depends on lives in `markerCrop.ts`, which is pure and
 * fully covered.
 *
 * The one known difference from the CLI: browser resampling is not sharp's
 * Lanczos, so the luminance image will not be byte-identical. `docs/
 * marker-layer-design.md` §4.2 records why that is judged low-risk and how
 * Phase 0 measures it.
 */

import {
  MARKER_LUMINANCE_HEIGHT,
  MARKER_THUMBNAIL_HEIGHT,
  type MarkerCrop,
} from './markerCrop';

/** The two PNGs one marker is made of. */
export interface MarkerImages {
  /** 480x640 grayscale — what the tracker matches. Its hash is the markerId. */
  luminance: Blob;
  /** 263x350 colour — Studio library and viewer scan hint. */
  thumbnail: Blob;
}

/**
 * Either canvas flavour. `OffscreenCanvas` is preferred because it keeps the
 * work off the document, but Safari only gained it recently enough that a
 * fallback is still worth carrying.
 */
type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

/** Creates the best available canvas at the given size. */
function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Gets a 2D context, or throws.
 *
 * `willReadFrequently` is set because {@link grayscaleInPlace} reads the whole
 * buffer back; without it browsers may keep the surface GPU-side and pay a
 * readback stall.
 */
function context2d(canvas: AnyCanvas): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('marker: could not acquire a 2D canvas context');
  // Both flavours yield the same drawing API; the DOM lib types them as two
  // unrelated interfaces, so one narrowing cast is unavoidable here.
  return ctx as CanvasRenderingContext2D;
}

/** Encodes a canvas as PNG. Lossless, because the tracker matches these pixels. */
async function toPngBlob(canvas: AnyCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' });

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('marker: PNG encoding failed'))),
      'image/png',
    );
  });
}

/**
 * Applies the source rotation and the crop, in that order.
 *
 * Order matters and is not interchangeable: the CLI rotates the image first
 * (`rawImage.clone().rotate(90)`) and stores the crop rectangle in
 * POST-rotation coordinates, so cropping first would cut the wrong region of a
 * landscape source. `markerCrop.getDefaultCrop` returns coordinates in that
 * same post-rotation space.
 *
 * @param source — The decoded source photo.
 * @param crop — The crop rectangle, in post-rotation coordinates.
 * @returns A canvas holding exactly the cropped region.
 */
function rotateAndCrop(source: ImageBitmap, crop: MarkerCrop): AnyCanvas {
  let upright: AnyCanvas | ImageBitmap = source;

  if (crop.isRotated) {
    // Clockwise quarter turn, matching sharp's rotate(90): a w x h source
    // becomes h x w, and source (x, y) lands at (h - y, x).
    const rotated = createCanvas(source.height, source.width);
    const rctx = context2d(rotated);
    rctx.translate(source.height, 0);
    rctx.rotate(Math.PI / 2);
    rctx.drawImage(source, 0, 0);
    upright = rotated;
  }

  const cropped = createCanvas(crop.width, crop.height);
  context2d(cropped).drawImage(
    upright as CanvasImageSource,
    crop.left,
    crop.top,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );
  return cropped;
}

/**
 * Scales a canvas to an exact target height, preserving aspect.
 *
 * Prefers `createImageBitmap`'s `resizeQuality: 'high'`, which gives the
 * browser's best downscaler in one step. Where that option is unsupported the
 * fallback halves repeatedly before the final draw: a single large-ratio
 * `drawImage` uses bilinear filtering that samples too few source pixels and
 * visibly aliases, which for an image the tracker matches against would be
 * throwing away exactly the fine detail that makes a marker trackable.
 *
 * @param source — The image to scale.
 * @param targetHeight — Exact output height in pixels.
 * @returns A canvas at `targetHeight`, width rounded to keep the aspect.
 */
async function resizeToHeight(source: AnyCanvas, targetHeight: number): Promise<AnyCanvas> {
  const srcWidth = source.width;
  const srcHeight = source.height;
  const targetWidth = Math.round((srcWidth * targetHeight) / srcHeight);

  try {
    const bitmap = await createImageBitmap(source as ImageBitmapSource, {
      resizeWidth: targetWidth,
      resizeHeight: targetHeight,
      resizeQuality: 'high',
    });
    const out = createCanvas(targetWidth, targetHeight);
    context2d(out).drawImage(bitmap, 0, 0);
    bitmap.close();
    return out;
  } catch {
    // Fall through to the manual downscale below.
  }

  let current: AnyCanvas = source;
  while (current.height > targetHeight * 2) {
    const halfWidth = Math.max(targetWidth, Math.round(current.width / 2));
    const halfHeight = Math.max(targetHeight, Math.round(current.height / 2));
    const half = createCanvas(halfWidth, halfHeight);
    context2d(half).drawImage(current as CanvasImageSource, 0, 0, halfWidth, halfHeight);
    current = half;
  }

  const out = createCanvas(targetWidth, targetHeight);
  context2d(out).drawImage(current as CanvasImageSource, 0, 0, targetWidth, targetHeight);
  return out;
}

/**
 * Converts a canvas to grayscale in place.
 *
 * Uses Rec. 601 luma weights, which is what `sharp.grayscale()` applies. Alpha
 * is forced opaque: the tracker wants a plain intensity image, and a source
 * photo with transparency would otherwise composite unpredictably.
 */
function grayscaleInPlace(canvas: AnyCanvas): void {
  const ctx = context2d(canvas);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;

  for (let i = 0; i < px.length; i += 4) {
    const luma = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const value = luma < 0 ? 0 : luma > 255 ? 255 : Math.round(luma);
    px[i] = value;
    px[i + 1] = value;
    px[i + 2] = value;
    px[i + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
}

/**
 * Produces a marker's two PNGs.
 *
 * Both derive from the same cropped canvas, so the thumbnail always depicts
 * exactly the region the tracker matches — an operator comparing them is
 * comparing like with like.
 *
 * @param source — The decoded source photo, before any rotation.
 * @param crop — A crop rectangle in post-rotation coordinates, as returned by
 *   `getDefaultCrop` and accepted by `validateCrop`. Validate it BEFORE calling
 *   this: a crop reaching outside the source draws transparent pixels rather
 *   than throwing, which would produce a marker that simply tracks badly.
 * @returns The luminance and thumbnail PNGs.
 */
export async function renderMarkerImages(
  source: ImageBitmap,
  crop: MarkerCrop,
): Promise<MarkerImages> {
  const cropped = rotateAndCrop(source, crop);

  const luminanceCanvas = await resizeToHeight(cropped, MARKER_LUMINANCE_HEIGHT);
  grayscaleInPlace(luminanceCanvas);

  const thumbnailCanvas = await resizeToHeight(cropped, MARKER_THUMBNAIL_HEIGHT);

  const [luminance, thumbnail] = await Promise.all([
    toPngBlob(luminanceCanvas),
    toPngBlob(thumbnailCanvas),
  ]);

  return { luminance, thumbnail };
}
