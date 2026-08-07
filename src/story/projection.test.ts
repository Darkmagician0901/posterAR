import { describe, it, expect } from 'vitest';
import { SCENE, cameraDepth, depthScale } from './projection';

describe('SCENE', () => {
  it('spans the calibrated range shared by every view', () => {
    expect(SCENE.xHalf).toBe(3.4);
    expect(SCENE.zMax).toBe(4.6);
  });
});

describe('cameraDepth', () => {
  it('is the near distance at the front plane', () => {
    expect(cameraDepth(0)).toBeCloseTo(1.9, 10);
  });

  it('grows one metre of camera depth per metre of scene depth', () => {
    expect(cameraDepth(2.3)).toBeCloseTo(4.2, 10);
    expect(cameraDepth(SCENE.zMax)).toBeCloseTo(6.5, 10);
  });

  it('clamps outside the scene rather than producing a negative depth', () => {
    expect(cameraDepth(-5)).toBeCloseTo(cameraDepth(0), 10);
    expect(cameraDepth(99)).toBeCloseTo(cameraDepth(SCENE.zMax), 10);
  });
});

describe('depthScale', () => {
  it('is 1 at the front plane', () => {
    expect(depthScale(0)).toBe(1);
  });

  it('shrinks with depth, on the pinhole law', () => {
    expect(depthScale(2.3)).toBeCloseTo(0.4523809, 6);
    expect(depthScale(SCENE.zMax)).toBeCloseTo(0.2923076, 6);
  });

  it('is the reciprocal of camera depth, normalised to the front plane', () => {
    for (const z of [0, 1.15, 2.3, 3.45, 4.6]) {
      expect(depthScale(z)).toBeCloseTo(1.9 / cameraDepth(z), 10);
    }
  });
});
