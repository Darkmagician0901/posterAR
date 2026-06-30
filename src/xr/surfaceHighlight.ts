/**
 * surfaceHighlight — a translucent footprint drawn flat on the detected ground
 * while the user is aiming, before the story tile is planted. Engine-agnostic
 * (plain three.js), mirroring reticle.ts: matrixAutoUpdate is disabled and the
 * pose matrix from the hit-test is written straight into the mesh matrix each
 * frame.
 *
 * The geometry is baked face-up (rotateX(-PI/2)) so the raw hit-test pose lays
 * it flat on a horizontal surface. Size comes from the hit-test extent (a fixed
 * default — 8th Wall reports no real surface size; see hitTestController).
 */

import {
  DoubleSide,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from 'three'

/** Control handle returned by {@link createSurfaceHighlight}. */
export interface SurfaceHighlight {
  /** The flat footprint mesh. Add to the scene root. */
  object: Object3D
  /** Writes a hit-test pose (16 column-major floats) into the mesh matrix. */
  setPose(matrix: Float32Array): void
  /** Resizes the footprint to u (width) x v (depth) metres. */
  setSize(u: number, v: number): void
  /** Shows or hides the footprint. */
  setVisible(visible: boolean): void
  /** Frees GPU resources and detaches from the scene. */
  dispose(): void
}

/** Default footprint size in metres (overridden by setSize from the extent). */
const DEFAULT_SIZE_M = 1.0

/**
 * Builds the footprint mesh and returns its control handle. The caller adds
 * `object` to the scene root. Starts hidden.
 */
export const createSurfaceHighlight = (): SurfaceHighlight => {
  const material = new MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.15,
    side: DoubleSide,
    depthWrite: false,
  })
  const mesh = new Mesh(
    new PlaneGeometry(DEFAULT_SIZE_M, DEFAULT_SIZE_M).rotateX(-Math.PI / 2),
    material,
  )
  mesh.matrixAutoUpdate = false
  mesh.visible = false
  const tmp = new Matrix4()

  return {
    object: mesh,
    setPose(matrix) {
      tmp.fromArray(matrix)
      mesh.matrix.copy(tmp)
    },
    setSize(u, v) {
      mesh.geometry.dispose()
      mesh.geometry = new PlaneGeometry(u, v).rotateX(-Math.PI / 2)
    },
    setVisible(visible) {
      mesh.visible = visible
    },
    dispose() {
      mesh.geometry.dispose()
      material.dispose()
      mesh.removeFromParent()
    },
  }
}
