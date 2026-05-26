/**
 * Anchor Manager
 *
 * For every placed poster we hold:
 *   - the XRAnchor created from the hit-test pose
 *   - a three.js mesh whose matrix is rewritten from anchor.anchorSpace
 *     every frame
 *
 * No mesh.position.set() is ever called after placement. The mesh's
 * matrixAutoUpdate is disabled so React/three never recompute the matrix
 * from position/quaternion/scale.
 */

import { Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Texture } from 'three';

export interface AnchorRecord {
  id: string;
  anchor: XRAnchor;
  group: Group;
  mesh: Mesh;
  /** Scale, in meters, applied to the poster's plane (width, height). */
  size: { width: number; height: number };
}

export class AnchorManager {
  private records = new Map<string, AnchorRecord>();
  private readonly tmpMatrix = new Matrix4();

  /** Create an anchor at the given hit-test pose and bind a mesh to it. */
  async createAnchor(
    frame: XRFrame,
    matrix: Float32Array,
    texture: Texture,
    sceneRoot: Group,
    aspectRatio: number,
    id?: string
  ): Promise<AnchorRecord | null> {
    if (!frame.createAnchor) {
      console.warn('Anchors feature unavailable on this session');
      return null;
    }

    const pose = matrixToXRRigidTransform(matrix);

    let anchor: XRAnchor;
    try {
      const space = (frame.session as XRSession & {
        requestReferenceSpace: (type: XRReferenceSpaceType) => Promise<XRReferenceSpace>;
      });
      const refSpace = await space.requestReferenceSpace('local');
      const offsetSpace = refSpace.getOffsetReferenceSpace(pose);
      const created = await frame.createAnchor(new XRRigidTransform(), offsetSpace);
      if (!created) return null;
      anchor = created;
    } catch (error) {
      console.error('createAnchor failed:', error);
      return null;
    }

    const recordId = id ?? `anchor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const width = 0.5;
    const height = width * (aspectRatio || 1);

    const geometry = new PlaneGeometry(width, height);
    const material = new MeshBasicMaterial({ map: texture, transparent: false });
    const mesh = new Mesh(geometry, material);

    const group = new Group();
    group.matrixAutoUpdate = false;
    group.add(mesh);
    sceneRoot.add(group);

    const record: AnchorRecord = {
      id: recordId,
      anchor,
      group,
      mesh,
      size: { width, height },
    };

    this.records.set(recordId, record);
    return record;
  }

  /**
   * Per-frame update. For each anchor, query pose against the local reference
   * space and apply the resulting matrix directly to the mesh.
   */
  update(frame: XRFrame, localSpace: XRReferenceSpace): void {
    for (const record of this.records.values()) {
      const pose = frame.getPose(record.anchor.anchorSpace, localSpace);
      if (!pose) {
        record.group.visible = false;
        continue;
      }
      record.group.visible = true;
      this.tmpMatrix.fromArray(pose.transform.matrix);
      record.group.matrix.copy(this.tmpMatrix);
    }
  }

  /**
   * Apply a uniform scale to the anchored mesh. The mesh sits inside the
   * anchor-driven group, so its local scale composes with the anchor matrix
   * — no position mutation involved.
   */
  setScale(id: string, scaleX: number, scaleY: number): void {
    const record = this.records.get(id);
    if (!record) return;
    const baseX = record.size.width;
    const baseY = record.size.height;
    record.mesh.scale.set(scaleX / baseX, scaleY / baseY, 1);
  }

  remove(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    record.group.removeFromParent();
    record.mesh.geometry.dispose();
    const material = record.mesh.material as MeshBasicMaterial;
    material.dispose();
    if (typeof record.anchor.delete === 'function') {
      try { record.anchor.delete(); } catch { /* ignore */ }
    }
    this.records.delete(id);
  }

  clear(): void {
    for (const id of [...this.records.keys()]) this.remove(id);
  }

  list(): AnchorRecord[] {
    return [...this.records.values()];
  }

  size(): number {
    return this.records.size;
  }
}

/**
 * Decompose a 4x4 column-major matrix into the XRRigidTransform shape that
 * XRSpace.getOffsetReferenceSpace expects.
 */
const matrixToXRRigidTransform = (m: Float32Array): XRRigidTransform => {
  const position = { x: m[12], y: m[13], z: m[14] };

  // Rotation extracted from upper-left 3x3 to quaternion.
  const m00 = m[0], m01 = m[4], m02 = m[8];
  const m10 = m[1], m11 = m[5], m12 = m[9];
  const m20 = m[2], m21 = m[6], m22 = m[10];

  const trace = m00 + m11 + m22;
  let qw: number, qx: number, qy: number, qz: number;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }

  return new XRRigidTransform(position, { x: qx, y: qy, z: qz, w: qw });
};
