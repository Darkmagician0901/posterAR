/**
 * posterPlacement.ts
 *
 * Replaces the old AnchorManager. Because 8th Wall SLAM keeps the world
 * frame stable, a poster placed at a world transform simply stays there —
 * no per-frame anchor update is required, so there is intentionally no
 * update() method.
 */

import {
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Texture,
} from 'three'

export interface PlacedPoster {
  id: string
  group: Group
  mesh: Mesh
  size: { width: number; height: number }
}

export class PosterPlacement {
  private readonly _sceneRoot: Group
  private readonly _posters: Map<string, PlacedPoster> = new Map()
  private readonly _tmpMatrix = new Matrix4()

  constructor(sceneRoot: Group) {
    this._sceneRoot = sceneRoot
  }

  /**
   * Place a poster in the scene at the world transform described by `matrix`.
   *
   * @param matrix      Column-major Float32Array from readReticlePose().matrix.
   * @param texture     The poster image texture.
   * @param aspectRatio width / height of the source image (falls back to 1).
   * @param id          Optional stable id; one is generated if omitted.
   * @returns The poster id, or null if placement failed.
   */
  place(
    matrix: Float32Array,
    texture: Texture,
    aspectRatio: number,
    id?: string,
  ): string | null {
    try {
      const width = 0.5
      const height = width * (aspectRatio || 1)

      const geometry = new PlaneGeometry(width, height)
      const material = new MeshBasicMaterial({ map: texture })
      const mesh = new Mesh(geometry, material)

      const group = new Group()
      group.matrixAutoUpdate = false
      this._tmpMatrix.fromArray(matrix)
      group.matrix.copy(this._tmpMatrix)

      group.add(mesh)
      this._sceneRoot.add(group)

      const posterId =
        id ?? `poster-${Date.now()}-${Math.random().toString(36).slice(2)}`

      const record: PlacedPoster = {
        id: posterId,
        group,
        mesh,
        size: { width, height },
      }
      this._posters.set(posterId, record)

      return posterId
    } catch {
      return null
    }
  }

  /**
   * Override the displayed size of a poster while keeping it anchored at its
   * world transform. Scale is applied to the mesh, not the group matrix.
   */
  setScale(id: string, scaleX: number, scaleY: number): void {
    const record = this._posters.get(id)
    if (!record) return
    const { mesh, size } = record
    mesh.scale.set(scaleX / size.width, scaleY / size.height, 1)
  }

  /** Remove a single poster from the scene and free its GPU resources. */
  remove(id: string): void {
    const record = this._posters.get(id)
    if (!record) return
    const { group, mesh } = record
    group.removeFromParent()
    mesh.geometry.dispose()
    ;(mesh.material as MeshBasicMaterial).dispose()
    this._posters.delete(id)
  }

  /** Remove every poster from the scene and free all GPU resources. */
  clear(): void {
    for (const id of this._posters.keys()) {
      this.remove(id)
    }
  }

  /** Number of currently placed posters. */
  size(): number {
    return this._posters.size
  }

  /** Snapshot of all currently placed posters. */
  list(): PlacedPoster[] {
    return Array.from(this._posters.values())
  }
}
