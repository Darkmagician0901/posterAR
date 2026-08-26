/**
 * markerRelativeTransform.ts
 *
 * Engine-agnostic math for anchoring assets to an image marker.
 *
 * The idea: an image marker (an 8th Wall image target) defines its own local
 * coordinate space — a "space" whose origin sits at the centre of the printed
 * picture. Every asset bound to that marker is stored as a transform *relative
 * to the marker*, never as a world position. World positions are meaningless
 * across sessions because SLAM (the camera-based tracking system) picks a new,
 * arbitrary world origin every time the app starts; a marker-relative
 * transform, by contrast, is a physical fact about where the asset sits with
 * respect to a real printed picture, so it survives quitting the app.
 *
 *   latch:    T_local = inverse(T_marker_world) · T_asset_world
 *   restore:  T_asset_world' = T_marker_world' · T_local
 *
 * The marker frame is treated as RIGID — built from the marker's position and
 * rotation only, deliberately ignoring the `scale` the engine reports. Folding
 * scale into the frame would make the inverse rescale every stored offset, so a
 * marker whose reported scale wobbled by 1% would move a 1 m offset by 1 cm.
 * Physical size is kept separately (see `scaledWidth`/`scaledHeight` on the
 * pose) and used for sizing assets, not for anchoring them.
 *
 * Pure functions: they read only their arguments and module-scoped
 * temporaries, so they are unit-testable with no 8th Wall or browser globals.
 */

import { Matrix4, Quaternion, Vector3 } from 'three';

/**
 * The subset of an 8th Wall image-target event payload this module needs.
 * Position and rotation are in the same world frame as SLAM, which is what
 * makes the latch/restore pair below valid.
 */
export interface MarkerPose {
  /** Marker origin in world space, in metres. */
  position: { x: number; y: number; z: number };
  /** Marker orientation in world space, as a quaternion. */
  rotation: { x: number; y: number; z: number; w: number };
}

/**
 * An asset's placement relative to its marker — the thing we persist.
 *
 * Serializable on purpose (plain numbers, no three.js objects): this is what
 * goes into the store, over the wire, and into Postgres.
 */
export interface LocalTransform {
  /**
   * Offset from the marker origin, expressed in the MARKER's own axes, in
   * metres. `+z` points out of the printed surface, so `position[2]` is the
   * asset's distance from the marker — the axis the testbed's slider drives.
   */
  position: [number, number, number];
  /** Orientation relative to the marker, as a quaternion (x, y, z, w). */
  quaternion: [number, number, number, number];
  /** Uniform scale relative to the marker frame. */
  scale: number;
}

/** An asset sitting exactly on the marker, unrotated and unscaled. */
export const IDENTITY_LOCAL: LocalTransform = {
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
  scale: 1,
};

/**
 * Which axis of the marker's local frame points out of the printed surface —
 * the "distance from the marker" axis the slider drives.
 *
 * Set to +Z (index 2), matching the plane convention three.js and 8th Wall's
 * PLANAR targets share. VERIFY THIS ON DEVICE: if dragging the distance slider
 * slides the asset ACROSS the marker instead of lifting it off, the engine's
 * planar frame uses +Y as its normal and this should be 1. It is a named
 * constant precisely so that correction is a one-line change.
 */
export const MARKER_NORMAL_AXIS = 2;

// ── module-scoped temporaries — reused to avoid per-frame allocation ─────────
// Each function uses its own set so nested calls can never clobber each other.
const _markerMat = new Matrix4();
const _markerPos = new Vector3();
const _markerQuat = new Quaternion();
const _unitScale = new Vector3(1, 1, 1);

const _localMat = new Matrix4();
const _localPos = new Vector3();
const _localQuat = new Quaternion();
const _localScale = new Vector3();

const _invMat = new Matrix4();
const _outMat = new Matrix4();

const _decPos = new Vector3();
const _decQuat = new Quaternion();
const _decScale = new Vector3();

/**
 * Builds the marker's world transform: a rigid (rotation + translation only)
 * 4x4 matrix. See the module header for why scale is excluded.
 *
 * @param pose — Marker position and rotation in world space, straight from a
 *   `reality.imagefound` / `reality.imageupdated` event payload.
 * @param target — Optional matrix to write into, to avoid allocating. When
 *   omitted, a shared module-scoped matrix is returned — copy it if you need
 *   to keep it past the next call.
 * @returns The marker's world transform.
 */
export function markerPoseToMatrix(pose: MarkerPose, target?: Matrix4): Matrix4 {
  const out = target ?? _markerMat;
  _markerPos.set(pose.position.x, pose.position.y, pose.position.z);
  _markerQuat.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
  // A non-normalized quaternion (float noise from the engine, or a hand-built
  // test fixture) would shear the basis; normalizing keeps the frame rigid.
  _markerQuat.normalize();
  return out.compose(_markerPos, _markerQuat, _unitScale);
}

/**
 * Expands a stored {@link LocalTransform} into a 4x4 matrix.
 *
 * @param local — The persisted marker-relative placement.
 * @param target — Optional matrix to write into. When omitted, a shared
 *   module-scoped matrix is returned.
 * @returns The transform as a matrix, in the marker's frame.
 */
export function localToMatrix(local: LocalTransform, target?: Matrix4): Matrix4 {
  const out = target ?? _localMat;
  _localPos.set(local.position[0], local.position[1], local.position[2]);
  _localQuat.set(
    local.quaternion[0],
    local.quaternion[1],
    local.quaternion[2],
    local.quaternion[3],
  );
  _localQuat.normalize();
  const s = local.scale || 1;
  _localScale.set(s, s, s);
  return out.compose(_localPos, _localQuat, _localScale);
}

/**
 * Decomposes a matrix back into the serializable {@link LocalTransform} shape.
 *
 * Scale is collapsed to a single number by taking the x component, since every
 * transform this app produces is uniformly scaled.
 *
 * @param matrix — A transform in the marker's frame.
 * @returns A plain, serializable placement record.
 */
export function matrixToLocal(matrix: Matrix4): LocalTransform {
  matrix.decompose(_decPos, _decQuat, _decScale);
  return {
    position: [_decPos.x, _decPos.y, _decPos.z],
    quaternion: [_decQuat.x, _decQuat.y, _decQuat.z, _decQuat.w],
    scale: _decScale.x,
  };
}

/**
 * THE LATCH. Converts an asset's world transform into a marker-relative one:
 * `T_local = inverse(T_marker_world) · T_asset_world`.
 *
 * Use this when an asset was positioned in world space (e.g. dropped by a
 * hit-test) and now needs to be stored against a marker.
 *
 * @param markerWorld — The marker's rigid world transform, from
 *   {@link markerPoseToMatrix}.
 * @param assetWorld — The asset's current world transform.
 * @returns The asset's placement in the marker's frame, ready to persist.
 */
export function worldToMarkerLocal(markerWorld: Matrix4, assetWorld: Matrix4): LocalTransform {
  _invMat.copy(markerWorld).invert();
  _outMat.multiplyMatrices(_invMat, assetWorld);
  return matrixToLocal(_outMat);
}

/**
 * THE RESTORE. Rebuilds an asset's world transform from its stored
 * marker-relative placement: `T_asset_world = T_marker_world · T_local`.
 *
 * Called every time the marker is seen — on first detection after a cold
 * start, and (in follow mode) on each subsequent tracking update.
 *
 * @param markerWorld — The marker's rigid world transform for THIS frame.
 * @param local — The persisted marker-relative placement.
 * @returns The 16 floats of the asset's world transform, column-major — the
 *   layout three.js `Group.matrix` and `PosterPlacement` expect.
 */
export function markerLocalToWorld(markerWorld: Matrix4, local: LocalTransform): Float32Array {
  // Reuses the module temporary rather than allocating: this runs once per
  // anchored asset per frame.
  _outMat.multiplyMatrices(markerWorld, localToMatrix(local));
  return new Float32Array(_outMat.elements);
}

/**
 * Reads how far an asset sits from its marker along the marker's normal —
 * the quantity the testbed's distance slider edits.
 *
 * @param local — The persisted marker-relative placement.
 * @returns Distance out of the marker's printed surface, in metres. Negative
 *   values sit behind the picture.
 */
export function distanceFromMarker(local: LocalTransform): number {
  return local.position[MARKER_NORMAL_AXIS];
}

/**
 * Returns a copy of `local` moved to a new distance from the marker along its
 * normal, leaving the in-plane offset, rotation, and scale untouched.
 *
 * Pure — the input is not mutated, so this composes cleanly with Zustand's
 * immutable updates.
 *
 * @param local — The placement to adjust.
 * @param distance — New distance out of the marker's surface, in metres.
 * @returns A new placement at that distance.
 */
export function withDistanceFromMarker(local: LocalTransform, distance: number): LocalTransform {
  const position: [number, number, number] = [...local.position];
  position[MARKER_NORMAL_AXIS] = distance;
  return { ...local, position };
}

/**
 * Straight-line distance between the origins of two transforms, in metres.
 *
 * This is the recovery-accuracy metric: latch an asset, quit, reopen, re-scan
 * the marker, and compare the restored world position against where it was —
 * a small number means marker-relative storage round-tripped faithfully.
 *
 * @param a — First transform.
 * @param b — Second transform.
 * @returns The distance between their translation components, in metres.
 */
export function originDistance(a: Matrix4, b: Matrix4): number {
  _decPos.setFromMatrixPosition(a);
  const bx = b.elements[12];
  const by = b.elements[13];
  const bz = b.elements[14];
  return Math.hypot(_decPos.x - bx, _decPos.y - by, _decPos.z - bz);
}
