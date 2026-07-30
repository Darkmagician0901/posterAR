import { describe, expect, it, vi } from 'vitest';
import { checkComposable } from './assetGuard';

vi.mock('@/utils/gifDecode', () => ({
  decodeGifFrames: (buf: ArrayBuffer) =>
    // Byte 0 stands in for the frame count in these fixtures.
    new Array(new Uint8Array(buf)[0] ?? 1).fill({}),
}));

const gifWithFrames = (n: number): ArrayBuffer => new Uint8Array([n]).buffer;

describe('checkComposable', () => {
  it('accepts a webp', () => {
    expect(checkComposable('image/webp', new ArrayBuffer(4))).toEqual({ ok: true });
  });

  it('accepts a single-frame gif', () => {
    expect(checkComposable('image/gif', gifWithFrames(1))).toEqual({ ok: true });
  });

  it('rejects an animated gif with a reason a person can act on', () => {
    const result = checkComposable('image/gif', gifWithFrames(12));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/animat/i);
      expect(result.reason.length).toBeGreaterThan(20);
    }
  });

  // A GIF that cannot be decoded must not be assumed safe.
  it('rejects a gif whose frames cannot be counted', async () => {
    vi.resetModules();
    vi.doMock('@/utils/gifDecode', () => ({
      decodeGifFrames: () => {
        throw new Error('corrupt');
      },
    }));
    const { checkComposable: guard } = await import('./assetGuard');
    expect(guard('image/gif', new ArrayBuffer(4)).ok).toBe(false);
  });
});
