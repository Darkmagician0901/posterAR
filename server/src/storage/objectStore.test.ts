import { describe, it, expect } from 'vitest';
import { createObjectStore } from './objectStore';

const s3 = {
  endpoint: 'https://x.supabase.co/storage/v1/s3',
  region: 'us-east-1',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
  bucket: 'assets',
  publicBaseUrl: 'https://x.supabase.co/storage/v1/object/public/assets',
  forcePathStyle: true,
};

describe('objectStore', () => {
  it('builds a public URL from key', () => {
    const store = createObjectStore(s3);
    expect(store.publicUrl('a/b.webp')).toBe(
      'https://x.supabase.co/storage/v1/object/public/assets/a/b.webp',
    );
  });

  it('presigns a PUT URL that targets the bucket+key over https', async () => {
    const store = createObjectStore(s3);
    const url = await store.presignPut('a/b.webp', 'image/webp');
    expect(url).toMatch(/^https:\/\//);
    expect(url).toContain('/assets/a/b.webp');
    expect(url).toContain('X-Amz-Signature');
  });

  it('presigns virtual-hosted style against real AWS S3', async () => {
    // AWS treats path-style as legacy, so the bucket has to move into the
    // hostname rather than the path when forcePathStyle is off.
    const store = createObjectStore({
      ...s3,
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      publicBaseUrl: 'https://assets.s3.us-east-1.amazonaws.com',
      forcePathStyle: false,
    });
    const url = await store.presignPut('a/b.webp', 'image/webp');
    expect(url).toContain('https://assets.s3.us-east-1.amazonaws.com/a/b.webp');
    expect(url).toContain('X-Amz-Signature');
  });
});
