import { describe, it, expect } from 'vitest';
import {
  FRONT,
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
import { SCENE, depthScale as sharedDepthScale } from '@/story/projection';
import { project } from './perspective';

describe('depthScale', () => {
  it('is 1 at the near plane and shrinks toward the wall', () => {
    expect(depthScale(SCENE.zMax)).toBe(1);
    expect(depthScale(3)).toBeLessThan(1);
    expect(depthScale(0)).toBeLessThan(depthScale(3));
  });

  it('treats depth behind the wall as the wall plane', () => {
    expect(depthScale(-5)).toBe(depthScale(0));
  });

  it('is the projection module, not a second copy of it', () => {
    for (const z of [0, 1.15, 2.3, 3.45, 4.6]) {
      expect(depthScale(z)).toBe(sharedDepthScale(z));
    }
  });

  it('matches the phone preview, which used to disagree by about 2x', () => {
    // The preview reports px-per-metre directly; normalise it against the near
    // plane to get the same multiplier depthScale returns.
    for (const z of [0, 1.15, 2.3, 3.45, 4.6]) {
      const ratio = project(0, 0, z, 0).k / project(0, 0, SCENE.zMax, 0).k;
      expect(ratio).toBeCloseTo(depthScale(z), 10);
    }
  });

  it('matches the stage editor camera view, whose inline copy is gone', () => {
    // frontProject's horizontal compression IS the depth factor, so a round
    // trip through it recovers the same multiplier the editor's handles use.
    for (const z of [0, 2.3, SCENE.zMax]) {
      const offset = frontProject(1, z).x - FRONT.w / 2;
      expect(offset / FRONT.ppm).toBeCloseTo(depthScale(z), 10);
    }
  });

  it('matches the composer, or previews would lie about placement', () => {
    // Compose one prop at depth and read back the scale the composer applied.
    const prop: StoryProp = { t: 'lib', k: 'sunflower', x: 0, z: 1, h: 1.6, f: false, e: 0 };
    const svg = composeFrame([prop], { ppm: 30 });
    const composedScale = Number(/scale\(([\d.]+),/.exec(svg)![1]);
    // The composer's scale folds in bbox mapping; compare the depth factor by
    // dividing out the near-plane case, where depthScale is 1.
    const flat = composeFrame([{ ...prop, z: SCENE.zMax }], { ppm: 30 });
    const flatScale = Number(/scale\(([\d.]+),/.exec(flat)![1]);
    // Tolerance absorbs the composer's output rounding. The point of this test
    // is to catch a divergence in the depth *model* — changing the 0.16
    // coefficient in one file and not the other — which would be far larger.
    expect(composedScale / flatScale).toBeCloseTo(depthScale(1), 3);
  });
});

describe('frontProject', () => {
  it('puts a centred, grounded prop on the ground line at centre', () => {
    // The near plane is where the ground line sits: a prop out by the visitor.
    expect(frontProject(0, SCENE.zMax, 0)).toEqual({ x: FRONT.w / 2, y: FRONT.groundY });
  });

  it('moves right for positive x and left for negative', () => {
    expect(frontProject(1, 0).x).toBeGreaterThan(FRONT.w / 2);
    expect(frontProject(-1, 0).x).toBeLessThan(FRONT.w / 2);
  });

  it('raises props up the frame as they recede', () => {
    // Receding now means moving toward the wall, i.e. smaller z.
    expect(frontProject(0, 1).y).toBeLessThan(frontProject(0, SCENE.zMax).y);
  });

  it('raises props further when lifted off the ground', () => {
    expect(frontProject(0, 0, 1).y).toBeLessThan(frontProject(0, 0, 0).y);
  });

  it('compresses horizontal offset with depth', () => {
    const near = frontProject(2, SCENE.zMax).x - FRONT.w / 2;
    const far = frontProject(2, 0).x - FRONT.w / 2;
    expect(far).toBeLessThan(near);
  });
});

describe('frontUnprojectX', () => {
  it('round-trips with frontProject at any depth', () => {
    for (const z of [0, 1.5, 3, 4.6]) {
      for (const x of [-3, -0.5, 0, 1.25, 3]) {
        expect(frontUnprojectX(frontProject(x, z).x, z)).toBeCloseTo(x, 6);
      }
    }
  });
});

describe('topProject / topUnproject', () => {
  it('puts the wall at the top edge and the visitor at the bottom', () => {
    expect(topProject(0, 0).y).toBe(0);
    expect(topProject(0, TOP.zr).y).toBeCloseTo(TOP.h, 6);
  });

  it('centres x=0', () => {
    expect(topProject(0, 0).x).toBe(TOP.w / 2);
  });

  it('round-trips', () => {
    for (const [x, z] of [
      [0, 0],
      [1.5, 2],
      [-2.2, 4],
      [3.4, 4.6],
    ]) {
      const p = topProject(x, z);
      const back = topUnproject(p.x, p.y);
      expect(back.x).toBeCloseTo(x, 6);
      expect(back.z).toBeCloseTo(z, 6);
    }
  });

  it('clamps a drag outside the plan to its edges', () => {
    expect(topUnproject(-9999, -9999)).toEqual({ x: -TOP.xr, z: 0 });
    expect(topUnproject(9999, 9999)).toEqual({ x: TOP.xr, z: TOP.zr });
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
