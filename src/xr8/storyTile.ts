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

import {
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Texture,
} from 'three';

/** Default diorama width in metres (height follows the art aspect). */
const DEFAULT_TILE_WIDTH_M = 0.9;

/**
 * Owns the lifecycle of the one diorama tile: planting it at a hit-test pose,
 * swapping its texture per era, and disposing GPU resources on teardown.
 */
export class StoryTile {
  private readonly _sceneRoot: Group;
  private readonly _group: Group;
  private readonly _widthM: number;
  private _mesh: Mesh | null = null;
  private _material: MeshBasicMaterial | null = null;
  private _placed = false;

  /**
   * @param sceneRoot — Group the tile is added under (the engine scene group).
   * @param widthM — Diorama width in metres (admin-tunable; default 0.9).
   */
  constructor(sceneRoot: Group, widthM: number = DEFAULT_TILE_WIDTH_M) {
    this._sceneRoot = sceneRoot;
    this._group = new Group();
    this._sceneRoot.add(this._group);
    this._widthM = widthM;
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
    const width = this._widthM;
    const height = width * (aspect || 1);

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
