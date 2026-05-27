/**
 * PlaneRenderer
 *
 * Consumes `frame.detectedPlanes` and renders ONE plane at a time — the one
 * the reticle currently rests on. Other detected planes stay in the cache
 * but are not drawn unless `showAll` is on (debug toggle).
 *
 * Each plane mesh's matrix is rewritten from `frame.getPose(plane.planeSpace,
 * localSpace)` every frame. No position.set anywhere. matrixAutoUpdate is
 * disabled on all owned objects.
 */

import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  Uint16BufferAttribute,
  Vector3,
} from 'three';

import { debugTelemetry, PlaneStability } from './debugTelemetry';

const HORIZONTAL_COLOR = new Color('#22c55e');
const VERTICAL_COLOR = new Color('#06b6d4');
const PASSIVE_OPACITY = 0.3;
const FILL_OPACITY = 0.25;
const NORMAL_DIST_TOLERANCE = 0.02; // 2 cm
/** Keep showing the previously-active plane for this long after the hit pose
 *  moves off it, so brief tracking jitter doesn't make the mesh blink. */
const STICKY_ACTIVE_MS = 500;

interface PlaneRecord {
  plane: XRPlane;
  group: Group;
  outline: LineLoop;
  fill: Mesh;
  label: Sprite;
  firstSeen: number;
  lastChangedTime: number;
  changeRateEMA: number;
  centroid: Vector3;
}

export interface PlaneRendererUpdate {
  planes: ReadonlySet<XRPlane> | undefined;
  /** The pose returned by hit-test this frame, in local space. */
  activeHitMatrix: Float32Array | null;
  localSpace: XRReferenceSpace;
  showAll: boolean;
}

export class PlaneRenderer {
  private readonly cache = new Map<XRPlane, PlaneRecord>();
  private activePlane: XRPlane | null = null;
  private activeStability: PlaneStability = null;
  private lastActiveMatchTime: number = 0;
  private readonly tmpMatrix = new Matrix4();
  private readonly tmpVec = new Vector3();

  constructor(private readonly root: Group) {}

  update({ planes, activeHitMatrix, localSpace, showAll }: PlaneRendererUpdate, frame: XRFrame): void {
    if (!planes) {
      this.activePlane = null;
      this.activeStability = null;
      for (const record of this.cache.values()) record.group.visible = false;
      return;
    }

    // 1. Drop cache entries whose plane is gone.
    for (const [plane, record] of this.cache) {
      if (!planes.has(plane)) {
        this.disposeRecord(record);
        this.cache.delete(plane);
      }
    }

    // 2. Add / refresh entries for current planes.
    const now = performance.now();
    for (const plane of planes) {
      let record = this.cache.get(plane);
      if (!record) {
        record = this.buildRecord(plane, now);
        this.cache.set(plane, record);
      } else if (plane.lastChangedTime > record.lastChangedTime) {
        this.rebuildGeometry(record, plane);
        const dtSec = Math.max(0.001, (now - record.firstSeen) / 1000);
        record.changeRateEMA =
          record.changeRateEMA * 0.7 + (1 / dtSec) * 0.3;
        record.lastChangedTime = plane.lastChangedTime;
      }
    }

    // 3. Determine active plane by geometric match against the hit pose.
    // Honor a sticky window so brief tracking jitter doesn't drop the
    // active highlight — if we found a match recently and the previous
    // active plane is still present, keep it.
    const matched = activeHitMatrix
      ? this.matchActivePlane(activeHitMatrix, frame, localSpace)
      : null;
    if (matched) {
      this.activePlane = matched;
      this.lastActiveMatchTime = now;
    } else if (
      this.activePlane &&
      planes.has(this.activePlane) &&
      now - this.lastActiveMatchTime <= STICKY_ACTIVE_MS
    ) {
      // keep activePlane as-is
    } else {
      this.activePlane = null;
    }

    // 4. Pose update + visibility per record.
    for (const record of this.cache.values()) {
      const pose = frame.getPose(record.plane.planeSpace, localSpace);
      if (!pose) {
        record.group.visible = false;
        continue;
      }

      this.tmpMatrix.fromArray(pose.transform.matrix);
      record.group.matrix.copy(this.tmpMatrix);

      const isActive = record.plane === this.activePlane;
      const visible = isActive || showAll;
      record.group.visible = visible;

      if (!visible) continue;

      const orientationColor =
        record.plane.orientation === 'vertical' ? VERTICAL_COLOR : HORIZONTAL_COLOR;

      const outlineMat = record.outline.material as LineBasicMaterial;
      outlineMat.color.copy(orientationColor);
      outlineMat.opacity = isActive ? 1 : PASSIVE_OPACITY;

      const fillMat = record.fill.material as MeshBasicMaterial;
      fillMat.color.copy(orientationColor);
      fillMat.opacity = isActive ? FILL_OPACITY : 0;
      record.fill.visible = isActive;

      record.label.visible = isActive;
      if (isActive) {
        const stability = this.computeStability(record, now);
        this.activeStability = stability;
        this.updateLabelTexture(record, stability);
      }
    }

    if (!this.activePlane) this.activeStability = null;
  }

  getActiveStability(): PlaneStability {
    return this.activeStability;
  }

  countByOrientation(): { horizontal: number; vertical: number } {
    let h = 0, v = 0;
    for (const record of this.cache.values()) {
      if (record.plane.orientation === 'vertical') v++;
      else h++;
    }
    return { horizontal: h, vertical: v };
  }

  dispose(): void {
    for (const record of this.cache.values()) this.disposeRecord(record);
    this.cache.clear();
    this.activePlane = null;
    this.activeStability = null;
    this.lastActiveMatchTime = 0;
  }

  // ---------- internals ----------

  private buildRecord(plane: XRPlane, now: number): PlaneRecord {
    const group = new Group();
    group.matrixAutoUpdate = false;
    group.visible = false;

    const outlineGeom = new BufferGeometry();
    const outlineMat = new LineBasicMaterial({
      color: HORIZONTAL_COLOR,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const outline = new LineLoop(outlineGeom, outlineMat);

    const fillGeom = new BufferGeometry();
    const fillMat = new MeshBasicMaterial({
      color: HORIZONTAL_COLOR,
      transparent: true,
      opacity: FILL_OPACITY,
      depthWrite: false,
      side: DoubleSide,
    });
    const fill = new Mesh(fillGeom, fillMat);

    const labelTex = this.makeLabelTexture('forming', '#f59e0b');
    const labelMat = new SpriteMaterial({
      map: labelTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const label = new Sprite(labelMat);
    label.scale.set(0.25, 0.06, 1);

    group.add(outline);
    group.add(fill);
    group.add(label);
    this.root.add(group);

    const record: PlaneRecord = {
      plane,
      group,
      outline,
      fill,
      label,
      firstSeen: now,
      lastChangedTime: plane.lastChangedTime,
      changeRateEMA: 0,
      centroid: new Vector3(),
    };

    this.rebuildGeometry(record, plane);
    return record;
  }

  private rebuildGeometry(record: PlaneRecord, plane: XRPlane): void {
    const polygon = plane.polygon;
    if (!polygon || polygon.length < 3) return;

    const positions = new Float32Array(polygon.length * 3);
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i];
      positions[i * 3 + 0] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      cx += p.x; cy += p.y; cz += p.z;
    }
    cx /= polygon.length; cy /= polygon.length; cz /= polygon.length;
    record.centroid.set(cx, cy, cz);
    record.label.position.set(cx, cy + 0.05, cz);

    record.outline.geometry.dispose();
    const outlineGeom = new BufferGeometry();
    outlineGeom.setAttribute('position', new Float32BufferAttribute(positions, 3));
    record.outline.geometry = outlineGeom;

    record.fill.geometry.dispose();
    const fillGeom = new BufferGeometry();
    fillGeom.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const indices: number[] = [];
    for (let i = 1; i < polygon.length - 1; i++) {
      indices.push(0, i, i + 1);
    }
    fillGeom.setIndex(new Uint16BufferAttribute(indices, 1));
    fillGeom.computeVertexNormals();
    record.fill.geometry = fillGeom;
  }

  private matchActivePlane(
    hitMatrix: Float32Array,
    frame: XRFrame,
    localSpace: XRReferenceSpace
  ): XRPlane | null {
    // Hit position in local space.
    const hx = hitMatrix[12], hy = hitMatrix[13], hz = hitMatrix[14];

    let best: XRPlane | null = null;
    let bestDist = NORMAL_DIST_TOLERANCE;

    for (const record of this.cache.values()) {
      const pose = frame.getPose(record.plane.planeSpace, localSpace);
      if (!pose) continue;
      const m = pose.transform.matrix;

      // Plane normal = column 1 of the pose matrix (Y axis in plane space).
      const nx = m[4], ny = m[5], nz = m[6];
      // Point on plane = pose translation.
      const px = m[12], py = m[13], pz = m[14];

      const dist = Math.abs((hx - px) * nx + (hy - py) * ny + (hz - pz) * nz);
      if (dist <= bestDist) {
        // Also require the hit to lie within the polygon's bounding sphere
        // around the centroid (cheap pre-filter against unrelated coplanar
        // surfaces). Centroid is in plane-local; project hit into local.
        this.tmpMatrix.fromArray(m).invert();
        this.tmpVec.set(hx, hy, hz).applyMatrix4(this.tmpMatrix);
        const dx = this.tmpVec.x - record.centroid.x;
        const dz = this.tmpVec.z - record.centroid.z;
        const polygonRadius = this.polygonRadius(record);
        if (Math.sqrt(dx * dx + dz * dz) <= polygonRadius * 1.1) {
          best = record.plane;
          bestDist = dist;
        }
      }
    }

    return best;
  }

  private polygonRadius(record: PlaneRecord): number {
    const polygon = record.plane.polygon;
    if (!polygon || polygon.length === 0) return 0;
    let max = 0;
    for (const p of polygon) {
      const dx = p.x - record.centroid.x;
      const dz = p.z - record.centroid.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > max) max = d;
    }
    return max;
  }

  private computeStability(record: PlaneRecord, now: number): PlaneStability {
    const ageSec = (now - record.firstSeen) / 1000;
    const sinceChangeMs = now - record.lastChangedTime;

    if (sinceChangeMs < 250) return 'reshaping';
    if (ageSec > 5 && record.changeRateEMA < 0.5) return 'stable';
    return 'forming';
  }

  private updateLabelTexture(record: PlaneRecord, stability: PlaneStability): void {
    const mat = record.label.material as SpriteMaterial;
    const tag = stability ?? 'forming';
    const color =
      stability === 'stable' ? '#22c55e' :
      stability === 'reshaping' ? '#ef4444' :
      '#f59e0b';
    if ((mat as any).__tag === tag) return;
    (mat as any).__tag = tag;
    if (mat.map) mat.map.dispose();
    mat.map = this.makeLabelTexture(tag, color);
    mat.needsUpdate = true;
  }

  private makeLabelTexture(text: string, color: string): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    const r = 16;
    const w = canvas.width, h = canvas.height;
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = color;
    ctx.font = '700 32px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const tex = new CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private disposeRecord(record: PlaneRecord): void {
    record.group.removeFromParent();
    record.outline.geometry.dispose();
    (record.outline.material as LineBasicMaterial).dispose();
    record.fill.geometry.dispose();
    (record.fill.material as MeshBasicMaterial).dispose();
    const labelMat = record.label.material as SpriteMaterial;
    if (labelMat.map) labelMat.map.dispose();
    labelMat.dispose();
  }
}

export { debugTelemetry };
