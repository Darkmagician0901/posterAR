import { describe, it, expect } from 'vitest';
import { LEGACY_Z_MAX, migrateDraftDepth } from './markerBackfill';
import { DEFAULT_MARKER } from './marker';
import { SCENE } from './projection';
import type { StoryDoc, StoryFrame } from './storyDoc';

function frame(z: number): StoryFrame {
  return {
    key: 'f1',
    year: '1951',
    label: 'F1',
    title: 'TEST',
    line: '',
    washColor: 'rgba(0,0,0,0)',
    art: '<svg viewBox="0 0 330 175" xmlns="http://www.w3.org/2000/svg"></svg>',
    props: [{ t: 'lib', k: 'sunflower', x: 0, z, h: 1.6, f: false, e: 0 }],
  };
}

function doc(frames: StoryFrame[], marker?: StoryDoc['marker']): StoryDoc {
  return {
    schemaVersion: 3,
    id: 'x',
    title: 'T',
    loc: '',
    intro: { title: 'a', subtitle: 'b' },
    outro: { title: 'c', subtitle: 'd' },
    frames,
    ...(marker ? { marker } : {}),
  };
}

describe('migrateDraftDepth', () => {
  it('turns the old scene front-to-back', () => {
    // Old z was distance from the viewer; new z is distance from the wall.
    const out = migrateDraftDepth(doc([frame(0)]));
    expect(out.frames[0].props![0].z).toBeCloseTo(SCENE.zMax, 6);
  });

  it('maps the old far edge onto the wall', () => {
    const out = migrateDraftDepth(doc([frame(LEGACY_Z_MAX)]));
    expect(out.frames[0].props![0].z).toBeCloseTo(0, 6);
  });

  it('maps the midpoint to the midpoint', () => {
    const out = migrateDraftDepth(doc([frame(LEGACY_Z_MAX / 2)]));
    expect(out.frames[0].props![0].z).toBeCloseTo(SCENE.zMax / 2, 6);
  });

  it('clamps a prop parked beyond the old map', () => {
    const out = migrateDraftDepth(doc([frame(99)]));
    expect(out.frames[0].props![0].z).toBeGreaterThanOrEqual(0);
    expect(out.frames[0].props![0].z).toBeLessThanOrEqual(SCENE.zMax);
  });

  it('seeds a default marker, which is what marks the draft migrated', () => {
    const out = migrateDraftDepth(doc([frame(1)]));
    expect(out.marker).toEqual(DEFAULT_MARKER);
  });

  it('never runs twice on the same draft', () => {
    const once = migrateDraftDepth(doc([frame(0)]));
    const twice = migrateDraftDepth(once);
    expect(twice).toBe(once);
    expect(twice.frames[0].props![0].z).toBeCloseTo(SCENE.zMax, 6);
  });

  it('leaves an already-marked draft completely alone', () => {
    const current = doc([frame(2)], DEFAULT_MARKER);
    expect(migrateDraftDepth(current)).toBe(current);
  });

  it('recomposes art so the thumbnail matches the migrated props', () => {
    const before = doc([frame(0)]);
    const after = migrateDraftDepth(before);
    expect(after.frames[0].art).not.toBe(before.frames[0].art);
    expect(after.frames[0].art).toContain('<svg');
  });

  it('leaves a frame with no props alone but still marks the doc', () => {
    const bare = { ...frame(0), props: undefined };
    const out = migrateDraftDepth(doc([bare]));
    expect(out.frames[0].art).toBe(bare.art);
    expect(out.marker).toEqual(DEFAULT_MARKER);
  });
});
