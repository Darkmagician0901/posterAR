/**
 * posterPlacement.ts
 *
 * Creates, tracks, scales, and removes the poster meshes placed in the AR
 * scene. Because 8th Wall's SLAM world-tracking (camera-based positional
 * tracking) keeps the world coordinate frame stable, a poster placed at a
 * world transform simply stays there — no per-frame anchor update is
 * required. Animated (GIF) posters carry a PosterAnimator that is ticked
 * each frame and disposed with the poster.
 */

import {
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Texture,
} from 'three'

import type { PosterAnimator } from '@/xr8/gifAnimator'
import { releasePosterTexture } from '@/xr8/posterTextureCache'

/** Everything tracked for one poster currently in the scene. */
export interface PlacedPoster {
  /** Stable identifier, generated at place() time unless supplied. */
  id: string
  /** Source URL the texture was acquired from (cache key for release). */
  url: string
  /** Scene node holding the world transform; the mesh is its child. */
  group: Group
  /** The textured plane that displays the poster image. */
  mesh: Mesh
  /** The poster image texture (static, or animator-driven for GIFs). */
  texture: Texture
  /** Per-frame GIF animator, or null for static images. */
  animator: PosterAnimator | null
  /** Base plane dimensions in metres, before any setScale() override. */
  size: { width: number; height: number }
}

/**
 * Manages the lifecycle of posters placed in the 3D scene: creating the
 * plane mesh at a hit-test pose, ticking GIF animators every frame, scaling,
 * and removal (including freeing GPU resources and returning the shared
 * texture to posterTextureCache).
 */
export class PosterPlacement {
  private readonly _sceneRoot: Group
  private readonly _posters: Map<string, PlacedPoster> = new Map()
  private readonly _tmpMatrix = new Matrix4()

  /**
   * @param sceneRoot — Scene group all poster groups are added under
   *   (typically the three.js scene from XR8.Threejs.xrScene()).
   */
  constructor(sceneRoot: Group) {
    this._sceneRoot = sceneRoot
  }

  /**
   * Places a poster at the world transform described by `matrix`.
   *
   * @param matrix — The 16 floats of a 4x4 transform in column-major order
   *   (column-by-column, the layout three.js expects), normally taken
   *   straight from readReticlePose().matrix.
   * @param texture — The poster image texture (static or animated).
   * @param heightOverWidth — Aspect ratio (height / width) of the source
   *   image; falls back to 1 (square) when 0 or NaN.
   * @param id — Optional stable id; one is generated if omitted.
   * @param url — Source URL the texture was acquired from (used to release
   *   the texture-cache entry on removal).
   * @param animator — Per-frame animator for GIFs; null for static images.
   * @returns The poster id (the generated one when `id` was omitted).
   */
  place(
    matrix: Float32Array,
    texture: Texture,
    heightOverWidth: number,
    id?: string,
    url: string = '',
    animator: PosterAnimator | null = null,
  ): string {
    const width = 0.5
    const height = width * (heightOverWidth || 1)

    const geometry = new PlaneGeometry(width, height)
    // transparent + a tiny alphaTest makes the texture's alpha channel show
    // the real world through (cut-out PNGs and transparent-background GIFs)
    // instead of rendering transparent regions as an opaque black box. The
    // small alphaTest discards fully-transparent pixels so depth stays sane
    // and cut-out edges don't pick up dark halos.
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.01,
    })
    const mesh = new Mesh(geometry, material)

    const group = new Group()
    // We write the world transform directly into group.matrix below. Setting
    // matrixAutoUpdate = false stops three.js from recomputing (and thereby
    // overwriting) that matrix from the group's position/rotation/scale
    // properties on every render.
    group.matrixAutoUpdate = false
    this._tmpMatrix.fromArray(matrix)
    group.matrix.copy(this._tmpMatrix)

    group.add(mesh)
    this._sceneRoot.add(group)

    const posterId =
      id ?? `poster-${Date.now()}-${Math.random().toString(36).slice(2)}`

    this._posters.set(posterId, {
      id: posterId,
      url,
      group,
      mesh,
      texture,
      animator,
      size: { width, height },
    })

    return posterId
  }

  /**
   * Advances all animated posters. Called once per frame; static posters are
   * no-ops. Each distinct animator is updated at most once per call even when
   * multiple posters share the same animator instance.
   *
   * @param deltaMs — Milliseconds elapsed since the previous frame.
   */
  tick(deltaMs: number): void {
    const seen = new Set<PosterAnimator>()
    for (const { animator } of this._posters.values()) {
      if (animator && !seen.has(animator)) {
        seen.add(animator)
        animator.update(deltaMs)
      }
    }
  }

  /**
   * Overrides the displayed size of a poster while keeping it anchored at its
   * world transform. Scale is applied to the mesh, not the group matrix, so
   * the placement pose stored on the group is never disturbed.
   *
   * @param id — Id of the poster to resize; unknown ids are ignored.
   * @param scaleX — Desired displayed width in metres.
   * @param scaleY — Desired displayed height in metres.
   */
  setScale(id: string, scaleX: number, scaleY: number): void {
    const record = this._posters.get(id)
    if (!record) return
    const { mesh, size } = record
    mesh.scale.set(scaleX / size.width, scaleY / size.height, 1)
  }

  /**
   * Spins a poster within its own surface plane (about the surface normal)
   * while keeping it anchored at its world transform. Like setScale, the
   * rotation is applied to the mesh — not the group matrix — so the placement
   * pose is never disturbed, and it composes with any scale without shear
   * (both act in/about the plane's local frame). The angle is absolute, not
   * relative to the placement's default orientation: 0 means "as placed".
   *
   * @param id — Id of the poster to rotate; unknown ids are ignored.
   * @param radians — In-plane spin about the surface normal, in radians.
   */
  setRotation(id: string, radians: number): void {
    const record = this._posters.get(id)
    if (!record) return
    record.mesh.rotation.z = radians
  }

  /**
   * Removes a single poster from the scene and frees its resources.
   *
   * "Dispose" here is three.js's dispose(): GPU-side buffers are not garbage
   * collected with the JS object, so they must be freed explicitly. Geometry
   * and material are disposed in this method; the texture and animator are
   * shared across posters with the same URL, so their lifetime is managed by
   * posterTextureCache and we only drop our reference via
   * releasePosterTexture.
   *
   * @param id — Id of the poster to remove; unknown ids are ignored.
   */
  remove(id: string): void {
    const record = this._posters.get(id)
    if (!record) return
    const { group, mesh, url } = record
    group.removeFromParent()
    mesh.geometry.dispose()
    ;(mesh.material as MeshBasicMaterial).dispose()
    releasePosterTexture(url)
    this._posters.delete(id)
  }

  /** Remove every poster and free all GPU resources. */
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
