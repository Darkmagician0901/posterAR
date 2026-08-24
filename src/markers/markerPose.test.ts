import { describe, expect, it } from 'vitest';
import { DEFAULT_WIDTH_IN_MARKERS, hasDimensions, tileSize } from './markerPose';

describe('tileSize', () => {
  const dims = { scaledWidth: 0.3, scaledHeight: 0.4 };

  it('covers the marker exactly at the v1 multiplier', () => {
    expect(tileSize(dims, DEFAULT_WIDTH_IN_MARKERS)).toEqual({ width: 0.3, height: 0.4 });
  });

  it('defaults to covering the marker when no multiplier is given', () => {
    expect(tileSize(dims)).toEqual(tileSize(dims, 1));
  });

  it('scales both axes together, so artwork never stretches', () => {
    const big = tileSize(dims, 4);
    expect(big).toEqual({ width: 1.2, height: 1.6 });
    // The ratio is what must survive — that is what "never stretches" means.
    expect(big.width / big.height).toBeCloseTo(dims.scaledWidth / dims.scaledHeight, 10);
  });

  it('is unit-agnostic: the multiplier is a ratio, so any unit scales alike', () => {
    // Same marker described in a 100x larger unit. The multiplier must behave
    // identically, because the design never learns what the units are (§5.1).
    const other = { scaledWidth: 30, scaledHeight: 40 };
    const a = tileSize(dims, 3);
    const b = tileSize(other, 3);
    expect(b.width / a.width).toBeCloseTo(100, 10);
    expect(a.width / a.height).toBeCloseTo(b.width / b.height, 10);
  });

  it('refuses a multiplier that would collapse the plane to nothing', () => {
    // Zero or negative would render an invisible plane, which reads on a phone
    // as "tracking is broken" and sends someone debugging the wrong thing.
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(tileSize(dims, bad)).toEqual({ width: 0.3, height: 0.4 });
    }
  });
});

describe('hasDimensions', () => {
  it('accepts a FLAT target’s reported size', () => {
    expect(hasDimensions({ scaledWidth: 0.3, scaledHeight: 0.4 })).toBe(true);
  });

  it('rejects a target with no dimensions, rather than sizing from undefined', () => {
    // Cylindrical/conical targets carry no scaledWidth. Sizing from undefined
    // yields a NaN-sized plane that never appears — the worst failure mode.
    expect(hasDimensions({})).toBe(false);
    expect(hasDimensions({ scaledWidth: 0.3 })).toBe(false);
  });

  it('rejects degenerate numbers', () => {
    expect(hasDimensions({ scaledWidth: 0, scaledHeight: 0.4 })).toBe(false);
    expect(hasDimensions({ scaledWidth: NaN, scaledHeight: 0.4 })).toBe(false);
    expect(hasDimensions({ scaledWidth: Infinity, scaledHeight: 0.4 })).toBe(false);
    expect(hasDimensions({ scaledWidth: -0.3, scaledHeight: 0.4 })).toBe(false);
  });
});
