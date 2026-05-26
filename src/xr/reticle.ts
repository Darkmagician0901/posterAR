/**
 * Reticle — surface-tracking placement indicator.
 *
 * The reticle's matrix is rewritten every frame from the hit-test pose; it
 * is not added to the scene via position.set. matrixAutoUpdate is disabled
 * so three.js never overwrites our matrix from local TRS components.
 */

import {
  Mesh,
  MeshBasicMaterial,
  Matrix4,
  RingGeometry,
  Color,
} from 'three';

export interface Reticle {
  mesh: Mesh;
  setPose(matrix: Float32Array): void;
  setVisible(visible: boolean): void;
  setVertical(vertical: boolean): void;
}

export const createReticle = (): Reticle => {
  const geometry = new RingGeometry(0.07, 0.1, 32).rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    color: new Color('#00ff88'),
    transparent: true,
    opacity: 0.9,
  });

  const mesh = new Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;

  const tmp = new Matrix4();

  return {
    mesh,
    setPose(matrix) {
      tmp.fromArray(matrix);
      mesh.matrix.copy(tmp);
      mesh.visible = true;
    },
    setVisible(visible) {
      mesh.visible = visible;
    },
    setVertical(vertical) {
      material.color.set(vertical ? '#00ffff' : '#00ff88');
    },
  };
};
