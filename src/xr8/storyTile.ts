/**
 * storyTile.ts — the single AR-anchored "diorama tile" for the story.
 *
 * Where posterPlacement.ts manages MANY opaque posters, the story shows ONE
 * tile that is planted once on the detected ground and then swaps its texture
 * as the user steps through the eras. The material is transparent (alphaTest)
 * so the real ground shows through the pixel-art gaps, making the diorama look
 * like it grew out of the dirt.
 *
 * 8th Wall's SLAM keeps the world frame stable, so once the tile's group
 * matrix is set it simply stays put — no per-frame anchor update needed. The
 * tile's orientation (upright or flat) comes entirely from the matrix supplied
 * by composePosterMatrix(); this class just decomposes and applies it.
 */

import { DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Texture } from 'three';

/** Width of the diorama in metres (height follows the art aspect). */
const TILE_WIDTH_M = 0.9;

/**
 * Owns the lifecycle of the one diorama tile: planting it at a hit-test pose,
 * swapping its texture per era, and disposing GPU resources on teardown.
 */
export class StoryTile {
  private readonly _sceneRoot: Group;
  private readonly _group: Group;
  private _mesh: Mesh | null = null;
  private _material: MeshBasicMaterial | null = null;
  private _placed = false;
  /** Aspect of the current art, kept so a width change can resize alone. */
  private _aspect = 1;
  /**
   * Width override, in the same units the caller's matrix uses.
   *
   * Null means the ground-placed default, `TILE_WIDTH_M` — a fixed real-world
   * size, which is right when the tile stands on a floor and nothing else sets
   * the scale. A marker-anchored tile instead takes its width from the
   * marker's own reported size, so it stays correct whatever units the engine
   * is reporting in.
   */
  private _width: number | null = null;

  /**
   * @param sceneRoot — Group the tile is added under (the engine scene group).
   */
  constructor(sceneRoot: Group) {
    this._sceneRoot = sceneRoot;
    this._group = new Group();
    this._sceneRoot.add(this._group);
  }

  /** Whether the tile has been planted on the ground yet. */
  get placed(): boolean {
    return this._placed;
  }

  /**
   * Plants the tile on the detected surface at the given pose.
   *
   * @param matrix — 16 column-major floats of the pose (normally from
   *   composePosterMatrix(readReticlePose().matrix, cameraPos)), which already
   *   encodes the upright-or-flat orientation.
   */
  place(matrix: Float32Array): void {
    const m = new Matrix4().fromArray(matrix as unknown as number[]);
    m.decompose(this._group.position, this._group.quaternion, this._group.scale);
    this._placed = true;
  }

  /**
   * Swaps the tile's texture (era change). Builds the mesh on first use and
   * resizes the plane to the new art's aspect ratio.
   *
   * @param texture — The era's rasterized CanvasTexture.
   * @param aspect — height / width of the art, to size the plane.
   */
  setTexture(texture: Texture, aspect: number): void {
    this._aspect = aspect || 1;
    const width = this._width ?? TILE_WIDTH_M;
    const height = width * this._aspect;

    if (!this._mesh || !this._material) {
      this._material = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        // Drop near-transparent pixels so the art reads cleanly on the ground
        // without a translucent "card" rectangle around it.
        alphaTest: 0.5,
        side: DoubleSide,
        depthWrite: false,
      });
      const geometry = new PlaneGeometry(width, height);
      this._mesh = new Mesh(geometry, this._material);
      // composePosterMatrix already orients the group (upright facing the viewer,
      // or flat on the ground per the POSTER_STANDS_UPRIGHT toggle), so the
      // +Z-facing plane needs no extra mesh rotation — matching PosterPlacement.
      this._group.add(this._mesh);
      return;
    }

    // Subsequent era swaps: replace the map and resize the plane.
    const prev = this._material.map;
    this._material.map = texture;
    this._material.needsUpdate = true;
    if (prev && prev !== texture) prev.dispose();

    this._mesh.geometry.dispose();
    this._mesh.geometry = new PlaneGeometry(width, height);
  }

  /**
   * Sets how wide the tile should be drawn, overriding the ground default.
   *
   * Used by the marker path, where width comes from the marker's own reported
   * size rather than a fixed number of metres. Called every frame while a
   * marker is tracked, so it returns early unless the width actually changed —
   * rebuilding the plane geometry each frame would churn GPU buffers for
   * nothing.
   *
   * @param width — Tile width in the caller's units, or null to restore the
   *   fixed ground-placed default.
   */
  setWidth(width: number | null): void {
    if (width !== null && !(Number.isFinite(width) && width > 0)) return;
    if (this._width === width) return;
    this._width = width;

    if (!this._mesh) return;
    const w = width ?? TILE_WIDTH_M;
    this._mesh.geometry.dispose();
    this._mesh.geometry = new PlaneGeometry(w, w * this._aspect);
  }

  /**
   * Per-frame hook (reserved for animated era textures driven by a future
   * GIF/canvas animator). No-op for the current static SVG textures.
   *
   * @param _deltaMs — Milliseconds since the previous frame.
   */
  tick(_deltaMs: number): void {
    // Static textures: nothing to advance yet.
  }

  /** Removes the tile and frees its GPU resources. */
  clear(): void {
    if (this._mesh) {
      this._group.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._mesh = null;
    }
    if (this._material) {
      this._material.map?.dispose();
      this._material.dispose();
      this._material = null;
    }
    this._sceneRoot.remove(this._group);
    this._placed = false;
  }
}
