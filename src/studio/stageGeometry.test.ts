import { describe, it, expect } from 'vitest';
import {
  FRONT,
  MARKER_FRONT,
  TOP,
  depthScale,
  frontProject,
  frontUnprojectX,
  topProject,
  topUnproject,
  toViewBox,
} from './stageGeometry';
import { composeFrame } from '@/story/props/compose';
import { StoryProp } from '@/story/storyDoc';

describe('depthScale', () => {
  it('is 1 at the front and shrinks with depth', () => {
    expect(depthScale(0)).toBe(1);
    expect(depthScale(3)).toBeLessThan(1);
    expect(depthScale(6)).toBeLessThan(depthScale(3));
  });

  it('treats negative depth as the front plane', () => {
    expect(depthScale(-5)).toBe(1);
  });

  it('matches the composer, or previews would lie about placement', () => {
    // Compose one prop at depth and read back the scale the composer applied.
    const prop: StoryProp = { t: 'lib', k: 'sunflower', x: 0, z: 4, h: 1.6, f: false, e: 0 };
    const svg = composeFrame([prop], { ppm: 30 });
    const composedScale = Number(/scale\(([\d.]+),/.exec(svg)![1]);
    // The composer's scale folds in bbox mapping; compare the depth factor by
    // dividing out the z=0 case.
    const flat = composeFrame([{ ...prop, z: 0 }], { ppm: 30 });
    const flatScale = Number(/scale\(([\d.]+),/.exec(flat)![1]);
    // Tolerance absorbs the composer's output rounding. The point of this test
    // is to catch a divergence in the depth *model* — changing the 0.16
    // coefficient in one file and not the other — which would be far larger.
    expect(composedScale / flatScale).toBeCloseTo(depthScale(4), 3);
  });
});

describe('frontProject', () => {
  it('puts a centred, grounded prop on the ground line at centre', () => {
    expect(frontProject(0, 0, 0)).toEqual({ x: FRONT.w / 2, y: FRONT.groundY });
  });

  it('moves right for positive x and left for negative', () => {
    expect(frontProject(1, 0).x).toBeGreaterThan(FRONT.w / 2);
    expect(frontProject(-1, 0).x).toBeLessThan(FRONT.w / 2);
  });

  it('raises props up the frame as they recede', () => {
    expect(frontProject(0, 3).y).toBeLessThan(frontProject(0, 0).y);
  });

  it('raises props further when lifted off the ground', () => {
    expect(frontProject(0, 0, 1).y).toBeLessThan(frontProject(0, 0, 0).y);
  });

  it('compresses horizontal offset with depth', () => {
    const near = frontProject(2, 0).x - FRONT.w / 2;
    const far = frontProject(2, 5).x - FRONT.w / 2;
    expect(far).toBeLessThan(near);
  });
});

describe('frontUnprojectX', () => {
  it('round-trips with frontProject at any depth', () => {
    for (const z of [0, 1.5, 4, 6]) {
      for (const x of [-3, -0.5, 0, 1.25, 3]) {
        expect(frontUnprojectX(frontProject(x, z).x, z)).toBeCloseTo(x, 6);
      }
    }
  });
});

describe('topProject / topUnproject', () => {
  it('places the viewer at the bottom edge and depth upward', () => {
    expect(topProject(0, 0).y).toBe(TOP.h);
    expect(topProject(0, TOP.zr).y).toBeCloseTo(0, 6);
  });

  it('centres x=0', () => {
    expect(topProject(0, 0).x).toBe(TOP.w / 2);
  });

  it('round-trips', () => {
    for (const [x, z] of [
      [0, 0],
      [1.5, 2],
      [-2.2, 5],
      [3.4, 6.2],
    ]) {
      const p = topProject(x, z);
      const back = topUnproject(p.x, p.y);
      expect(back.x).toBeCloseTo(x, 6);
      expect(back.z).toBeCloseTo(z, 6);
    }
  });

  it('clamps a drag outside the plan to its edges', () => {
    expect(topUnproject(-9999, 9999)).toEqual({ x: -TOP.xr, z: 0 });
    expect(topUnproject(9999, -9999)).toEqual({ x: TOP.xr, z: TOP.zr });
  });
});

describe('toViewBox', () => {
  const rect = { left: 100, top: 50, width: 260, height: 150 };

  it('maps a pointer position into viewBox units', () => {
    // Centre of a half-scale element maps to the centre of the viewBox.
    expect(toViewBox(230, 125, rect, 520, 300)).toEqual({ x: 260, y: 150 });
  });

  it('maps the origin corner', () => {
    expect(toViewBox(100, 50, rect, 520, 300)).toEqual({ x: 0, y: 0 });
  });

  it('does not divide by zero on a collapsed element', () => {
    const collapsed = { left: 0, top: 0, width: 0, height: 0 };
    expect(toViewBox(10, 10, collapsed, 520, 300)).toEqual({ x: 0, y: 0 });
  });
});

describe('marker stage', () => {
  it('is exactly 3:4, matching the printed picture', () => {
    expect(MARKER_FRONT.w / MARKER_FRONT.h).toBeCloseTo(3 / 4, 6);
  });

  it('keeps the same pixels-per-metre, so props do not resize when a story is bound', () => {
    expect(MARKER_FRONT.ppm).toBe(FRONT.ppm);
  });

  it('puts the ground line at the same proportion of the frame', () => {
    // Precision 2, not 3: MARKER_FRONT.groundY is the whole-pixel rounding of
    // 238/300 * 400 (317.33...), so it cannot match FRONT's proportion past
    // two decimal places — only a fractional groundY could, and the frame is
    // specified in whole SVG units.
    expect(MARKER_FRONT.groundY / MARKER_FRONT.h).toBeCloseTo(FRONT.groundY / FRONT.h, 2);
  });

  it('projects into the marker frame when one is given', () => {
    expect(frontProject(0, 0, 0, MARKER_FRONT).x).toBe(MARKER_FRONT.w / 2);
  });

  it('still projects into the landscape frame by default', () => {
    expect(frontProject(0, 0, 0).x).toBe(FRONT.w / 2);
  });

  it('round-trips a drag in the marker frame', () => {
    const x = 1.4;
    const p = frontProject(x, 2, 0, MARKER_FRONT);
    expect(frontUnprojectX(p.x, 2, MARKER_FRONT)).toBeCloseTo(x, 6);
  });
});
