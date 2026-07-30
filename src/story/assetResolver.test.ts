import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { clearAssetCache, resolveAssets } from './assetResolver';
import { TRANSPARENT_PIXEL } from './artTokens';

const SHA = 'a'.repeat(64);
const SHA2 = 'b'.repeat(64);

function okResponse(): Response {
  return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }), { status: 200 });
}

beforeEach(() => {
  clearAssetCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveAssets', () => {
  it('resolves a v4 reference to a data URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
    const map = await resolveAssets({ logo: { assetId: SHA, aspect: 1 } });
    expect(map.get('logo')).toMatch(/^data:/);
  });

  it('passes a v3 inline href through without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const href = 'data:image/webp;base64,AAA';
    const map = await resolveAssets({ old: { href, aspect: 1 } });
    expect(map.get('old')).toBe(href);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The whole point of the cache: N frames sharing an asset cost one fetch.
  it('fetches each distinct assetId only once across calls', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await resolveAssets({ a: { assetId: SHA, aspect: 1 } });
    await resolveAssets({ b: { assetId: SHA, aspect: 1 } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches distinct assetIds separately', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    await resolveAssets({ a: { assetId: SHA, aspect: 1 }, b: { assetId: SHA2, aspect: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to a transparent pixel on a network failure, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    const map = await resolveAssets({ logo: { assetId: SHA, aspect: 1 } });
    expect(map.get('logo')).toBe(TRANSPARENT_PIXEL);
  });

  it('falls back to a transparent pixel on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    const map = await resolveAssets({ logo: { assetId: SHA, aspect: 1 } });
    expect(map.get('logo')).toBe(TRANSPARENT_PIXEL);
  });

  it('returns an empty map for a document with no assets', async () => {
    await expect(resolveAssets({})).resolves.toEqual(new Map());
  });
});
