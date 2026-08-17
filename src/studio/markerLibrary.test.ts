import { describe, expect, it, beforeEach } from 'vitest';
import { getDefaultCrop } from '@/markers/markerCrop';
import {
  MARKER_LIBRARY_KEY,
  addToLibrary,
  readMarkerLibrary,
  writeMarkerLibrary,
  type MarkerLibraryEntry,
} from './markerLibrary';

const crop = getDefaultCrop({ width: 1200, height: 1600 }, false);

function entry(id: string, name = 'Poster'): MarkerLibraryEntry {
  return { markerId: id.repeat(64), thumbId: 'b'.repeat(64), name, crop, addedAt: 1 };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('readMarkerLibrary', () => {
  it('is empty when nothing was ever saved', () => {
    expect(readMarkerLibrary()).toEqual([]);
  });

  it('round-trips what was written', () => {
    writeMarkerLibrary([entry('a')]);
    expect(readMarkerLibrary()).toEqual([entry('a')]);
  });

  it('returns empty rather than throwing on corrupt storage', () => {
    window.localStorage.setItem(MARKER_LIBRARY_KEY, '{not json');
    expect(readMarkerLibrary()).toEqual([]);
  });

  it('drops an entry whose id could name a path, not just a hash', () => {
    window.localStorage.setItem(
      MARKER_LIBRARY_KEY,
      JSON.stringify([{ ...entry('a'), markerId: '../../etc/passwd' }]),
    );
    expect(readMarkerLibrary()).toEqual([]);
  });

  it('drops an entry with no crop, because the target could not be synthesized', () => {
    const { crop: _drop, ...noCrop } = entry('a');
    window.localStorage.setItem(MARKER_LIBRARY_KEY, JSON.stringify([noCrop]));
    expect(readMarkerLibrary()).toEqual([]);
  });
});

describe('addToLibrary', () => {
  it('appends a new marker', () => {
    expect(addToLibrary([], entry('a'))).toHaveLength(1);
  });

  it('replaces rather than duplicates when the same picture is added twice', () => {
    const first = addToLibrary([], entry('a', 'Old name'));
    const second = addToLibrary(first, entry('a', 'New name'));
    expect(second).toHaveLength(1);
    expect(second[0].name).toBe('New name');
  });
});
