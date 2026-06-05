import { describe, it, expect } from 'vitest'
import { dataUrlToArrayBuffer } from './gifAnimator'

describe('dataUrlToArrayBuffer', () => {
  it('round-trips a base64 data: URL back to the original bytes', () => {
    const original = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0xde, 0xad, 0xbe, 0xef])
    const base64 = btoa(String.fromCharCode(...original))
    const dataUrl = `data:image/gif;base64,${base64}`

    const result = new Uint8Array(dataUrlToArrayBuffer(dataUrl))

    expect(result).toHaveLength(original.length)
    for (let i = 0; i < original.length; i++) {
      expect(result[i]).toBe(original[i])
    }
  })

  it('returns an ArrayBuffer', () => {
    const dataUrl = `data:image/gif;base64,${btoa('hello')}`
    const result = dataUrlToArrayBuffer(dataUrl)
    expect(result).toBeInstanceOf(ArrayBuffer)
  })

  it('throws for a malformed data URL with no comma', () => {
    expect(() => dataUrlToArrayBuffer('data:image/gif;base64')).toThrow('malformed data URL')
  })

  it('handles a percent-encoded (non-base64) data URL', () => {
    const payload = 'GIF'
    const dataUrl = `data:image/gif,${encodeURIComponent(payload)}`
    const result = new Uint8Array(dataUrlToArrayBuffer(dataUrl))
    const expected = new Uint8Array([0x47, 0x49, 0x46])
    expect(result).toHaveLength(expected.length)
    for (let i = 0; i < expected.length; i++) {
      expect(result[i]).toBe(expected[i])
    }
  })
})
