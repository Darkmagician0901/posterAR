import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveStorySource,
  readLocalDraft,
  loadStoryForLocation,
  LOCAL_DRAFT_KEY,
} from './storyApi';

describe('resolveStorySource', () => {
  it('defaults to the bundled story when nothing is asked for', () => {
    expect(resolveStorySource('')).toEqual({ kind: 'default' });
    expect(resolveStorySource('?')).toEqual({ kind: 'default' });
    expect(resolveStorySource('?other=1')).toEqual({ kind: 'default' });
  });

  it('reads a published id, with or without the leading question mark', () => {
    expect(resolveStorySource('?s=ground-remembers')).toEqual({
      kind: 'published',
      id: 'ground-remembers',
    });
    expect(resolveStorySource('s=abc123')).toEqual({ kind: 'published', id: 'abc123' });
  });

  it('normalises case and surrounding whitespace', () => {
    expect(resolveStorySource('?s=%20Ground-1%20')).toEqual({
      kind: 'published',
      id: 'ground-1',
    });
  });

  it('falls back to default for malformed ids rather than fetching them', () => {
    for (const bad of ['', '../etc/passwd', 'a b', '-leading', 'x'.repeat(65), 'a/b']) {
      expect(resolveStorySource(`?s=${encodeURIComponent(bad)}`)).toEqual({ kind: 'default' });
    }
  });

  it('recognises the studio draft flag', () => {
    expect(resolveStorySource('?draft=1')).toEqual({ kind: 'draft' });
    expect(resolveStorySource('?draft=0')).toEqual({ kind: 'default' });
  });

  it('prefers a published id over the draft flag', () => {
    expect(resolveStorySource('?s=abc&draft=1')).toEqual({ kind: 'published', id: 'abc' });
  });
});

describe('readLocalDraft', () => {
  afterEach(() => window.localStorage.clear());

  it('returns null when no draft is stored', () => {
    expect(readLocalDraft()).toBeNull();
  });

  it('returns the parsed draft', () => {
    window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({ title: 'DRAFT' }));
    expect(readLocalDraft()).toEqual({ title: 'DRAFT' });
  });

  it('returns null rather than throwing on unparseable content', () => {
    window.localStorage.setItem(LOCAL_DRAFT_KEY, '{not json');
    expect(readLocalDraft()).toBeNull();
  });
});

describe('loadStoryForLocation', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('returns null for the default source so the bundled story is kept', async () => {
    await expect(loadStoryForLocation('')).resolves.toBeNull();
  });

  it('returns the local draft for the draft source', async () => {
    window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({ title: 'D' }));
    await expect(loadStoryForLocation('?draft=1')).resolves.toEqual({ title: 'D' });
  });

  it('returns null for a published id when no story host is configured', async () => {
    // VITE_STORY_BASE_URL is unset in the test env, so remote loading is off.
    await expect(loadStoryForLocation('?s=abc')).resolves.toBeNull();
  });

  it('never rejects, even when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await expect(loadStoryForLocation('?s=abc')).resolves.toBeNull();
  });
});
