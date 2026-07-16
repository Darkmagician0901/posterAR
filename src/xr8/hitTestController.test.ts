import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readReticlePose } from './hitTestController';

// readReticlePose reads the bare global `XR8`. Stub it on globalThis per test.
beforeEach(() => {
  delete (globalThis as { XR8?: unknown }).XR8;
});
afterEach(() => {
  delete (globalThis as { XR8?: unknown }).XR8;
});

describe('readReticlePose', () => {
  it('returns null when the engine is not loaded', () => {
    expect(readReticlePose()).toBeNull();
  });

  it('returns a flat pose on a horizontal hit', () => {
    (globalThis as { XR8?: unknown }).XR8 = {
      XrController: {
        hitTest: () => [
          {
            type: 'DETECTED_SURFACE',
            position: { x: 1, y: 0, z: -2 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            distance: 2,
          },
        ],
      },
    };
    const pose = readReticlePose();
    expect(pose).not.toBeNull();
    expect(pose?.vertical).toBe(false);
    // Translation column (matrix elements 12,13,14) = the hit position.
    expect(Array.from(pose!.matrix.slice(12, 15))).toEqual([1, 0, -2]);
  });
});
