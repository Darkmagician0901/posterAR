/**
 * stageOverlay.ts — the real-world reference marks drawn over the stage.
 *
 * Once a poster with a declared physical width defines the origin, "2 m from
 * the wall" is a physical claim rather than a stylistic one. An author cannot
 * check that claim against an empty grid, so the stage draws three things they
 * can: the poster itself at true scale, a 1 m bar, and a 1.7 m person.
 *
 * A true-scale A3 poster is about four view units wide in the camera view. That
 * is the honest answer — it is what stops wildly mis-scaled scenes — so the
 * geometry here is exact and the component is responsible for ringing it with a
 * fixed-width outline so a tiny mark stays findable.
 *
 * Pure arithmetic, no DOM.
 */

import { markerHeightM, type StoryMarker } from '@/story/marker';
import { SCENE, depthScale } from '@/story/projection';
import type { StoryProp } from '@/story/storyDoc';
import { FRONT, TOP } from './stageGeometry';

/** A rectangle in one of the stage views, in SVG user units. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A typical adult, for scale. */
const HUMAN_M = 1.7;

/** View units per metre on the top-down map. */
const TOP_PPM = TOP.w / (TOP.xr * 2);

/**
 * The poster, drawn to true scale on the wall plane of the camera view.
 *
 * @param marker — The story's marker.
 * @returns Its rectangle in camera-view units.
 */
export function markerFrontRect(marker: StoryMarker): Rect {
  // The wall is the far plane, z = 0.
  const s = depthScale(0);
  const w = marker.widthM * FRONT.ppm * s;
  const h = markerHeightM(marker) * FRONT.ppm * s;
  // mountHeight is floor to the poster's centre, and the floor is the view's
  // ground line.
  const centreY = FRONT.groundY - marker.mountHeight * FRONT.ppm * s;
  return { x: FRONT.w / 2 - w / 2, y: centreY - h / 2, w, h };
}

/**
 * The poster seen from above: a band lying along the wall at the map's top edge.
 *
 * @param marker — The story's marker.
 * @returns Its rectangle in map units.
 */
export function markerTopRect(marker: StoryMarker): Rect {
  const w = marker.widthM * TOP_PPM;
  // Thin, because from above a poster is just its thickness — drawn as a solid
  // bar sitting on the wall line rather than to true depth.
  const h = 6;
  return { x: TOP.w / 2 - w / 2, y: 0, w, h };
}

/**
 * A 1.7 m person standing at the near plane, off to one side.
 *
 * @returns The silhouette's rectangle in camera-view units.
 */
export function humanFrontRect(): Rect {
  const s = depthScale(SCENE.zMax);
  const h = HUMAN_M * FRONT.ppm * s;
  // Roughly shoulder-width, and parked left of centre so it does not sit on top
  // of a centred scene.
  const w = h * 0.28;
  return { x: FRONT.w * 0.08, y: FRONT.groundY - h, w, h };
}

/** A one-metre bar along the camera view's ground line, at the near plane. */
export function scaleBarFront(): { x1: number; x2: number; y: number } {
  const m = FRONT.ppm * depthScale(SCENE.zMax);
  const x1 = FRONT.w - 18 - m;
  return { x1, x2: x1 + m, y: FRONT.groundY - 8 };
}

/** A one-metre bar in the map's bottom-right corner. */
export function scaleBarTop(): { x1: number; x2: number; y: number } {
  const x1 = TOP.w - 18 - TOP_PPM;
  return { x1, x2: x1 + TOP_PPM, y: TOP.h - 14 };
}

/**
 * Finds props that have left the scene.
 *
 * @param props — The frame's staged props.
 * @returns The indices of props behind the wall or past the far edge.
 */
export function outOfRange(props: StoryProp[]): number[] {
  const out: number[] = [];
  props.forEach((p, i) => {
    if (p.z < 0 || p.z > SCENE.zMax) out.push(i);
  });
  return out;
}
