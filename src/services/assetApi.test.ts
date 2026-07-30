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

// The derivative rides the SAME parent content address as variant: 'r1024',
// never its own hash — see src/story/assetVariants.ts. These pin that both
// presign requests share `sha256` while diverging on `sha256Base64` (the
// checksum of the bytes actually being uploaded) and `variant`.
describe('uploadStoryAsset with a derivative', () => {
  const derivative = () => new Blob([new Uint8Array([9, 9, 9, 9])], { type: 'image/webp' });

  function stubTwoVariantUploads(): {
    presignBodies: Array<Record<string, unknown>>;
    putCount: () => number;
  } {
    const presignBodies: Array<Record<string, unknown>> = [];
    let putCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/api/story-assets')) {
          presignBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return new Response(
            JSON.stringify({
              exists: false,
              uploadUrl: 'https://store.example/x',
              requiredHeaders: { 'If-None-Match': '*' },
            }),
            { status: 201 },
          );
        }
        putCount += 1;
        return new Response(null, { status: 200 });
      }),
    );
    return { presignBodies, putCount: () => putCount };
  }

  it('uploads the derivative under the parent sha256 as variant r1024', async () => {
    const { presignBodies, putCount } = stubTwoVariantUploads();

    const assetId = await uploadStoryAsset(blob(), 'image/webp', derivative());

    expect(assetId).toMatch(/^[a-f0-9]{64}$/);
    expect(presignBodies).toHaveLength(2);
    const [full, r1024] = presignBodies;

    expect(full.variant).toBe('full');
    expect(r1024.variant).toBe('r1024');
    // Both requests address the SAME parent — the derivative is never
    // addressed by its own hash.
    expect(full.sha256).toBe(assetId);
    expect(r1024.sha256).toBe(assetId);
    // But the checksum header is of the bytes actually being uploaded, so it
    // differs between the two distinct blobs.
    expect(full.sha256Base64).not.toBe(r1024.sha256Base64);

    expect(putCount()).toBe(2);
  });

  it('is non-fatal when the derivative upload fails — the asset still stands', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/api/story-assets')) {
          const parsed = JSON.parse(String(init?.body)) as Record<string, unknown>;
          if (parsed.variant === 'r1024') {
            return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
          }
          return new Response(
            JSON.stringify({ exists: false, uploadUrl: 'https://store.example/x', requiredHeaders: {} }),
            { status: 201 },
          );
        }
        return new Response(null, { status: 200 });
      }),
    );

    await expect(uploadStoryAsset(blob(), 'image/webp', derivative())).resolves.toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it('does not swallow a primary upload failure when a derivative is also provided', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 400 })));
    await expect(uploadStoryAsset(blob(), 'image/webp', derivative())).rejects.toThrow(/400/);
  });

  it('skips the derivative step entirely when none is passed', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ exists: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await uploadStoryAsset(blob(), 'image/webp', null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
