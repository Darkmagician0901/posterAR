import { describe, expect, it } from 'vitest';
import { markerTargetData } from './markerTarget';
import type { StoryAnchor } from '@/story/storyDoc';

const crop = {
  top: 0, left: 100, width: 1200, height: 1600,
  isRotated: false, originalWidth: 1400, originalHeight: 1600,
};
const anchor: StoryAnchor = {
  type: 'marker', markerId: 'a'.repeat(64), thumbId: 'b'.repeat(64),
  crop, local: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
  widthInMarkers: 1, mode: 'follow',
};

describe('markerTargetData', () => {
  it('names the target by its markerId, so an imagefound event keys straight into the story map', () => {
    expect(markerTargetData(anchor).name).toBe(anchor.markerId);
  });

  it('requests a same-origin path, because the engine resolves imagePath against the page', () => {
    const path = markerTargetData(anchor).imagePath;
    expect(path.startsWith('/')).toBe(true);
    expect(path).not.toMatch(/^https?:/);
  });

  it('builds the path from the markerId alone, which cannot name a host', () => {
    expect(markerTargetData(anchor).imagePath).toBe(`/image-targets/${anchor.markerId}.png`);
  });

  it('carries the crop through as the target properties', () => {
    expect(markerTargetData(anchor).properties).toEqual(crop);
  });

  it('sets metadata to null, matching what the CLI emits', () => {
    expect(markerTargetData(anchor).metadata).toBeNull();
  });

  it('is PLANAR — curved markers are not generated', () => {
    expect(markerTargetData(anchor).type).toBe('PLANAR');
  });

  it('is identical across calls, so a reload configures the same targets', () => {
    expect(markerTargetData(anchor)).toEqual(markerTargetData(anchor));
  });
});

describe('testbed export pairing', () => {
  // The Markers panel exports two files for Phase 0's on-device check, named
  // `<markerId>.png` and `<markerId>.json`, and the testbed's loader leaves an
  // already-absolute imagePath untouched. So the JSON only finds its image if
  // imagePath's basename is exactly the PNG's filename. Nothing at runtime
  // checks that — it just silently fails to detect, which is indistinguishable
  // from a bad marker and would corrupt the very measurement Phase 0 takes.
  it('points at a file named for the markerId, which is what the export writes', () => {
    const { imagePath } = markerTargetData(anchor);
    expect(imagePath.split('/').pop()).toBe(`${anchor.markerId}.png`);
  });

  it('keeps the luminance resource name in step with the path it is served from', () => {
    const target = markerTargetData(anchor);
    expect(target.resources.luminanceImage).toBe(target.imagePath.split('/').pop());
  });
});
