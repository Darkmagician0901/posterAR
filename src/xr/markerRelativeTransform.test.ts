import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

import {
  IDENTITY_LOCAL,
  distanceFromMarker,
  localToMatrix,
  markerLocalToWorld,
  markerPoseToMatrix,
  matrixToLocal,
  originDistance,
  withDistanceFromMarker,
  worldToMarkerLocal,
  type MarkerPose,
} from '@/xr/markerRelativeTransform';

/**
 * Builds a marker pose from readable inputs.
 *
 * @param pos — World position as [x, y, z].
 * @param euler — Orientation as [x, y, z] Euler angles in radians.
 * @returns The pose in the shape an 8th Wall event delivers.
 */
function pose(pos: [number, number, number], euler: [number, number, number]): MarkerPose {
  const q = new Quaternion().setFromEuler(new Euler(...euler));
  return {
    position: { x: pos[0], y: pos[1], z: pos[2] },
    rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
  };
}

/** Asserts two matrices agree element-wise. */
function expectMatrixClose(a: Matrix4, b: Matrix4, precision = 6): void {
  for (let i = 0; i < 16; i++) {
    expect(a.elements[i]).toBeCloseTo(b.elements[i], precision);
  }
}

describe('markerPoseToMatrix', () => {
  it('builds a rigid transform from position and rotation', () => {
    const m = markerPoseToMatrix(pose([1, 2, 3], [0, Math.PI / 2, 0]), new Matrix4());
    const p = new Vector3();
    const q = new Quaternion();
    const s = new Vector3();
    m.decompose(p, q, s);
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(3);
    // Rigid means unit scale on every axis — no shear, no stretch.
    expect(s.x).toBeCloseTo(1);
    expect(s.y).toBeCloseTo(1);
    expect(s.z).toBeCloseTo(1);
  });

  it('normalizes a non-unit quaternion instead of shearing the basis', () => {
    const m = markerPoseToMatrix(
      { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 2 } },
      new Matrix4(),
    );
    const s = new Vector3();
    m.decompose(new Vector3(), new Quaternion(), s);
    expect(s.x).toBeCloseTo(1);
  });
});

describe('local transform round-trip', () => {
  it('matrixToLocal inverts localToMatrix', () => {
    const local = {
      position: [0.1, -0.2, 0.3] as [number, number, number],
      quaternion: (() => {
        const q = new Quaternion().setFromEuler(new Euler(0.3, -0.2, 0.5));
        return [q.x, q.y, q.z, q.w] as [number, number, number, number];
      })(),
      scale: 2,
    };
    const back = matrixToLocal(localToMatrix(local, new Matrix4()));
    expect(back.position[0]).toBeCloseTo(local.position[0]);
    expect(back.position[1]).toBeCloseTo(local.position[1]);
    expect(back.position[2]).toBeCloseTo(local.position[2]);
    expect(back.scale).toBeCloseTo(2);
  });
});

describe('latch and restore', () => {
  it('restores the exact world transform when the marker has not moved', () => {
    const markerWorld = markerPoseToMatrix(pose([0.5, 1, -2], [0, 0.4, 0]), new Matrix4());
    const assetWorld = new Matrix4().compose(
      new Vector3(0.8, 1.3, -1.7),
      new Quaternion().setFromEuler(new Euler(0, 0.9, 0)),
      new Vector3(1, 1, 1),
    );

    const local = worldToMarkerLocal(markerWorld, assetWorld);
    const restored = new Matrix4().fromArray(markerLocalToWorld(markerWorld, local));

    expectMatrixClose(restored, assetWorld);
  });

  it('places the asset at the same offset when the world frame is different', () => {
    // Session A: SLAM picks one arbitrary world origin.
    const markerA = markerPoseToMatrix(pose([0, 0, 0], [0, 0, 0]), new Matrix4());
    const assetA = new Matrix4().compose(
      new Vector3(0, 0, 0.25), // 25 cm out from the marker's face
      new Quaternion(),
      new Vector3(1, 1, 1),
    );
    const local = worldToMarkerLocal(markerA, assetA);

    // Session B after a cold start: same physical marker, completely
    // different world coordinates and heading.
    const markerB = markerPoseToMatrix(pose([3, -1, 7], [0, Math.PI / 2, 0]), new Matrix4());
    const restoredB = new Matrix4().fromArray(markerLocalToWorld(markerB, local));

    // The asset must land 25 cm out along the marker's OWN normal, which in
    // session B points along world +x because the marker is turned 90°.
    const p = new Vector3().setFromMatrixPosition(restoredB);
    expect(p.x).toBeCloseTo(3.25);
    expect(p.y).toBeCloseTo(-1);
    expect(p.z).toBeCloseTo(7);

    // And re-latching in session B must reproduce the same stored offset.
    const relatched = worldToMarkerLocal(markerB, restoredB);
    expect(relatched.position[0]).toBeCloseTo(local.position[0]);
    expect(relatched.position[1]).toBeCloseTo(local.position[1]);
    expect(relatched.position[2]).toBeCloseTo(local.position[2]);
  });

  it('ignores marker scale so a wobbling scale estimate cannot move the asset', () => {
    const p = pose([0, 0, 0], [0, 0, 0]);
    const local = { ...IDENTITY_LOCAL, position: [0, 0, 1] as [number, number, number] };

    // markerPoseToMatrix reads only position/rotation, so a pose object that
    // also carried a scale field would produce an identical frame.
    const world = new Matrix4().fromArray(
      markerLocalToWorld(markerPoseToMatrix(p, new Matrix4()), local),
    );
    const pos = new Vector3().setFromMatrixPosition(world);
    expect(pos.z).toBeCloseTo(1);
  });
});

describe('distance helpers', () => {
  it('reads distance from the marker normal', () => {
    expect(distanceFromMarker({ ...IDENTITY_LOCAL, position: [0.1, 0.2, 0.35] })).toBeCloseTo(0.35);
  });

  it('changes only the normal axis and does not mutate the input', () => {
    const original = { ...IDENTITY_LOCAL, position: [0.1, 0.2, 0.3] as [number, number, number] };
    const moved = withDistanceFromMarker(original, 1.5);
    expect(moved.position).toEqual([0.1, 0.2, 1.5]);
    expect(original.position).toEqual([0.1, 0.2, 0.3]);
    expect(moved.quaternion).toEqual(original.quaternion);
  });

  it('drives the asset along the marker normal in world space', () => {
    // Marker lying flat, face pointing straight up (rotate -90° about x).
    const markerWorld = markerPoseToMatrix(pose([0, 0, 0], [-Math.PI / 2, 0, 0]), new Matrix4());
    const local = withDistanceFromMarker(IDENTITY_LOCAL, 0.4);
    const p = new Vector3().setFromMatrixPosition(
      new Matrix4().fromArray(markerLocalToWorld(markerWorld, local)),
    );
    expect(p.y).toBeCloseTo(0.4);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);
  });
});

describe('originDistance', () => {
  it('measures the gap between two transforms translations', () => {
    const a = new Matrix4().setPosition(0, 0, 0);
    const b = new Matrix4().setPosition(0.003, 0.004, 0);
    expect(originDistance(a, b)).toBeCloseTo(0.005);
  });
});
