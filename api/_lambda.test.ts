import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * What the mocked route handlers recorded about the Request they were handed.
 * The adapter's whole job is building that Request faithfully, so asserting on
 * it is the point rather than an implementation detail.
 */
interface Seen {
  route: string;
  method: string;
  url: string;
  body: string;
  contentType: string | null;
}

const seen: Seen[] = [];
let reply: () => Response = () => new Response('{"ok":true}', { status: 200 });

async function record(route: string, request: Request): Promise<Response> {
  seen.push({
    route,
    method: request.method,
    url: request.url,
    // GET/HEAD carry no body; reading it yields '' rather than throwing.
    body: request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text(),
    contentType: request.headers.get('content-type'),
  });
  return reply();
}

vi.mock('./story-assets', () => ({
  default: (request: Request) => record('story-assets', request),
}));

vi.mock('./publish', () => ({
  default: (request: Request) => record('publish', request),
}));

/** Minimal function-URL event, payload format 2.0. */
function event(overrides: Record<string, unknown> = {}) {
  return {
    rawPath: '/api/publish',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    body: '{"hello":"world"}',
    isBase64Encoded: false,
    requestContext: {
      domainName: 'abc123.lambda-url.us-east-1.on.aws',
      http: { method: 'POST' },
    },
    ...overrides,
  };
}

async function invoke(overrides: Record<string, unknown> = {}) {
  const { handler } = await import('./_lambda');
  return handler(event(overrides));
}

beforeEach(() => {
  seen.length = 0;
  reply = () => new Response('{"ok":true}', { status: 200 });
  vi.restoreAllMocks();
});

describe('lambda adapter — routing', () => {
  it('dispatches /api/publish to the publish handler', async () => {
    await invoke({ rawPath: '/api/publish' });
    expect(seen.map((s) => s.route)).toEqual(['publish']);
  });

  it('dispatches /api/story-assets to the upload handler', async () => {
    await invoke({ rawPath: '/api/story-assets' });
    expect(seen.map((s) => s.route)).toEqual(['story-assets']);
  });

  it('404s an unknown path without invoking any handler', async () => {
    const res = await invoke({ rawPath: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(seen).toEqual([]);
  });

  it('treats a trailing slash as the same route', async () => {
    await invoke({ rawPath: '/api/publish/' });
    expect(seen.map((s) => s.route)).toEqual(['publish']);
  });

  it('does not collapse the root path into an empty string', async () => {
    // '/' must stay '/' — stripping it would leave '' and produce a confusing
    // "No such route: " message with nothing after the colon.
    const res = await invoke({ rawPath: '/' });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toContain('/');
  });
});

describe('lambda adapter — request construction', () => {
  it('passes the method, body and headers through unchanged', async () => {
    await invoke({ body: '{"a":1}' });
    expect(seen[0].method).toBe('POST');
    expect(seen[0].body).toBe('{"a":1}');
    expect(seen[0].contentType).toBe('application/json');
  });

  it('decodes a base64-encoded body', async () => {
    await invoke({
      body: Buffer.from('{"binary":true}').toString('base64'),
      isBase64Encoded: true,
    });
    expect(seen[0].body).toBe('{"binary":true}');
  });

  it('builds an absolute URL including the query string', async () => {
    await invoke({ rawQueryString: 'draft=1&x=2' });
    expect(seen[0].url).toBe(
      'https://abc123.lambda-url.us-east-1.on.aws/api/publish?draft=1&x=2',
    );
  });

  it('attaches no body to a GET, which would otherwise throw', async () => {
    // The Request constructor rejects a body on GET outright, so a naive
    // adapter crashes on any GET rather than letting the route answer 405.
    const res = await invoke({
      requestContext: {
        domainName: 'abc123.lambda-url.us-east-1.on.aws',
        http: { method: 'GET' },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(seen[0].method).toBe('GET');
  });

  it('survives an event with no headers, body or requestContext', async () => {
    const { handler } = await import('./_lambda');
    const res = await handler({ rawPath: '/api/publish' });
    expect(res.statusCode).toBe(200);
    expect(seen[0].method).toBe('GET');
  });
});

describe('lambda adapter — response translation', () => {
  it('carries the status and headers back out', async () => {
    reply = () =>
      new Response('{"created":true}', {
        status: 201,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    const res = await invoke();
    expect(res.statusCode).toBe(201);
    expect(res.headers['content-type']).toBe('application/json');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toBe('{"created":true}');
    expect(res.isBase64Encoded).toBe(false);
  });

  it('turns an unhandled throw into a 500 that reveals nothing', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    reply = () => {
      throw new Error('bucket credentials are AKIAEXAMPLE');
    };
    const res = await invoke();
    expect(res.statusCode).toBe(500);
    // The detail belongs in CloudWatch, not in a response the browser renders.
    expect(res.body).not.toContain('AKIAEXAMPLE');
    expect(JSON.parse(res.body).error).toMatch(/logs/i);
    expect(logged).toHaveBeenCalled();
  });
});
