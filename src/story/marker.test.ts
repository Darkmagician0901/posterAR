import { describe, it, expect } from 'vitest';
import {
  applyMarkerEdit,
  DEFAULT_MARKER,
  MARKER_LIMITS,
  markerHeightM,
  sanitizeMarker,
} from './marker';

describe('DEFAULT_MARKER', () => {
  it('is an A3 portrait poster at eye height', () => {
    expect(DEFAULT_MARKER.widthM).toBeCloseTo(0.297, 6);
    expect(DEFAULT_MARKER.aspect).toBeCloseTo(420 / 297, 6);
    expect(DEFAULT_MARKER.mountHeight).toBe(1.5);
  });

  it('carries no image until the author uploads one', () => {
    expect(DEFAULT_MARKER.image).toBe('');
  });
});

describe('markerHeightM', () => {
  it('derives printed height from width and aspect', () => {
    expect(markerHeightM(DEFAULT_MARKER)).toBeCloseTo(0.42, 6);
  });
});

describe('sanitizeMarker', () => {
  it('returns the default for a non-object', () => {
    expect(sanitizeMarker(null)).toEqual(DEFAULT_MARKER);
    expect(sanitizeMarker('poster')).toEqual(DEFAULT_MARKER);
    expect(sanitizeMarker(undefined)).toEqual(DEFAULT_MARKER);
  });

  it('keeps a well-formed marker', () => {
    const m = { image: 'data:image/webp;base64,AAA', widthM: 0.6, aspect: 0.75, mountHeight: 1.2 };
    expect(sanitizeMarker(m)).toEqual(m);
  });

  it('falls back per field rather than all-or-nothing', () => {
    const out = sanitizeMarker({ widthM: 0.6, aspect: 'wide', mountHeight: null });
    expect(out.widthM).toBe(0.6);
    expect(out.aspect).toBe(DEFAULT_MARKER.aspect);
    expect(out.mountHeight).toBe(DEFAULT_MARKER.mountHeight);
  });

  it('rejects an image that is not inline data', () => {
    // Composed art is rasterized through an <img>, which will not fetch
    // external references — and a published doc is untrusted input.
    expect(sanitizeMarker({ image: 'https://example.com/p.png' }).image).toBe('');
    expect(sanitizeMarker({ image: 'data:image/webp;base64,AAA' }).image).toBe(
      'data:image/webp;base64,AAA',
    );
  });

  it('clamps a physically impossible poster', () => {
    expect(sanitizeMarker({ widthM: 0 }).widthM).toBe(MARKER_LIMITS.widthMin);
    expect(sanitizeMarker({ widthM: -3 }).widthM).toBe(MARKER_LIMITS.widthMin);
    expect(sanitizeMarker({ widthM: 999 }).widthM).toBe(MARKER_LIMITS.widthMax);
    expect(sanitizeMarker({ aspect: 0 }).aspect).toBe(DEFAULT_MARKER.aspect);
    expect(sanitizeMarker({ mountHeight: -1 }).mountHeight).toBe(MARKER_LIMITS.mountMin);
    expect(sanitizeMarker({ mountHeight: 99 }).mountHeight).toBe(MARKER_LIMITS.mountMax);
  });
});

describe('applyMarkerEdit', () => {
  const base = { ...DEFAULT_MARKER, image: 'data:image/webp;base64,AAA', widthM: 0.6 };

  it('applies one field and leaves the rest', () => {
    const out = applyMarkerEdit(base, { mountHeight: 1.2 });
    expect(out.mountHeight).toBe(1.2);
    expect(out.widthM).toBe(0.6);
    expect(out.image).toBe(base.image);
  });

  it('clamps an edit past the limits', () => {
    expect(applyMarkerEdit(base, { widthM: 99 }).widthM).toBe(MARKER_LIMITS.widthMax);
    expect(applyMarkerEdit(base, { mountHeight: -4 }).mountHeight).toBe(MARKER_LIMITS.mountMin);
  });

  it('keeps the current value when a number field is cleared mid-edit', () => {
    // An emptied number input reads as NaN. Falling back to the A3 default here
    // would yank the field out from under the author as they retype.
    expect(applyMarkerEdit(base, { widthM: NaN }).widthM).toBe(0.6);
    expect(applyMarkerEdit(base, { mountHeight: NaN }).mountHeight).toBe(base.mountHeight);
  });

  it('takes a new image and its aspect together', () => {
    const out = applyMarkerEdit(base, { image: 'data:image/webp;base64,BBB', aspect: 0.7 });
    expect(out.image).toBe('data:image/webp;base64,BBB');
    expect(out.aspect).toBe(0.7);
  });

  it('still refuses an off-origin image', () => {
    expect(applyMarkerEdit(base, { image: 'https://example.com/p.png' }).image).toBe('');
  });
});
