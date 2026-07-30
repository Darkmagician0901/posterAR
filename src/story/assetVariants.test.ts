import { describe, expect, it } from 'vitest';
import { ASSET_VARIANTS, RASTER_LONGEST_AXIS, variantKey } from './assetVariants';

const SHA = 'a'.repeat(64);

describe('variantKey', () => {
  it('builds the full-size key', () => {
    expect(variantKey(SHA, 'full')).toBe(`assets/${SHA}/full.webp`);
  });

  it('builds the display-derivative key', () => {
    expect(variantKey(SHA, 'r1024')).toBe(`assets/${SHA}/r1024.webp`);
  });

  // Both variants share one content address, so the schema never changes when
  // the derivative is added or removed.
  it('places both variants under the same content address', () => {
    expect(variantKey(SHA, 'full').startsWith(`assets/${SHA}/`)).toBe(true);
    expect(variantKey(SHA, 'r1024').startsWith(`assets/${SHA}/`)).toBe(true);
  });
});

describe('RASTER_LONGEST_AXIS', () => {
  // svgTexture rasterizes the whole composed frame at 1024 on its longest
  // axis, so a single prop never needs more than that.
  it('matches the rasterizer budget', () => {
    expect(RASTER_LONGEST_AXIS).toBe(1024);
  });
});

describe('ASSET_VARIANTS', () => {
  it('lists exactly the two supported variants', () => {
    expect(ASSET_VARIANTS).toEqual(['full', 'r1024']);
  });
});
