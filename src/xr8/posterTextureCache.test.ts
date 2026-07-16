import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Texture } from 'three';

// ── mock gifAnimator ───────────────────────────────────────────────────────
// We must mock before importing the module under test so the factory runs
// with the mock in place.
vi.mock('@/xr8/gifAnimator', () => ({
  createPosterTexture: vi.fn(),
}));

import { createPosterTexture } from '@/xr8/gifAnimator';
import {
  acquirePosterTexture,
  releasePosterTexture,
  __resetPosterTextureCache,
  ANIMATION_BYTE_BUDGET,
} from './posterTextureCache';

// Convenience: cast the mock so TypeScript knows it's a vi.Mock.
const mockCreate = createPosterTexture as ReturnType<typeof vi.fn>;

/** Build a fake PosterTexture-like result for mockCreate to return. */
function makeResult(opts?: {
  animator?: { update: () => void; dispose: ReturnType<typeof vi.fn> } | null;
  decodedBytes?: number;
}) {
  const texture = new Texture();
  vi.spyOn(texture, 'dispose');
  const animator =
    opts?.animator !== undefined ? opts.animator : { update: vi.fn(), dispose: vi.fn() };
  return {
    texture,
    animator,
    aspect: 1,
    decodedBytes: opts?.decodedBytes ?? 0,
    fallbackReason: undefined,
  };
}

beforeEach(() => {
  __resetPosterTextureCache();
  mockCreate.mockReset();
});

// ── sharing ────────────────────────────────────────────────────────────────

describe('acquirePosterTexture — sharing', () => {
  it('calls createPosterTexture only once for the same URL (shared on second call)', async () => {
    const result = makeResult();
    mockCreate.mockResolvedValue(result);

    const a1 = await acquirePosterTexture('https://example.com/poster.gif');
    const a2 = await acquirePosterTexture('https://example.com/poster.gif');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(a1.texture).toBe(a2.texture);
    expect(a1.animator).toBe(a2.animator);
  });

  it('returns distinct objects for distinct URLs', async () => {
    const r1 = makeResult();
    const r2 = makeResult();
    mockCreate.mockResolvedValueOnce(r1).mockResolvedValueOnce(r2);

    const a1 = await acquirePosterTexture('https://example.com/a.gif');
    const a2 = await acquirePosterTexture('https://example.com/b.gif');

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(a1.texture).not.toBe(a2.texture);
  });
});

// ── refcounting / disposal ─────────────────────────────────────────────────

describe('releasePosterTexture — refcounting', () => {
  it('does NOT dispose after the first of two releases', async () => {
    const result = makeResult();
    mockCreate.mockResolvedValue(result);

    await acquirePosterTexture('https://example.com/poster.gif');
    await acquirePosterTexture('https://example.com/poster.gif'); // refs = 2

    releasePosterTexture('https://example.com/poster.gif'); // refs = 1

    expect(result.texture.dispose).not.toHaveBeenCalled();
    expect(result.animator!.dispose).not.toHaveBeenCalled();
  });

  it('disposes texture and animator when the last reference is released', async () => {
    const result = makeResult();
    mockCreate.mockResolvedValue(result);

    await acquirePosterTexture('https://example.com/poster.gif');
    await acquirePosterTexture('https://example.com/poster.gif'); // refs = 2

    releasePosterTexture('https://example.com/poster.gif'); // refs = 1
    releasePosterTexture('https://example.com/poster.gif'); // refs = 0 → dispose

    expect(result.texture.dispose).toHaveBeenCalledTimes(1);
    expect(result.animator!.dispose).toHaveBeenCalledTimes(1);
  });

  it('re-decodes after all references are released (evicted from cache)', async () => {
    const r1 = makeResult();
    const r2 = makeResult();
    mockCreate.mockResolvedValueOnce(r1).mockResolvedValueOnce(r2);

    const url = 'https://example.com/poster.gif';
    await acquirePosterTexture(url); // refs = 1, calls create once
    releasePosterTexture(url); // refs = 0, evict

    await acquirePosterTexture(url); // refs = 1, must call create again

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('is a no-op for a URL not in the cache', () => {
    expect(() => releasePosterTexture('https://example.com/not-there.gif')).not.toThrow();
  });

  it('disposes only the animator for animated entries, not for static (animator null)', async () => {
    const result = makeResult({ animator: null, decodedBytes: 0 });
    mockCreate.mockResolvedValue(result);

    const url = 'https://example.com/static.webp';
    await acquirePosterTexture(url);
    releasePosterTexture(url); // should not throw even with null animator

    expect(result.texture.dispose).toHaveBeenCalledTimes(1);
  });
});

// ── concurrent acquires ────────────────────────────────────────────────────

describe('concurrent acquires of the same URL', () => {
  it('shares a single decode between overlapping acquires', async () => {
    const result = makeResult();
    let resolveLoad!: (r: ReturnType<typeof makeResult>) => void;
    mockCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const url = 'https://example.com/poster.gif';
    const p1 = acquirePosterTexture(url);
    const p2 = acquirePosterTexture(url); // starts before the first decode resolves

    resolveLoad(result);
    const [a1, a2] = await Promise.all([p1, p2]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(a1.texture).toBe(a2.texture);

    // Both references must be released before disposal happens.
    releasePosterTexture(url);
    expect(result.texture.dispose).not.toHaveBeenCalled();
    releasePosterTexture(url);
    expect(result.texture.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes the decode result when every ref is released before it resolves', async () => {
    const result = makeResult();
    let resolveLoad!: (r: ReturnType<typeof makeResult>) => void;
    mockCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const url = 'https://example.com/poster.gif';
    const p1 = acquirePosterTexture(url);
    releasePosterTexture(url); // released while still decoding — nobody owns the result

    resolveLoad(result);
    await p1;

    expect(result.texture.dispose).toHaveBeenCalledTimes(1);
    expect(result.animator!.dispose).toHaveBeenCalledTimes(1);
  });

  it('evicts a failed decode so a later acquire can retry', async () => {
    mockCreate.mockRejectedValueOnce(new Error('decode failed'));
    const url = 'https://example.com/poster.gif';
    await expect(acquirePosterTexture(url)).rejects.toThrow('decode failed');

    const result = makeResult();
    mockCreate.mockResolvedValueOnce(result);
    const a = await acquirePosterTexture(url);

    expect(a.texture).toBe(result.texture);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

// ── byte budget ────────────────────────────────────────────────────────────

describe('animation byte budget', () => {
  it('passes the full budget on the first acquire', async () => {
    const result = makeResult({ decodedBytes: 0 });
    mockCreate.mockResolvedValue(result);

    await acquirePosterTexture('https://example.com/a.gif');

    expect(mockCreate).toHaveBeenCalledWith('https://example.com/a.gif', {
      animationByteBudget: ANIMATION_BYTE_BUDGET,
    });
  });

  it('reduces the remaining budget by decodedBytes of the first entry', async () => {
    const bigBytes = 30 * 1024 * 1024; // 30 MB
    const r1 = makeResult({ decodedBytes: bigBytes });
    const r2 = makeResult({ decodedBytes: 0 });
    mockCreate.mockResolvedValueOnce(r1).mockResolvedValueOnce(r2);

    await acquirePosterTexture('https://example.com/first.gif');
    await acquirePosterTexture('https://example.com/second.gif');

    // Second call must receive the reduced remaining budget.
    const secondCallArgs = mockCreate.mock.calls[1];
    expect(secondCallArgs[1]).toEqual({ animationByteBudget: ANIMATION_BYTE_BUDGET - bigBytes });
  });

  it('passes 0 (or negative) remaining budget when the budget is exhausted', async () => {
    // Fill the entire budget with the first URL.
    const r1 = makeResult({ decodedBytes: ANIMATION_BYTE_BUDGET });
    const r2 = makeResult({ decodedBytes: 0 });
    mockCreate.mockResolvedValueOnce(r1).mockResolvedValueOnce(r2);

    await acquirePosterTexture('https://example.com/first.gif');
    await acquirePosterTexture('https://example.com/second.gif');

    const secondCallArgs = mockCreate.mock.calls[1];
    // Remaining budget is 0 — the second GIF should be told there's no room.
    expect(
      (secondCallArgs[1] as { animationByteBudget: number }).animationByteBudget,
    ).toBeLessThanOrEqual(0);
  });

  it('frees byte budget when the last reference to an animated entry is released', async () => {
    const bigBytes = 40 * 1024 * 1024; // 40 MB
    const r1 = makeResult({ decodedBytes: bigBytes });
    const r2 = makeResult({ decodedBytes: bigBytes });
    const r3 = makeResult({ decodedBytes: 0 });
    mockCreate.mockResolvedValueOnce(r1).mockResolvedValueOnce(r2).mockResolvedValueOnce(r3);

    const url1 = 'https://example.com/first.gif';
    const url2 = 'https://example.com/second.gif';
    const url3 = 'https://example.com/third.gif';

    await acquirePosterTexture(url1); // 40 MB used
    releasePosterTexture(url1); // freed → 0 MB used

    await acquirePosterTexture(url2); // 40 MB used again
    await acquirePosterTexture(url3); // remaining = BUDGET - 40 MB

    // Third call should see BUDGET minus r2's bytes (not cumulative with r1).
    const thirdCallArgs = mockCreate.mock.calls[2];
    expect((thirdCallArgs[1] as { animationByteBudget: number }).animationByteBudget).toBe(
      ANIMATION_BYTE_BUDGET - bigBytes,
    );
  });
});
