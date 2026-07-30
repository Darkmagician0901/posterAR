import { describe, expect, it, vi, afterEach } from 'vitest';
import { uploadStoryAsset } from './assetApi';

const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadStoryAsset', () => {
  it('returns the content address without uploading on a dedup hit', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ exists: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const id = await uploadStoryAsset(blob(), 'image/webp');
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    // One call only: the presign request. Nothing is uploaded, and there is no
    // commit step to follow it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uploads with the exact headers the server requires', async () => {
    let putInit: RequestInit | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/story-assets')) {
        return new Response(
          JSON.stringify({
            exists: false,
            uploadUrl: 'https://store.example/assets/x/full.webp',
            requiredHeaders: { 'If-None-Match': '*', 'x-amz-checksum-sha256': 'zz' },
          }),
          { status: 201 },
        );
      }
      putInit = init;
      return new Response(null, { status: 200 });
    }));

    await uploadStoryAsset(blob(), 'image/webp');
    expect(putInit?.method).toBe('PUT');
    // The headers are SIGNED, so dropping one produces a signature mismatch.
    expect((putInit?.headers as Record<string, string>)['If-None-Match']).toBe('*');
    expect((putInit?.headers as Record<string, string>)['x-amz-checksum-sha256']).toBe('zz');
  });

  // S3 answers 412 when If-None-Match rejects the write because the object
  // already exists — a race with another uploader of identical bytes. The
  // bytes we wanted are there, so this is success.
  it('treats a 412 from S3 as success', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/story-assets')) {
        return new Response(
          JSON.stringify({ exists: false, uploadUrl: 'https://store.example/x', requiredHeaders: {} }),
          { status: 201 },
        );
      }
      return new Response(null, { status: 412 });
    }));

    await expect(uploadStoryAsset(blob(), 'image/webp')).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  it('throws with the status when the upload genuinely fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/story-assets')) {
        return new Response(
          JSON.stringify({ exists: false, uploadUrl: 'https://store.example/x', requiredHeaders: {} }),
          { status: 201 },
        );
      }
      return new Response(null, { status: 500 });
    }));

    await expect(uploadStoryAsset(blob(), 'image/webp')).rejects.toThrow(/500/);
  });

  it('throws when the presign request is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 400 })));
    await expect(uploadStoryAsset(blob(), 'image/webp')).rejects.toThrow(/400/);
  });

  it('produces the same id for identical bytes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ exists: true }), { status: 200 })));
    const a = await uploadStoryAsset(blob(), 'image/webp');
    const b = await uploadStoryAsset(blob(), 'image/webp');
    expect(a).toBe(b);
  });
});
