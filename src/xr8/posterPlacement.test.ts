import { describe, it, expect, vi } from 'vitest'
import { Group, Texture, MeshBasicMaterial } from 'three'
import { PosterPlacement } from './posterPlacement'

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

describe('PosterPlacement', () => {
  it('places a poster and tracks it', () => {
    const pp = new PosterPlacement(new Group())
    const id = pp.place(IDENTITY, new Texture(), 1, 'p1', null)
    expect(id).toBe('p1')
    expect(pp.size()).toBe(1)
  })

  it('ticks each poster animator with the delta', () => {
    const pp = new PosterPlacement(new Group())
    const animator = { update: vi.fn(), dispose: vi.fn() }
    pp.place(IDENTITY, new Texture(), 1, 'p1', animator)
    pp.tick(16)
    expect(animator.update).toHaveBeenCalledWith(16)
  })

  it('disposes geometry, material, texture, and animator on remove', () => {
    const pp = new PosterPlacement(new Group())
    const texture = new Texture()
    const animator = { update: vi.fn(), dispose: vi.fn() }
    pp.place(IDENTITY, texture, 1, 'p1', animator)

    const record = pp.list()[0]
    const geoSpy = vi.spyOn(record.mesh.geometry, 'dispose')
    const matSpy = vi.spyOn(record.mesh.material as MeshBasicMaterial, 'dispose')
    const texSpy = vi.spyOn(texture, 'dispose')

    pp.remove('p1')

    expect(geoSpy).toHaveBeenCalled()
    expect(matSpy).toHaveBeenCalled()
    expect(texSpy).toHaveBeenCalled()
    expect(animator.dispose).toHaveBeenCalled()
    expect(pp.size()).toBe(0)
  })
})
