/**
 * surfaceHighlight.ts
 *
 * The translucent green patch that shows the surface currently detected under
 * the crosshair. It is a quad laid IN the surface plane (facing along the
 * surface normal), sized to the fitted region's extent, and posed straight
 * from the surface-estimate matrix.
 *
 * Mirrors the poster-placement pattern: a Group with `matrixAutoUpdate = false`
 * holds the world pose; a child Mesh carries the size via its local scale.
 *
 * The matrix convention matches the reticle / hit pose: local +Y is the surface
 * normal. A PlaneGeometry faces +Z, so the quad is rotated -90° about X to face
 * +Y; after that rotation it spans local X (uAxis) and local Z (vAxis).
 */

import {
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three'

export interface SurfaceHighlight {
  /** Add this to the scene root. */
  object: Group
  /** Write a surface-estimate pose (16 floats, column-major; +Y = normal). */
  setPose(matrix: Float32Array): void
  /** Resize the patch to the fitted region's half-extents (metres). */
  setSize(uHalf: number, vHalf: number): void
  /** Show / hide the patch. */
  setVisible(v: boolean): void
  /** Free GPU resources and detach from the scene. */
  dispose(): void
}

/**
 * Build the green surface-highlight patch.
 *
 * @returns The control handle; the caller adds `object` to the scene root.
 *   Starts hidden at unit size.
 */
export function createSurfaceHighlight(): SurfaceHighlight {
  const group = new Group()
  group.matrixAutoUpdate = false
  group.visible = false

  const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  const material = new MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.25,
    side: DoubleSide,
    depthWrite: false,
  })
  const mesh = new Mesh(geometry, material)
  // Below the reticle rings (renderOrder 998/999) so the ring stays on top.
  mesh.renderOrder = 997
  group.add(mesh)

  const tmp = new Matrix4()

  return {
    object: group,
    setPose(matrix) {
      tmp.fromArray(matrix)
      group.matrix.copy(tmp)
    },
    setSize(uHalf, vHalf) {
      // Quad spans X (uAxis) and Z (vAxis); full size = 2 × half-extent.
      mesh.scale.set(Math.max(2 * uHalf, 0.001), 1, Math.max(2 * vHalf, 0.001))
    },
    setVisible(v) {
      group.visible = v
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      group.removeFromParent()
    },
  }
}
