import { describe, expect, it, vi, beforeEach } from 'vitest';
import { uploadMarker } from './markerApi';

const uploadContent = vi.fn();
vi.mock('./contentUpload', () => ({
  uploadContent: (...args: unknown[]) => uploadContent(...args),
}));

beforeEach(() => {
  uploadContent.mockReset();
});

describe('uploadMarker', () => {
  const images = {
    luminance: new Blob([new Uint8Array([1])], { type: 'image/png' }),
    thumbnail: new Blob([new Uint8Array([2])], { type: 'image/png' }),
  };

  it('addresses each image by its own bytes, never the luminance hash twice', async () => {
    uploadContent.mockResolvedValueOnce('a'.repeat(64)).mockResolvedValueOnce('b'.repeat(64));

    const out = await uploadMarker(images);

    expect(out).toEqual({ markerId: 'a'.repeat(64), thumbId: 'b'.repeat(64) });
    expect(uploadContent).toHaveBeenNthCalledWith(1, images.luminance, 'image/png', 'marker');
    expect(uploadContent).toHaveBeenNthCalledWith(2, images.thumbnail, 'image/png', 'marker');
  });

  it('fails loudly when the thumbnail does not land', async () => {
    uploadContent.mockResolvedValueOnce('a'.repeat(64)).mockRejectedValueOnce(new Error('nope'));

    await expect(uploadMarker(images)).rejects.toThrow();
  });
});
