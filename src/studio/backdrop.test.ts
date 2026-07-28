import { describe, it, expect } from 'vitest';
import { parseSvgDoc, scaledBackdrop, deriveBackdrop } from './backdrop';
import { composeFrame, COMPOSE_DEFAULTS } from '@/story/props/compose';
import type { StoryFrame } from '@/story/storyDoc';

/**
 * The stage editor was empty on the five bundled frames because they carry
 * `art` but no `props`, so it composed nothing. These cover the backdrop
 * mechanism that lets the existing art be shown behind the props and,
 * critically, survive a save instead of being overwritten with an empty SVG.
 */

const OIL = '<svg width="660" height="336" viewBox="0 0 330 168" xmlns="http://www.w3.org/2000/svg"><rect id="derrick" x="10" y="20" width="4" height="120"/></svg>';

describe('parseSvgDoc', () => {
  it('reads width and height from the viewBox', () => {
    const { width, height } = parseSvgDoc(OIL);
    expect(width).toBe(330);
    expect(height).toBe(168);
  });

  it('returns the inner markup without the <svg> wrapper', () => {
    const { inner } = parseSvgDoc(OIL);
    expect(inner).toBe('<rect id="derrick" x="10" y="20" width="4" height="120"/>');
    expect(inner).not.toContain('<svg');
    expect(inner).not.toContain('</svg>');
  });

  it('falls back to the composer defaults when there is no parseable svg', () => {
    const { width, height, inner } = parseSvgDoc('');
    expect(width).toBe(COMPOSE_DEFAULTS.width);
    expect(height).toBe(COMPOSE_DEFAULTS.height);
    expect(inner).toBe('');
  });
});

describe('scaledBackdrop', () => {
  it('is identity markup when the target size matches the source', () => {
    expect(scaledBackdrop('<rect/>', 330, 168, 330, 168)).toBe('<rect/>');
  });

  it('wraps in a scale transform when resizing to fill', () => {
    const out = scaledBackdrop('<rect/>', 330, 168, 520, 300);
    expect(out).toContain('scale(');
    expect(out).toContain('<rect/>');
    // 520/330 and 300/168
    expect(out).toContain(String(Number((520 / 330).toFixed(4))));
    expect(out).toContain(String(Number((300 / 168).toFixed(4))));
  });

  it('is empty when there is nothing to draw', () => {
    expect(scaledBackdrop('', 330, 175, 520, 300)).toBe('');
  });
});

describe('deriveBackdrop', () => {
  const base: StoryFrame = {
    key: 'oil',
    year: '1974',
    label: 'OIL',
    title: 'THE OIL YEARS',
    line: '',
    washColor: 'rgba(0,0,0,0)',
    art: OIL,
  };

  it('uses the stored backdrop when the frame already has one', () => {
    expect(deriveBackdrop({ ...base, backdrop: '<svg>kept</svg>' })).toBe('<svg>kept</svg>');
  });

  it('falls back to the frame art for a legacy frame with no backdrop', () => {
    expect(deriveBackdrop(base)).toBe(OIL);
  });

  it('is empty for a frame whose art carries no svg', () => {
    expect(deriveBackdrop({ ...base, art: '' })).toBe('');
  });

  // Double-draw regression: the bundled frames now compose their art from
  // props. Treating that art as a backdrop would paint every object twice —
  // once in the frozen layer, once as the prop over it — and saving would bake
  // the doubling in permanently.
  it('is empty for a frame that composed its own art from props', () => {
    const props = [{ t: 'lib' as const, k: 'car', x: 0, z: 1, h: 1.35, f: false, e: 0 }];
    expect(deriveBackdrop({ ...base, props })).toBe('');
  });

  it('still falls back to art for a frame with an empty props array', () => {
    // An emptied frame is a legacy frame by another name: nothing composed its
    // art, so the hand-authored scene is still the backdrop worth keeping.
    expect(deriveBackdrop({ ...base, props: [] })).toBe(OIL);
  });

  it('prefers a stored backdrop over dropping it for a propped frame', () => {
    const props = [{ t: 'lib' as const, k: 'car', x: 0, z: 1, h: 1.35, f: false, e: 0 }];
    expect(deriveBackdrop({ ...base, backdrop: '<svg>kept</svg>', props })).toBe('<svg>kept</svg>');
  });
});

describe('save composition (data-loss regression)', () => {
  // Reproduces the bug: SAVE STAGE used to emit composeFrame([]), collapsing
  // oil's 3445-char art to an empty 122-char SVG. With the backdrop carried,
  // saving a legacy frame with no props must preserve its art instead.
  it('preserves the hand-authored art when saving a frame with no props', () => {
    const { inner, width, height } = parseSvgDoc(OIL);
    const scale = height / COMPOSE_DEFAULTS.height;
    const art = composeFrame([], {
      width,
      height,
      groundY: COMPOSE_DEFAULTS.groundY * scale,
      ppm: COMPOSE_DEFAULTS.ppm * scale,
      backdrop: inner,
    });
    expect(art).toContain('id="derrick"');
    expect(art.length).toBeGreaterThan(OIL.length * 0.8);
  });

  it('does not nest the backdrop as a data: URL image (stays a flat svg for AR)', () => {
    const { inner } = parseSvgDoc(OIL);
    const art = composeFrame([], { backdrop: inner });
    expect(art).not.toContain('data:image/svg+xml');
  });
});
