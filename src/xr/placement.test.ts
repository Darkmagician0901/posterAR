import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  PLACEMENT_RANGE,
  TILE,
  clampPlacementPoint,
  tileSize,
  isPlaceableHit,
} from './placement';

/** Horizontal (floor-plane) distance between two points. */
const horiz = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

const eye = new Vector3(0, 1.5, 0);

describe('clampPlacementPoint', () => {
  it('leaves a hit that is already a comfortable distance away alone', () => {
    const hit = new Vector3(0, 0, -2);
    const out = clampPlacementPoint(hit, eye);
    expect(out.x).toBeCloseTo(hit.x);
    expect(out.y).toBeCloseTo(hit.y);
    expect(out.z).toBeCloseTo(hit.z);
  });

  // The bug: a hit-test landing across the room planted a 0.9 m tile 6 m away,
  // where it covers 14% of the screen and reads as a postage stamp.
  it('pulls a far hit in to the maximum distance', () => {
    const hit = new Vector3(0, 0, -6);
    const out = clampPlacementPoint(hit, eye);
    expect(horiz(out, eye)).toBeCloseTo(PLACEMENT_RANGE.maxM);
  });

  it('pushes a hit that is almost underfoot out to the minimum distance', () => {
    const hit = new Vector3(0, 0, -0.3);
    const out = clampPlacementPoint(hit, eye);
    expect(horiz(out, eye)).toBeCloseTo(PLACEMENT_RANGE.minM);
  });

  it('keeps the pulled-in point on the same bearing from the viewer', () => {
    const hit = new Vector3(3, 0, -4); // 5 m away on the floor plane
    const out = clampPlacementPoint(hit, eye);
    const bearingIn = Math.atan2(hit.x - eye.x, hit.z - eye.z);
    const bearingOut = Math.atan2(out.x - eye.x, out.z - eye.z);
    expect(bearingOut).toBeCloseTo(bearingIn);
  });

  // Clamping along the raw camera->hit ray would lift a floor hit off the floor.
  // Only the horizontal offset is clamped, so the art stays at ground height.
  it('preserves the height the surface was found at', () => {
    const hit = new Vector3(0, 0.42, -7);
    const out = clampPlacementPoint(hit, eye);
    expect(out.y).toBe(0.42);
  });

  it('leaves the point alone when the viewer is directly above it', () => {
    const hit = new Vector3(0, 0, 0);
    const out = clampPlacementPoint(hit, new Vector3(0, 1.5, 0));
    expect(out.x).toBe(0);
    expect(out.z).toBe(0);
  });

  it('does not mutate the hit it was given', () => {
    const hit = new Vector3(0, 0, -9);
    clampPlacementPoint(hit, eye);
    expect(hit.z).toBe(-9);
  });
});

describe('tileSize', () => {
  it('gives landscape art the full human-scale width', () => {
    const { widthM, heightM } = tileSize(168 / 330); // the era art's shape
    expect(widthM).toBeCloseTo(TILE.targetWidthM);
    expect(heightM).toBeCloseTo(TILE.targetWidthM * (168 / 330));
  });

  it('is far bigger than the 0.9 m tile it replaces', () => {
    expect(tileSize(0.5).widthM).toBeGreaterThan(0.9);
  });

  // A tall portrait story at 2 m wide would be over 3 m high — taller than the
  // room it is standing in.
  it('narrows very tall art so it still fits under a ceiling', () => {
    const { widthM, heightM } = tileSize(2);
    expect(heightM).toBeCloseTo(TILE.maxHeightM);
    expect(widthM).toBeCloseTo(TILE.maxHeightM / 2);
  });

  it('treats a missing or nonsense aspect as square rather than collapsing', () => {
    for (const bad of [0, Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const { widthM, heightM } = tileSize(bad);
      expect(widthM).toBeGreaterThan(0);
      expect(heightM).toBeGreaterThan(0);
    }
  });
});

describe('isPlaceableHit', () => {
  it('accepts a real surface', () => {
    expect(isPlaceableHit('DETECTED_SURFACE')).toBe(true);
    expect(isPlaceableHit('ESTIMATED_SURFACE')).toBe(true);
  });

  // A feature point is one tracked speck, often metres off across the room —
  // the main source of a story planted somewhere absurd.
  it('refuses a lone feature point and an unknown result', () => {
    expect(isPlaceableHit('FEATURE_POINT')).toBe(false);
    expect(isPlaceableHit('UNSPECIFIED')).toBe(false);
  });
});
