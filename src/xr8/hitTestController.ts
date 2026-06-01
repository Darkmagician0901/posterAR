/**
 * hitTestController.ts
 *
 * Replaces the old WebXR hitTest.ts (XRHitTestSource) with 8th Wall's
 * XrController.hitTest. Because SLAM keeps the world frame stable, a single
 * per-frame hit-test at screen-centre is all that is needed — no anchor
 * lifecycle, no reference-space management.
 */

import { Matrix4, Quaternion, Vector3 } from 'three'

export interface ReticlePose {
  /** Column-major Float32Array suitable for Matrix4.fromArray / mesh.matrix. */
  matrix: Float32Array
  /** True when the surface normal is roughly horizontal (i.e. a wall). */
  vertical: boolean
}

// ── module-scoped temporaries — reused every frame to avoid GC pressure ──────
const _m4 = new Matrix4()
const _pos = new Vector3()
const _quat = new Quaternion()
const _scale = new Vector3(1, 1, 1)
const _normal = new Vector3()

/**
 * Runs a centre-screen hit-test via XR8.XrController.hitTest and returns the
 * best surface pose, or null when no results are available or the API is absent.
 *
 * Priority: DETECTED_SURFACE > ESTIMATED_SURFACE > FEATURE_POINT > results[0].
 */
export function readReticlePose(): ReticlePose | null {
  // Guard: engine not yet loaded or XrController unavailable.
  if (typeof XR8 === 'undefined' || !XR8?.XrController?.hitTest) {
    return null
  }

  let results: Xr8HitResult[]
  try {
    results = XR8.XrController.hitTest(0.5, 0.5, [
      'DETECTED_SURFACE',
      'ESTIMATED_SURFACE',
      'FEATURE_POINT',
    ]) as Xr8HitResult[]
  } catch {
    return null
  }

  if (!results || results.length === 0) {
    return null
  }

  // Pick the best result according to priority order.
  const best: Xr8HitResult =
    results.find((r) => r.type === 'DETECTED_SURFACE') ??
    results.find((r) => r.type === 'ESTIMATED_SURFACE') ??
    results.find((r) => r.type === 'FEATURE_POINT') ??
    results[0]

  const { position: p, rotation: r } = best

  // Compose world-space Matrix4 from position + rotation quaternion, unit scale.
  _pos.set(p.x, p.y, p.z)
  _quat.set(r.x, r.y, r.z, r.w)
  _scale.set(1, 1, 1)
  _m4.compose(_pos, _quat, _scale)

  // Determine verticality: rotate world-up (0,1,0) by the hit quaternion.
  // If the resulting normal is close to horizontal the surface is a wall.
  _normal.set(0, 1, 0).applyQuaternion(_quat)
  const vertical = Math.abs(_normal.y) < 0.5

  return {
    matrix: new Float32Array(_m4.elements),
    vertical,
  }
}
