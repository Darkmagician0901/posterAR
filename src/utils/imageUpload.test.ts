import { describe, it, expect, vi } from 'vitest'

vi.mock('@/utils/gifDecode', () => ({
  readGifSize: vi.fn(() => ({ width: 10, height: 10 })),
}))

import { validateImageFile, processImage, MAX_GIF_SIZE } from './imageUpload'

describe('imageUpload — GIF handling', () => {
  it('rejects GIFs over MAX_GIF_SIZE', () => {
    const fake = { type: 'image/gif', size: MAX_GIF_SIZE + 1 } as File
    const res = validateImageFile(fake)
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/8\s*MB/i)
  })

  it('accepts a small GIF', () => {
    const fake = { type: 'image/gif', size: 1000 } as File
    expect(validateImageFile(fake).valid).toBe(true)
  })

  it('preserves a GIF as image/gif without flattening to webp', async () => {
    const file = new File([new Uint8Array([0x47, 0x49, 0x46, 0x38])], 'a.gif', {
      type: 'image/gif',
    })
    const result = await processImage(file)
    expect(result.mimeType).toBe('image/gif')
    expect(result.dataUrl.startsWith('data:image/gif')).toBe(true)
    expect(result.width).toBe(10)
    expect(result.height).toBe(10)
  })
})
