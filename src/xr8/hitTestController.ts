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
  /** True when the surface is a wall (its normal is roughly horizontal). */
  vertical: boolean
}

// ── Wall-detection heuristic constants ───────────────────────────────────────
// These are intentionally named and grouped so they're easy to tune on-device.

/**
 * Minimum height (metres) a FEATURE_POINT must sit above the floor reference
 * for us to treat it as a wall hit. Lower = more aggressive wall detection but
 * more false positives from floor-adjacent feature points. Start at 0.3 m.
 */
const WALL_MIN_HEIGHT_M = 0.3

// ── module-scoped temporaries — reused every frame to avoid GC pressure ──────
const _m4 = new Matrix4()
const _pos = new Vector3()
const _quat = new Quaternion()
const _scale = new Vector3(1, 1, 1)
const _normal = new Vector3()

// Additional temporaries for synthesizeWallPose — module-scoped so the pure
// helper can be called every frame without allocation.
const _wallNormal = new Vector3()
const _tangentX = new Vector3()
const _tangentY = new Vector3()
const _tangentZ = new Vector3()
const _worldUp = new Vector3(0, 1, 0)
const _featureVec = new Vector3()

/**
 * Synthesizes a vertical surface pose at `pointPos` whose local +Y axis
 * (= surface normal, matching the existing reticle convention) faces the camera.
 *
 * The normal is the *horizontal* direction from the feature point toward the
 * camera (y = 0 after projection), so the ring stands vertically against the
 * wall and faces outward toward the viewer.
 *
 * This is a PURE function — it reads only its arguments and module-scoped
 * temporaries, making it unit-testable without mocking 8th Wall globals.
 *
 * @param pointPos  World-space position of the FEATURE_POINT hit.
 * @param cameraPos World-space camera position.
 * @returns ReticlePose with vertical === true.
 */
export function synthesizeWallPose(
  pointPos: Vector3,
  cameraPos: Vector3,
): ReticlePose {
  // Horizontal direction from point toward the camera (project out the Y
  // component so the normal is truly horizontal regardless of camera tilt).
  _wallNormal.subVectors(cameraPos, pointPos)
  _wallNormal.y = 0

  // Guard: if the camera is almost directly above the point (degenerate case),
  // fall back to a stable forward direction so we never produce NaNs.
  if (_wallNormal.lengthSq() < 1e-6) {
    _wallNormal.set(0, 0, 1)
  } else {
    _wallNormal.normalize()
  }

  // Build an orthonormal basis where local +Y = _wallNormal (the surface
  // normal), matching the convention used by the existing horizontal path.
  //   tangentX = worldUp × wallNormal   (horizontal axis along the wall)
  //   tangentY = wallNormal              (the outward normal, our +Y)
  //   tangentZ = wallNormal × tangentX  (vertical axis up the wall = world up
  //                                      when the wall is truly vertical)
  _tangentX.crossVectors(_worldUp, _wallNormal).normalize()
  // If _worldUp and _wallNormal happen to be parallel (shouldn't happen since
  // _wallNormal.y = 0) this degenerates — fall back to a perp in XZ plane.
  if (_tangentX.lengthSq() < 1e-6) {
    _tangentX.set(1, 0, 0)
  }
  _tangentY.copy(_wallNormal)
  // Recompute a clean "up-in-plane" to guarantee strict orthogonality.
  // tangentZ = tangentY × tangentX   (right-hand rule: tangentZ points up along wall)
  _tangentZ.crossVectors(_tangentY, _tangentX).normalize()

  // Column-major Matrix4: [ tangentX | tangentY | tangentZ | translation ]
  // three.js Matrix4 element order: elements[col*4 + row]
  //   col0 = tangentX (local +X)
  //   col1 = tangentY (local +Y = normal)
  //   col2 = tangentZ (local +Z)
  //   col3 = translation
  _m4.set(
    _tangentX.x, _tangentY.x, _tangentZ.x, pointPos.x,
    _tangentX.y, _tangentY.y, _tangentZ.y, pointPos.y,
    _tangentX.z, _tangentY.z, _tangentZ.z, pointPos.z,
    0,           0,           0,           1,
  )

  return {
    matrix: new Float32Array(_m4.elements),
    vertical: true,
  }
}

/**
 * Runs a centre-screen hit-test via XR8.XrController.hitTest and returns the
 * best surface pose, or null when no results are available or the API is absent.
 *
 * Priority (horizontal path): DETECTED_SURFACE > ESTIMATED_SURFACE > results[0].
 *
 * Wall path (Phase 1, Approach A — cheap experiment):
 *   If a FEATURE_POINT hit exists and sits meaningfully above the floor
 *   reference (WALL_MIN_HEIGHT_M), we synthesize a vertical pose at that
 *   point whose normal faces the camera. This fires on textured walls; blank
 *   walls will produce no FEATURE_POINT and fall through to the floor path.
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

  // ── Separate results by type ─────────────────────────────────────────────
  const surfaceHit: Xr8HitResult | undefined =
    results.find((r) => r.type === 'DETECTED_SURFACE') ??
    results.find((r) => r.type === 'ESTIMATED_SURFACE')

  // Prefer the nearest FEATURE_POINT (sort by distance ascending).
  const featureHit: Xr8HitResult | undefined = results
    .filter((r) => r.type === 'FEATURE_POINT')
    .sort((a, b) => a.distance - b.distance)[0]

  // ── Wall heuristic ───────────────────────────────────────────────────────
  if (featureHit) {
    // Floor reference: use the horizontal surface hit when one exists; if
    // there is no surface hit at all we also treat this as a potential wall
    // (the SLAM ground plane hasn't settled yet or the user is fully aimed
    // at a wall).
    const floorY = surfaceHit ? surfaceHit.position.y : null
    const featureY = featureHit.position.y

    const isWall =
      floorY === null
        ? true // No floor reference — trust the feature point.
        : featureY - floorY > WALL_MIN_HEIGHT_M

    if (isWall) {
      // Read the camera world position from the 8th Wall three.js scene.
      // Guard gracefully — if the scene/camera is unavailable fall through
      // to the existing horizontal path.
      let cameraPos: Vector3 | null = null
      try {
        const scene = XR8?.Threejs?.xrScene?.()
        if (scene?.camera?.position) {
          _pos.copy(scene.camera.position as Vector3)
          cameraPos = _pos
        }
      } catch {
        // xrScene() can throw before the session is fully initialised.
      }

      if (cameraPos !== null) {
        const fp = featureHit.position
        _featureVec.set(fp.x, fp.y, fp.z)
        return synthesizeWallPose(_featureVec, cameraPos)
      }
      // Camera unavailable — fall through to horizontal path below.
    }
  }

  // ── Existing horizontal path (unchanged) ─────────────────────────────────
  const best: Xr8HitResult =
    surfaceHit ??
    featureHit ??
    results[0]

  const { position: p, rotation: r } = best

  // Compose world-space Matrix4 from position + rotation quaternion, unit scale.
  _pos.set(p.x, p.y, p.z)
  _quat.set(r.x, r.y, r.z, r.w)
  _scale.set(1, 1, 1)
  _m4.compose(_pos, _quat, _scale)

  // Determine verticality: rotate world-up (0,1,0) by the hit quaternion to get
  // the surface normal. A wall's normal is roughly horizontal, so |normal.y| is
  // small — treat that as a vertical surface.
  _normal.set(0, 1, 0).applyQuaternion(_quat)
  const vertical = Math.abs(_normal.y) < 0.5

  return {
    matrix: new Float32Array(_m4.elements),
    vertical,
  }
}
