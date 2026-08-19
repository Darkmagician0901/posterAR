/**
 * placement.ts — how far away the diorama may be planted, and how big it is.
 *
 * A fixed-size object's apparent size is its width divided by its distance, so
 * a story planted wherever the hit-test happened to land is a lottery: the
 * 0.9 m tile this replaces covered 81% of the screen at 1 m and 11% at 8 m,
 * and the hit-test had no range limit at all. The green reticle appeared to
 * shrink with the art for the same reason — both are fixed-size objects at a
 * shared distance, not one scaled by the other.
 *
 * Two rules fix that, and they are deliberately separate:
 *
 *   1. The art is human-scale ({@link TILE}) — a thing you stand in front of,
 *      not a poster you squint at.
 *   2. It is planted within arm's-reach-to-a-few-paces ({@link PLACEMENT_RANGE}),
 *      so that scale actually lands in view.
 *
 * What this deliberately does NOT do is scale the art by distance to hold a
 * constant apparent size. That would guarantee "big" while destroying the
 * illusion the app exists for: walking toward a real thing makes it grow.
 * Here the art keeps one honest size in metres and behaves like an object.
 *
 * NOTE: {@link TILE} is a stopgap. The studio already authors real metres, and
 * the runtime is meant to grow into them (see `docs/story-document-format.md`);
 * when it does, `tileSize` gives way to the authored dimensions and only
 * `clampPlacementPoint` should survive.
 *
 * Pure maths: no three.js scene, no 8th Wall globals, no DOM.
 */

import { Vector3 } from 'three';

/**
 * How far from the viewer the story may be planted, measured on the floor
 * plane rather than along the line of sight — clamping the raw camera-to-hit
 * ray would lift a floor hit off the floor.
 */
export const PLACEMENT_RANGE = {
  /** Closer than this and the art is in your face and cannot be read. */
  minM: 1,
  /** A few paces: far enough to take in whole, near enough to stay big. */
  maxM: 2.5,
} as const;

/** The diorama's real-world size. */
export const TILE = {
  /** Human scale — about the width of a doorway and a half. */
  targetWidthM: 2,
  /** Nothing taller than a tall person, so it fits under a real ceiling. */
  maxHeightM: 2.2,
} as const;

/** Hit-test result kinds solid enough to plant a story on. */
const PLACEABLE = new Set<Xr8HitResult['type']>(['DETECTED_SURFACE', 'ESTIMATED_SURFACE']);

/**
 * Whether a hit-test result is trustworthy enough to plant the story on.
 *
 * A FEATURE_POINT is a single tracked speck — frequently metres away across
 * the room and unstable frame to frame. It is fine for showing the reticle
 * ("something is over there"), and a bad thing to commit the whole story to.
 *
 * @param type — The hit result's kind, from `Xr8HitResult.type`.
 * @returns True for a confirmed or estimated surface; false otherwise.
 */
export function isPlaceableHit(type: Xr8HitResult['type']): boolean {
  return PLACEABLE.has(type);
}

/**
 * Moves a placement point into {@link PLACEMENT_RANGE} of the viewer.
 *
 * Only the horizontal offset is clamped; the height the surface was found at
 * is preserved exactly, so art planted on the floor stays on the floor and art
 * found on a table stays at table height. The bearing is preserved too — the
 * story still appears in the direction the user pointed, just at a distance
 * they can actually see it from.
 *
 * @param hit — The world-space contact point from the hit-test.
 * @param cameraPos — The viewer's world position.
 * @param range — Distance limits; defaults to {@link PLACEMENT_RANGE}.
 * @returns A new point — the input is never mutated. When the viewer is
 *   directly above the hit there is no bearing to preserve, so the point is
 *   returned unchanged rather than shoved in an arbitrary direction.
 */
export function clampPlacementPoint(
  hit: Vector3,
  cameraPos: Vector3,
  range: { minM: number; maxM: number } = PLACEMENT_RANGE,
): Vector3 {
  const dx = hit.x - cameraPos.x;
  const dz = hit.z - cameraPos.z;
  const distance = Math.hypot(dx, dz);

  // Directly overhead (or underfoot): no horizontal bearing exists to move along.
  if (distance < 1e-6) return hit.clone();

  const clamped = Math.min(range.maxM, Math.max(range.minM, distance));
  if (clamped === distance) return hit.clone();

  const s = clamped / distance;
  return new Vector3(cameraPos.x + dx * s, hit.y, cameraPos.z + dz * s);
}

/**
 * The diorama's plane size in metres for a given art shape.
 *
 * Width is the target unless that would make the art taller than a room, in
 * which case height wins and the width narrows to match — a portrait story is
 * better slightly narrow than clipping through the ceiling.
 *
 * @param aspect — The art's height / width, from `svgToTexture`.
 * @param size — Size limits; defaults to {@link TILE}.
 * @returns Plane width and height in metres, both always positive.
 */
export function tileSize(
  aspect: number,
  size: { targetWidthM: number; maxHeightM: number } = TILE,
): { widthM: number; heightM: number } {
  // A zero, negative, NaN or infinite aspect means the art never reported a
  // usable shape; square keeps it visible instead of collapsing it to a line.
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;

  const widthM = size.targetWidthM;
  const heightM = widthM * a;
  if (heightM <= size.maxHeightM) return { widthM, heightM };

  return { widthM: size.maxHeightM / a, heightM: size.maxHeightM };
}
