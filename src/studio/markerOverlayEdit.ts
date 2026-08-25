/**
 * markerOverlayEdit.ts — dragging and resizing the printed picture on the stage.
 *
 * The author does not type a scale or an offset. They drag a rectangle around
 * the scene they are composing, and both numbers fall out of where it lands
 * (`docs/marker-locator-design.md` §3.2). This file is that conversion, plus
 * the guard rails from §3.3.
 *
 * Pure arithmetic, no DOM — pointer handling lives in StageEditor, the rules
 * live here so they are testable without synthesising drags. Same split as
 * `markerCropEdit.ts`, which does the same job for the crop box.
 *
 * The size limits are derived from the SCHEMA's bounds rather than picked
 * separately, so the editor cannot author a layout `sanitizeAnchor` would
 * refuse and silently reset.
 */

import { MAX_OFFSET_IN_MARKERS, MAX_WIDTH_IN_MARKERS } from '@/story/storyDoc';
import type { StageFrame } from './stageGeometry';

/** The marker rectangle on the stage, in SVG view units. */
export interface MarkerRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Printed markers are cut 3:4 (`markerCropEdit.ts`), so the overlay is too. */
export const MARKER_ASPECT = 3 / 4;

/** Below this fraction of the scene's width, warn the author (§3.3). */
export const SMALL_MARKER_WARN_FRACTION = 0.08;

/** Clamps `v` into `[lo, hi]`. `hi` below `lo` yields `lo`. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(Math.max(lo, hi), v));
}

/**
 * The smallest rectangle the author may draw.
 *
 * Derived from `MAX_WIDTH_IN_MARKERS`, not chosen: a rectangle any smaller
 * would mean a multiplier the validator rejects, so the UI simply cannot
 * express one.
 *
 * @param frame — The stage being drawn on.
 * @returns The minimum width, in view units.
 */
export function minRectWidth(frame: StageFrame): number {
  return frame.w / MAX_WIDTH_IN_MARKERS;
}

/**
 * The largest rectangle that fits on the stage at 3:4.
 *
 * @param frame — The stage being drawn on.
 * @returns The maximum width, in view units.
 */
export function maxRectWidth(frame: StageFrame): number {
  return Math.min(frame.w, frame.h * MARKER_ASPECT);
}

/**
 * Draws a stored layout as a rectangle on the stage.
 *
 * Clamped for DISPLAY only — nothing is written back until the author actually
 * drags. That matters for legacy bindings: every story published before this
 * design carries `widthInMarkers: 1`, whose rectangle is larger than the stage.
 *
 * @param frame — The stage being drawn on.
 * @param widthInMarkers — The anchor's stored multiplier.
 * @param offset — The anchor's stored `[ox, oy]`, in marker-widths.
 * @returns The rectangle, in view units, always inside the stage.
 */
export function rectFromAnchor(
  frame: StageFrame,
  widthInMarkers: number,
  offset: readonly [number, number],
): MarkerRect {
  const k = Number.isFinite(widthInMarkers) && widthInMarkers > 0 ? widthInMarkers : 1;
  const w = clamp(frame.w / k, minRectWidth(frame), maxRectWidth(frame));
  const h = w / MARKER_ASPECT;

  // The offset points marker -> scene centre, so it inverts to find the
  // marker. View y grows down while the stored y grows up, hence the + on cy.
  const cx = frame.w / 2 - offset[0] * w;
  const cy = frame.h / 2 + offset[1] * w;

  return {
    x: clamp(cx - w / 2, 0, frame.w - w),
    y: clamp(cy - h / 2, 0, frame.h - h),
    w,
    h,
  };
}

/**
 * Reads a rectangle back as the numbers the anchor stores.
 *
 * @param frame — The stage the rectangle was drawn on.
 * @param rect — Where the author left the marker.
 * @returns `widthInMarkers` and the `local.position` triple, `z` always 0.
 */
export function anchorFromRect(
  frame: StageFrame,
  rect: MarkerRect,
): { widthInMarkers: number; position: [number, number, number] } {
  const raw = frame.w / rect.w;
  const widthInMarkers = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_WIDTH_IN_MARKERS) : 1;

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const bound = (v: number): number =>
    clamp(Number.isFinite(v) ? v : 0, -MAX_OFFSET_IN_MARKERS, MAX_OFFSET_IN_MARKERS);

  return {
    widthInMarkers,
    position: [bound((frame.w / 2 - cx) / rect.w), bound((cy - frame.h / 2) / rect.w), 0],
  };
}

/**
 * Slides the rectangle, stopping at the stage edges.
 *
 * @param rect — Rectangle at the start of the drag.
 * @param dx — View units right(+) / left(-).
 * @param dy — View units down(+) / up(-).
 * @param frame — The stage being drawn on.
 * @returns The moved rectangle, always in bounds.
 */
export function moveRect(rect: MarkerRect, dx: number, dy: number, frame: StageFrame): MarkerRect {
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, frame.w - rect.w),
    y: clamp(rect.y + dy, 0, frame.h - rect.h),
  };
}

/**
 * Resizes the rectangle about its own centre, keeping 3:4.
 *
 * Centre-anchored, like `scaleCrop`: the marker stays where the author put it
 * while they change how big the scene around it is, which is the question they
 * are actually answering. It does mean the grip drifts from the pointer on a
 * large drag — the alternative moves the marker while resizing it, which
 * conflates the two decisions.
 *
 * @param rect — Rectangle at the start of the drag.
 * @param width — Desired width in view units, before bounds.
 * @param frame — The stage being drawn on.
 * @returns The resized rectangle: never past `maxRectWidth`, never below
 *   `minRectWidth`, never off the stage.
 */
export function resizeRect(rect: MarkerRect, width: number, frame: StageFrame): MarkerRect {
  const w = clamp(
    Number.isFinite(width) ? width : rect.w,
    minRectWidth(frame),
    maxRectWidth(frame),
  );
  const h = w / MARKER_ASPECT;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  return {
    w,
    h,
    x: clamp(cx - w / 2, 0, frame.w - w),
    y: clamp(cy - h / 2, 0, frame.h - h),
  };
}

/**
 * Whether the marker is small enough in its scene to be worth warning about.
 *
 * A warning, never a block (§3.3): a large room with a large print may be
 * exactly right, and only the author knows the room.
 *
 * @param frame — The stage being drawn on.
 * @param rect — The marker rectangle.
 * @returns True when the author should be told.
 */
export function isMarkerTooSmall(frame: StageFrame, rect: MarkerRect): boolean {
  return rect.w < frame.w * SMALL_MARKER_WARN_FRACTION;
}

/**
 * How wide the finished scene will be in the real world.
 *
 * Not stored and not published — it is an authoring aid, and the one place
 * relative units become a measurement. It exists because getting the print
 * size wrong is expensive in paper and ink (§3.4).
 *
 * @param printWidthMm — The intended physical width of the printed picture.
 * @param widthInMarkers — The scene's width in marker-widths.
 * @returns Metres. Zero for a nonsense print width, rather than NaN on screen.
 */
export function sceneWidthMetres(printWidthMm: number, widthInMarkers: number): number {
  if (!(Number.isFinite(printWidthMm) && printWidthMm > 0)) return 0;
  if (!(Number.isFinite(widthInMarkers) && widthInMarkers > 0)) return 0;
  return (printWidthMm / 1000) * widthInMarkers;
}
