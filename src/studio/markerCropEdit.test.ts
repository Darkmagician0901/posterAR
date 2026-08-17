import { describe, expect, it } from 'vitest';
import { getDefaultCrop, validateCrop, MARKER_MIN_WIDTH, MARKER_MIN_HEIGHT } from '@/markers/markerCrop';
import { canCrop, moveCrop, scaleCrop } from './markerCropEdit';

const size = { width: 1200, height: 1600 };
const base = getDefaultCrop(size, false);

describe('canCrop', () => {
  it('accepts an image at exactly the minimum', () => {
    expect(canCrop({ width: MARKER_MIN_WIDTH, height: MARKER_MIN_HEIGHT })).toBe(true);
  });

  it('rejects an image one pixel too narrow', () => {
    expect(canCrop({ width: MARKER_MIN_WIDTH - 1, height: MARKER_MIN_HEIGHT })).toBe(false);
  });

  it('rejects an image one pixel too short', () => {
    expect(canCrop({ width: MARKER_MIN_WIDTH, height: MARKER_MIN_HEIGHT - 1 })).toBe(false);
  });
});

describe('moveCrop', () => {
  it('moves by the requested delta when there is room', () => {
    // Not `base`: getDefaultCrop always maximises at least one axis to match
    // the source exactly (that is its job), so the default crop has zero
    // slack on that axis by construction and can never move along it. This
    // fixture is an explicit interior crop with genuine slack on both axes,
    // so the delta is unclamped and applies exactly.
    const roomy = { ...base, top: 400, left: 300, width: 480, height: 640 };
    const moved = moveCrop(roomy, 10, -20, size);
    expect(moved.left).toBe(roomy.left + 10);
    expect(moved.top).toBe(roomy.top - 20);
  });

  it('never leaves the image, however far it is dragged', () => {
    const moved = moveCrop(base, 99999, 99999, size);
    expect(validateCrop(moved, size)).toEqual([]);
    expect(moved.left + moved.width).toBeLessThanOrEqual(size.width);
    expect(moved.top + moved.height).toBeLessThanOrEqual(size.height);
  });

  it('never goes negative, however far it is dragged the other way', () => {
    const moved = moveCrop(base, -99999, -99999, size);
    expect(moved.left).toBe(0);
    expect(moved.top).toBe(0);
  });

  it('leaves the size and the rotation bookkeeping alone', () => {
    const moved = moveCrop(base, 7, 7, size);
    expect(moved.width).toBe(base.width);
    expect(moved.height).toBe(base.height);
    expect(moved.isRotated).toBe(base.isRotated);
    expect(moved.originalWidth).toBe(base.originalWidth);
  });
});

describe('scaleCrop', () => {
  it('keeps 3:4 exactly, because the tracker image is 480x640', () => {
    const grown = scaleCrop(base, 0.8, size);
    expect(grown.width / grown.height).toBeCloseTo(3 / 4, 5);
  });

  it('refuses to shrink below the CLI minimum', () => {
    const tiny = scaleCrop(base, 0.01, size);
    expect(tiny.width).toBeGreaterThanOrEqual(MARKER_MIN_WIDTH);
    expect(tiny.height).toBeGreaterThanOrEqual(MARKER_MIN_HEIGHT);
    expect(validateCrop(tiny, size)).toEqual([]);
  });

  it('refuses to grow past the image', () => {
    const huge = scaleCrop(base, 99, size);
    expect(validateCrop(huge, size)).toEqual([]);
  });

  it('produces a valid crop at every factor across the range', () => {
    for (let f = 0.05; f <= 4; f += 0.05) {
      expect(validateCrop(scaleCrop(base, f, size), size)).toEqual([]);
    }
  });
});
