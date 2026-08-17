import { describe, expect, it } from 'vitest';
import { markerKey } from './markerStorage';

describe('markerKey', () => {
  const id = 'a'.repeat(64);

  it('addresses a marker by its own hash, under the markers prefix', () => {
    expect(markerKey(id)).toBe(`markers/${id}.png`);
  });

  it('stays outside the assets prefix so the publish reachability check ignores it', () => {
    expect(markerKey(id).startsWith('assets/')).toBe(false);
  });
});
