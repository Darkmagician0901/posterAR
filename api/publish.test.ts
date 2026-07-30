import { describe, expect, it, vi, beforeEach } from 'vitest';

const puts: Array<{ key: string; body: string; cacheControl: string }> = [];
const existing = new Set<string>();

vi.mock('./_s3', () => ({
  BUCKET: 'test-bucket',
  getS3: () => ({}),
  async putJson(key: string, body: string, cacheControl: string) {
    puts.push({ key, body, cacheControl });
  },
  async objectExists(key: string) {
    return existing.has(key);
  },
}));

const SHA = 'a'.repeat(64);
const SECRET = 'test-secret';

const frame = (art: string) => ({
  key: 'f1', year: '1951', label: 'a', title: 't', line: 'l', washColor: '#000', art,
});

const doc = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 4,
  id: 'my-story',
  title: 'T',
  loc: '',
  intro: { title: '', subtitle: '' },
  outro: { title: '', subtitle: '' },
  frames: [frame('<svg viewBox="0 0 1 1"><image href="asset:logo"/></svg>')],
  assets: { logo: { assetId: SHA, aspect: 1 } },
  ...over,
});

async function post(body: unknown, auth = `Bearer ${SECRET}`) {
  const { default: handler } = await import('./publish');
  return handler(
    new Request('https://x/api/publish', {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  puts.length = 0;
  existing.clear();
  existing.add(`assets/${SHA}/full.webp`);
  process.env.STUDIO_PUBLISH_SECRET = SECRET;
  process.env.S3_BUCKET = 'test-bucket';
  vi.resetModules();
});

describe('POST /api/publish', () => {
  it('writes the artifact to stories/<id>.json', async () => {
    const res = await post({ id: 'my-story', doc: doc() });
    expect(res.status).toBe(200);
    expect(puts).toHaveLength(1);
    expect(puts[0].key).toBe('stories/my-story.json');
  });

  // stories/ is the one mutable object at a stable key. A long TTL means a
  // republish is invisible to visitors until it expires.
  it('sets a short cache TTL on the artifact', async () => {
    await post({ id: 'my-story', doc: doc() });
    expect(puts[0].cacheControl).toMatch(/max-age=60\b/);
  });

  it('rejects a document referencing an asset that was never uploaded', async () => {
    existing.clear();
    const res = await post({ id: 'my-story', doc: doc() });
    expect(res.status).toBe(422);
    expect(puts).toHaveLength(0);
    expect((await res.json()).error).toMatch(/upload/i);
  });

  // An art token with no matching assets entry would hydrate to a transparent
  // gap on every viewer's device. Better to refuse at publish.
  it('rejects art whose token has no assets entry', async () => {
    const res = await post({
      id: 'my-story',
      doc: doc({ assets: {} }),
    });
    expect(res.status).toBe(422);
    expect(puts).toHaveLength(0);
  });

  it('accepts a document with no assets at all', async () => {
    const res = await post({
      id: 'my-story',
      doc: doc({ frames: [frame('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>')], assets: undefined }),
    });
    expect(res.status).toBe(200);
    expect(puts).toHaveLength(1);
  });

  it('still rejects a bad secret before doing any work', async () => {
    const res = await post({ id: 'my-story', doc: doc() }, 'Bearer wrong');
    expect(res.status).toBe(401);
    expect(puts).toHaveLength(0);
  });

  it('still rejects an invalid id', async () => {
    const res = await post({ id: 'Not Valid!', doc: doc() });
    expect(res.status).toBe(400);
    expect(puts).toHaveLength(0);
  });

  it('still rejects a document with no usable frames', async () => {
    const res = await post({ id: 'my-story', doc: doc({ frames: [] }) });
    expect(res.status).toBe(400);
    expect(puts).toHaveLength(0);
  });
});
