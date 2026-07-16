import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/posterApi', () => ({
  isPersistenceEnabled: () => true,
  persistAsset: vi.fn().mockResolvedValue({
    id: 'gen',
    url: 'https://pub/gen.webp',
    contentType: 'image/webp',
    isAnimated: false,
    width: 10,
    height: 20,
    originalName: 'a.webp',
  }),
}));

import { persistProcessedImage } from './usePosterUpload';
import { persistAsset } from '@/services/posterApi';
import type { ProcessedImage } from '@/utils/imageUpload';

const processed: ProcessedImage = {
  dataUrl: 'data:image/webp;base64,AAAA',
  width: 10,
  height: 20,
  compressedBytes: 3,
  originalBytes: 9,
  ratio: 3,
  quality: 0.9,
  mimeType: 'image/webp',
  originalName: 'a.webp',
};

beforeEach(() => vi.clearAllMocks());

describe('persistProcessedImage', () => {
  it('uploads the processed bytes and returns the remote url', async () => {
    const url = await persistProcessedImage(processed);
    expect(url).toBe('https://pub/gen.webp');
    expect(persistAsset).toHaveBeenCalledOnce();
    const arg = (persistAsset as unknown as vi.Mock).mock.calls[0][0];
    expect(arg.contentType).toBe('image/webp');
    expect(arg.isAnimated).toBe(false);
    expect(arg.blob).toBeInstanceOf(Blob);
  });

  it('returns null and does not throw when persistence fails', async () => {
    (persistAsset as unknown as vi.Mock).mockRejectedValueOnce(new Error('offline'));
    const url = await persistProcessedImage(processed);
    expect(url).toBeNull();
  });
});
