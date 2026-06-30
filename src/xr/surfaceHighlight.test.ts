import { describe, expect, it } from 'vitest'
import { Matrix4, Object3D } from 'three'
import { createSurfaceHighlight } from './surfaceHighlight'

describe('createSurfaceHighlight', () => {
  it('starts hidden and exposes an Object3D', () => {
    const h = createSurfaceHighlight()
    expect(h.object).toBeInstanceOf(Object3D)
    expect(h.object.visible).toBe(false)
  })

  it('setVisible toggles object visibility', () => {
    const h = createSurfaceHighlight()
    h.setVisible(true)
    expect(h.object.visible).toBe(true)
    h.setVisible(false)
    expect(h.object.visible).toBe(false)
  })

  it('setPose writes the matrix with matrixAutoUpdate disabled', () => {
    const h = createSurfaceHighlight()
    const m = new Matrix4().makeTranslation(1, 2, 3)
    h.setPose(new Float32Array(m.elements))
    expect(h.object.matrixAutoUpdate).toBe(false)
    expect(h.object.matrix.elements[12]).toBe(1)
    expect(h.object.matrix.elements[13]).toBe(2)
    expect(h.object.matrix.elements[14]).toBe(3)
  })

  it('setSize and dispose run without throwing', () => {
    const h = createSurfaceHighlight()
    expect(() => h.setSize(0.5, 0.7)).not.toThrow()
    expect(() => h.dispose()).not.toThrow()
  })
})
