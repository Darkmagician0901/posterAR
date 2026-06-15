/**
 * hitTestController.test.ts
 *
 * Unit tests for the pure `synthesizeWallPose` helper exported from
 * hitTestController.ts. The helper has no 8th Wall dependency and can be
 * tested in isolation. `readReticlePose` itself requires the XR8 global and is
 * covered by on-device manual testing (see TESTING.md).
 */

import { describe, it, expect } from 'vitest'
import { Matrix4, Vector3 } from 'three'
import { synthesizeWallPose } from './hitTestController'

// ── helpers ──────────────────────────────────────────────────────────────────

/** Decompose the returned Float32Array into a three.js Matrix4. */
function toMatrix4(pose: { matrix: Float32Array }): Matrix4 {
  return new Matrix4().fromArray(pose.matrix)
}

/** Extract a column from a Matrix4 as a Vector3 (ignores w). */
function col(m: Matrix4, index: 0 | 1 | 2 | 3): Vector3 {
  const e = m.elements // column-major: col `index` starts at element[index*4]
  const base = index * 4
  return new Vector3(e[base], e[base + 1], e[base + 2])
}

/** Extract the translation (column 3) from a Matrix4. */
function translation(m: Matrix4): Vector3 {
  return col(m, 3)
}

/** Local +Y axis of the matrix (= surface normal by convention). */
function localY(m: Matrix4): Vector3 {
  return col(m, 1)
}

const EPS = 1e-5

// ── tests ─────────────────────────────────────────────────────────────────────

describe('synthesizeWallPose', () => {
  it('returns vertical === true', () => {
    const point = new Vector3(0, 1, -2)
    const camera = new Vector3(0, 1.6, 0)
    const pose = synthesizeWallPose(point, camera)
    expect(pose.vertical).toBe(true)
  })

  it('translation equals pointPos', () => {
    const point = new Vector3(1.5, 0.8, -3.0)
    const camera = new Vector3(0, 1.6, 0)
    const pose = synthesizeWallPose(point, camera)
    const t = translation(toMatrix4(pose))
    expect(t.x).toBeCloseTo(point.x, 5)
    expect(t.y).toBeCloseTo(point.y, 5)
    expect(t.z).toBeCloseTo(point.z, 5)
  })

  it('local +Y (surface normal) points horizontally from point toward camera', () => {
    // Camera is 2 m in front (−Z) of the feature point, same height.
    // Expected normal: (0, 0, 1) pointing from wall toward camera.
    const point = new Vector3(0, 1, -2)
    const camera = new Vector3(0, 1, 0) // directly in front, y matches
    const pose = synthesizeWallPose(point, camera)
    const normal = localY(toMatrix4(pose))

    // The normal's y component must be ~0 (horizontal).
    expect(Math.abs(normal.y)).toBeLessThan(EPS)

    // Compute expected horizontal direction: camera − point, y=0, normalized.
    const expected = new Vector3(
      camera.x - point.x,
      0,
      camera.z - point.z,
    ).normalize()
    expect(normal.x).toBeCloseTo(expected.x, 4)
    expect(normal.z).toBeCloseTo(expected.z, 4)
  })

  it('local +Y is a unit vector', () => {
    const point = new Vector3(-1, 0.9, -1.5)
    const camera = new Vector3(0.3, 1.6, 0.1)
    const pose = synthesizeWallPose(point, camera)
    const normal = localY(toMatrix4(pose))
    expect(normal.length()).toBeCloseTo(1, 5)
  })

  it('basis is orthonormal — columns are unit-length and mutually perpendicular', () => {
    const point = new Vector3(0.5, 1.2, -2.5)
    const camera = new Vector3(0, 1.6, 0)
    const m = toMatrix4(synthesizeWallPose(point, camera))
    const x = col(m, 0)
    const y = col(m, 1)
    const z = col(m, 2)

    expect(x.length()).toBeCloseTo(1, 5)
    expect(y.length()).toBeCloseTo(1, 5)
    expect(z.length()).toBeCloseTo(1, 5)

    expect(x.dot(y)).toBeCloseTo(0, 5)
    expect(x.dot(z)).toBeCloseTo(0, 5)
    expect(y.dot(z)).toBeCloseTo(0, 5)
  })

  it('degenerate case — camera directly above point — returns finite, normalized basis (no NaNs)', () => {
    // Camera is directly above the feature point: horizontal offset ~0.
    // The fallback should kick in and return a stable pose.
    const point = new Vector3(1, 0, 1)
    const camera = new Vector3(1, 1.6, 1) // same XZ as point

    const pose = synthesizeWallPose(point, camera)
    const m = toMatrix4(pose)
    const x = col(m, 0)
    const y = col(m, 1)
    const z = col(m, 2)

    // None of the components should be NaN or Infinity.
    for (const v of [x, y, z]) {
      expect(isFinite(v.x)).toBe(true)
      expect(isFinite(v.y)).toBe(true)
      expect(isFinite(v.z)).toBe(true)
    }

    // Columns should still be unit-length after the fallback.
    expect(x.length()).toBeCloseTo(1, 5)
    expect(y.length()).toBeCloseTo(1, 5)
    expect(z.length()).toBeCloseTo(1, 5)
  })

  it('camera with a different Y from the point — normal y is still ~0', () => {
    // Camera is 1.5 m higher than the feature point AND displaced horizontally.
    const point = new Vector3(0, 0.5, -2)
    const camera = new Vector3(0.3, 2.0, 0.5) // large Y delta
    const pose = synthesizeWallPose(point, camera)
    const normal = localY(toMatrix4(pose))
    // Y-component must be zero because we project out the vertical component.
    expect(Math.abs(normal.y)).toBeLessThan(EPS)
  })
})
