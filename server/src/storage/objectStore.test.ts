import { describe, it, expect } from 'vitest'
import { createObjectStore } from './objectStore'

const s3 = {
  endpoint: 'https://x.supabase.co/storage/v1/s3',
  region: 'us-east-1',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
  bucket: 'assets',
  publicBaseUrl: 'https://x.supabase.co/storage/v1/object/public/assets',
}

describe('objectStore', () => {
  it('builds a public URL from key', () => {
    const store = createObjectStore(s3)
    expect(store.publicUrl('a/b.webp')).toBe(
      'https://x.supabase.co/storage/v1/object/public/assets/a/b.webp',
    )
  })

  it('presigns a PUT URL that targets the bucket+key over https', async () => {
    const store = createObjectStore(s3)
    const url = await store.presignPut('a/b.webp', 'image/webp')
    expect(url).toMatch(/^https:\/\//)
    expect(url).toContain('/assets/a/b.webp')
    expect(url).toContain('X-Amz-Signature')
  })
})
