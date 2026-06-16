/**
 * posterOrientation.ts
 *
 * Engine-agnostic helper that turns a hit-test pose into the transform used to
 * lay a poster FLAT on the surface (instead of standing it up).
 *
 * Why this exists: a three.js PlaneGeometry faces its local +Z. The 8th Wall
 * hit-test pose follows the convention "local +Y = surface normal", so feeding
 * the raw hit matrix to a plane makes it face a *horizontal* direction on a
 * floor — i.e. it stands up like a billboard. To lay it flat we rebuild the
 * transform so the plane's facing axis (+Z) coincides with the surface normal,
 * and we choose the in-plane spin so the image's top edge (+Y) points away
 * from the viewer (the photo's "head" faces away from where you stand).
 *
 * Pure function: reads only its arguments + module-scoped temporaries, so it is
 * unit-testable without any 8th Wall / browser globals.
 */

import { Matrix4, Vector3 } from 'three'

// ── module-scoped temporaries — reused to avoid per-placement allocation ─────
const _hit = new Matrix4()
const _pos = new Vector3()
const _normal = new Vector3()
const _hitInPlane = new Vector3()
const _fromCam = new Vector3()
const _xAxis = new Vector3()
const _yAxis = new Vector3()
const _out = new Matrix4()

/**
 * Build the world transform that lays a poster flat in the surface plane.
 *
 * @param hitMatrix Column-major Float32Array from the hit-test pose
 *                  (`readReticlePose().matrix`). Its local +Y is the surface
 *                  normal; its translation is the contact point.
 * @param cameraPos Optional camera world position, used only as a fallback for
 *                  near-horizontal surfaces (where gravity projects to ~zero in
 *                  the plane): the image's top edge is then oriented away from
 *                  the camera, projected into the surface plane. On walls and
 *                  slopes the in-plane "up" is gravity-aligned regardless of
 *                  this argument. When omitted/null — or when the camera also
 *                  sits along the surface normal — we fall back further to the
 *                  hit pose's own in-plane axis so the poster still lies flat.
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

  // Desired image "up" = gravity (world up) projected into the surface plane, so
  // the poster stands upright on a wall and points uphill on a slope. For a
  // near-horizontal surface (floor/ceiling) this projects to ~zero and we fall
  // back to the legacy rule. worldUp·normal == normal.y, so the projection is
  // worldUp - normal.y * normal.
  _yAxis.set(0, 1, 0).addScaledVector(_normal, -_normal.y)

  // Fallback 1 (near-horizontal surface): point the top AWAY from the camera,
  // projected into the surface plane — the legacy floor behaviour.
  if (_yAxis.lengthSq() < 1e-8 && cameraPos) {
    _fromCam.subVectors(_pos, cameraPos)
    _yAxis.copy(_fromCam).addScaledVector(_normal, -_fromCam.dot(_normal))
  }

  // Fallback 2 (no camera, or camera along the normal): the hit pose's own
  // in-plane axis.
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
