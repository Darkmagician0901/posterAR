import { describe, it, expect } from 'vitest';
import { estimateAmbient, type AmbientColor } from './ambientProbe';

const WHITE: AmbientColor = { r: 1, g: 1, b: 1 };

// Build a flat RGBA buffer of `count` pixels, all the same color.
function flat(r: number, g: number, b: number, count: number): Uint8Array {
  const buf = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

describe('estimateAmbient', () => {
  it('clamps a dark scene to the brightness floor (steady state)', () => {
    // ema:1 -> ignore previous, return the target directly.
    const out = estimateAmbient(flat(10, 10, 10, 16), 16, WHITE, { ema: 1 });
    // Neutral color, luma 10 < 30 -> brightness floor 0.6, no color cast.
    expect(out.r).toBeCloseTo(0.6, 2);
    expect(out.g).toBeCloseTo(0.6, 2);
    expect(out.b).toBeCloseTo(0.6, 2);
  });

  it('leaves a bright neutral scene near full brightness', () => {
    const out = estimateAmbient(flat(220, 220, 220, 16), 16, WHITE, { ema: 1 });
    expect(out.r).toBeCloseTo(1, 2);
    expect(out.g).toBeCloseTo(1, 2);
    expect(out.b).toBeCloseTo(1, 2);
  });

  it('preserves a warm color cast (r > g > b) without over-saturating', () => {
    const out = estimateAmbient(flat(200, 120, 60, 16), 16, WHITE, { ema: 1 });
    expect(out.r).toBeGreaterThan(out.g);
    expect(out.g).toBeGreaterThan(out.b);
    expect(out.r).toBeLessThanOrEqual(1);
  });

  it('eases toward the target via EMA rather than jumping', () => {
    // One step from white toward a dark target with default ema 0.1.
    const out = estimateAmbient(flat(10, 10, 10, 16), 16, WHITE);
    // target ~0.6, so after one 0.1 step: 1 + (0.6 - 1) * 0.1 = 0.96.
    expect(out.r).toBeCloseTo(0.96, 2);
    // Repeated calls converge toward the target.
    let c: AmbientColor = WHITE;
    for (let i = 0; i < 200; i++) c = estimateAmbient(flat(10, 10, 10, 16), 16, c);
    expect(c.r).toBeCloseTo(0.6, 2);
  });

  it('returns the previous color unchanged when there are no pixels', () => {
    const prev: AmbientColor = { r: 0.3, g: 0.4, b: 0.5 };
    const out = estimateAmbient(new Uint8Array(0), 0, prev);
    expect(out).toEqual(prev);
  });
});
