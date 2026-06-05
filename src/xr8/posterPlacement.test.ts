import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Group, Texture, MeshBasicMaterial } from 'three'
import { PosterPlacement } from './posterPlacement'

// Mock posterTextureCache so we can spy on releasePosterTexture without
// importing three.js canvas machinery.
vi.mock('@/xr8/posterTextureCache', () => ({
  releasePosterTexture: vi.fn(),
  acquirePosterTexture: vi.fn(),
  __resetPosterTextureCache: vi.fn(),
}))

import { releasePosterTexture } from '@/xr8/posterTextureCache'

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PosterPlacement', () => {
  it('places a poster and tracks it', () => {
    const pp = new PosterPlacement(new Group())
    const id = pp.place(IDENTITY, new Texture(), 1, 'p1', 'https://example.com/img.webp', null)
    expect(id).toBe('p1')
    expect(pp.size()).toBe(1)
  })

  it('ticks each poster animator with the delta', () => {
    const pp = new PosterPlacement(new Group())
    const animator = { update: vi.fn(), dispose: vi.fn() }
    pp.place(IDENTITY, new Texture(), 1, 'p1', 'https://example.com/img.gif', animator)
    pp.tick(16)
    expect(animator.update).toHaveBeenCalledWith(16)
  })

  it('ticks a shared animator exactly once even when multiple posters reference it', () => {
    const pp = new PosterPlacement(new Group())
    const sharedAnimator = { update: vi.fn(), dispose: vi.fn() }
    const sharedTexture = new Texture()
    const url = 'https://example.com/shared.gif'
    pp.place(IDENTITY, sharedTexture, 1, 'p1', url, sharedAnimator)
    pp.place(IDENTITY, sharedTexture, 1, 'p2', url, sharedAnimator)
    pp.place(IDENTITY, sharedTexture, 1, 'p3', url, sharedAnimator)
    pp.tick(16)
    expect(sharedAnimator.update).toHaveBeenCalledTimes(1)
    expect(sharedAnimator.update).toHaveBeenCalledWith(16)
  })

  it('disposes geometry and material on remove, and delegates texture/animator to the cache', () => {
    const pp = new PosterPlacement(new Group())
    const texture = new Texture()
    const animator = { update: vi.fn(), dispose: vi.fn() }
    const url = 'https://example.com/poster.gif'
    pp.place(IDENTITY, texture, 1, 'p1', url, animator)

    const record = pp.list()[0]
    const geoSpy = vi.spyOn(record.mesh.geometry, 'dispose')
    const matSpy = vi.spyOn(record.mesh.material as MeshBasicMaterial, 'dispose')
    const texSpy = vi.spyOn(texture, 'dispose')

    pp.remove('p1')

    expect(geoSpy).toHaveBeenCalled()
    expect(matSpy).toHaveBeenCalled()
    // Texture must NOT be disposed directly — the cache owns it.
    expect(texSpy).not.toHaveBeenCalled()
    // Animator must NOT be disposed directly — the cache owns it.
    expect(animator.dispose).not.toHaveBeenCalled()
    // Cache must be notified so it can decrement the refcount.
    expect(releasePosterTexture).toHaveBeenCalledWith(url)
    expect(pp.size()).toBe(0)
  })
})
