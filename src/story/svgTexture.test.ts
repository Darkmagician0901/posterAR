import { describe, expect, it } from 'vitest';
import { svgFrame } from './svgTexture';

describe('svgFrame', () => {
  it('reads width/height/aspect from a viewBox', () => {
    expect(svgFrame('<svg viewBox="0 0 800 400"></svg>')).toEqual({
      w: 800,
      h: 400,
      aspect: 0.5,
    });
  });

  it('falls back to 660x350 when the viewBox is absent', () => {
    const f = svgFrame('<svg></svg>');
    expect(f.w).toBe(660);
    expect(f.h).toBe(350);
    expect(f.aspect).toBeCloseTo(350 / 660);
  });

  it('ignores a malformed viewBox (wrong arity or non-positive dims)', () => {
    expect(svgFrame('<svg viewBox="0 0 800"></svg>').w).toBe(660);
    expect(svgFrame('<svg viewBox="0 0 0 400"></svg>').w).toBe(660);
  });
});
