import { describe, expect, it } from 'vitest';
import { RASTER_LONGEST_AXIS, assetKey } from './assetStorage';

const SHA = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

describe('assetKey', () => {
  it('builds the key for an asset', () => {
    expect(assetKey(SHA)).toBe(`assets/${SHA}/full.webp`);
  });

  // The whole security property: the key contains the hash of the bytes stored
  // under it and nothing else, so an address can only be claimed by content
  // that actually hashes to it. A derivative therefore gets its OWN key, not a
  // second slot under its parent's address (which nobody could verify).
  it('gives a derivative a key of its own, never a slot under a parent', () => {
    expect(assetKey(OTHER)).toBe(`assets/${OTHER}/full.webp`);
    expect(assetKey(OTHER)).not.toContain(SHA);
  });
});

describe('RASTER_LONGEST_AXIS', () => {
  // svgTexture rasterizes the whole composed frame at 1024 on its longest
  // axis, so a single prop never needs more than that.
  it('matches the rasterizer budget', () => {
    expect(RASTER_LONGEST_AXIS).toBe(1024);
  });
});
