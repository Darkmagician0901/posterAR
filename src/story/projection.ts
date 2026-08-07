/**
 * projection.ts — the scene's one depth model.
 *
 * The studio used to carry two: a painter's approximation `1/(1 + 0.16z)` in
 * the composer and the stage editor, and a true pinhole `focal/(nearM + z)` in
 * the phone preview. At z = 4.6 m they disagreed by about 2x, and both were
 * shown to the same author. The pinhole wins because it is the one that stays
 * correct once a marker gives the scene real physical units.
 *
 * Depth is measured out from the wall the marker hangs on: z = 0 is the poster
 * plane, growing toward the visitor. That is what makes a stored position mean
 * something across sessions — a SLAM world origin is invented fresh on every
 * launch, but a distance from a printed poster is a fact about the room.
 *
 * Everything that turns a depth in metres into a size lives here, so the models
 * cannot drift apart again. Screen-space concerns (focal length, canvas size,
 * the horizon) stay in the studio's perspective.ts; this module is pure metres.
 *
 * In src/story rather than src/studio because the composer is a story module
 * and story must never import from the studio.
 */

/**
 * The scene's extents in metres — the one range every view shares.
 *
 * zMax is taken from the phone preview's ground grid rather than the stage
 * map's old 6.2 m reach: nearM was derived as CAMZ - zMax at 4.6, so keeping
 * 4.6 preserves the v4 calibration the preview was matched against. The cost is
 * that the map's reach shrinks from 6.2 m to 4.6 m.
 */
export const SCENE = { xHalf: 3.4, zMax: 4.6 } as const;

/** Distance from the eye to the front plane, in metres. */
export const NEAR_M = 1.9;

/** Holds a depth inside the scene. */
function clampZ(z: number): number {
  return Math.min(SCENE.zMax, Math.max(0, z));
}

/**
 * Camera-space depth of a scene depth.
 *
 * `z` is measured out from the wall the marker hangs on, so a prop at z = 0 is
 * flat against the poster and furthest from the visitor, and z = SCENE.zMax is
 * the near plane. The visitor's eye therefore sits NEAR_M beyond the near
 * plane, cameraDepth(0) = 6.5 m from the wall.
 *
 * @param z — Metres out from the wall, clamped to the scene.
 * @returns Metres from the eye. Never below NEAR_M, so nothing divides by zero.
 */
export function cameraDepth(z: number): number {
  return NEAR_M + (SCENE.zMax - clampZ(z));
}

/**
 * Depth foreshortening — how much a prop shrinks at a given depth.
 *
 * @param z — Scene depth in metres.
 * @returns A multiplier, 1 at the front plane and falling with depth.
 */
export function depthScale(z: number): number {
  return NEAR_M / cameraDepth(z);
}

/**
 * The reach of the old viewer-relative stage, in metres.
 *
 * Depth used to be measured from the viewer's feet across a 6.2 m map. Anything
 * authored under that convention — a saved draft, the bundled prop lists ported
 * from the v4 prototype — has to be converted before it can be read as a
 * distance from the wall.
 */
export const LEGACY_Z_MAX = 6.2;

/**
 * Converts a legacy viewer-relative depth to metres out from the wall.
 *
 * Reading a stored z under the new meaning without this would flip a scene
 * front-to-back: what the author put at their feet would end up on the wall.
 *
 * @param z — Old depth: metres from the viewer, across LEGACY_Z_MAX.
 * @returns New depth: metres from the wall, clamped to the scene.
 */
export function fromLegacyZ(z: number): number {
  return clampZ((1 - z / LEGACY_Z_MAX) * SCENE.zMax);
}
