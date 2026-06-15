/**
 * Reticle — surface-tracking placement indicator.
 *
 * The reticle is the small ring-shaped cursor that shows the user where a
 * poster would be placed. Its pose comes from a hit-test (asking the AR
 * engine which real-world surface lies under the screen centre).
 *
 * Two modes:
 *   1. tracking  — the ring sits on a detected surface; its matrix is
 *                  rewritten every frame from the hit-test pose.
 *                  matrixAutoUpdate is disabled so three.js never overwrites
 *                  that matrix by recomputing it from the mesh's local
 *                  position/rotation/scale properties.
 *   2. searching — head-locked (attached to the camera, so it moves with the
 *                  user's view). The ring sits 1 m in front of the camera
 *                  with a slowly pulsing outline, communicating "we're
 *                  looking for a surface, move the phone around." Used when
 *                  hit-test is active but produces zero results.
 *
 * The searching ring is a child of the camera (added by the caller), so
 * letting matrixAutoUpdate compute its local transform is fine — there is
 * no AR pose involved.
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

/**
 * Reticle display state: 'tracking' shows the on-surface ring, 'searching'
 * shows the head-locked pulse, 'hidden' shows neither.
 */
export type ReticleMode = 'hidden' | 'tracking' | 'searching';

/** Control handle returned by {@link createReticle}. */
export interface Reticle {
  /** The on-surface tracking ring. Add to the scene root. */
  mesh: Mesh;
  /** The head-locked searching ring + outer pulse. Add as a child of the
   *  active camera (from XR8.Threejs.xrScene(), or the mock camera) so it
   *  follows the user's view. */
  scanner: Group;
  /**
   * Writes a hit-test pose straight into the tracking mesh's matrix.
   *
   * @param matrix — The 16 floats of a 4x4 transform in column-major order
   *   (listed column by column, the layout three.js expects), as produced by
   *   readReticlePose().
   */
  setPose(matrix: Float32Array): void;
  /**
   * Recolors the tracking ring by surface orientation.
   *
   * @param vertical — True for walls (ring turns cyan); false for floors and
   *   other horizontal surfaces (ring stays green).
   */
  setVertical(vertical: boolean): void;
  /**
   * Switches which ring is visible.
   *
   * @param mode — 'tracking', 'searching', or 'hidden' (see {@link ReticleMode}).
   */
  setMode(mode: ReticleMode): void;
  /**
   * Drives the searching-mode pulse animation. Call once per frame; no-op
   * unless the searching ring is visible.
   *
   * @param timeMs — Frame timestamp in milliseconds (performance.now()).
   */
  tick(timeMs: number): void;
}

/**
 * Builds the reticle meshes and returns the control handle. The caller adds
 * `mesh` to the scene root and `scanner` to the camera (see {@link Reticle}).
 *
 * @returns The reticle handle: both ring objects plus the setPose /
 *   setVertical / setMode / tick controls. Both rings start hidden.
 */
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
    depthTest: false, // always render on top so the searching ring stays
                      // visible regardless of scene depth / camera-feed compositing
  });
  const innerRing = new Mesh(innerGeom, innerMat);
  // High renderOrder makes three.js draw these rings after everything else,
  // which (together with depthTest: false) keeps them on top of the scene.
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
      // Pulse: the outer ring scales from 0.85x up to 1.4x over a 1.6 s
      // cycle while its opacity fades in the opposite direction.
      // `0.5 - 0.5*cos(t*2PI)` is a "raised cosine": a cosine wave shifted
      // and scaled so it sweeps smoothly 0 -> 1 -> 0 over one cycle with no
      // sudden jump when t wraps from 1 back to 0. Driving both scale and
      // opacity from it gives a seamless "breathing" ring.
      const t = (timeMs % 1600) / 1600;
      const s = 0.85 + 0.55 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
      pulseRing.scale.setScalar(s);
      pulseMat.opacity = 0.6 - 0.5 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
    },
  };
};
