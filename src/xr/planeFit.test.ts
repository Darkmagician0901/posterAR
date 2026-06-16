/**
 * planeFit.test.ts — unit tests for the pure RANSAC + PCA plane fitter.
 * No 8th Wall / browser globals; exercises the geometry with synthetic points.
 */
import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import { fitPlane } from './planeFit'

/** Deterministic LCG so RANSAC-dependent tests don't flake. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/** Grid of points on the plane through `origin` spanned by `a`, `b`. */
function planePoints(origin: Vector3, a: Vector3, b: Vector3, n = 5): Vector3[] {
  const pts: Vector3[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u = i / (n - 1) - 0.5
      const v = j / (n - 1) - 0.5
      pts.push(
        origin.clone().addScaledVector(a, u).addScaledVector(b, v),
      )
    }
  }
  return pts
}

describe('fitPlane', () => {
  it('returns null when there are too few points', () => {
    const pts = [new Vector3(0, 0, 0), new Vector3(1, 0, 0)]
    expect(fitPlane(pts, new Vector3(0, 1, 0))).toBeNull()
  })

  it('fits a horizontal plane and signs the normal toward the camera', () => {
    // Plane at y = 0 spanned by X and Z; camera above → normal should be +Y.
    const pts = planePoints(new Vector3(0, 0, -2), new Vector3(1, 0, 0), new Vector3(0, 0, 1))
    const plane = fitPlane(pts, new Vector3(0, 1.5, -2), { rng: seededRng(1) })
    expect(plane).not.toBeNull()
    expect(plane!.normal.x).toBeCloseTo(0, 2)
    expect(plane!.normal.y).toBeCloseTo(1, 2)
    expect(plane!.normal.z).toBeCloseTo(0, 2)
    expect(plane!.confidence).toBeGreaterThan(0.8)
  })

  it('fits a vertical (wall) plane with a horizontal normal toward the camera', () => {
    // Plane at z = -2 spanned by X and Y; camera at z = 0 → normal should be +Z.
    const pts = planePoints(new Vector3(0, 1, -2), new Vector3(1, 0, 0), new Vector3(0, 1, 0))
    const plane = fitPlane(pts, new Vector3(0, 1, 0), { rng: seededRng(2) })
    expect(plane).not.toBeNull()
    expect(Math.abs(plane!.normal.y)).toBeLessThan(0.1) // wall → near-horizontal normal
    expect(plane!.normal.z).toBeCloseTo(1, 2)
  })

  it('rejects outliers via RANSAC', () => {
    const pts = planePoints(new Vector3(0, 0, -2), new Vector3(1, 0, 0), new Vector3(0, 0, 1))
    // Add gross outliers well off the plane.
    pts.push(new Vector3(0, 0.8, -2), new Vector3(0.3, -0.7, -2))
    const plane = fitPlane(pts, new Vector3(0, 1.5, -2), { rng: seededRng(3) })
    expect(plane).not.toBeNull()
    expect(plane!.normal.y).toBeCloseTo(1, 1) // outliers didn't tilt the fit
    expect(plane!.inlierCount).toBeGreaterThanOrEqual(25)
  })

  it('reports an in-plane extent that covers the detected region', () => {
    // 1m x 1m horizontal patch → half-extents ≈ 0.5 along each in-plane axis.
    const pts = planePoints(new Vector3(0, 0, -2), new Vector3(1, 0, 0), new Vector3(0, 0, 1))
    const plane = fitPlane(pts, new Vector3(0, 1.5, -2), { rng: seededRng(4) })!
    expect(plane.extent.u).toBeGreaterThan(0.4)
    expect(plane.extent.u).toBeLessThan(0.6)
    expect(plane.extent.v).toBeGreaterThan(0.4)
    expect(plane.extent.v).toBeLessThan(0.6)
  })

  it('returns an orthonormal in-plane basis orthogonal to the normal', () => {
    const pts = planePoints(new Vector3(0, 0, -2), new Vector3(1, 0, 0), new Vector3(0, 0, 1))
    const p = fitPlane(pts, new Vector3(0, 1.5, -2), { rng: seededRng(5) })!
    expect(p.uAxis.length()).toBeCloseTo(1, 4)
    expect(p.vAxis.length()).toBeCloseTo(1, 4)
    expect(p.uAxis.dot(p.normal)).toBeCloseTo(0, 4)
    expect(p.vAxis.dot(p.normal)).toBeCloseTo(0, 4)
    expect(p.uAxis.dot(p.vAxis)).toBeCloseTo(0, 4)
  })

  it('returns null when no plane gathers enough inliers (pure noise)', () => {
    const rng = seededRng(6)
    const pts: Vector3[] = []
    for (let i = 0; i < 20; i++) pts.push(new Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1))
    const plane = fitPlane(pts, new Vector3(0, 1.5, 0), { rng: seededRng(7) })
    // A random cloud may still find a weak plane; require either null or low confidence.
    if (plane) expect(plane.confidence).toBeLessThan(0.6)
  })
})
