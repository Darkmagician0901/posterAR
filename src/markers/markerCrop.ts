/**
 * markerCrop.ts — the PLANAR crop maths from `@8thwall/image-target-cli@1.0.0`
 * (MIT), ported verbatim.
 *
 * `getDefaultCrop` and `validateCrop` are pure arithmetic on width and height
 * — no image bytes touched — so the port is exact rather than approximate.
 * The CLI's own `crop.test.js` cases (worked by hand here) are the reference
 * this port agrees with; see `markerCrop.test.ts` and
 * `docs/marker-layer-design.md` §4 and §13.
 *
 * There is deliberately no feature extraction or proprietary descriptor here:
 * per `docs/marker-layer-design.md` §1, a fingerprint is a grayscale image, a
 * crop rectangle, and some filenames. The engine computes matchable features
 * on-device at runtime from the grayscale image these functions help produce.
 */

/** The CLI's `constants.json`. */
export const MARKER_MIN_WIDTH = 480;
export const MARKER_MIN_HEIGHT = 640;
export const MARKER_LUMINANCE_HEIGHT = 640;
export const MARKER_THUMBNAIL_HEIGHT = 350;

/** A width/height pair. Used both for a source image and for a crop target. */
export interface ImageSize {
  width: number;
  height: number;
}

/**
 * A 3:4 crop rectangle plus the bookkeeping the CLI carries alongside it.
 *
 * `isRotated`, `originalWidth`, and `originalHeight` describe the *source*
 * that this crop was computed from ({@link getDefaultCrop}'s `isRotated` and
 * `size` arguments) — they are not re-derived from `top`/`left`/`width`/
 * `height`, which describe the crop rectangle itself.
 */
export interface MarkerCrop {
  top: number;
  left: number;
  width: number;
  height: number;
  isRotated: boolean;
  originalWidth: number;
  originalHeight: number;
}

/**
 * Computes the centred 3:4 default crop for a source image.
 *
 * Ported verbatim from the CLI's `getDefaultCrop`. Trims whichever axis is
 * "too long" for a 3:4 crop and centres the trim, so the default crop always
 * keeps as much of the source as a 3:4 rectangle can.
 *
 * @param size — The source image's own dimensions (i.e. as decoded, before
 *   any rotation).
 * @param isRotated — Whether the *source* is landscape. This is the CLI call
 *   site's meaning, not a description of the returned crop: when true, width
 *   and height are swapped before the 3:4 arithmetic runs, so the crop is
 *   computed — and returned — in POST-rotation (portrait) coordinates. The
 *   returned `originalWidth`/`originalHeight` are those post-swap dimensions,
 *   not `size` itself.
 * @returns The default crop, in post-rotation coordinates when `isRotated`.
 */
export function getDefaultCrop(size: ImageSize, isRotated: boolean): MarkerCrop {
  const width = isRotated ? size.height : size.width;
  const height = isRotated ? size.width : size.height;

  if (width / 3 > height / 4) {
    const croppedWidth = Math.round((height * 3) / 4);
    return {
      left: Math.round((width - croppedWidth) / 2),
      top: 0,
      width: croppedWidth,
      height,
      isRotated,
      originalWidth: width,
      originalHeight: height,
    };
  }

  const croppedHeight = Math.round((width * 4) / 3);
  return {
    left: 0,
    top: Math.round((height - croppedHeight) / 2),
    width,
    height: croppedHeight,
    isRotated,
    originalWidth: width,
    originalHeight: height,
  };
}

/**
 * Validates a crop rectangle against the image it will be cut from.
 *
 * Ported verbatim from the CLI's `validateCrop`, including the exact issue
 * strings (with their interpolated numbers) — they are shown to an operator
 * verbatim in the Studio Markers screen (`docs/marker-layer-design.md` §7.1),
 * so wording changes here are a UI-visible change, not a refactor.
 *
 * Every applicable check runs; the result can carry more than one issue.
 *
 * @param crop — The candidate crop rectangle.
 * @param size — The size of the image the crop is cut from, in the SAME
 *   coordinate space as `crop` — i.e. AFTER any rotation. The CLI's call site
 *   always passes post-rotation metadata here; passing the source's original
 *   (pre-rotation) dimensions for a rotated crop will silently validate
 *   against the wrong axis.
 * @returns Human-readable issue strings; empty when the crop is valid.
 */
export function validateCrop(crop: MarkerCrop, size: ImageSize): string[] {
  const issues: string[] = [];
  const { top, left, width, height } = crop;

  if (top < 0) issues.push('Top offset cannot be negative');
  if (left < 0) issues.push('Left offset cannot be negative');
  if (width < MARKER_MIN_WIDTH) issues.push(`Width must be at least ${MARKER_MIN_WIDTH}`);
  if (height < MARKER_MIN_HEIGHT) issues.push(`Height must be at least ${MARKER_MIN_HEIGHT}`);
  if (top + height > size.height) {
    issues.push(`Bottom edge of crop exceeds image height (${top + height} > ${size.height})`);
  }
  if (left + width > size.width) {
    issues.push(`Right edge of crop exceeds image width (${left + width} > ${size.width})`);
  }

  return issues;
}
