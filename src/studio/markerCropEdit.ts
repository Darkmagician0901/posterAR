/**
 * markerCropEdit.ts — moving and resizing the marker crop box.
 *
 * Every function returns a crop that `validateCrop` accepts, so the UI can
 * never hand the generator a rectangle the CLI's own rules would refuse. The
 * aspect stays locked at 3:4 because that is the shape of the 480x640 image
 * the tracker matches against — a free-form box would be resampled to 3:4
 * anyway, distorting what the operator saw in the preview.
 *
 * Pure arithmetic, no DOM. Pointer handling lives in MarkersPanel; the rules
 * live here so they are testable without synthesising drags.
 */

import {
  MARKER_MIN_HEIGHT,
  MARKER_MIN_WIDTH,
  type ImageSize,
  type MarkerCrop,
} from '@/markers/markerCrop';

/** Clamps `v` into `[lo, hi]`. `hi` below `lo` yields `lo`. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(Math.max(lo, hi), v));
}

/**
 * True when an image is large enough to cut any legal marker from.
 *
 * @param size — Post-rotation dimensions.
 */
export function canCrop(size: ImageSize): boolean {
  return size.width >= MARKER_MIN_WIDTH && size.height >= MARKER_MIN_HEIGHT;
}

/**
 * Slides the crop box, stopping at the image edges.
 *
 * @param crop — Current crop.
 * @param dx — Pixels right(+) / left(-).
 * @param dy — Pixels down(+) / up(-).
 * @param size — Post-rotation dimensions of the image being cut.
 * @returns The moved crop, always in bounds.
 */
export function moveCrop(crop: MarkerCrop, dx: number, dy: number, size: ImageSize): MarkerCrop {
  return {
    ...crop,
    left: Math.round(clamp(crop.left + dx, 0, size.width - crop.width)),
    top: Math.round(clamp(crop.top + dy, 0, size.height - crop.height)),
  };
}

/**
 * Resizes the crop box about its own centre, keeping 3:4.
 *
 * Height is the driven axis and width follows it, matching the CLI, where both
 * output images are resized by height. Bounds are applied to the height before
 * the width is derived, so the result cannot be a rectangle that fits one axis
 * and overflows the other.
 *
 * @param crop — Current crop.
 * @param factor — Multiplier; below 1 shrinks.
 * @param size — Post-rotation dimensions of the image being cut.
 * @returns The resized crop, never below the CLI minimum and never larger than
 *   the image.
 */
export function scaleCrop(crop: MarkerCrop, factor: number, size: ImageSize): MarkerCrop {
  const maxHeight = Math.min(size.height, Math.floor((size.width * 4) / 3));
  const height = Math.round(clamp(crop.height * factor, MARKER_MIN_HEIGHT, maxHeight));
  const width = Math.round((height * 3) / 4);

  const cx = crop.left + crop.width / 2;
  const cy = crop.top + crop.height / 2;

  return {
    ...crop,
    width,
    height,
    left: Math.round(clamp(cx - width / 2, 0, size.width - width)),
    top: Math.round(clamp(cy - height / 2, 0, size.height - height)),
  };
}
