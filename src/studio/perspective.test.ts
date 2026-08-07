import { describe, it, expect } from 'vitest';
import { project, groundGrid, SCENE } from './perspective';
import { NEAR_M } from '@/story/projection';

describe('project', () => {
  it('renders a farther prop smaller and higher (the depth-sign guard)', () => {
    const near = project(0, 0, 0, 0);
    const far = project(0, 0, 4, 0);
    expect(far.k).toBeLessThan(near.k); // smaller
    expect(far.y).toBeLessThan(near.y); // higher up the frame
  });

  it('displaces near props more than far props under equal pan', () => {
    const nearShift = Math.abs(project(0, 0, 0, 1).x - project(0, 0, 0, 0).x);
    const farShift = Math.abs(project(0, 0, 4, 1).x - project(0, 0, 4, 0).x);
    expect(nearShift).toBeGreaterThan(farShift);
  });

  it('never lets depth reach zero', () => {
    // The shared model clamps z into the scene, so a depth behind the front
    // plane floors at the near distance rather than an arbitrary 0.5.
    expect(project(0, 0, -100, 0).d).toBe(NEAR_M);
  });
});

describe('groundGrid', () => {
  it('draws across-lines whose spacing shrinks with depth', () => {
    const across = groundGrid(0)
      .filter((_, i) => i <= Math.floor(SCENE.zMax / 0.5)) // the constant-z lines, near->far
      .map((l) => l.y1);
    const nearGap = Math.abs(across[0] - across[1]);
    const farGap = Math.abs(across[across.length - 2] - across[across.length - 1]);
    expect(nearGap).toBeGreaterThan(farGap);
  });
});
