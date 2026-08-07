import { describe, it, expect } from 'vitest';
import { SCENE, cameraDepth, depthScale } from './projection';

describe('SCENE', () => {
  it('spans the calibrated range shared by every view', () => {
    expect(SCENE.xHalf).toBe(3.4);
    expect(SCENE.zMax).toBe(4.6);
  });
});

describe('cameraDepth', () => {
  it('puts the wall furthest away and the near plane closest', () => {
    // z is measured out from the wall, so z = 0 is the far plane.
    expect(cameraDepth(0)).toBeCloseTo(6.5, 10);
    expect(cameraDepth(SCENE.zMax)).toBeCloseTo(1.9, 10);
  });

  it('loses one metre of camera depth per metre out from the wall', () => {
    expect(cameraDepth(2.3)).toBeCloseTo(4.2, 10);
  });

  it('clamps outside the scene rather than producing a negative depth', () => {
    expect(cameraDepth(-5)).toBeCloseTo(cameraDepth(0), 10);
    expect(cameraDepth(99)).toBeCloseTo(cameraDepth(SCENE.zMax), 10);
  });
});

describe('depthScale', () => {
  it('is 1 at the near plane, by the visitor', () => {
    expect(depthScale(SCENE.zMax)).toBe(1);
  });

  it('is smallest at the wall', () => {
    expect(depthScale(0)).toBeCloseTo(0.2923076, 6);
    expect(depthScale(0)).toBeLessThan(depthScale(2.3));
    expect(depthScale(2.3)).toBeLessThan(depthScale(SCENE.zMax));
  });

  it('is the reciprocal of camera depth, normalised to the near plane', () => {
    for (const z of [0, 1.15, 2.3, 3.45, 4.6]) {
      expect(depthScale(z)).toBeCloseTo(1.9 / cameraDepth(z), 10);
    }
  });
});
