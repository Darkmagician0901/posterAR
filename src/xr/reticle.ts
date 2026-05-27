/**
 * Reticle — surface-tracking placement indicator.
 *
 * Two modes:
 *   1. tracking  — the matrix is rewritten every frame from a hit-test pose.
 *                  matrixAutoUpdate is disabled so three.js never overwrites
 *                  our matrix from local TRS components.
 *   2. searching — head-locked. The reticle sits 1 m in front of the camera
 *                  with a slowly pulsing outline, communicating "we're
 *                  looking for a surface, move the phone around." Used when
 *                  hit-test is active but produces zero results.
 *
 * The scanning mode is a child of the camera (added by the caller), so
 * letting matrixAutoUpdate compute its local transform is fine — there is
 * no XR pose involved.
 */

import {
  Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from 'three';

export type ReticleMode = 'hidden' | 'tracking' | 'searching';

export interface Reticle {
  /** The on-surface tracking ring. Add to the scene root. */
  mesh: Mesh;
  /** The head-locked searching ring + outer pulse. Add as a child of the
   *  XR camera (renderer.xr.getCamera()) so it follows the user's view. */
  scanner: Group;
  setPose(matrix: Float32Array): void;
  setVertical(vertical: boolean): void;
  setMode(mode: ReticleMode): void;
  /** Drive the searching-mode pulse. Pass the XRFrame timestamp. */
  tick(timeMs: number): void;
}

export const createReticle = (): Reticle => {
  // ---- tracking ring (on-surface) ----
  const trackingGeom = new RingGeometry(0.07, 0.1, 32).rotateX(-Math.PI / 2);
  const trackingMat = new MeshBasicMaterial({
    color: new Color('#00ff88'),
    transparent: true,
    opacity: 0.9,
    side: DoubleSide,
    depthWrite: false,
  });
  const mesh = new Mesh(trackingGeom, trackingMat);
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;

  // ---- searching ring (head-locked) ----
  // Two concentric rings: an inner crosshair-ish ring + an outer pulse that
  // grows/fades. Sized to occupy roughly the same screen footprint as the
  // tracking reticle at typical placement distances.
  const scanner = new Group();
  scanner.position.set(0, 0, -1); // 1 m in front of the camera
  scanner.visible = false;

  const innerGeom = new RingGeometry(0.04, 0.05, 32);
  const innerMat = new MeshBasicMaterial({
    color: new Color('#fbbf24'), // amber to match diagnostic 'searching'
    transparent: true,
    opacity: 0.95,
    side: DoubleSide,
    depthWrite: false,
    depthTest: false, // always on top so the user sees it even if WebXR
                      // composes against an opaque clear
  });
  const innerRing = new Mesh(innerGeom, innerMat);
  innerRing.renderOrder = 999;
  scanner.add(innerRing);

  const pulseGeom = new RingGeometry(0.06, 0.075, 32);
  const pulseMat = new MeshBasicMaterial({
    color: new Color('#fbbf24'),
    transparent: true,
    opacity: 0.5,
    side: DoubleSide,
    depthWrite: false,
    depthTest: false,
  });
  const pulseRing = new Mesh(pulseGeom, pulseMat);
  pulseRing.renderOrder = 998;
  scanner.add(pulseRing);

  const tmp = new Matrix4();

  return {
    mesh,
    scanner,
    setPose(matrix) {
      tmp.fromArray(matrix);
      mesh.matrix.copy(tmp);
    },
    setVertical(vertical) {
      trackingMat.color.set(vertical ? '#00ffff' : '#00ff88');
    },
    setMode(mode) {
      mesh.visible = mode === 'tracking';
      scanner.visible = mode === 'searching';
    },
    tick(timeMs) {
      if (!scanner.visible) return;
      // Pulse: 0.85 .. 1.4× scale on a 1.6 s cycle, opacity inverse.
      const t = (timeMs % 1600) / 1600;
      const s = 0.85 + 0.55 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
      pulseRing.scale.setScalar(s);
      pulseMat.opacity = 0.6 - 0.5 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
    },
  };
};
