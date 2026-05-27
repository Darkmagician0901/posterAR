/**
 * SyntheticSurfaceMesh
 *
 * Fallback "this is the surface we found" visualization for sessions where
 * `frame.detectedPlanes` is not exposed (WebXR API Emulator, ARCore sessions
 * without the plane-detection optional feature). Draws a 60×60 cm
 * semi-transparent green grid quad at the hit-test pose, oriented so its
 * normal matches the hit's normal — i.e. the quad lies flush against the
 * detected surface.
 *
 * This is intentionally NOT a replacement for `PlaneRenderer`. When real
 * plane polygons exist, PlaneRenderer's outlines + fills are more accurate
 * and we hide this mesh.
 *
 * Same matrix discipline as the rest of the XR pipeline: matrixAutoUpdate
 * is off and the matrix is rewritten every frame from the hit-test pose.
 */

import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
} from 'three';

const QUAD_SIZE = 0.6; // 60 cm
const TEXTURE_REPEAT = 6; // 6 grid cells across the quad

const makeGridTexture = (color: string): CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  // Faint fill so the surface reads as solid-ish, not transparent.
  ctx.fillStyle = 'rgba(34, 197, 94, 0.08)';
  ctx.fillRect(0, 0, 256, 256);

  // Grid lines.
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 252, 252);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(128, 0); ctx.lineTo(128, 256);
  ctx.moveTo(0, 128); ctx.lineTo(256, 128);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const p = (i / 4) * 256;
    ctx.moveTo(p, 0); ctx.lineTo(p, 256);
    ctx.moveTo(0, p); ctx.lineTo(256, p);
  }
  ctx.stroke();

  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(TEXTURE_REPEAT, TEXTURE_REPEAT);
  return tex;
};

const HORIZONTAL_COLOR = '#22c55e';
const VERTICAL_COLOR = '#06b6d4';

export class SyntheticSurfaceMesh {
  private readonly group: Group;
  private readonly quad: Mesh;
  private readonly material: MeshBasicMaterial;
  private readonly texHorizontal: CanvasTexture;
  private readonly texVertical: CanvasTexture;
  private currentVertical: boolean | null = null;
  private readonly tmpMatrix = new Matrix4();

  constructor(parent: Group) {
    this.group = new Group();
    this.group.matrixAutoUpdate = false;
    this.group.visible = false;
    parent.add(this.group);

    this.texHorizontal = makeGridTexture(HORIZONTAL_COLOR);
    this.texVertical = makeGridTexture(VERTICAL_COLOR);

    // The hit-test pose for a horizontal surface has +Y as the surface
    // normal. A PlaneGeometry has its normal along +Z by default, so we
    // rotate -PI/2 about X to align +Y → +Z and let the pose matrix do
    // the rest.
    const geom = new PlaneGeometry(QUAD_SIZE, QUAD_SIZE);
    geom.rotateX(-Math.PI / 2);

    this.material = new MeshBasicMaterial({
      map: this.texHorizontal,
      color: new Color(0xffffff),
      transparent: true,
      opacity: 0.85,
      side: DoubleSide,
      depthWrite: false,
    });

    this.quad = new Mesh(geom, this.material);
    this.group.add(this.quad);
  }

  /**
   * Drop the mesh at the hit-test pose. Matrix is taken verbatim so the
   * quad lies in the same plane as the hit reticle, oriented to the hit
   * normal.
   */
  update(hitMatrix: Float32Array, vertical: boolean): void {
    this.tmpMatrix.fromArray(hitMatrix);
    this.group.matrix.copy(this.tmpMatrix);
    this.group.visible = true;
    if (this.currentVertical !== vertical) {
      this.material.map = vertical ? this.texVertical : this.texHorizontal;
      this.material.needsUpdate = true;
      this.currentVertical = vertical;
    }
  }

  hide(): void {
    this.group.visible = false;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.quad.geometry.dispose();
    this.material.dispose();
    this.texHorizontal.dispose();
    this.texVertical.dispose();
  }
}
