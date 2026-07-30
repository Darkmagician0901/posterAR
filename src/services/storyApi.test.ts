import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveStorySource,
  readLocalDraft,
  loadStoryForLocation,
  slugifyStoryId,
  publishStory,
  hydrateStoryDoc,
  LOCAL_DRAFT_KEY,
} from './storyApi';
import { clearAssetCache } from '@/story/assetResolver';
import type { StoryDoc } from '@/story/storyDoc';

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

describe('slugifyStoryId', () => {
  it('produces ids the publish endpoint accepts', () => {
    const pattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
    for (const title of [
      'THE GROUND REMEMBERS',
      "10th & Center",
      '  spaced  out  ',
      'Ünïcødé Title',
      '2026 retrospective',
      '!!!',
      '',
    ]) {
      expect(slugifyStoryId(title)).toMatch(pattern);
    }
  });

  it('lowercases and hyphenates', () => {
    expect(slugifyStoryId('THE GROUND REMEMBERS')).toBe('the-ground-remembers');
  });

  it('strips leading and trailing separators', () => {
    expect(slugifyStoryId('  --hello--  ')).toBe('hello');
  });

  it('never starts with a hyphen, even for symbol-only titles', () => {
    expect(slugifyStoryId('!!!')).toMatch(/^[a-z0-9]/);
    expect(slugifyStoryId('')).toMatch(/^[a-z0-9]/);
  });

  it('caps length so the id stays path-safe', () => {
    expect(slugifyStoryId('x'.repeat(200)).length).toBeLessThanOrEqual(48);
  });

  it('round-trips through resolveStorySource', () => {
    const id = slugifyStoryId('The Ground Remembers');
    expect(resolveStorySource(`?s=${id}`)).toEqual({ kind: 'published', id });
  });
});

describe('publishStory', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the published and visitor URLs on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'abc', url: 'https://blob.example/stories/abc.json' }),
        }),
      ),
    );
    const out = await publishStory({ title: 'x' }, 'abc', 'secret');
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.url).toBe('https://blob.example/stories/abc.json');
      expect(out.viewUrl).toContain('?s=abc');
    }
  });

  it('sends the secret as a bearer token and never in the body', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ url: 'https://x/y.json' }) }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await publishStory({ title: 'x' }, 'abc', 'super-secret');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer super-secret');
    expect(String(init.body)).not.toContain('super-secret');
  });

  it('surfaces the server error message rather than a generic failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Not authorised.' }),
        }),
      ),
    );
    const out = await publishStory({}, 'abc', 'wrong');
    expect(out).toEqual({ ok: false, error: 'Not authorised.' });
  });

  it('falls back to a status message when the server sends no error text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) })),
    );
    const out = await publishStory({}, 'abc', 's');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('503');
  });

  it('reports a network failure rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    const out = await publishStory({}, 'abc', 's');
    expect(out.ok).toBe(false);
  });

  it('treats a success response with no url as a failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'abc' }) })),
    );
    const out = await publishStory({}, 'abc', 's');
    expect(out.ok).toBe(false);
  });
});

const SHA = 'a'.repeat(64);

const docWithToken = (): StoryDoc => ({
  schemaVersion: 4,
  id: 'x',
  title: '',
  loc: '',
  intro: { title: '', subtitle: '' },
  outro: { title: '', subtitle: '' },
  frames: [
    { key: 'f1', year: '', label: '', title: '', line: '', washColor: '',
      art: '<svg><image href="asset:logo"/></svg>' },
    { key: 'f2', year: '', label: '', title: '', line: '', washColor: '',
      art: '<svg><image href="asset:logo"/></svg>' },
  ],
  assets: { logo: { assetId: SHA, aspect: 1 } },
});

describe('hydrateStoryDoc', () => {
  afterEach(() => {
    clearAssetCache();
    vi.unstubAllGlobals();
  });

  it('replaces tokens in every frame with the resolved bytes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(new Blob([new Uint8Array([1])], { type: 'image/webp' }), { status: 200 })));

    const out = await hydrateStoryDoc(docWithToken());
    expect(out.frames[0].art).toMatch(/href="data:/);
    expect(out.frames[1].art).toMatch(/href="data:/);
    expect(out.frames[0].art).not.toContain('asset:logo');
  });

  it('fetches a shared asset once for the whole document', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Blob([new Uint8Array([1])], { type: 'image/webp' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await hydrateStoryDoc(docWithToken());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a document with no assets unchanged', async () => {
    const doc = { ...docWithToken(), assets: undefined };
    const out = await hydrateStoryDoc(doc);
    expect(out).toBe(doc);
  });

  it('leaves art intact when an asset fails to resolve', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })));
    const out = await hydrateStoryDoc(docWithToken());
    // A transparent pixel, not a broken document.
    expect(out.frames[0].art).toContain('data:image/png;base64,');
  });
});
