import { describe, it, expect } from 'vitest';
import {
  FONT_OPTIONS,
  COLOR_OPTIONS,
  DEFAULT_FONT_ID,
  isFontId,
  isTextColor,
  resolveFont,
} from './textStyle';

describe('textStyle', () => {
  it('accepts a known font id and rejects an unknown one', () => {
    expect(isFontId('terminal')).toBe(true);
    expect(isFontId('comic-sans')).toBe(false);
    expect(isFontId(42)).toBe(false);
  });

  it('accepts an offered color and rejects anything else', () => {
    expect(isTextColor('#f08a1e')).toBe(true);
    expect(isTextColor('#123456')).toBe(false);
    expect(isTextColor('red')).toBe(false);
  });

  it('resolves a known font to its family and scale', () => {
    const clean = FONT_OPTIONS.find((f) => f.id === 'clean')!;
    expect(resolveFont('clean')).toEqual({ family: clean.family, scale: clean.scale });
  });

  it('falls back to the default pixel font for missing or unknown ids', () => {
    const def = FONT_OPTIONS.find((f) => f.id === DEFAULT_FONT_ID)!;
    expect(resolveFont(undefined)).toEqual({ family: def.family, scale: def.scale });
    expect(resolveFont('nope')).toEqual({ family: def.family, scale: def.scale });
  });

  it('keeps the default font at scale 1 so shipped stories are unchanged', () => {
    expect(resolveFont(undefined).scale).toBe(1);
  });

  it('offers a non-empty, id-unique font list and a non-empty color list', () => {
    expect(FONT_OPTIONS.length).toBeGreaterThan(0);
    expect(new Set(FONT_OPTIONS.map((f) => f.id)).size).toBe(FONT_OPTIONS.length);
    expect(COLOR_OPTIONS.length).toBeGreaterThan(0);
  });
});
