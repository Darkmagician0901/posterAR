import { describe, expect, it, vi, beforeEach } from 'vitest';

const present = new Set<string>();
const presigned: string[] = [];

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
  async presignPutConditional(key: string) {
    presigned.push(key);
    return `https://store.example/${key}?X-Amz-Signature=abc`;
  },
}));

const SHA = 'a'.repeat(64);

const body = {
  sha256: SHA,
  sha256Base64: 'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=',
  contentType: 'image/webp',
};

async function post(payload: unknown) {
  const { default: handler } = await import('./story-assets');
  return handler(
    new Request('https://x/api/story-assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

beforeEach(() => {
  present.clear();
  presigned.length = 0;
  process.env.S3_BUCKET = 'test-bucket';
  vi.resetModules();
});

describe('POST /api/story-assets', () => {
  it('issues a conditional upload URL for unseen bytes', async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.exists).toBe(false);
    expect(json.uploadUrl).toContain(`assets/${SHA}/full.webp`);
    expect(json.requiredHeaders['If-None-Match']).toBe('*');
    expect(json.requiredHeaders['x-amz-checksum-sha256']).toBe(body.sha256Base64);
  });

  // The dedup win: the bytes are already stored, so there is nothing to upload
  // and — with no database — nothing to record either.
  it('reports a dedup hit without presigning anything', async () => {
    present.add(`assets/${SHA}/full.webp`);
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ exists: true });
    expect(presigned).toHaveLength(0);
  });

  it('rejects a sha256 that is not 64 lowercase hex', async () => {
    expect((await post({ ...body, sha256: 'nope' })).status).toBe(400);
    expect((await post({ ...body, sha256: 'A'.repeat(64) })).status).toBe(400);
  });

  // An SVG served from the bucket origin would be active content.
  it('rejects a content type outside the allowlist', async () => {
    expect((await post({ ...body, contentType: 'image/svg+xml' })).status).toBe(400);
    expect((await post({ ...body, contentType: 'text/html' })).status).toBe(400);
  });

  // Narrowed to webp end to end (finding 1): the read path
  // (src/story/assetResolver.ts) fetches a hardcoded `full.webp`, so any other
  // extension would write a key nothing ever reads. These were accepted
  // before that narrowing and must not be again.
  it('rejects every non-webp type that used to have its own extension', async () => {
    for (const contentType of ['image/gif', 'image/png', 'image/jpeg']) {
      const res = await post({ ...body, contentType });
      expect(res.status).toBe(400);
    }
  });

  // Pins the key<->URL contract from both sides in one place: the presigned
  // URL must target exactly the key the reader will later request. A
  // divergence here (e.g. a reintroduced per-type extension) fails this
  // assertion instead of going silent behind a 404 -> transparent pixel.
  it('presigns a key at exactly assets/<sha256>/full.webp', async () => {
    const res = await post(body);
    const json = await res.json();
    const expectedKey = `assets/${SHA}/full.webp`;
    expect(presigned).toEqual([expectedKey]);
    expect(json.uploadUrl).toBe(`https://store.example/${expectedKey}?X-Amz-Signature=abc`);
  });

  it('rejects a body that is not an object', async () => {
    expect((await post('nope')).status).toBe(400);
  });

  it('503s when the bucket is not configured', async () => {
    delete process.env.S3_BUCKET;
    vi.resetModules();
    expect((await post(body)).status).toBe(503);
  });

  it('rejects a non-POST method', async () => {
    const { default: handler } = await import('./story-assets');
    const res = await handler(new Request('https://x/api/story-assets', { method: 'GET' }));
    expect(res.status).toBe(405);
  });
});

// variant is optional and defaults to 'full', but when it's r1024 the
// derivative shares the PARENT sha256 as its path segment — never its own
// hash — so both variants live in one directory. Pins the key<->URL contract
// for r1024 the same way the tests above pin it for full: a divergence
// between the key written here and the URL src/story/assetResolver.ts reads
// must fail a test, not resolve to a silent 404 -> transparent pixel.
describe('POST /api/story-assets — variant', () => {
  it('defaults to variant "full" when omitted, unchanged from before', async () => {
    const res = await post(body);
    const json = await res.json();
    expect(json.uploadUrl).toContain(`assets/${SHA}/full.webp`);
    expect(presigned).toEqual([`assets/${SHA}/full.webp`]);
  });

  it('presigns assets/<sha256>/r1024.webp when variant is r1024', async () => {
    const res = await post({ ...body, variant: 'r1024' });
    const json = await res.json();
    const expectedKey = `assets/${SHA}/r1024.webp`;
    expect(res.status).toBe(201);
    expect(presigned).toEqual([expectedKey]);
    expect(json.uploadUrl).toBe(`https://store.example/${expectedKey}?X-Amz-Signature=abc`);
  });

  it('keeps sha256 as the PARENT address for the r1024 variant — never its own hash', async () => {
    // sha256Base64 stands in for the derivative's own digest here; sha256
    // itself (the path segment) still names the parent asset.
    await post({ ...body, variant: 'r1024', sha256Base64: 'ZGVyaXZhdGl2ZS1oYXNoLWJhc2U2NA==' });
    expect(presigned[0]).toBe(`assets/${SHA}/r1024.webp`);
  });

  it('rejects a variant outside the allowed set', async () => {
    const res = await post({ ...body, variant: 'r2048' });
    expect(res.status).toBe(400);
    expect(presigned).toHaveLength(0);
  });

  it('checks existence at the SAME key it is about to presign for r1024', async () => {
    present.add(`assets/${SHA}/r1024.webp`);
    const res = await post({ ...body, variant: 'r1024' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ exists: true });
    // A dedup hit means nothing is presigned.
    expect(presigned).toHaveLength(0);
  });

  // full and r1024 are independent objects: an existing full.webp must not
  // short-circuit an r1024 upload for the same parent, and vice versa.
  it('treats full and r1024 as independently-existing objects', async () => {
    present.add(`assets/${SHA}/full.webp`);
    const res = await post({ ...body, variant: 'r1024' });
    const json = await res.json();
    expect(json.exists).toBe(false);
    expect(presigned).toEqual([`assets/${SHA}/r1024.webp`]);
  });
});
