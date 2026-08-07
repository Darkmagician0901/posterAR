import { describe, it, expect } from 'vitest';
import { composeFrameArt } from './frameArt';
import { composeFrame, COMPOSE_DEFAULTS } from './compose';
import type { StoryFrame } from '../storyDoc';

/** A frame with one prop and no backdrop. */
function propped(): StoryFrame {
  return {
    key: 'f1',
    year: '1951',
    label: 'F1',
    title: 'TEST',
    line: '',
    washColor: 'rgba(0,0,0,0)',
    art: '<svg viewBox="0 0 330 175" xmlns="http://www.w3.org/2000/svg"></svg>',
    props: [{ t: 'lib', k: 'sunflower', x: 0, z: 2, h: 1.6, f: false, e: 0 }],
  };
}

describe('composeFrameArt', () => {
  it('composes a propped frame at the composer defaults', () => {
    const art = composeFrameArt(propped());
    expect(art).toContain('<svg');
    expect(art).toContain(`viewBox="0 0 ${COMPOSE_DEFAULTS.width} ${COMPOSE_DEFAULTS.height}"`);
  });

  it('matches a direct composeFrame call at the same size', () => {
    const frame = propped();
    const direct = composeFrame(frame.props!, {
      width: COMPOSE_DEFAULTS.width,
      height: COMPOSE_DEFAULTS.height,
      groundY: COMPOSE_DEFAULTS.groundY,
      ppm: COMPOSE_DEFAULTS.ppm,
      images: {},
      backdrop: '',
    });
    expect(composeFrameArt(frame)).toBe(direct);
  });

  it('scales the ground line and ppm with a larger backdrop', () => {
    const frame = propped();
    const big = '<svg viewBox="0 0 660 350" xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const art = composeFrameArt(frame, {}, big);
    // Twice the native size means twice the pixels-per-metre, so the prop's
    // composed scale doubles.
    expect(art).toContain('viewBox="0 0 660 350"');
    const at2x = Number(/scale\(([\d.]+),/.exec(art)![1]);
    const at1x = Number(/scale\(([\d.]+),/.exec(composeFrameArt(frame))![1]);
    expect(at2x / at1x).toBeCloseTo(2, 3);
  });

  it('keeps the backdrop markup behind the props', () => {
    const frame = propped();
    const withArt =
      '<svg viewBox="0 0 330 175" xmlns="http://www.w3.org/2000/svg"><rect id="bd"/></svg>';
    const art = composeFrameArt(frame, {}, withArt);
    expect(art.indexOf('id="bd"')).toBeLessThan(art.indexOf('<ellipse'));
  });

  it('composes an empty frame to an empty document rather than throwing', () => {
    const frame = { ...propped(), props: undefined };
    expect(composeFrameArt(frame, {}, '')).toContain('<svg');
  });
});
