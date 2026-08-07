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

import { SCENE, depthScale } from '@/story/projection';

/** Re-exported so the stage editor's views read depth from one place. */
export { depthScale };

/** Camera-view frame, in SVG user units. */
export const FRONT = { w: 520, h: 300, ppm: 46, groundY: 238 } as const;

/** Top-down map frame. Shows x within +/-xr metres and z from 0 to zr. */
export const TOP = { w: 520, h: 300, xr: SCENE.xHalf, zr: SCENE.zMax } as const;

/** How much a prop rises up the camera view per metre of depth. */
const depthRise = FRONT.ppm * 0.3;

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
 * @returns The prop's anchor point (its bottom centre) in view units.
 */
export function frontProject(x: number, z: number, e = 0): Point {
  const s = depthScale(z);
  return {
    x: FRONT.w / 2 + x * FRONT.ppm * s,
    y: FRONT.groundY - (SCENE.zMax - z) * depthRise * s - e * FRONT.ppm * s,
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
 * @returns Metres left(-) / right(+) of centre.
 */
export function frontUnprojectX(viewX: number, z: number): number {
  const s = depthScale(z);
  return (viewX - FRONT.w / 2) / (FRONT.ppm * s);
}

/**
 * Projects a staged position onto the top-down map.
 *
 * @param x — Metres left(-) / right(+) of centre.
 * @param z — Metres out from the wall.
 * @returns The plan position in view units.
 */
export function topProject(x: number, z: number): Point {
  return {
    x: TOP.w / 2 + (x / TOP.xr) * (TOP.w / 2),
    // The wall is the top edge and the visitor stands at the bottom, so z grows
    // downward on the map.
    y: (z / TOP.zr) * TOP.h,
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
  const z = (viewY / TOP.h) * TOP.zr;
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
