/**
 * markerPose.ts — how big the artwork is, and where it sits on the marker.
 *
 * Split out of the engine wiring because it is the one part of marker
 * placement that is arithmetic rather than plumbing, and arithmetic can be
 * tested without a phone. `markerTracking.ts` supplies the engine's numbers;
 * this decides what to do with them.
 *
 * The sizing rule is a RATIO, never a measurement. The engine reports a
 * marker's size in units it never names, so the tile is sized as
 * `reported x multiplier` — which is correct whatever those units mean,
 * because the same unknown appears on both sides and cancels. See
 * `docs/marker-layer-design.md` §5.1.
 */

import { Matrix4, Quaternion, Vector3 } from 'three';
import { DEFAULT_WIDTH_IN_MARKERS } from '@/story/storyDoc';

/**
 * The multiplier a story falls back to: artwork exactly covering the marker.
 *
 * Re-exported from `storyDoc.ts`, which is where the bound is enforced, so the
 * geometry and the validator cannot disagree. It is the LEGACY meaning, not
 * the intended one — a real installation uses a small print locating a much
 * larger scene, which is a multiplier well above 1.
 */
export { DEFAULT_WIDTH_IN_MARKERS };

/** The engine's reported dimensions for one tracked image. */
export interface MarkerDimensions {
  scaledWidth: number;
  scaledHeight: number;
}

/** How large the artwork should be drawn, in the engine's own units. */
export interface TileSize {
  width: number;
  height: number;
}

/**
 * Sizes the artwork plane from what the engine reports.
 *
 * @param dims — The engine's `scaledWidth`/`scaledHeight` for this marker.
 * @param widthInMarkers — How many marker-widths wide the artwork should be.
 *   1 covers the marker exactly. Larger values scale both axes together, so
 *   the artwork keeps the marker's aspect and never stretches.
 * @returns The plane size, in the engine's units.
 */
export function tileSize(
  dims: MarkerDimensions,
  widthInMarkers: number = DEFAULT_WIDTH_IN_MARKERS,
): TileSize {
  // Guard rather than trust: a multiplier of 0 or below would collapse the
  // plane to nothing, which on a phone looks exactly like "tracking is broken"
  // and would send someone debugging the engine instead of the number.
  const k = Number.isFinite(widthInMarkers) && widthInMarkers > 0 ? widthInMarkers : 1;
  return { width: dims.scaledWidth * k, height: dims.scaledHeight * k };
}

/**
 * True when the engine's reported dimensions are usable.
 *
 * FLAT targets carry `scaledWidth`/`scaledHeight`; cylindrical and conical
 * ones do not, and Studio only ever generates PLANAR. A target arriving
 * without them means something upstream changed, and sizing from `undefined`
 * would silently produce a `NaN`-sized plane that never appears — the most
 * confusing failure available.
 */
export function hasDimensions(e: {
  scaledWidth?: number;
  scaledHeight?: number;
}): e is MarkerDimensions {
  return (
    typeof e.scaledWidth === 'number' &&
    typeof e.scaledHeight === 'number' &&
    Number.isFinite(e.scaledWidth) &&
    Number.isFinite(e.scaledHeight) &&
    e.scaledWidth > 0 &&
    e.scaledHeight > 0
  );
}

/**
 * Builds the scene's world transform from a marker's reported pose.
 *
 * The marker LOCATES the scene; it does not size it. Size comes from
 * `tileSize`; this decides where the centre goes.
 *
 * **Rotating the offset is load-bearing.** The offset is expressed in the
 * marker's own frame, so it must be rotated into world space before it is
 * added. Omit that and the scene slides in a fixed world direction whatever
 * way the print faces — which looks perfectly correct on a print hanging
 * square in front of whoever is testing, and is wrong on every angled wall.
 * `markerPose.test.ts` pins it with a deliberately yawed marker.
 *
 * **Scale is deliberately excluded** — the matrix is rigid, position and
 * rotation only. The engine also reports a `scale` estimate, and folding it in
 * would mean a wobble of a percent or two rescaling the artwork every frame,
 * which reads as breathing. `marker-testbed-design.md` §5 agrees.
 *
 * This is also the single point every marker pose passes through on its way to
 * the tile, so if a large scene turns out to swing on device, a smoothing step
 * goes here and nowhere else (`marker-locator-design.md` §4.1).
 *
 * @param position — The engine's world position for the marker.
 * @param rotation — The engine's world orientation quaternion.
 * @param markerWidth — The marker's reported width, in the engine's own units.
 *   Non-finite values are treated as 0, which reduces the offset to nothing
 *   rather than placing the scene at NaN, where it would never appear.
 * @param offset — `[ox, oy]` from the anchor's `local.position`, in
 *   marker-widths: the vector from the marker to the scene's centre, `+x`
 *   right and `+y` up as seen by someone facing the print.
 * @returns 16 column-major floats, the form `StoryTile.place` expects.
 */
export function composeSceneMatrix(
  position: { x: number; y: number; z: number },
  rotation: { w: number; x: number; y: number; z: number },
  markerWidth: number,
  offset: readonly [number, number],
): Float32Array {
  // Normalised because a quaternion that has drifted off unit length would
  // otherwise smuggle a scale into a matrix this function promises is rigid.
  const q = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
  const w = Number.isFinite(markerWidth) ? markerWidth : 0;
  const shift = new Vector3(offset[0] * w, offset[1] * w, 0).applyQuaternion(q);

  const m = new Matrix4().compose(
    new Vector3(position.x + shift.x, position.y + shift.y, position.z + shift.z),
    q,
    new Vector3(1, 1, 1),
  );
  return new Float32Array(m.elements);
}
