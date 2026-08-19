import { describe, it, expect } from 'vitest';
import { nextReticleMode } from './reticle';

describe('nextReticleMode', () => {
  it('aims at the surface it found', () => {
    expect(nextReticleMode(false, true)).toBe('tracking');
  });

  it('asks the user to keep looking when no surface is under the crosshair', () => {
    expect(nextReticleMode(false, false)).toBe('searching');
  });

  // The bug this function exists to prevent: after placement the loop set
  // 'searching', which parks the amber head-locked pulse in the middle of the
  // screen — drawn over the whole scene, since it renders with depthTest off —
  // for the rest of the session, exactly while the user is trying to look at
  // the diorama.
  it('shows nothing once the story is planted and a surface is still tracked', () => {
    expect(nextReticleMode(true, true)).toBe('hidden');
  });

  it('shows nothing once the story is planted and tracking has been lost', () => {
    expect(nextReticleMode(true, false)).toBe('hidden');
  });

  it('never shows a ring after placement, whatever the hit-test reports', () => {
    for (const hasPose of [true, false]) {
      expect(nextReticleMode(true, hasPose)).toBe('hidden');
    }
  });
});
