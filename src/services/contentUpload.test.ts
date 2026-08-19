import { describe, expect, it, vi, beforeEach } from 'vitest';
import { uploadContent } from './contentUpload';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function presignOk(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('uploadContent', () => {
  it('sends the kind so the server picks the right prefix', async () => {
    fetchMock
      .mockResolvedValueOnce(presignOk({ exists: false, uploadUrl: 'https://s3/put', requiredHeaders: {} }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await uploadContent(new Blob([new Uint8Array([1, 2, 3])]), 'image/png', 'marker');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { kind: string };
    expect(body.kind).toBe('marker');
  });

  it('sends the base64 digest as the base64 form of the hex one', async () => {
    fetchMock
      .mockResolvedValueOnce(presignOk({ exists: false, uploadUrl: 'https://s3/put', requiredHeaders: {} }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await uploadContent(new Blob([new Uint8Array([1, 2, 3])]), 'image/png', 'marker');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      sha256: string; sha256Base64: string;
    };
    expect(body.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(body.sha256Base64).toBe(Buffer.from(body.sha256, 'hex').toString('base64'));
  });

  it('skips the PUT when the server says the bytes are already stored', async () => {
    fetchMock.mockResolvedValueOnce(presignOk({ exists: true }, 200));

    const id = await uploadContent(new Blob([new Uint8Array([9])]), 'image/png', 'marker');

    expect(id).toMatch(/^[a-f0-9]{64}$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats a 412 as success, because it means identical bytes won the race', async () => {
    fetchMock
      .mockResolvedValueOnce(presignOk({ exists: false, uploadUrl: 'https://s3/put', requiredHeaders: {} }))
      .mockResolvedValueOnce(new Response(null, { status: 412 }));

    await expect(
      uploadContent(new Blob([new Uint8Array([1])]), 'image/png', 'marker'),
    ).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  it('throws when the upload fails for any other reason', async () => {
    fetchMock
      .mockResolvedValueOnce(presignOk({ exists: false, uploadUrl: 'https://s3/put', requiredHeaders: {} }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(
      uploadContent(new Blob([new Uint8Array([1])]), 'image/png', 'marker'),
    ).rejects.toThrow(/upload failed/);
  });
});
