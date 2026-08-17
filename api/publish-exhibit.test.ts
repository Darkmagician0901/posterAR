import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { StoryAnchor, StoryDoc } from '../src/story/storyDoc';
import type { MarkerCrop } from '../src/markers/markerCrop';
import { markerKey } from '../src/markers/markerStorage';
import { MAX_EXHIBIT_STORIES } from '../src/exhibit/exhibitDoc';

const present = new Set<string>();
const stories = new Map<string, unknown>();
const puts: Array<{ key: string; body: string; cacheControl: string }> = [];
/** Set to make getJson throw, standing in for an S3 outage on the read path. */
let getError: Error | null = null;

vi.mock('./_s3', () => ({
  // A getter (not a static string) so this mirrors the real _s3.ts, which
  // derives BUCKET from process.env.S3_BUCKET at module-evaluation time. The
  // "503 when not configured" test below deletes that env var and calls
  // vi.resetModules() specifically to force a fresh read — a hardcoded
  // literal here would make that env toggle inert and the 503 unreachable.
  get BUCKET() {
    return process.env.S3_BUCKET ?? '';
  },
  async objectExists(key: string) {
    return present.has(key);
  },
  async getJson(key: string) {
    // The real getJson rethrows every non-404 — a wrong region, absent
    // credentials, an outage — rather than reporting "missing".
    if (getError) throw getError;
    return stories.has(key) ? stories.get(key) : null;
  },
  async putJson(key: string, body: string, cacheControl: string) {
    puts.push({ key, body, cacheControl });
  },
}));

const SECRET = 'test-secret';

const CROP: MarkerCrop = {
  top: 0,
  left: 0,
  width: 480,
  height: 640,
  isRotated: false,
  originalWidth: 480,
  originalHeight: 640,
};

function anchor(markerId: string, thumbId: string): StoryAnchor {
  return {
    type: 'marker',
    markerId,
    thumbId,
    crop: CROP,
    local: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    widthInMarkers: 1,
    mode: 'follow',
  };
}

const frame = {
  key: 'f1',
  year: '1951',
  label: 'a',
  title: 't',
  line: 'l',
  washColor: '#000',
  art: '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>',
};

function story(id: string, over: Record<string, unknown> = {}): StoryDoc {
  return {
    schemaVersion: 4,
    id,
    title: 'T',
    loc: '',
    intro: { title: '', subtitle: '' },
    outro: { title: '', subtitle: '' },
    frames: [frame],
    ...over,
  } as StoryDoc;
}

/**
 * Seeds a story published under `stories/<id>.json`, with a working marker
 * anchor whose both images are already present in the bucket. The common case
 * every "everything is fine except X" test starts from.
 */
function seedStory(id: string, markerId: string, thumbId: string): void {
  stories.set(`stories/${id}.json`, story(id, { anchor: anchor(markerId, thumbId) }));
  present.add(markerKey(markerId));
  present.add(markerKey(thumbId));
}

async function post(payload: unknown, auth = `Bearer ${SECRET}`) {
  const { default: handler } = await import('./publish-exhibit');
  return handler(
    new Request('https://x/api/publish-exhibit', {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

beforeEach(() => {
  present.clear();
  stories.clear();
  puts.length = 0;
  getError = null;
  process.env.STUDIO_PUBLISH_SECRET = SECRET;
  process.env.S3_BUCKET = 'test-bucket';
  delete process.env.STORY_PUBLIC_BASE_URL;
  vi.resetModules();
});

describe('POST /api/publish-exhibit', () => {
  it('refuses without the publish secret', async () => {
    const res = await post({ id: 'lobby', doc: { title: 'Lobby', storyIds: ['a'] } }, 'Bearer wrong');
    expect(res.status).toBe(401);
    expect(puts).toHaveLength(0);
  });

  it('refuses a story that is not bound to any picture, naming the story', async () => {
    stories.set('stories/a.json', story('a')); // no anchor
    const res = await post({ id: 'lobby', doc: { title: 'Lobby', storyIds: ['a'] } });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('"a"');
    expect(puts).toHaveLength(0);
  });

  it('refuses two stories bound to the same picture', async () => {
    const marker = 'a'.repeat(64);
    const thumb = 'b'.repeat(64);
    seedStory('a', marker, thumb);
    seedStory('b', marker, thumb); // same picture as "a"
    const res = await post({ id: 'lobby', doc: { title: 'Lobby', storyIds: ['a', 'b'] } });
    expect(res.status).toBe(422);
    const error = (await res.json()).error;
    expect(error).toMatch(/"a"/);
    expect(error).toMatch(/"b"/);
    expect(puts).toHaveLength(0);
  });

  // The operator is standing right there and can drop a story, so the cap is
  // refused here rather than trimmed. This is the regression test for the
  // ordering bug: running exhibitIssues on validateExhibitDoc's output instead
  // of the submitted list made this 422 unreachable, and a fourteen-story
  // exhibit published happily as ten with four dead pictures.
  it('refuses more stories than the tracker can watch at once', async () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_EXHIBIT_STORIES + 4; i++) {
      const id = `s${i}`;
      const marker = i.toString(16).padStart(64, '0');
      const thumb = (i + 1000).toString(16).padStart(64, '0');
      seedStory(id, marker, thumb);
      ids.push(id);
    }
    const res = await post({ id: 'lobby', doc: { title: 'Lobby', storyIds: ids } });
    expect(res.status).toBe(422);
    const error = (await res.json()).error;
    expect(error).toMatch(/10/);
    expect(error).toMatch(/14/);
    expect(puts).toHaveLength(0);
  });

  it('refuses the same story listed twice, before it reaches the bucket', async () => {
    seedStory('a', 'a'.repeat(64), 'b'.repeat(64));
    const res = await post({ id: 'lobby', doc: { title: 'Lobby', storyIds: ['a', 'a'] } });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/twice/);
    expect(puts).toHaveLength(0);
  });

  it('refuses a marker whose image never finished uploading', async () => {
    const marker = 'a'.repeat(64);
    const thumb = 'b'.repeat(64);
    stories.set('stories/a.json', story('a', { anchor: anchor(marker, thumb) }));
    // Neither markerKey is added to `present` — the upload never finished.
    const res = await post({ id: 'lobby', doc: { title: 'Lobby', storyIds: ['a'] } });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/upload/i);
    expect(puts).toHaveLength(0);
  });

  it('refuses a marker id that is not a hash', async () => {
    stories.set('stories/a.json', {
      ...story('a'),
      anchor: { ...anchor('a'.repeat(64), 'b'.repeat(64)), markerId: 'not-a-hash' },
    });
    const res = await post({ id: 'lobby', doc: { title: 'Lobby', storyIds: ['a'] } });
    expect(res.status).toBe(422);
    expect(puts).toHaveLength(0);
  });

  it('refuses an anchor whose crop is missing', async () => {
    const raw = story('a') as unknown as Record<string, unknown>;
    raw.anchor = {
      type: 'marker',
      markerId: 'a'.repeat(64),
      thumbId: 'b'.repeat(64),
      // crop deliberately omitted
      local: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
      widthInMarkers: 1,
      mode: 'follow',
    };
    stories.set('stories/a.json', raw);
    const res = await post({ id: 'lobby', doc: { title: 'Lobby', storyIds: ['a'] } });
    expect(res.status).toBe(422);
    expect(puts).toHaveLength(0);
  });

  it('refuses a story that has not been published yet', async () => {
    const res = await post({ id: 'lobby', doc: { title: 'Lobby', storyIds: ['ghost'] } });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('"ghost"');
    expect(puts).toHaveLength(0);
  });

  it('writes the exhibit with a 60-second TTL so a republish is promptly visible', async () => {
    const marker = 'a'.repeat(64);
    const thumb = 'b'.repeat(64);
    seedStory('a', marker, thumb);
    const res = await post({ id: 'lobby', doc: { title: 'Lobby', storyIds: ['a'] } });
    expect(res.status).toBe(200);
    expect(puts).toHaveLength(1);
    expect(puts[0].key).toBe('exhibits/lobby.json');
    expect(puts[0].cacheControl).toMatch(/max-age=60\b/);
  });

  it('returns the published id and url on success', async () => {
    const marker = 'a'.repeat(64);
    const thumb = 'b'.repeat(64);
    seedStory('a', marker, thumb);
    process.env.STORY_PUBLIC_BASE_URL = 'https://cdn.example';
    const res = await post({ id: 'lobby', doc: { title: 'Lobby', storyIds: ['a'] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'lobby', url: 'https://cdn.example/exhibits/lobby.json' });
  });

  it('still rejects an invalid id before doing any work', async () => {
    const res = await post({ id: 'Not Valid!', doc: { title: 'Lobby', storyIds: ['a'] } });
    expect(res.status).toBe(400);
    expect(puts).toHaveLength(0);
  });

  // 422, not 400: with the refusals running on the submitted list, an empty
  // exhibit is now caught by exhibitIssues, which can say what to do about it.
  // validateExhibitDoc's own null branch stays as the type-level backstop that
  // turns `ExhibitDoc | null` into `ExhibitDoc`.
  it('still rejects an exhibit with no usable stories, and says what is missing', async () => {
    const res = await post({ id: 'lobby', doc: { title: 'Lobby', storyIds: [] } });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('at least one story');
    expect(puts).toHaveLength(0);
  });

  it('rejects a list of ids that are all unusable, without fetching any of them', async () => {
    const res = await post({
      id: 'lobby',
      doc: { title: 'Lobby', storyIds: ['../etc/passwd', 'https://evil.example/x'] },
    });
    expect(res.status).toBe(422);
    expect(puts).toHaveLength(0);
  });
});

// getJson and objectExists both rethrow every non-404 on purpose. Run outside
// the try/catch, that would escape the handler as a bare 500; the designed
// answer is a 502 that names what actually failed.
describe('POST /api/publish-exhibit — pre-flight storage failures', () => {
  it('answers 502 with the storage message when reading a member story throws', async () => {
    const marker = 'a'.repeat(64);
    const thumb = 'b'.repeat(64);
    seedStory('a', marker, thumb);
    getError = new Error('Region is missing');

    const res = await post({ id: 'lobby', doc: { title: 'Lobby', storyIds: ['a'] } });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('Could not save the exhibit: Region is missing');
    expect(puts).toHaveLength(0);
  });
});
