/**
 * hitTestController.ts
 *
 * A "hit-test" asks the AR engine: "if I shoot a ray from this screen point
 * into the real world, what surface does it hit, and where?" The answer gives
 * us the position and orientation to draw the reticle (the ring-shaped
 * placement cursor) and to place posters.
 *
 * This module replaces the old WebXR hitTest.ts (XRHitTestSource) with 8th
 * Wall's XrController.hitTest. Because SLAM world-tracking (the engine's
 * camera-based positional tracking) keeps the world coordinate frame stable,
 * a single per-frame hit-test at screen-centre is all that is needed — no
 * anchor lifecycle, no reference-space management.
 */

import { Matrix4, Quaternion, Vector3 } from 'three'

import { sampleSurfacePoints } from '@/xr8/surfaceSampler'
import { fitPlane, FittedPlane } from '@/xr/planeFit'

export interface ReticlePose {
  /**
   * The 4x4 world transform of the hit point as 16 floats in column-major
   * order. Local +Y is the surface normal. Feed to Matrix4.fromArray or copy
   * into mesh.matrix.
   */
  matrix: Float32Array
  /** True when the surface is a wall (its normal is roughly horizontal). */
  vertical: boolean
  /** True when the pose came from the plane fit; false for the fallback ray. */
  estimated: boolean
  /** Fit/hit confidence in [0,1]. */
  confidence: number
  /** In-plane half-extents (m) for the highlight patch, or null on fallback. */
  extent: { u: number; v: number } | null
}

// Confidence below which we ignore the plane fit and fall back to the single
// centre-ray ground-plane hit (today's behaviour). Tunable on device.
const PLANE_CONFIDENCE_MIN = 0.55

// Temporal smoothing of the fitted plane (kills per-frame jitter). Snap-reset
// when the crosshair jumps to a far/different plane so there is no lag.
const SMOOTH_ALPHA = 0.35
const SMOOTH_RESET_DISTANCE = 0.5 // metres
const SMOOTH_RESET_DOT = 0.7 // normals diverging > ~45° → snap

// ── module-scoped temporaries — reused every frame to avoid GC pressure ──────
const _m4 = new Matrix4()
const _pos = new Vector3()
const _quat = new Quaternion()
const _scale = new Vector3(1, 1, 1)
const _normal = new Vector3()
const _camPos = new Vector3()
const _xAxis = new Vector3()
const _zAxis = new Vector3()
const _poseM = new Matrix4()

// Smoothing state (centroid + normal of the last accepted plane).
let _smCentroid: Vector3 | null = null
let _smNormal: Vector3 | null = null

/**
 * Per-frame surface estimate. Samples a hit-test grid, fits a plane, and (when
 * confident) returns a pose whose +Y is the fitted normal — so the reticle and
 * posters adhere to walls / tables / slopes, not just the floor. Falls back to
 * the single centre-ray ground-plane hit-test when confidence is low or the
 * camera pose is unavailable, so behaviour is never worse than before.
 */
export function readReticlePose(): ReticlePose | null {
  if (typeof XR8 === 'undefined' || !XR8?.XrController?.hitTest) return null

  const cameraPos = readCameraPosition()
  if (cameraPos) {
    const points = sampleSurfacePoints()
    if (points.length >= 3) {
      const plane = fitPlane(points, cameraPos)
      if (plane && plane.confidence >= PLANE_CONFIDENCE_MIN) {
        return buildEstimatedPose(plane)
      }
    }
  }

  return readSingleRayPose()
}

/**
 * Read the live camera world position from the engine's three.js scene.
 *
 * @returns A shared Vector3 (do not retain) set to the camera position, or null
 *   when the scene/camera is unavailable.
 */
function readCameraPosition(): Vector3 | null {
  try {
    const scene = XR8?.Threejs?.xrScene?.() as
      | { camera?: { position?: { x: number; y: number; z: number } } }
      | undefined
    const p = scene?.camera?.position
    if (p) return _camPos.set(p.x, p.y, p.z)
  } catch {
    /* fall through */
  }
  return null
}

/**
 * Temporally smooth the fitted plane's centroid + normal, snapping (no blend)
 * when the crosshair jumps to a far or differently-oriented surface.
 *
 * @param plane — The freshly fitted plane.
 * @returns The smoothed centroid + normal (shared Vectors — do not retain).
 */
function smoothPlane(plane: FittedPlane): { centroid: Vector3; normal: Vector3 } {
  const c = plane.centroid
  const n = plane.normal
  if (
    _smCentroid === null ||
    _smNormal === null ||
    _smCentroid.distanceTo(c) > SMOOTH_RESET_DISTANCE ||
    _smNormal.dot(n) < SMOOTH_RESET_DOT
  ) {
    _smCentroid = c.clone()
    _smNormal = n.clone()
  } else {
    _smCentroid.lerp(c, SMOOTH_ALPHA)
    _smNormal.lerp(n, SMOOTH_ALPHA).normalize()
  }
  return { centroid: _smCentroid, normal: _smNormal }
}

/**
 * Build a reticle pose from a fitted plane. The matrix encodes a right-handed
 * basis with +Y = surface normal (matching the hit-pose convention used by the
 * reticle and composeFlatPosterMatrix).
 *
 * @param plane — The fitted plane (its uAxis/extent are used as-is).
 * @returns The estimated ReticlePose.
 */
function buildEstimatedPose(plane: FittedPlane): ReticlePose {
  const { centroid, normal } = smoothPlane(plane)

  // In-plane X axis: the plane's uAxis re-orthogonalised against the (smoothed)
  // normal. Z = X × normal keeps the basis right-handed (det +1).
  _xAxis.copy(plane.uAxis).addScaledVector(normal, -plane.uAxis.dot(normal))
  if (_xAxis.lengthSq() < 1e-8) _xAxis.set(1, 0, 0).addScaledVector(normal, -normal.x)
  _xAxis.normalize()
  _zAxis.crossVectors(_xAxis, normal).normalize()

  _poseM.makeBasis(_xAxis, normal, _zAxis)
  _poseM.setPosition(centroid)

  return {
    matrix: new Float32Array(_poseM.elements),
    vertical: Math.abs(normal.y) < 0.5,
    estimated: true,
    confidence: plane.confidence,
    extent: plane.extent,
  }
}

/**
 * The legacy single centre-ray hit-test (today's behaviour), used as the
 * low-confidence fallback. Result priority: DETECTED_SURFACE > ESTIMATED_SURFACE
 * > FEATURE_POINT > results[0].
 *
 * @returns The fallback ReticlePose, or null when nothing was hit.
 */
function readSingleRayPose(): ReticlePose | null {
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

  if (!results || results.length === 0) return null

  const best: Xr8HitResult =
    results.find((r) => r.type === 'DETECTED_SURFACE') ??
    results.find((r) => r.type === 'ESTIMATED_SURFACE') ??
    results.find((r) => r.type === 'FEATURE_POINT') ??
    results[0]

  const { position: p, rotation: r } = best
  _pos.set(p.x, p.y, p.z)
  _quat.set(r.x, r.y, r.z, r.w)
  _scale.set(1, 1, 1)
  _m4.compose(_pos, _quat, _scale)

  _normal.set(0, 1, 0).applyQuaternion(_quat)
  const vertical = Math.abs(_normal.y) < 0.5
  const confidence =
    best.type === 'DETECTED_SURFACE' ? 1 : best.type === 'ESTIMATED_SURFACE' ? 0.7 : 0.4

  return {
    matrix: new Float32Array(_m4.elements),
    vertical,
    estimated: false,
    confidence,
    extent: null,
  }
}
