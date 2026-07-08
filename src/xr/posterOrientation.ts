/**
 * posterOrientation.ts
 *
 * Engine-agnostic helper that turns a hit-test pose into the transform used to
 * place a poster on the detected surface. Two orientations are supported:
 *
 *   - FLAT  (`composeFlatPosterMatrix`)   — the poster lies on the ground.
 *   - UPRIGHT (`composeUprightPosterMatrix`) — the poster stands vertically
 *     like a sign, facing the viewer.
 *
 * `composePosterMatrix` picks between them via the `POSTER_STANDS_UPRIGHT`
 * toggle so callers don't have to care which one is active.
 *
 * Why this exists: a three.js PlaneGeometry faces its local +Z. The 8th Wall
 * hit-test pose follows the convention "local +Y = surface normal", so feeding
 * the raw hit matrix to a plane makes it face a *horizontal* direction on a
 * floor — i.e. it stands up like a billboard. To lay it flat we rebuild the
 * transform so the plane's facing axis (+Z) coincides with the surface normal,
 * and we choose the in-plane spin so the image's top edge (+Y) points away
 * from the viewer (the photo's "head" faces away from where you stand).
 *
 * Pure functions: they read only their arguments + module-scoped temporaries,
 * so they are unit-testable without any 8th Wall / browser globals.
 */

import { Matrix4, Vector3 } from 'three'

/**
 * Master switch for how a tapped asset is oriented.
 *
 * `true`  → posters STAND upright, facing the viewer (current default).
 * `false` → posters lie FLAT on the detected ground (the original behaviour).
 *
 * Kept as a single exported constant so the "standing vs. flat" decision has
 * exactly one home and can be flipped back without touching the call sites.
 */
export const POSTER_STANDS_UPRIGHT = true

// ── module-scoped temporaries — reused to avoid per-placement allocation ─────
const _hit = new Matrix4()
const _pos = new Vector3()
const _normal = new Vector3()
const _hitInPlane = new Vector3()
const _fromCam = new Vector3()
const _xAxis = new Vector3()
const _yAxis = new Vector3()
const _zAxis = new Vector3()
const _out = new Matrix4()

/** Gravity-up: the direction an upright poster's top edge points. */
const WORLD_UP = new Vector3(0, 1, 0)

/**
 * Build the world transform for a tapped poster, honoring the
 * `POSTER_STANDS_UPRIGHT` toggle (upright by default, flat when disabled).
 *
 * Both branches share the same signature and return convention, so call sites
 * can switch behaviour purely through the toggle. See the two delegates for the
 * per-orientation geometry.
 */
export function composePosterMatrix(
  hitMatrix: Float32Array,
  cameraPos?: Vector3 | null,
): Float32Array {
  return POSTER_STANDS_UPRIGHT
    ? composeUprightPosterMatrix(hitMatrix, cameraPos)
    : composeFlatPosterMatrix(hitMatrix, cameraPos)
}

/**
 * Build the world transform that lays a poster flat in the surface plane.
 *
 * @param hitMatrix Column-major Float32Array from the hit-test pose
 *                  (`readReticlePose().matrix`). Its local +Y is the surface
 *                  normal; its translation is the contact point.
 * @param cameraPos Optional camera world position. When supplied, the image's
 *                  top edge is oriented away from the camera (projected into the
 *                  surface plane). When omitted/null — or when the camera sits
 *                  directly along the surface normal — we fall back to the hit
 *                  pose's own in-plane axis so the poster still lies flat.
 * @returns Column-major Float32Array suitable for `Group.matrix` (a proper
 *          right-handed rotation + translation — no mirroring).
 */
export function composeFlatPosterMatrix(
  hitMatrix: Float32Array,
  cameraPos?: Vector3 | null,
): Float32Array {
  _hit.fromArray(hitMatrix)

  // Contact point + surface normal (local +Y of the hit pose).
  _pos.setFromMatrixColumn(_hit, 3)
  _normal.setFromMatrixColumn(_hit, 1).normalize()
  // The hit pose's local +Z already lies in the tangent plane — our fallback
  // "up" direction when the camera can't disambiguate the spin.
  _hitInPlane.setFromMatrixColumn(_hit, 2)

  // Desired image "up" = direction AWAY from the camera, projected into the
  // surface plane (remove the component along the normal) — the poster's head
  // points away from where the viewer is standing.
  if (cameraPos) {
    _fromCam.subVectors(_pos, cameraPos)
    _yAxis.copy(_fromCam).addScaledVector(_normal, -_fromCam.dot(_normal))
  } else {
    _yAxis.set(0, 0, 0)
  }

  // Fallbacks for degenerate spin (no camera, or camera along the normal).
  if (_yAxis.lengthSq() < 1e-8) {
    _yAxis.copy(_hitInPlane).addScaledVector(_normal, -_hitInPlane.dot(_normal))
  }
  if (_yAxis.lengthSq() < 1e-8) {
    // Extreme degenerate — any vector perpendicular to the normal will do.
    _yAxis.set(_normal.y, -_normal.x, 0)
    if (_yAxis.lengthSq() < 1e-8) _yAxis.set(1, 0, 0)
  }
  _yAxis.normalize()

  // Right-handed orthonormal basis with the poster facing along the normal:
  //   zAxis = normal (poster +Z faces out of the surface)
  //   xAxis = yAxis × zAxis
  //   yAxis = zAxis × xAxis  (re-derived for strict orthogonality)
  _xAxis.crossVectors(_yAxis, _normal).normalize()
  _yAxis.crossVectors(_normal, _xAxis).normalize()

  _out.makeBasis(_xAxis, _yAxis, _normal)
  _out.setPosition(_pos)
  return new Float32Array(_out.elements)
}

/**
 * Build the world transform that stands a poster UPRIGHT at the contact point,
 * like a sign planted in the ground and turned to face the viewer.
 *
 * The plane's top edge (+Y) is gravity-up regardless of how the detected
 * surface is tilted, and its facing axis (+Z) points horizontally toward the
 * camera so the art reads head-on. The poster is centered on the contact point
 * (it pivots there), so with the default poster size roughly its lower half
 * sits below the surface — grounding the bottom edge is a deliberate follow-up.
 *
 * @param hitMatrix Column-major Float32Array from the hit-test pose. Only its
 *                  translation (the contact point) is used here — the standing
 *                  orientation is derived from gravity + the camera, not the
 *                  surface normal.
 * @param cameraPos Optional camera world position. When supplied, the poster
 *                  turns to face it (projected onto the horizontal plane). When
 *                  omitted/null — or when the camera sits directly overhead — we
 *                  fall back to the hit pose's in-plane axis, then a default, so
 *                  the poster still stands vertically.
 * @returns Column-major Float32Array suitable for `Group.matrix` (a proper
 *          right-handed rotation + translation — no mirroring).
 */
export function composeUprightPosterMatrix(
  hitMatrix: Float32Array,
  cameraPos?: Vector3 | null,
): Float32Array {
  _hit.fromArray(hitMatrix)
  _pos.setFromMatrixColumn(_hit, 3)

  // Image "up" is true vertical so the poster stands regardless of surface tilt.
  _yAxis.copy(WORLD_UP)

  // Facing (+Z) = horizontal direction toward the camera, so the art faces you.
  if (cameraPos) {
    _fromCam.subVectors(cameraPos, _pos)
    _zAxis.copy(_fromCam).addScaledVector(_yAxis, -_fromCam.dot(_yAxis))
  } else {
    _zAxis.set(0, 0, 0)
  }

  // Fallbacks for a degenerate facing (no camera, or camera directly overhead).
  if (_zAxis.lengthSq() < 1e-8) {
    _hitInPlane.setFromMatrixColumn(_hit, 2)
    _zAxis.copy(_hitInPlane).addScaledVector(_yAxis, -_hitInPlane.dot(_yAxis))
  }
  if (_zAxis.lengthSq() < 1e-8) {
    // Extreme degenerate — any horizontal facing will do.
    _zAxis.set(0, 0, 1)
  }
  _zAxis.normalize()

  // Right-handed orthonormal basis with the poster facing the viewer:
  //   yAxis = world up (poster stands vertically)
  //   xAxis = yAxis × zAxis
  //   zAxis = xAxis × yAxis  (re-derived for strict orthogonality)
  _xAxis.crossVectors(_yAxis, _zAxis).normalize()
  _zAxis.crossVectors(_xAxis, _yAxis).normalize()

  _out.makeBasis(_xAxis, _yAxis, _zAxis)
  _out.setPosition(_pos)
  return new Float32Array(_out.elements)
}
