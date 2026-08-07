import { describe, it, expect } from 'vitest';
import {
  markerFrontRect,
  markerTopRect,
  humanFrontRect,
  scaleBarFront,
  scaleBarTop,
  outOfRange,
} from './stageOverlay';
import { FRONT, TOP } from './stageGeometry';
import { DEFAULT_MARKER } from '@/story/marker';
import { SCENE, depthScale } from '@/story/projection';
import type { StoryProp } from '@/story/storyDoc';

const prop = (z: number): StoryProp => ({ t: 'lib', k: 'sunflower', x: 0, z, h: 1, f: false, e: 0 });

describe('markerFrontRect', () => {
  it('draws the poster to true scale on the wall plane', () => {
    const r = markerFrontRect(DEFAULT_MARKER);
    // 0.297 m at the wall's foreshortening, in camera-view units.
    expect(r.w).toBeCloseTo(0.297 * FRONT.ppm * depthScale(0), 6);
    expect(r.h / r.w).toBeCloseTo(DEFAULT_MARKER.aspect, 6);
  });

  it('centres it horizontally', () => {
    const r = markerFrontRect(DEFAULT_MARKER);
    expect(r.x + r.w / 2).toBeCloseTo(FRONT.w / 2, 6);
  });

  it('hangs it above the ground line, centred on the mount height', () => {
    const r = markerFrontRect(DEFAULT_MARKER);
    expect(r.y + r.h).toBeLessThan(FRONT.groundY);
    // Higher mounting draws it higher up the frame.
    const high = markerFrontRect({ ...DEFAULT_MARKER, mountHeight: 2.5 });
    expect(high.y).toBeLessThan(r.y);
  });

  it('grows with the printed width', () => {
    const wide = markerFrontRect({ ...DEFAULT_MARKER, widthM: 1.2 });
    expect(wide.w).toBeGreaterThan(markerFrontRect(DEFAULT_MARKER).w);
  });
});

describe('markerTopRect', () => {
  it('lies along the wall at the top edge of the map', () => {
    expect(markerTopRect(DEFAULT_MARKER).y).toBe(0);
  });

  it('is as wide as the poster is printed', () => {
    const r = markerTopRect(DEFAULT_MARKER);
    // The map spans 2 * TOP.xr metres across TOP.w units.
    expect(r.w).toBeCloseTo((0.297 / (TOP.xr * 2)) * TOP.w, 6);
    expect(r.x + r.w / 2).toBeCloseTo(TOP.w / 2, 6);
  });
});

describe('humanFrontRect', () => {
  it('is 1.7 m tall standing at the near plane', () => {
    const r = humanFrontRect();
    expect(r.h).toBeCloseTo(1.7 * FRONT.ppm * depthScale(SCENE.zMax), 6);
    expect(r.y + r.h).toBeCloseTo(FRONT.groundY, 6);
  });

  it('dwarfs an A3 poster, which is the whole point of drawing it', () => {
    expect(humanFrontRect().h).toBeGreaterThan(markerFrontRect(DEFAULT_MARKER).h * 4);
  });
});

describe('scale bars', () => {
  it('spans one metre in the camera view, at the near plane', () => {
    const b = scaleBarFront();
    expect(b.x2 - b.x1).toBeCloseTo(FRONT.ppm * depthScale(SCENE.zMax), 6);
  });

  it('spans one metre on the map', () => {
    const b = scaleBarTop();
    expect(b.x2 - b.x1).toBeCloseTo(TOP.w / (TOP.xr * 2), 6);
  });

  it('keeps both bars inside their frames', () => {
    expect(scaleBarFront().x1).toBeGreaterThan(0);
    expect(scaleBarFront().x2).toBeLessThanOrEqual(FRONT.w);
    expect(scaleBarTop().x1).toBeGreaterThan(0);
    expect(scaleBarTop().x2).toBeLessThanOrEqual(TOP.w);
  });
});

describe('outOfRange', () => {
  it('finds nothing in a well-placed scene', () => {
    expect(outOfRange([prop(0), prop(2.3), prop(SCENE.zMax)])).toEqual([]);
  });

  it('flags a prop behind the wall', () => {
    expect(outOfRange([prop(2), prop(-0.5)])).toEqual([1]);
  });

  it('flags a prop past the far edge of the scene', () => {
    expect(outOfRange([prop(SCENE.zMax + 0.1)])).toEqual([0]);
  });

  it('reports every offender, not just the first', () => {
    expect(outOfRange([prop(-1), prop(2), prop(99)])).toEqual([0, 2]);
  });
});
