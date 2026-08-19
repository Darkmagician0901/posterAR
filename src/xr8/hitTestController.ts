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

import { Matrix4, Quaternion, Vector3 } from 'three';

export interface ReticlePose {
  /**
   * The 4x4 world transform of the hit point as 16 floats in column-major
   * order (the matrix is listed column by column — the memory layout three.js
   * and WebGL use). Feed it to Matrix4.fromArray or copy into mesh.matrix.
   */
  matrix: Float32Array;
  /** True when the surface is a wall (its normal is roughly horizontal). */
  vertical: boolean;
  /**
   * Which kind of hit this was. Carried through because the reticle will
   * happily point at a lone FEATURE_POINT, while planting the story on one is
   * a good way to end up with it across the room — see `isPlaceableHit` in
   * `xr/placement.ts`.
   */
  type: Xr8HitResult['type'];
}

// ── module-scoped temporaries — reused every frame to avoid GC pressure ──────
const _m4 = new Matrix4();
const _pos = new Vector3();
const _quat = new Quaternion();
const _scale = new Vector3(1, 1, 1);
const _normal = new Vector3();

/**
 * Runs a centre-screen hit-test via XR8.XrController.hitTest and returns the
 * best surface pose. Called once per frame from the render loop.
 *
 * Result priority: DETECTED_SURFACE (a surface the engine has confirmed) >
 * ESTIMATED_SURFACE (a guess) > FEATURE_POINT (a single tracked point) >
 * whatever came first.
 *
 * Priority: DETECTED_SURFACE > ESTIMATED_SURFACE > FEATURE_POINT > results[0].
 */
export function readReticlePose(): ReticlePose | null {
  // Guard: engine not yet loaded or XrController unavailable.
  if (typeof XR8 === 'undefined' || !XR8?.XrController?.hitTest) {
    return null;
  }

  let results: Xr8HitResult[];
  try {
    // (0.5, 0.5) is the screen centre — hitTest takes normalized screen
    // coordinates where (0, 0) is top-left and (1, 1) is bottom-right.
    results = XR8.XrController.hitTest(0.5, 0.5, [
      'DETECTED_SURFACE',
      'ESTIMATED_SURFACE',
      'FEATURE_POINT',
    ]) as Xr8HitResult[];
  } catch {
    return null;
  }

  if (!results || results.length === 0) {
    return null;
  }

  // Pick the best result according to priority order.
  const best: Xr8HitResult =
    results.find((r) => r.type === 'DETECTED_SURFACE') ??
    results.find((r) => r.type === 'ESTIMATED_SURFACE') ??
    results.find((r) => r.type === 'FEATURE_POINT') ??
    results[0];

  const { position: p, rotation: r } = best;

  // Build the world-space 4x4 transform from the hit's position and rotation
  // quaternion (three.js's 4-number rotation representation) at unit scale.
  _pos.set(p.x, p.y, p.z);
  _quat.set(r.x, r.y, r.z, r.w);
  _scale.set(1, 1, 1);
  _m4.compose(_pos, _quat, _scale);

  // Determine verticality: rotate world-up (0,1,0) by the hit quaternion to get
  // the surface normal. A wall's normal is roughly horizontal, so |normal.y| is
  // small — treat that as a vertical surface.
  _normal.set(0, 1, 0).applyQuaternion(_quat);
  const vertical = Math.abs(_normal.y) < 0.5;

  return {
    matrix: new Float32Array(_m4.elements),
    vertical,
    type: best.type,
  };
}
