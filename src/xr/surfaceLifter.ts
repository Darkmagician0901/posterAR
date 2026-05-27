/**
 * surfaceLifter
 *
 * Converts a 2D segmentation result (centroid + bbox in image pixels) into
 * a 3D world-space plane that the SurfaceMesh can render. We don't have
 * depth data on iOS Safari, so we assume the surface is at a fixed depth
 * along the camera ray through the centroid pixel. This is good enough for
 * poster placement at typical room distances (1.5–3 m).
 *
 * Pinhole-camera model:
 *   - We treat the video frame as a virtual sensor with a horizontal FOV
 *     matching the three.js camera FOV (passed in).
 *   - The centroid pixel (cx_px, cy_px) maps to a normalized direction
 *     (x_ndc, y_ndc) in [-1, 1].
 *   - The 3D ray in CAMERA space is then (x_ndc * tan(hfov/2),
 *                                          y_ndc * tan(vfov/2) * -1, -1).
 *   - World position = camera_position + camera_quaternion ⋅ (ray * depth).
 *
 * The orientation we return puts the quad's local +Z axis along the ray
 * (so the quad faces the camera). The IMU stabilizer can then lock that
 * orientation in world space using the snapshot of the camera quat we took
 * at the moment of detection.
 */

import { Quaternion, Vector3, MathUtils } from 'three';

export interface LiftInput {
  /** Centroid pixel in the segmentation image, origin top-left. */
  centroidPx: { x: number; y: number };
  /** Bbox in segmentation pixels — used to size the mesh. */
  bboxPx: { width: number; height: number };
  /** Segmentation map dimensions. */
  imageWidth: number;
  imageHeight: number;
  /** Three.js camera vertical FOV, in degrees. */
  cameraFovDeg: number;
  /** Camera aspect ratio (width / height). */
  cameraAspect: number;
  /** Camera world position at the moment the frame was captured. */
  cameraPosition: Vector3;
  /** Camera world quaternion at the moment the frame was captured. */
  cameraQuaternion: Quaternion;
  /** Distance from camera to surface, in metres. Default 2 m. */
  depth?: number;
}

export interface LiftedSurface {
  /** Centre of the surface in world space. */
  position: Vector3;
  /** Orientation: +Z normal points back toward the camera. */
  quaternion: Quaternion;
  /** Size of the quad in world metres (width, height). */
  size: { width: number; height: number };
  /** Distance we placed the surface at (echoes input depth for telemetry). */
  depth: number;
}

const DEFAULT_DEPTH = 2.0;

export const liftSurface = (input: LiftInput): LiftedSurface => {
  const {
    centroidPx,
    bboxPx,
    imageWidth,
    imageHeight,
    cameraFovDeg,
    cameraAspect,
    cameraPosition,
    cameraQuaternion,
    depth = DEFAULT_DEPTH,
  } = input;

  // Convert centroid pixel to normalized device coordinates in [-1, 1].
  // Y is flipped because image pixel y grows downward while NDC y grows up.
  const xNdc = (centroidPx.x / imageWidth) * 2 - 1;
  const yNdc = -((centroidPx.y / imageHeight) * 2 - 1);

  // FOV-derived tangents (camera frustum half-angles).
  const vFov = MathUtils.degToRad(cameraFovDeg);
  const tanV = Math.tan(vFov / 2);
  const tanH = tanV * cameraAspect;

  // Ray in camera space. -Z is forward in three.js convention.
  const rayCam = new Vector3(xNdc * tanH, yNdc * tanV, -1).normalize();

  // Same ray rotated into world space.
  const rayWorld = rayCam.clone().applyQuaternion(cameraQuaternion);

  // Hit point along the ray at the assumed depth.
  const hit = new Vector3()
    .copy(rayWorld)
    .multiplyScalar(depth)
    .add(cameraPosition);

  // Quad orientation: face the camera. We re-use the camera quaternion so
  // the quad's local +Z aligns with -ray direction (i.e. it looks back at
  // the camera). This is good enough at the moment of detection; the IMU
  // stabilizer will keep it world-locked after that.
  const quaternion = cameraQuaternion.clone();

  // Size the quad from the bbox: a pixel at this depth subtends
  // `2 * depth * tan(half_fov) / image_dim` world metres. We give a small
  // padding so the mesh extends slightly beyond the detected pixels.
  const metresPerPixelY = (2 * depth * tanV) / imageHeight;
  const metresPerPixelX = (2 * depth * tanH) / imageWidth;
  const width = Math.max(0.3, bboxPx.width * metresPerPixelX * 1.1);
  const height = Math.max(0.3, bboxPx.height * metresPerPixelY * 1.1);

  return {
    position: hit,
    quaternion,
    size: { width, height },
    depth,
  };
};
