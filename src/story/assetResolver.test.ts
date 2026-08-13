import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  clearAssetCache,
  isAssetHostConfigured,
  resetAssetResolverWarnings,
  resolveAssets,
} from './assetResolver';
import { TRANSPARENT_PIXEL } from './artTokens';
import { assetKey } from './assetStorage';

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
  // (a divergence here is a silent, unfixable 404). The key comes from the one
  // shared builder on both sides, so a change to it moves both at once.
  it('fetches assets/<assetId>/full.webp, credentials omitted', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    await resolveAssets({ logo: { assetId: SHA, aspect: 1 } });
    expect(fetchMock).toHaveBeenCalledWith(`/${assetKey(SHA)}`, { credentials: 'omit' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // The derivative is a separate asset with its own address, so it is found
  // only by the id the document carries — and preferring it is the whole point
  // of storing one.
  it('resolves from r1024Id when the reference carries one', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const map = await resolveAssets({ logo: { assetId: SHA, r1024Id: SHA2, aspect: 1 } });
    expect(map.get('logo')).toMatch(/^data:/);
    expect(fetchMock).toHaveBeenCalledWith(`/${assetKey(SHA2)}`, { credentials: 'omit' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // A derivative that was reclaimed, never landed, or is simply absent must
  // not cost the image — the canonical bytes are still there.
  it('falls back to assetId when the r1024Id misses', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes(SHA2) ? new Response(null, { status: 404 }) : okResponse(),
    );
    vi.stubGlobal('fetch', fetchMock);
    const map = await resolveAssets({ logo: { assetId: SHA, r1024Id: SHA2, aspect: 1 } });
    expect(map.get('logo')).toMatch(/^data:/);
    expect(fetchMock).toHaveBeenNthCalledWith(1, `/${assetKey(SHA2)}`, { credentials: 'omit' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/${assetKey(SHA)}`, { credentials: 'omit' });
  });

  // Neither id resolves — must still fall through to the transparent pixel
  // rather than throwing.
  it('falls back to a transparent pixel when both ids 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    const map = await resolveAssets({ logo: { assetId: SHA, r1024Id: SHA2, aspect: 1 } });
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

  // A console.warn is the only runtime signal that this is unset, and nobody
  // is watching a console at an exhibit. PublishDialog reads this to say so
  // where an operator will actually see it.
  it('reports the unset base URL as unconfigured', () => {
    expect(isAssetHostConfigured()).toBe(false);
  });
});
