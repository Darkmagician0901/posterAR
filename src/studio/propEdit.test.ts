import { describe, it, expect } from 'vitest';
import { PROP_LIMITS, duplicateProp, clampProp } from './propEdit';
import type { StoryProp } from '@/story/storyDoc';

const base: StoryProp = { t: 'lib', k: 'oldcar', x: 1, z: 1.5, h: 1.4, f: false, e: 0 };

describe('duplicateProp', () => {
  it('offsets the copy to the right so it does not hide under the original', () => {
    const copy = duplicateProp(base);
    expect(copy.x).toBeCloseTo(1.4);
    expect(copy.z).toBe(base.z);
    expect(copy.h).toBe(base.h);
  });

  it('clamps the offset at the right edge of the stage', () => {
    const copy = duplicateProp({ ...base, x: PROP_LIMITS.xMax });
    expect(copy.x).toBe(PROP_LIMITS.xMax);
  });

  it('is a deep copy — editing the duplicate never mutates the original', () => {
    const copy = duplicateProp(base);
    copy.h = 5;
    expect(base.h).toBe(1.4);
  });
});

describe('clampProp', () => {
  it('holds every field inside the stage limits', () => {
    const wild: StoryProp = { t: 'lib', k: 'x', x: 99, z: -3, h: 999, f: false, e: 50 };
    const c = clampProp(wild);
    expect(c.x).toBe(PROP_LIMITS.xMax);
    expect(c.z).toBe(PROP_LIMITS.zMin);
    expect(c.h).toBe(PROP_LIMITS.hMax);
    expect(c.e).toBe(PROP_LIMITS.eMax);
  });

  it('leaves an in-range prop untouched', () => {
    const c = clampProp(base);
    expect(c).toEqual(base);
  });
});
