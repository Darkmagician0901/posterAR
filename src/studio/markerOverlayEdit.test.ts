import { describe, expect, it } from 'vitest';
import { MAX_WIDTH_IN_MARKERS } from '@/story/storyDoc';
import { FRONT } from './stageGeometry';
import {
  anchorFromRect,
  isMarkerTooSmall,
  MARKER_ASPECT,
  maxRectWidth,
  minRectWidth,
  moveRect,
  rectFromAnchor,
  resizeRect,
  sceneWidthMetres,
} from './markerOverlayEdit';

describe('rectFromAnchor / anchorFromRect', () => {
  it('round-trips a layout that fits on the stage', () => {
    // The author drags, we store numbers, we draw them again next time. Any
    // drift here is a marker that creeps across the stage between sessions.
    const rect = rectFromAnchor(FRONT, 4, [0.3, -0.2]);
    const back = anchorFromRect(FRONT, rect);
    expect(back.widthInMarkers).toBeCloseTo(4, 10);
    expect(back.position[0]).toBeCloseTo(0.3, 10);
    expect(back.position[1]).toBeCloseTo(-0.2, 10);
    expect(back.position[2]).toBe(0);
  });

  it('centres the marker when the offset is zero', () => {
    const rect = rectFromAnchor(FRONT, 4, [0, 0]);
    expect(rect.x + rect.w / 2).toBeCloseTo(FRONT.w / 2, 10);
    expect(rect.y + rect.h / 2).toBeCloseTo(FRONT.h / 2, 10);
  });

  it('sizes the rectangle as the scene width divided by the multiplier', () => {
    expect(rectFromAnchor(FRONT, 4, [0, 0]).w).toBeCloseTo(FRONT.w / 4, 10);
  });

  it('keeps the printed 3:4 shape at every size', () => {
    for (const k of [3, 5, 12]) {
      const rect = rectFromAnchor(FRONT, k, [0, 0]);
      expect(rect.w / rect.h).toBeCloseTo(MARKER_ASPECT, 10);
    }
  });

  it("reads a positive x offset as the scene sitting to the marker's right", () => {
    // Spec §2.1: [ox, oy] points FROM the marker TO the scene centre, so a
    // positive ox must put the marker LEFT of centre on the stage. Getting
    // this sign backwards is silent and mirrors every installation.
    const rect = rectFromAnchor(FRONT, 4, [0.5, 0]);
    expect(rect.x + rect.w / 2).toBeLessThan(FRONT.w / 2);
  });

  it('reads a positive y offset as the scene sitting above the marker', () => {
    // View y grows DOWN, spec y grows UP.
    const rect = rectFromAnchor(FRONT, 4, [0, 0.5]);
    expect(rect.y + rect.h / 2).toBeGreaterThan(FRONT.h / 2);
  });

  it('clamps a legacy 1:1 binding into a rectangle the stage can draw', () => {
    // Published stories all carry widthInMarkers 1, whose rectangle is wider
    // than the stage and taller than it. Drawing is clamped; the stored value
    // is untouched until the author actually drags something.
    const rect = rectFromAnchor(FRONT, 1, [0, 0]);
    expect(rect.w).toBeLessThanOrEqual(maxRectWidth(FRONT));
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.w).toBeLessThanOrEqual(FRONT.w + 1e-9);
    expect(rect.y + rect.h).toBeLessThanOrEqual(FRONT.h + 1e-9);
  });

  it('never authors a multiplier the validator would reject', () => {
    const tiny = { x: 0, y: 0, w: minRectWidth(FRONT) / 100, h: 1 };
    expect(anchorFromRect(FRONT, tiny).widthInMarkers).toBeLessThanOrEqual(MAX_WIDTH_IN_MARKERS);
  });
});

describe('moveRect', () => {
  const rect = rectFromAnchor(FRONT, 4, [0, 0]);

  it('slides the rectangle by the drag delta', () => {
    const moved = moveRect(rect, 20, -10, FRONT);
    expect(moved.x).toBeCloseTo(rect.x + 20, 10);
    expect(moved.y).toBeCloseTo(rect.y - 10, 10);
    expect(moved.w).toBe(rect.w);
  });

  it('stops at the stage edges', () => {
    // Spec §3.3: a print hanging outside its own artwork is almost always a
    // mistake, and there is no way to preview it.
    const far = moveRect(rect, 9999, 9999, FRONT);
    expect(far.x).toBeCloseTo(FRONT.w - rect.w, 10);
    expect(far.y).toBeCloseTo(FRONT.h - rect.h, 10);
    const near = moveRect(rect, -9999, -9999, FRONT);
    expect(near.x).toBe(0);
    expect(near.y).toBe(0);
  });
});

describe('resizeRect', () => {
  const rect = rectFromAnchor(FRONT, 4, [0, 0]);

  it('resizes about its own centre, keeping 3:4', () => {
    const bigger = resizeRect(rect, rect.w * 1.5, FRONT);
    expect(bigger.w / bigger.h).toBeCloseTo(MARKER_ASPECT, 10);
    expect(bigger.x + bigger.w / 2).toBeCloseTo(rect.x + rect.w / 2, 10);
    expect(bigger.y + bigger.h / 2).toBeCloseTo(rect.y + rect.h / 2, 10);
  });

  it('never grows past what the stage can show', () => {
    const huge = resizeRect(rect, 99999, FRONT);
    expect(huge.w).toBeCloseTo(maxRectWidth(FRONT), 10);
    expect(huge.h).toBeLessThanOrEqual(FRONT.h + 1e-9);
  });

  it("never shrinks past the validator's own ceiling on the multiplier", () => {
    const tiny = resizeRect(rect, 0, FRONT);
    expect(tiny.w).toBeCloseTo(minRectWidth(FRONT), 10);
    expect(anchorFromRect(FRONT, tiny).widthInMarkers).toBeCloseTo(MAX_WIDTH_IN_MARKERS, 6);
  });

  it('keeps the resized rectangle on the stage', () => {
    const corner = moveRect(rect, 9999, 9999, FRONT);
    const grown = resizeRect(corner, maxRectWidth(FRONT), FRONT);
    expect(grown.x).toBeGreaterThanOrEqual(0);
    expect(grown.y).toBeGreaterThanOrEqual(0);
    expect(grown.x + grown.w).toBeLessThanOrEqual(FRONT.w + 1e-9);
    expect(grown.y + grown.h).toBeLessThanOrEqual(FRONT.h + 1e-9);
  });
});

describe('isMarkerTooSmall', () => {
  it('warns below 8% of the scene width', () => {
    // Spec §3.3: a marker that small forces the visitor close enough to fill
    // the frame with it. A warning, not a block.
    expect(isMarkerTooSmall(FRONT, { x: 0, y: 0, w: FRONT.w * 0.07, h: 1 })).toBe(true);
    expect(isMarkerTooSmall(FRONT, { x: 0, y: 0, w: FRONT.w * 0.09, h: 1 })).toBe(false);
  });

  it('does not warn at the default a new binding starts on', () => {
    expect(isMarkerTooSmall(FRONT, rectFromAnchor(FRONT, 4, [0, 0]))).toBe(false);
  });
});

describe('sceneWidthMetres', () => {
  it('turns a print width into the real size of the finished scene', () => {
    // The one place relative units become a measurement — and getting it
    // wrong is expensive in paper and ink.
    expect(sceneWidthMetres(100, 8)).toBeCloseTo(0.8, 10);
    expect(sceneWidthMetres(210, 20)).toBeCloseTo(4.2, 10);
  });

  it('is zero for a nonsense print width rather than NaN on screen', () => {
    expect(sceneWidthMetres(NaN, 8)).toBe(0);
    expect(sceneWidthMetres(-5, 8)).toBe(0);
  });
});
