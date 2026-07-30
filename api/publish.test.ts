import { describe, expect, it, vi, beforeEach } from 'vitest';
import { assetKey } from '../src/story/assetStorage';

const puts: Array<{ key: string; body: string; cacheControl: string }> = [];
const existing = new Set<string>();
/** Every key the handler probed for existence, in order. */
const probed: string[] = [];
/** Set to make objectExists throw, standing in for an S3 outage. */
let existsError: Error | null = null;

vi.mock('./_s3', () => ({
  BUCKET: 'test-bucket',
  getS3: () => ({}),
  async putJson(key: string, body: string, cacheControl: string) {
    puts.push({ key, body, cacheControl });
  },
  async objectExists(key: string) {
    probed.push(key);
    // The real objectExists rethrows every non-404 — a wrong region, absent
    // credentials, an outage — rather than reporting "absent".
    if (existsError) throw existsError;
    return existing.has(key);
  },
}));

const SHA = 'a'.repeat(64);
const R1024 = 'b'.repeat(64);
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
  probed.length = 0;
  existsError = null;
  // Derived from the shared builder, never a repeated literal: the handler
  // probes whatever that function produces, so seeding a hand-written copy
  // would make this suite keep passing while every real publish 422'd on
  // assets that uploaded perfectly well.
  existing.add(assetKey(SHA));
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

  // The defect this pins: publish used to hand-write the key it probes. Change
  // the shared builder and publish silently keeps probing the old address —
  // every publish 422s on assets that uploaded fine — while a test seeded with
  // the same literal keeps passing. Both sides derive from one function now.
  it('probes exactly the key the shared builder produces', async () => {
    await post({ id: 'my-story', doc: doc() });
    expect(probed).toEqual([assetKey(SHA)]);
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

// The derivative is a separate asset at its own address, and the viewer reads
// it in preference to the canonical bytes. A reference naming one whose bytes
// are absent therefore costs every visitor a wasted round trip — invisibly,
// because the fallback hides it. Publish is the only place to catch that.
describe('POST /api/publish — the derivative must exist too', () => {
  const withDerivative = () => doc({ assets: { logo: { assetId: SHA, r1024Id: R1024, aspect: 1 } } });

  it('accepts a reference whose derivative is stored', async () => {
    existing.add(assetKey(R1024));
    const res = await post({ id: 'my-story', doc: withDerivative() });
    expect(res.status).toBe(200);
    expect(puts).toHaveLength(1);
  });

  it('422s when the r1024Id bytes are absent, even though the assetId is there', async () => {
    // assetKey(SHA) only — the derivative never landed.
    const res = await post({ id: 'my-story', doc: withDerivative() });
    expect(res.status).toBe(422);
    expect(puts).toHaveLength(0);
    expect((await res.json()).error).toMatch(/upload/i);
  });
});

// objectExists rethrows every non-404 on purpose. Run outside the try/catch,
// that escaped the handler as a bare 500; the designed answer is a 502 that
// names what actually failed.
describe('POST /api/publish — pre-flight storage failures', () => {
  it('answers 502 with the storage message when the existence probe throws', async () => {
    existsError = new Error('Region is missing');
    const res = await post({ id: 'my-story', doc: doc() });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('Could not save the story: Region is missing');
    expect(puts).toHaveLength(0);
  });
});
