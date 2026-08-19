import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveExhibitId, publishedExhibitUrl, buildMarkerStoryMap } from './exhibitApi';
import { IDENTITY_LOCAL, type StoryAnchor, type StoryDoc } from '@/story/storyDoc';

/** A crop the marker validator would accept, so fixtures stay realistic. */
const CROP = {
  top: 0,
  left: 0,
  width: 480,
  height: 640,
  isRotated: false,
  originalWidth: 480,
  originalHeight: 640,
};

const anchor = (markerId: string): StoryAnchor => ({
  type: 'marker',
  markerId,
  thumbId: 'b'.repeat(64),
  crop: CROP,
  local: IDENTITY_LOCAL,
  widthInMarkers: 1,
  mode: 'follow',
});

const story = (id: string, markerId?: string): StoryDoc => ({
  schemaVersion: 4,
  id,
  title: id,
  loc: '',
  intro: { title: '', subtitle: '' },
  outro: { title: '', subtitle: '' },
  frames: [
    { key: 'f1', year: '', label: '', title: '', line: '', washColor: '', art: '<svg/>' },
  ],
  ...(markerId === undefined ? {} : { anchor: anchor(markerId) }),
});

const MARKER_A = 'a'.repeat(64);
const MARKER_C = 'c'.repeat(64);

describe('resolveExhibitId', () => {
  it('reads ?e= as an exhibit id', () => {
    expect(resolveExhibitId('?e=lobby')).toBe('lobby');
    expect(resolveExhibitId('e=lobby')).toBe('lobby');
  });

  it('lowercases and trims the id, matching the story path', () => {
    expect(resolveExhibitId('?e=%20Lobby-2%20')).toBe('lobby-2');
  });

  it('ignores a malformed id rather than fetching it', () => {
    for (const bad of ['', '../etc/passwd', 'a b', '-leading', 'x'.repeat(65), 'a/b']) {
      expect(resolveExhibitId(`?e=${encodeURIComponent(bad)}`)).toBeNull();
    }
    expect(resolveExhibitId('?e=https://evil.example/x')).toBeNull();
  });

  it('returns null when there is no ?e=', () => {
    expect(resolveExhibitId('')).toBeNull();
    expect(resolveExhibitId('?')).toBeNull();
    expect(resolveExhibitId('?other=1')).toBeNull();
  });

  it('prefers ?s= — a single story link still opens that story', () => {
    expect(resolveExhibitId('?e=lobby&s=ground-remembers')).toBeNull();
    // Even a ?s= this module would consider malformed still means "story":
    // deciding otherwise would require duplicating resolveStorySource's rules.
    expect(resolveExhibitId('?e=lobby&s=')).toBeNull();
  });
});

describe('publishedExhibitUrl', () => {
  it('builds a path under the configured story origin', () => {
    expect(publishedExhibitUrl('lobby')).toMatch(/\/exhibits\/lobby\.json$/);
  });

  it('percent-encodes the id rather than interpolating it raw', () => {
    expect(publishedExhibitUrl('a b')).toContain('a%20b');
  });
});

describe('fetchPublishedExhibit', () => {
  // Same module-reset dance as storyApi.test.ts: STORY_BASE_URL is read once at
  // module load, so without vi.resetModules() the unconfigured-host early
  // return fires and the stubbed fetch is never reached — the assertions would
  // pass for the wrong reason.
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns null when no story host is configured', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchPublishedExhibit } = await import('./exhibitApi');
    await expect(fetchPublishedExhibit('lobby')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the parsed body, unvalidated, on success', async () => {
    vi.stubEnv('VITE_STORY_BASE_URL', 'https://story.example');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'lobby' }), { status: 200 })),
    );
    vi.resetModules();

    const { fetchPublishedExhibit } = await import('./exhibitApi');
    await expect(fetchPublishedExhibit('lobby')).resolves.toEqual({ id: 'lobby' });
  });

  it('returns null rather than throwing when the document is missing', async () => {
    vi.stubEnv('VITE_STORY_BASE_URL', 'https://story.example');
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();

    const { fetchPublishedExhibit } = await import('./exhibitApi');
    await expect(fetchPublishedExhibit('gone')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null rather than throwing when the network fails', async () => {
    vi.stubEnv('VITE_STORY_BASE_URL', 'https://story.example');
    const fetchMock = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();

    const { fetchPublishedExhibit } = await import('./exhibitApi');
    await expect(fetchPublishedExhibit('lobby')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('buildMarkerStoryMap', () => {
  it('maps each marker to its story', () => {
    const map = buildMarkerStoryMap([story('one', MARKER_A), story('two', MARKER_C)]);
    expect(map.size).toBe(2);
    expect(map.get(MARKER_A)?.id).toBe('one');
    expect(map.get(MARKER_C)?.id).toBe('two');
  });

  it('keeps the first story when two claim one marker, so a bad publish cannot blank the room', () => {
    const map = buildMarkerStoryMap([story('first', MARKER_A), story('second', MARKER_A)]);
    expect(map.size).toBe(1);
    expect(map.get(MARKER_A)?.id).toBe('first');
  });

  it('skips a story with no anchor rather than dropping the exhibit', () => {
    const map = buildMarkerStoryMap([story('unanchored'), story('anchored', MARKER_A)]);
    expect(map.size).toBe(1);
    expect(map.get(MARKER_A)?.id).toBe('anchored');
  });
});
