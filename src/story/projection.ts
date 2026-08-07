/**
 * projection.ts — the scene's one depth model.
 *
 * The studio used to carry two: a painter's approximation `1/(1 + 0.16z)` in
 * the composer and the stage editor, and a true pinhole `focal/(nearM + z)` in
 * the phone preview. At z = 4.6 m they disagreed by about 2x, and both were
 * shown to the same author. The pinhole wins because it is the one that stays
 * correct once a marker gives the scene real physical units.
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
 * @param z — Scene depth in metres, clamped to the scene.
 * @returns Metres from the eye. Never below NEAR_M, so nothing divides by zero.
 */
export function cameraDepth(z: number): number {
  return NEAR_M + clampZ(z);
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
