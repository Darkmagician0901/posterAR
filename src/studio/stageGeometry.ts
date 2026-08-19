/**
 * stageGeometry.ts — mapping between scene metres and the stage editor's two
 * views.
 *
 * The camera view uses the same perspective model as the composer, so what an
 * author drags is where the prop lands in the finished art. The top-down map is
 * a plain orthographic plan. Both mappings are invertible, because dragging
 * needs to go from a pointer position back to metres.
 *
 * Pure arithmetic — no DOM — so the drag maths is unit-testable without
 * simulating pointer events.
 */

/** A camera-view frame, in SVG user units. */
export interface StageFrame {
  w: number;
  h: number;
  /** Pixels per metre. Shared across frames so props keep their real size. */
  ppm: number;
  /** Where the ground line sits, in view units from the top. */
  groundY: number;
}

/** The default landscape stage, matching the era art's proportions. */
export const FRONT: StageFrame = { w: 520, h: 300, ppm: 46, groundY: 238 };

/**
 * The stage a marker-bound story composes on.
 *
 * Exactly 3:4, because that is the shape of the printed picture the art will
 * cover, so the author is literally designing on top of what they printed
 * rather than discovering the misfit on a phone. `ppm` matches FRONT so
 * binding a story never resizes its props, and the ground line sits at the
 * same proportion of the frame.
 */
export const MARKER_FRONT: StageFrame = { w: 300, h: 400, ppm: 46, groundY: 317 };

/** Top-down map frame. Shows x within +/-xr metres and z from 0 to zr. */
export const TOP = { w: 520, h: 300, xr: 3.4, zr: 6.2 } as const;

/** Depth foreshortening. Must match compose.ts exactly or previews lie. */
export function depthScale(z: number): number {
  return 1 / (1 + 0.16 * Math.max(0, z));
}

/** How much a prop rises up the camera view per metre of depth. */
function depthRise(frame: StageFrame): number {
  return frame.ppm * 0.3;
}

/** A point in the camera view. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Projects a staged position into camera-view coordinates.
 *
 * @param x — Metres left(-) / right(+) of centre.
 * @param z — Metres into the scene.
 * @param e — Metres above the ground line.
 * @param frame — Which stage frame to project into. Defaults to the
 * landscape `FRONT` frame, so every pre-marker call site keeps working
 * untouched.
 * @returns The prop's anchor point (its bottom centre) in view units.
 */
export function frontProject(x: number, z: number, e = 0, frame: StageFrame = FRONT): Point {
  const s = depthScale(z);
  return {
    x: frame.w / 2 + x * frame.ppm * s,
    y: frame.groundY - z * depthRise(frame) * s - e * frame.ppm * s,
  };
}

/**
 * Inverts frontProject for the horizontal axis at a known depth.
 *
 * Depth cannot be recovered from a camera-view drag — moving up the frame is
 * ambiguous between "further away" and "lifted off the ground" — so the caller
 * supplies the prop's current z and only x is solved.
 *
 * @param viewX — Pointer x in view units.
 * @param z — The prop's current depth.
 * @param frame — Which stage frame `viewX` was measured in. Defaults to
 * `FRONT`, matching `frontProject`.
 * @returns Metres left(-) / right(+) of centre.
 */
export function frontUnprojectX(viewX: number, z: number, frame: StageFrame = FRONT): number {
  const s = depthScale(z);
  return (viewX - frame.w / 2) / (frame.ppm * s);
}

/**
 * Projects a staged position onto the top-down map.
 *
 * @param x — Metres left(-) / right(+) of centre.
 * @param z — Metres into the scene.
 * @returns The plan position in view units.
 */
export function topProject(x: number, z: number): Point {
  return {
    x: TOP.w / 2 + (x / TOP.xr) * (TOP.w / 2),
    // z grows upward on the map: the viewer stands at the bottom edge.
    y: TOP.h - (z / TOP.zr) * TOP.h,
  };
}

/**
 * Inverts topProject. This is the only view that can set depth.
 *
 * @param viewX — Pointer x in view units.
 * @param viewY — Pointer y in view units.
 * @returns The staged `{ x, z }` in metres, clamped to the visible plan.
 */
export function topUnproject(viewX: number, viewY: number): { x: number; z: number } {
  const x = ((viewX - TOP.w / 2) / (TOP.w / 2)) * TOP.xr;
  const z = ((TOP.h - viewY) / TOP.h) * TOP.zr;
  return {
    x: Math.max(-TOP.xr, Math.min(TOP.xr, x)),
    z: Math.max(0, Math.min(TOP.zr, z)),
  };
}

/**
 * Converts a pointer event position into the coordinate space of an SVG whose
 * viewBox is `0 0 w h`, accounting for the element's rendered size.
 *
 * @param clientX — Pointer clientX.
 * @param clientY — Pointer clientY.
 * @param rect — The SVG element's bounding rect.
 * @param w — viewBox width.
 * @param h — viewBox height.
 * @returns The position in viewBox units.
 */
export function toViewBox(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  w: number,
  h: number,
): Point {
  return {
    x: rect.width === 0 ? 0 : ((clientX - rect.left) / rect.width) * w,
    y: rect.height === 0 ? 0 : ((clientY - rect.top) / rect.height) * h,
  };
}
