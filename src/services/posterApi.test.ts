import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/constants', async (orig) => ({
  ...(await orig<typeof import('@/utils/constants')>()),
  API_BASE_URL: 'https://api.test',
}));
vi.mock('@/utils/deviceToken', () => ({ getDeviceToken: () => 'owner-x' }));

import { persistAsset, listAssets } from './posterApi';

beforeEach(() => vi.restoreAllMocks());

describe('persistAsset', () => {
  it('POSTs metadata then PUTs the bytes to the presigned url', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            uploadUrl: 'https://store/up?sig=1',
            asset: {
              id: 'id-1',
              url: 'https://pub/id-1.webp',
              contentType: 'image/webp',
              isAnimated: false,
              width: 10,
              height: 20,
              originalName: 'a.webp',
            },
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const asset = await persistAsset({
      id: 'id-1',
      blob: new Blob(['x']),
      contentType: 'image/webp',
      isAnimated: false,
      width: 10,
      height: 20,
      originalName: 'a.webp',
    });

    expect(asset.url).toBe('https://pub/id-1.webp');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/api/assets');
    expect(fetchMock.mock.calls[0][1].headers['x-owner-id']).toBe('owner-x');
    expect(fetchMock.mock.calls[1][0]).toBe('https://store/up?sig=1');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
  });
});

describe('listAssets', () => {
  it('GETs the asset list for the owner', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          assets: [
            {
              id: 'a',
              url: 'u',
              contentType: 'image/webp',
              isAnimated: false,
              width: 1,
              height: 1,
              originalName: null,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const list = await listAssets();
    expect(list).toHaveLength(1);
    expect(fetchMock.mock.calls[0][1].headers['x-owner-id']).toBe('owner-x');
  });
});
