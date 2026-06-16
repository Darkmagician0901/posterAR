/**
 * planeFit.ts
 *
 * Engine-agnostic, pure plane fitting. Given a set of 3D points (gathered from
 * a grid of AR hit-tests) and the camera position, it finds the dominant plane
 * via RANSAC (robust to outliers / mixed surfaces) and refines its normal with
 * PCA (the eigenvector of the inlier covariance with the smallest eigenvalue).
 *
 * Returns the plane centroid, a unit normal signed to face the camera, an
 * orthonormal in-plane basis (uAxis/vAxis), the in-plane half-extents (used to
 * size the green highlight patch), a confidence score in [0,1], and the inlier
 * count. Returns null when there are too few points or no plane is found.
 *
 * Pure: depends only on its arguments + three.js math types, so it is unit
 * testable without any 8th Wall / browser globals. RANSAC randomness is
 * injectable via `options.rng` for deterministic tests.
 */

import { Vector3 } from 'three'

export interface FittedPlane {
  /** Mean of the inlier points (plane anchor), world space. */
  centroid: Vector3
  /** Unit surface normal, signed to point toward the camera. */
  normal: Vector3
  /** Unit in-plane axis (largest spread), orthogonal to the normal. */
  uAxis: Vector3
  /** Unit in-plane axis orthogonal to both uAxis and the normal. */
  vAxis: Vector3
  /** Half-sizes (metres) of the inlier footprint along uAxis / vAxis. */
  extent: { u: number; v: number }
  /** Fit quality in [0,1]: blends inlier ratio, residual tightness, count. */
  confidence: number
  /** Number of points within `inlierThreshold` of the chosen plane. */
  inlierCount: number
}

export interface PlaneFitOptions {
  /** Max point-to-plane distance (m) counted as an inlier. Default 0.03. */
  inlierThreshold?: number
  /** RANSAC sample count. Default 48. */
  ransacIterations?: number
  /** Minimum input points before attempting a fit. Default 6. */
  minPoints?: number
  /** Minimum inliers required to accept a fit. Default 6. */
  minInliers?: number
  /** Injectable RNG in [0,1) for deterministic tests. Default Math.random. */
  rng?: () => number
}

const _ab = new Vector3()
const _ac = new Vector3()
const _n = new Vector3()
const _d = new Vector3()

/**
 * Fit the dominant plane to `points`.
 *
 * @param points — World-space sample points (e.g. from the hit-test grid).
 * @param cameraPos — Camera world position; used to orient the normal toward
 *   the viewer so placed posters face the camera.
 * @param options — Tuning knobs; see {@link PlaneFitOptions}.
 * @returns The fitted plane, or null when there are too few points / no fit.
 */
export function fitPlane(
  points: Vector3[],
  cameraPos: Vector3,
  options: PlaneFitOptions = {},
): FittedPlane | null {
  const inlierThreshold = options.inlierThreshold ?? 0.03
  const iterations = options.ransacIterations ?? 48
  const minPoints = options.minPoints ?? 6
  const minInliers = options.minInliers ?? 6
  const rng = options.rng ?? Math.random

  if (points.length < minPoints) return null

  // ── RANSAC: find the plane (point + normal) with the most inliers ──────────
  let bestNormal: Vector3 | null = null
  let bestPoint: Vector3 | null = null
  let bestInliers = 0

  for (let iter = 0; iter < iterations; iter++) {
    const i0 = (rng() * points.length) | 0
    let i1 = (rng() * points.length) | 0
    let i2 = (rng() * points.length) | 0
    if (i1 === i0) i1 = (i1 + 1) % points.length
    if (i2 === i0 || i2 === i1) i2 = (i2 + 2) % points.length
    const p0 = points[i0]
    const p1 = points[i1]
    const p2 = points[i2]

    _ab.subVectors(p1, p0)
    _ac.subVectors(p2, p0)
    _n.crossVectors(_ab, _ac)
    const len = _n.length()
    if (len < 1e-6) continue // (near-)collinear sample
    _n.divideScalar(len)

    let inliers = 0
    for (const p of points) {
      const dist = Math.abs(_d.subVectors(p, p0).dot(_n))
      if (dist <= inlierThreshold) inliers++
    }
    if (inliers > bestInliers) {
      bestInliers = inliers
      bestNormal = _n.clone()
      bestPoint = p0.clone()
    }
  }

  if (!bestNormal || !bestPoint || bestInliers < minInliers) return null

  // ── Collect inliers for the chosen plane ───────────────────────────────────
  const inliers: Vector3[] = []
  for (const p of points) {
    const dist = Math.abs(_d.subVectors(p, bestPoint).dot(bestNormal))
    if (dist <= inlierThreshold) inliers.push(p)
  }

  // ── Centroid + covariance (symmetric 3x3) over the inliers ─────────────────
  const centroid = new Vector3()
  for (const p of inliers) centroid.add(p)
  centroid.divideScalar(inliers.length)

  let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0
  for (const p of inliers) {
    const dx = p.x - centroid.x
    const dy = p.y - centroid.y
    const dz = p.z - centroid.z
    cxx += dx * dx; cxy += dx * dy; cxz += dx * dz
    cyy += dy * dy; cyz += dy * dz; czz += dz * dz
  }
  const cov = [
    [cxx, cxy, cxz],
    [cxy, cyy, cyz],
    [cxz, cyz, czz],
  ]

  const { values, vectors } = symmetricEig3(cov)

  // Sort eigenpairs descending by eigenvalue: [0]=largest … [2]=smallest.
  const order = [0, 1, 2].sort((a, b) => values[b] - values[a])
  const uAxis = vectors[order[0]].clone().normalize() // largest spread (in-plane)
  const normal = vectors[order[2]].clone().normalize()   // smallest spread (normal)

  // Sign the normal toward the camera.
  if (normal.dot(_d.subVectors(cameraPos, centroid)) < 0) normal.negate()

  // Re-derive a clean right-handed in-plane basis from normal + uAxis.
  const u = uAxis.clone().addScaledVector(normal, -uAxis.dot(normal))
  if (u.lengthSq() < 1e-8) u.set(1, 0, 0).addScaledVector(normal, -normal.x)
  u.normalize()
  const v = new Vector3().crossVectors(normal, u).normalize()

  // ── In-plane extent (half-sizes) from inlier projections ───────────────────
  let maxU = 0
  let maxV = 0
  for (const p of inliers) {
    _d.subVectors(p, centroid)
    maxU = Math.max(maxU, Math.abs(_d.dot(u)))
    maxV = Math.max(maxV, Math.abs(_d.dot(v)))
  }

  // ── Confidence: inlier ratio + residual tightness + raw count ──────────────
  let residual = 0
  for (const p of inliers) residual += Math.abs(_d.subVectors(p, centroid).dot(normal))
  residual /= inliers.length
  const ratioScore = inliers.length / points.length
  const residualScore = clamp01(1 - residual / inlierThreshold)
  const countScore = clamp01(inliers.length / 12)
  const confidence = clamp01(ratioScore * 0.5 + residualScore * 0.25 + countScore * 0.25)

  return {
    centroid,
    normal,
    uAxis: u,
    vAxis: v,
    extent: { u: maxU, v: maxV },
    confidence,
    inlierCount: inliers.length,
  }
}

/** Clamp to [0,1]. */
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * Jacobi eigenvalue iteration for a symmetric 3x3 matrix. Returns the three
 * eigenvalues and their eigenvectors (as the columns of the accumulated
 * rotation). Sufficient for PCA of a small point covariance.
 *
 * @param a — Symmetric 3x3 matrix as row-major nested arrays.
 * @returns `values[i]` paired with `vectors[i]`.
 */
function symmetricEig3(a: number[][]): { values: number[]; vectors: Vector3[] } {
  const m = [
    [a[0][0], a[0][1], a[0][2]],
    [a[1][0], a[1][1], a[1][2]],
    [a[2][0], a[2][1], a[2][2]],
  ]
  const vec = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  const pairs: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ]
  for (let sweep = 0; sweep < 24; sweep++) {
    const off = Math.abs(m[0][1]) + Math.abs(m[0][2]) + Math.abs(m[1][2])
    if (off < 1e-12) break
    for (const [p, q] of pairs) {
      if (Math.abs(m[p][q]) < 1e-15) continue
      const phi = 0.5 * Math.atan2(2 * m[p][q], m[q][q] - m[p][p])
      const c = Math.cos(phi)
      const s = Math.sin(phi)
      // m := Jᵀ m J (rotate columns p,q then rows p,q).
      for (let k = 0; k < 3; k++) {
        const mkp = m[k][p]
        const mkq = m[k][q]
        m[k][p] = c * mkp - s * mkq
        m[k][q] = s * mkp + c * mkq
      }
      for (let k = 0; k < 3; k++) {
        const mpk = m[p][k]
        const mqk = m[q][k]
        m[p][k] = c * mpk - s * mqk
        m[q][k] = s * mpk + c * mqk
      }
      // Accumulate eigenvectors: vec := vec J.
      for (let k = 0; k < 3; k++) {
        const vkp = vec[k][p]
        const vkq = vec[k][q]
        vec[k][p] = c * vkp - s * vkq
        vec[k][q] = s * vkp + c * vkq
      }
    }
  }
  return {
    values: [m[0][0], m[1][1], m[2][2]],
    vectors: [
      new Vector3(vec[0][0], vec[1][0], vec[2][0]),
      new Vector3(vec[0][1], vec[1][1], vec[2][1]),
      new Vector3(vec[0][2], vec[1][2], vec[2][2]),
    ],
  }
}
