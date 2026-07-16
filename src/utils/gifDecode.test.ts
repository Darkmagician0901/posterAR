import { describe, it, expect, vi } from 'vitest';

vi.mock('gifuct-js', () => ({
  parseGIF: vi.fn(() => ({
    lsd: { width: 32, height: 24 },
    // Two image frames + one extension block (only images count toward the
    // decode-size estimate).
    frames: [{ image: {} }, { image: {} }, { gce: {} }],
  })),
  decompressFrames: vi.fn(() => [
    {
      dims: { top: 0, left: 0, width: 32, height: 24 },
      patch: new Uint8ClampedArray(32 * 24 * 4),
      delay: 120,
      disposalType: 1,
    },
    {
      dims: { top: 2, left: 4, width: 8, height: 8 },
      patch: new Uint8ClampedArray(8 * 8 * 4),
      delay: 80,
      disposalType: 2,
    },
  ]),
}));

import { parseGIF } from 'gifuct-js';
import { readGifSize, decodeGifFrames } from './gifDecode';

const mockParseGIF = parseGIF as ReturnType<typeof vi.fn>;

describe('gifDecode', () => {
  it('reads logical screen size', () => {
    expect(readGifSize(new ArrayBuffer(8))).toEqual({ width: 32, height: 24 });
  });

  it('maps gifuct frames to DecodedFrame', () => {
    const frames = decodeGifFrames(new ArrayBuffer(8));
    expect(frames).toHaveLength(2);
    expect(frames[0].delayMs).toBe(120);
    expect(frames[0].disposalType).toBe(1);
    expect(frames[0].dims).toEqual({ top: 0, left: 0, width: 32, height: 24 });
    expect(frames[0].patch).toBeInstanceOf(Uint8ClampedArray);
    expect(frames[1].delayMs).toBe(80);
  });

  it('refuses to decompress a decode bomb (huge declared size)', () => {
    // 16384 × 16384 × 4 bytes × 2 frames ≈ 2 GiB decoded — over the 1 GiB cap.
    mockParseGIF.mockReturnValueOnce({
      lsd: { width: 16384, height: 16384 },
      frames: [{ image: {} }, { image: {} }],
    });

    expect(() => decodeGifFrames(new ArrayBuffer(8))).toThrow(/too large to decode/);
  });
});
