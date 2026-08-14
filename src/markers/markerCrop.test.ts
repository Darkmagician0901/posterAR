/**
 * markerCrop.test.ts
 *
 * Reference behaviour is `@8thwall/image-target-cli@1.0.0`'s `getDefaultCrop`
 * and `validateCrop` (MIT), reproduced verbatim in `markerCrop.ts`. These cases
 * are worked by hand against that source so the port has a reference
 * implementation to agree with, per `docs/marker-layer-design.md` §13.
 */

import { describe, expect, it } from 'vitest';
import { getDefaultCrop, validateCrop, type MarkerCrop } from './markerCrop';

describe('getDefaultCrop', () => {
  it('takes the else branch and centres vertically for a portrait source', () => {
    // 900x1600 is narrower than a 3:4 crop of its own height would allow
    // (900/3 = 300 is not > 1600/4 = 400), so the crop keeps the full width
    // and trims height, centred top and bottom.
    const crop = getDefaultCrop({ width: 900, height: 1600 }, false);
    expect(crop).toEqual<MarkerCrop>({
      left: 0,
      top: 200,
      width: 900,
      height: 1200,
      isRotated: false,
      originalWidth: 900,
      originalHeight: 1600,
    });
    // Centred: equal room above and below the crop.
    expect(crop.top).toBe(crop.originalHeight - crop.height - crop.top);
  });

  it('swaps the axes for a landscape source rotated 90°', () => {
    // Same source as the portrait case above, but described the other way
    // round (as a 1600x900 landscape photo) with isRotated: true — the CLI's
    // call site sets isRotated when the *source* is landscape, and the crop
    // then operates in post-rotation (i.e. portrait) coordinates.
    const crop = getDefaultCrop({ width: 1600, height: 900 }, true);
    expect(crop).toEqual<MarkerCrop>({
      left: 0,
      top: 200,
      width: 900,
      height: 1200,
      isRotated: true,
      originalWidth: 900,
      originalHeight: 1600,
    });
  });

  it('takes the if branch for a landscape source with no rotation', () => {
    // 1600x900: 1600/3 = 533.33 > 900/4 = 225, so this time the crop keeps
    // the full height and trims width, centred left and right.
    const crop = getDefaultCrop({ width: 1600, height: 900 }, false);
    expect(crop).toEqual<MarkerCrop>({
      left: 463,
      top: 0,
      width: 675,
      height: 900,
      isRotated: false,
      originalWidth: 1600,
      originalHeight: 900,
    });
  });

  it('crops a source already exactly 3:4 to itself with zero offsets', () => {
    const crop = getDefaultCrop({ width: 480, height: 640 }, false);
    expect(crop).toEqual<MarkerCrop>({
      left: 0,
      top: 0,
      width: 480,
      height: 640,
      isRotated: false,
      originalWidth: 480,
      originalHeight: 640,
    });
  });
});

describe('validateCrop', () => {
  const validCrop: MarkerCrop = {
    left: 0,
    top: 0,
    width: 480,
    height: 640,
    isRotated: false,
    originalWidth: 480,
    originalHeight: 640,
  };

  it('returns no issues for a valid crop', () => {
    expect(validateCrop(validCrop, { width: 480, height: 640 })).toEqual([]);
  });

  it('flags a negative top offset', () => {
    const crop = { ...validCrop, top: -1 };
    expect(validateCrop(crop, { width: 480, height: 641 })).toContain(
      'Top offset cannot be negative',
    );
  });

  it('flags a negative left offset', () => {
    const crop = { ...validCrop, left: -1 };
    expect(validateCrop(crop, { width: 481, height: 640 })).toContain(
      'Left offset cannot be negative',
    );
  });

  it('flags a width below the minimum', () => {
    const crop = { ...validCrop, width: 479 };
    expect(validateCrop(crop, { width: 480, height: 640 })).toContain(
      'Width must be at least 480',
    );
  });

  it('flags a height below the minimum', () => {
    const crop = { ...validCrop, height: 639 };
    expect(validateCrop(crop, { width: 480, height: 640 })).toContain(
      'Height must be at least 640',
    );
  });

  it('flags a crop whose bottom edge exceeds the image height, with the exact numbers', () => {
    const crop = { ...validCrop, top: 10 };
    // top(10) + height(640) = 650 > imageMetadata.height(640)
    expect(validateCrop(crop, { width: 480, height: 640 })).toContain(
      'Bottom edge of crop exceeds image height (650 > 640)',
    );
  });

  it('flags a crop whose right edge exceeds the image width, with the exact numbers', () => {
    const crop = { ...validCrop, left: 10 };
    // left(10) + width(480) = 490 > imageMetadata.width(480)
    expect(validateCrop(crop, { width: 480, height: 640 })).toContain(
      'Right edge of crop exceeds image width (490 > 480)',
    );
  });

  it('rejects a 479-wide crop and accepts a 480-wide crop at the boundary', () => {
    const tooNarrow = { ...validCrop, width: 479 };
    const justWideEnough = { ...validCrop, width: 480 };
    expect(validateCrop(tooNarrow, { width: 479, height: 640 })).toContain(
      'Width must be at least 480',
    );
    expect(validateCrop(justWideEnough, { width: 480, height: 640 })).toEqual([]);
  });

  it('collects every issue at once rather than stopping at the first', () => {
    const crop: MarkerCrop = {
      left: -5,
      top: -5,
      width: 100,
      height: 100,
      isRotated: false,
      originalWidth: 480,
      originalHeight: 640,
    };
    const issues = validateCrop(crop, { width: 50, height: 50 });
    expect(issues).toEqual([
      'Top offset cannot be negative',
      'Left offset cannot be negative',
      'Width must be at least 480',
      'Height must be at least 640',
      'Bottom edge of crop exceeds image height (95 > 50)',
      'Right edge of crop exceeds image width (95 > 50)',
    ]);
  });
});
