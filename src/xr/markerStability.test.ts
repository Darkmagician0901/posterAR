import { describe, expect, it } from 'vitest';
import { createStabilityTracker, type StabilitySample } from '@/xr/markerStability';

/** Identity orientation, used wherever a test only cares about position. */
const NO_ROT = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Builds a sample at a position, in millimetres for readability.
 *
 * @param t — Timestamp in milliseconds.
 * @param xMm — X offset in millimetres.
 * @returns The sample, with position converted to metres.
 */
function sampleAtMm(t: number, xMm: number): StabilitySample {
  return { t, position: { x: xMm / 1000, y: 0, z: 0 }, rotation: NO_ROT };
}

describe('createStabilityTracker', () => {
  it('reports zeros before any sample arrives', () => {
    const m = createStabilityTracker().read();
    expect(m).toEqual({
      samples: 0,
      updateHz: 0,
      positionJitterMm: 0,
      rotationJitterDeg: 0,
      positionPeakMm: 0,
    });
  });

  it('reports no jitter for a perfectly still marker', () => {
    const t = createStabilityTracker();
    for (let i = 0; i < 10; i++) t.add(sampleAtMm(i * 16, 0));
    const m = t.read();
    expect(m.samples).toBe(10);
    expect(m.positionJitterMm).toBeCloseTo(0);
    expect(m.rotationJitterDeg).toBeCloseTo(0);
  });

  it('computes RMS deviation from the window mean, not from the previous sample', () => {
    const t = createStabilityTracker();
    // Alternating +-2 mm about zero: the mean is 0, so every sample deviates
    // by exactly 2 mm and the RMS is 2 mm. A frame-to-frame metric would
    // instead report the 4 mm step between neighbours.
    for (let i = 0; i < 8; i++) t.add(sampleAtMm(i * 16, i % 2 === 0 ? 2 : -2));
    const m = t.read();
    expect(m.positionJitterMm).toBeCloseTo(2, 5);
    expect(m.positionPeakMm).toBeCloseTo(2, 5);
  });

  it('derives update rate from the sample intervals', () => {
    const t = createStabilityTracker();
    // 5 samples, 4 intervals of 20 ms = 80 ms span → 50 Hz.
    for (let i = 0; i < 5; i++) t.add(sampleAtMm(i * 20, 0));
    expect(t.read().updateHz).toBeCloseTo(50);
  });

  it('drops samples older than the window', () => {
    const t = createStabilityTracker(100);
    t.add(sampleAtMm(0, 500));
    t.add(sampleAtMm(50, 0));
    t.add(sampleAtMm(500, 0));
    // The 500 mm outlier is far outside the 100 ms window and must not
    // contaminate the readout.
    const m = t.read();
    expect(m.samples).toBe(1);
    expect(m.positionJitterMm).toBeCloseTo(0);
  });

  it('treats q and -q as the same rotation', () => {
    const t = createStabilityTracker();
    // A quaternion and its negation describe an identical orientation. If the
    // mean were computed without aligning signs, these would cancel out and
    // produce a large bogus jitter reading.
    t.add({ t: 0, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
    t.add({ t: 16, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: -1 } });
    t.add({ t: 32, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
    expect(t.read().rotationJitterDeg).toBeCloseTo(0, 4);
  });

  it('measures a real angular wobble', () => {
    const t = createStabilityTracker();
    // +-1 degree about Y: half-angle is 0.5 deg in the quaternion.
    const half = (1 * Math.PI) / 180 / 2;
    for (let i = 0; i < 8; i++) {
      const s = i % 2 === 0 ? 1 : -1;
      t.add({
        t: i * 16,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: Math.sin(half) * s, z: 0, w: Math.cos(half) },
      });
    }
    // Mean orientation is the identity, each sample sits 1 deg away.
    expect(t.read().rotationJitterDeg).toBeCloseTo(1, 3);
  });

  it('reset clears the window', () => {
    const t = createStabilityTracker();
    t.add(sampleAtMm(0, 5));
    t.add(sampleAtMm(16, -5));
    t.reset();
    expect(t.read().samples).toBe(0);
  });
});
