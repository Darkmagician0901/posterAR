import { describe, it, expect } from 'vitest'
import { GifPlayhead } from './gifPlayhead'

describe('GifPlayhead', () => {
  it('does not advance a single-frame gif', () => {
    const p = new GifPlayhead([100])
    expect(p.advance(1000)).toBe(false)
    expect(p.frameIndex).toBe(0)
  })

  it('advances only after the per-frame delay elapses', () => {
    const p = new GifPlayhead([100, 100])
    expect(p.advance(50)).toBe(false)
    expect(p.frameIndex).toBe(0)
    expect(p.advance(60)).toBe(true) // 110ms total >= 100
    expect(p.frameIndex).toBe(1)
  })

  it('loops back to frame 0 at the end', () => {
    const p = new GifPlayhead([100, 100])
    p.advance(100)
    expect(p.frameIndex).toBe(1)
    p.advance(100)
    expect(p.frameIndex).toBe(0)
  })

  it('floors sub-20ms delays to 100ms (browser behavior)', () => {
    const p = new GifPlayhead([0, 0])
    expect(p.advance(99)).toBe(false)
    expect(p.advance(2)).toBe(true) // 101ms >= floored 100
    expect(p.frameIndex).toBe(1)
  })

  it('skips multiple frames on a large delta', () => {
    const p = new GifPlayhead([100, 100, 100])
    expect(p.advance(250)).toBe(true)
    expect(p.frameIndex).toBe(2)
  })
})
