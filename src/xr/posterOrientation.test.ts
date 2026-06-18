/**
 * posterOrientation.test.ts
 *
 * Unit tests for the pure `composeFlatPosterMatrix` helper. No 8th Wall or
 * browser globals required — exercises the geometry directly.
 */

import { describe, it, expect } from 'vitest'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { composeFlatPosterMatrix } from './posterOrientation'

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build a hit-pose Float32Array from position + rotation (unit scale). */
function hitMatrix(pos: Vector3, quat: Quaternion = new Quaternion()): Float32Array {
  const m = new Matrix4().compose(pos, quat, new Vector3(1, 1, 1))
  return new Float32Array(m.elements)
}

function toMatrix4(arr: Float32Array): Matrix4 {
  return new Matrix4().fromArray(arr)
}

/** Column `i` of a Matrix4 as a Vector3. */
function col(m: Matrix4, i: 0 | 1 | 2 | 3): Vector3 {
  return new Vector3().setFromMatrixColumn(m, i)
}

/** Determinant of the 3x3 rotation part (via the basis vectors). */
function det3(m: Matrix4): number {
  const x = col(m, 0)
  const y = col(m, 1)
  const z = col(m, 2)
  return x.dot(new Vector3().crossVectors(y, z))
}

const EPS = 1e-5

// ── tests ─────────────────────────────────────────────────────────────────────

describe('composeFlatPosterMatrix', () => {
  it('lays the poster flat on a floor — facing axis (+Z) equals the surface normal', () => {
    // Identity hit rotation → surface normal is world up.
    const pose = hitMatrix(new Vector3(0, 0, -2))
    const camera = new Vector3(0, 1.5, 0)
    const m = toMatrix4(composeFlatPosterMatrix(pose, camera))

    const facing = col(m, 2) // poster +Z
    expect(facing.x).toBeCloseTo(0, 4)
    expect(facing.y).toBeCloseTo(1, 4) // points straight up → lies flat
    expect(facing.z).toBeCloseTo(0, 4)
  })

  it('points the image top (+Y) away from the camera, in the surface plane', () => {
    const pose = hitMatrix(new Vector3(0, 0, -2))
    const camera = new Vector3(0, 1.5, 0)
    const m = toMatrix4(composeFlatPosterMatrix(pose, camera))

    const up = col(m, 1) // image top
    // Must lie in the floor plane (no vertical component).
    expect(Math.abs(up.y)).toBeLessThan(EPS)
    // Camera (0,1.5,0) is at +Z relative to the poster (0,0,-2); the head points
    // AWAY from the viewer, so the in-plane top direction is -Z.
    expect(up.z).toBeCloseTo(-1, 4)
  })

  it('keeps the contact point as the translation', () => {
    const pos = new Vector3(1.2, 0.3, -3.4)
    const m = toMatrix4(composeFlatPosterMatrix(hitMatrix(pos), new Vector3(0, 1.6, 0)))
    const t = col(m, 3)
    expect(t.x).toBeCloseTo(pos.x, 5)
    expect(t.y).toBeCloseTo(pos.y, 5)
    expect(t.z).toBeCloseTo(pos.z, 5)
  })

  it('produces a right-handed, orthonormal basis (no mirroring)', () => {
    const m = toMatrix4(
      composeFlatPosterMatrix(hitMatrix(new Vector3(0.5, 0, -2)), new Vector3(0.3, 1.6, 0.2)),
    )
    const x = col(m, 0)
    const y = col(m, 1)
    const z = col(m, 2)

    expect(x.length()).toBeCloseTo(1, 5)
    expect(y.length()).toBeCloseTo(1, 5)
    expect(z.length()).toBeCloseTo(1, 5)
    expect(x.dot(y)).toBeCloseTo(0, 5)
    expect(x.dot(z)).toBeCloseTo(0, 5)
    expect(y.dot(z)).toBeCloseTo(0, 5)

    expect(det3(m)).toBeCloseTo(1, 4) // +1 → proper rotation, image not flipped
  })

  it('still lies flat when no camera is supplied (fallback spin)', () => {
    const m = toMatrix4(composeFlatPosterMatrix(hitMatrix(new Vector3(0, 0, -2)), null))
    const facing = col(m, 2)
    expect(facing.y).toBeCloseTo(1, 4) // flat on the floor
    // basis still orthonormal
    expect(col(m, 0).length()).toBeCloseTo(1, 5)
    expect(col(m, 1).length()).toBeCloseTo(1, 5)
    expect(det3(m)).toBeCloseTo(1, 4)
  })

  it('degenerate camera directly above the point → finite, orthonormal basis', () => {
    // Camera straight up from the poster: toward-camera projects to ~zero,
    // so the fallback spin must kick in.
    const m = toMatrix4(
      composeFlatPosterMatrix(hitMatrix(new Vector3(1, 0, 1)), new Vector3(1, 2, 1)),
    )
    for (const i of [0, 1, 2] as const) {
      const c = col(m, i)
      expect(Number.isFinite(c.x)).toBe(true)
      expect(Number.isFinite(c.y)).toBe(true)
      expect(Number.isFinite(c.z)).toBe(true)
      expect(c.length()).toBeCloseTo(1, 5)
    }
    expect(col(m, 2).y).toBeCloseTo(1, 4) // still flat
  })

  it('follows a tilted surface normal (facing axis tracks the hit normal)', () => {
    // Tilt the hit pose 30° about X so the surface normal leans.
    const quat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 6)
    const expectedNormal = new Vector3(0, 1, 0).applyQuaternion(quat).normalize()
    const m = toMatrix4(
      composeFlatPosterMatrix(hitMatrix(new Vector3(0, 0, -2), quat), new Vector3(0, 2, 1)),
    )
    const facing = col(m, 2)
    expect(facing.x).toBeCloseTo(expectedNormal.x, 4)
    expect(facing.y).toBeCloseTo(expectedNormal.y, 4)
    expect(facing.z).toBeCloseTo(expectedNormal.z, 4)
  })

  it('stands a poster upright on a wall — image top (+Y) points up', () => {
    // Wall: rotate the hit pose +90° about X so the surface normal points +Z
    // (toward a camera at +Z). The in-plane "up" should be world-up.
    const quat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)
    const m = toMatrix4(
      composeFlatPosterMatrix(hitMatrix(new Vector3(0, 1.5, -2), quat), new Vector3(0, 1.5, 0)),
    )
    const facing = col(m, 2) // +Z = surface normal
    expect(facing.z).toBeCloseTo(1, 4)

    const up = col(m, 1) // image top
    expect(up.y).toBeCloseTo(1, 3) // upright: top points up
    expect(Math.abs(up.x)).toBeLessThan(1e-3)
    expect(Math.abs(up.z)).toBeLessThan(1e-3)
  })

  it('points uphill on a tilted wall (gravity projected into the plane)', () => {
    // 60° leaning surface whose normal points up-and-toward the camera (+Z):
    // the in-plane up should keep a positive vertical component (uphill), not
    // flip downward.
    const quat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 3)
    const m = toMatrix4(
      composeFlatPosterMatrix(hitMatrix(new Vector3(0, 1, -2), quat), new Vector3(0, 1, 0)),
    )
    const up = col(m, 1)
    expect(up.y).toBeGreaterThan(0.2) // clearly upward, not sideways/inverted
  })
})
