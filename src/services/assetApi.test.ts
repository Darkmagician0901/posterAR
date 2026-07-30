import { describe, expect, it, vi, afterEach } from 'vitest';
import { uploadStoryAsset } from './assetApi';
import { hexToBase64 } from '@/story/assetHash';

const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadStoryAsset', () => {
  it('returns the content address without uploading on a dedup hit', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ exists: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { assetId } = await uploadStoryAsset(blob(), 'image/webp');
    expect(assetId).toMatch(/^[a-f0-9]{64}$/);
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

  // The server refuses any presign whose checksum is not the base64 form of
  // the address being written (that check is what stops anyone overwriting a
  // published asset). This client must therefore always send the two forms of
  // ONE digest — the hash of the bytes it is about to PUT.
  it('asks for an address that is the hash of the bytes it is uploading', async () => {
    let presignBody: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/story-assets')) {
        presignBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      }
      return new Response(JSON.stringify({ exists: true }), { status: 200 });
    }));

    const { assetId } = await uploadStoryAsset(blob(), 'image/webp');
    expect(presignBody.sha256).toBe(assetId);
    expect(presignBody.sha256Base64).toBe(hexToBase64(assetId));
    // The parameter that let a caller name an address it had no bytes for.
    expect(presignBody).not.toHaveProperty('variant');
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

    await expect(uploadStoryAsset(blob(), 'image/webp')).resolves.toEqual({
      assetId: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
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
    expect(a.assetId).toBe(b.assetId);
  });
});

// The derivative is an ORDINARY asset under its OWN content address, not a
// slot beside its parent — see src/story/assetStorage.ts. These pin that both
// presign requests name the hash of the bytes each is uploading, and that the
// two ids come back distinct so the document can reference both.
describe('uploadStoryAsset with a derivative', () => {
  const derivative = () => new Blob([new Uint8Array([9, 9, 9, 9])], { type: 'image/webp' });

  function stubTwoUploads(): {
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

  it('stores the derivative under its own hash and returns both ids', async () => {
    const { presignBodies, putCount } = stubTwoUploads();

    const { assetId, r1024Id } = await uploadStoryAsset(blob(), 'image/webp', derivative());

    expect(assetId).toMatch(/^[a-f0-9]{64}$/);
    expect(r1024Id).toMatch(/^[a-f0-9]{64}$/);
    // Different bytes, therefore a different address — the derivative is never
    // written to an address it does not hash to.
    expect(r1024Id).not.toBe(assetId);

    expect(presignBodies).toHaveLength(2);
    const [full, small] = presignBodies;
    expect(full.sha256).toBe(assetId);
    expect(small.sha256).toBe(r1024Id);
    expect(full.sha256Base64).toBe(hexToBase64(assetId));
    expect(small.sha256Base64).toBe(hexToBase64(String(r1024Id)));

    expect(putCount()).toBe(2);
  });

  it('is non-fatal when the derivative upload fails — the asset still stands', async () => {
    let firstPresign = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/story-assets')) {
          if (!firstPresign) return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
          firstPresign = false;
          return new Response(
            JSON.stringify({ exists: false, uploadUrl: 'https://store.example/x', requiredHeaders: {} }),
            { status: 201 },
          );
        }
        return new Response(null, { status: 200 });
      }),
    );

    const uploaded = await uploadStoryAsset(blob(), 'image/webp', derivative());
    expect(uploaded.assetId).toMatch(/^[a-f0-9]{64}$/);
    // No r1024Id at all, rather than one pointing at bytes that never landed:
    // publish refuses a reference whose derivative is missing.
    expect(uploaded.r1024Id).toBeUndefined();
  });

  it('does not swallow a primary upload failure when a derivative is also provided', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 400 })));
    await expect(uploadStoryAsset(blob(), 'image/webp', derivative())).rejects.toThrow(/400/);
  });

  it('skips the derivative step entirely when none is passed', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ exists: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const uploaded = await uploadStoryAsset(blob(), 'image/webp', null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(uploaded.r1024Id).toBeUndefined();
  });
});
