/**
 * propEdit.ts — pure editing helpers for a staged prop.
 *
 * The stage editor lets an author set a prop's place and size two ways: by
 * dragging it in the views, and by the sliders in the prop panel. Both go
 * through the same metre-space fields, so the limits and the duplicate offset
 * live here as pure logic — testable without a DOM, and shared rather than
 * duplicated between the slider bounds and the drag clamps.
 *
 * Ranges match the stage's coordinate frame (stageGeometry TOP.xr / TOP.zr) so
 * a slider can never place a prop the top-down map cannot show.
 */

import type { StoryProp } from '@/story/storyDoc';
import { SCENE } from '@/story/projection';

/** Metre-space limits for every editable prop field. */
export const PROP_LIMITS = {
  /** Half-width of the stage: x runs from -xMax (left) to +xMax (right). */
  xMax: SCENE.xHalf,
  /** Nearest and furthest depth a prop can sit. */
  zMin: 0.2,
  zMax: SCENE.zMax,
  /** Real-world height, in metres. */
  hMin: 0.1,
  hMax: 6,
  /** Lift off the ground, in metres. */
  eMin: 0,
  eMax: 3,
} as const;

/** Clamps a value into `[lo, hi]`. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Holds every positional field of a prop inside the stage limits.
 *
 * @param p — The prop to clamp.
 * @returns A new prop with x, z, h and e clamped; other fields carried through.
 */
export function clampProp(p: StoryProp): StoryProp {
  return {
    ...p,
    x: clamp(p.x, -PROP_LIMITS.xMax, PROP_LIMITS.xMax),
    z: clamp(p.z, PROP_LIMITS.zMin, PROP_LIMITS.zMax),
    h: clamp(p.h, PROP_LIMITS.hMin, PROP_LIMITS.hMax),
    e: clamp(p.e, PROP_LIMITS.eMin, PROP_LIMITS.eMax),
  };
}

/** How far a duplicate lands to the right of its source, in metres. */
const DUP_OFFSET = 0.4;

/**
 * Copies a prop, nudged to the right so it does not sit exactly under the
 * original (where it would be invisible and un-selectable).
 *
 * @param p — The prop to duplicate.
 * @returns A deep copy offset in x and clamped to the stage.
 */
export function duplicateProp(p: StoryProp): StoryProp {
  return { ...p, x: clamp(p.x + DUP_OFFSET, -PROP_LIMITS.xMax, PROP_LIMITS.xMax) };
}
