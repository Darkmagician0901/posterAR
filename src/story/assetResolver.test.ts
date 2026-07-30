import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { clearAssetCache, resetAssetResolverWarnings, resolveAssets } from './assetResolver';
import { TRANSPARENT_PIXEL } from './artTokens';

const SHA = 'a'.repeat(64);
const SHA2 = 'b'.repeat(64);

function okResponse(): Response {
  return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }), { status: 200 });
}

beforeEach(() => {
  clearAssetCache();
  resetAssetResolverWarnings();
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

  // Pins the key<->URL contract from the read side, mirroring the write side
  // pinned in api/story-assets.test.ts — the write key must be exactly what
  // this fetch requests, or the upload lands somewhere nothing ever reads
  // (see finding 1: a divergence here is a silent, unfixable 404). Pins BOTH
  // variants so a future divergence between the written key and the read URL
  // — the exact defect this note exists to prevent — fails a test instead of
  // going silent.
  it('fetches the r1024 derivative first, credentials omitted', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    await resolveAssets({ logo: { assetId: SHA, aspect: 1 } });
    expect(fetchMock).toHaveBeenCalledWith(`/assets/${SHA}/r1024.webp`, { credentials: 'omit' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // The derivative is preferred, but full.webp is what pre-derivative assets
  // have — so a miss on r1024 must fall through to it, at the exact key the
  // presign endpoint writes.
  it('falls back to assets/<assetId>/full.webp when r1024 misses', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('r1024.webp') ? new Response(null, { status: 404 }) : okResponse(),
    );
    vi.stubGlobal('fetch', fetchMock);
    const map = await resolveAssets({ logo: { assetId: SHA, aspect: 1 } });
    expect(map.get('logo')).toMatch(/^data:/);
    expect(fetchMock).toHaveBeenNthCalledWith(1, `/assets/${SHA}/r1024.webp`, { credentials: 'omit' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/assets/${SHA}/full.webp`, { credentials: 'omit' });
  });

  // Neither variant resolves — must still fall through to the transparent
  // pixel rather than throwing.
  it('falls back to a transparent pixel when both variants 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    const map = await resolveAssets({ logo: { assetId: SHA, aspect: 1 } });
    expect(map.get('logo')).toBe(TRANSPARENT_PIXEL);
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

  it('returns an empty map for a document with no assets', async () => {
    await expect(resolveAssets({})).resolves.toEqual(new Map());
  });

  // VITE_ASSET_BASE_URL is unset in the test env, so every resolution below
  // exercises the "unset" branch — this is what would otherwise silently
  // resolve every asset same-origin with no signal (see .env.example).
  it('warns once per session, not once per asset, when the base URL is unset', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));

    await resolveAssets({ a: { assetId: SHA, aspect: 1 }, b: { assetId: SHA2, aspect: 1 } });
    await resolveAssets({ a: { assetId: SHA, aspect: 1 } });

    const unsetWarnings = warn.mock.calls.filter(([msg]) =>
      String(msg).includes('VITE_ASSET_BASE_URL'),
    );
    expect(unsetWarnings).toHaveLength(1);
    warn.mockRestore();
  });
});
