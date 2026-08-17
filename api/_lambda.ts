/**
 * _lambda.ts — one Lambda entry point in front of the API routes.
 *
 * The route handlers are written against the Web Fetch API: they take a
 * `Request` and return a `Response`. That is deliberately kept platform-neutral
 * — the handlers hold the actual logic and should not know what invoked them.
 * This file is the only place that knows about Lambda, which is why moving off
 * the previous host touched it and nothing else.
 *
 * ONE function serves BOTH routes rather than one function each. A Lambda
 * function URL is per-function, so two functions would mean two URLs and two
 * rewrite rules to keep in step; routing here on the path means the frontend
 * has a single origin to point at. The handlers are small and share the whole
 * S3 helper, so there is nothing gained by isolating them.
 *
 * Invoked through a function URL with payload format 2.0, which is what
 * `aws lambda create-function-url-config` produces.
 */

import storyAssets from './story-assets';
import publish from './publish';
import publishExhibit from './publish-exhibit';

/**
 * The slice of the function-URL event this adapter reads.
 *
 * Declared locally rather than pulled from `@types/aws-lambda`: four fields do
 * not justify a dependency, and naming exactly what is consumed documents the
 * coupling to the payload format better than a wide imported type would.
 */
interface FunctionUrlEvent {
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: {
    domainName?: string;
    http?: { method?: string };
  };
}

/** What a function URL expects back when the response is not streamed. */
interface FunctionUrlResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
}

type Handler = (request: Request) => Promise<Response>;

/**
 * Paths this function answers, matched exactly after trailing-slash removal.
 *
 * These are the same paths the frontend already calls, so the Amplify rewrite
 * can forward `/api/<*>` verbatim and nothing on the client changes.
 */
const ROUTES: Record<string, Handler> = {
  '/api/story-assets': storyAssets,
  '/api/publish': publish,
  '/api/publish-exhibit': publishExhibit,
};

function json(body: unknown, status: number): FunctionUrlResult {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

/**
 * Builds the `Request` the route handler expects.
 *
 * The URL has to be absolute for the `Request` constructor, but no handler
 * reads the host — they only ever look at the method and the body — so the
 * function URL's own domain is a truthful stand-in that costs nothing.
 */
function toRequest(event: FunctionUrlEvent): Request {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = event.rawPath ?? '/';
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const host = event.requestContext?.domainName ?? 'localhost';

  const headers = new Headers();
  for (const [name, value] of Object.entries(event.headers ?? {})) {
    if (value !== undefined) headers.set(name, value);
  }

  // GET and HEAD must not carry a body — the Request constructor throws rather
  // than ignoring one — and a function URL sends no body for them anyway.
  const bodyless = method === 'GET' || method === 'HEAD';
  const body = bodyless
    ? undefined
    : event.isBase64Encoded && event.body !== undefined
      ? Buffer.from(event.body, 'base64')
      : event.body;

  return new Request(`https://${host}${path}${query}`, { method, headers, body });
}

/** Converts a handler's `Response` into what the function URL will return. */
async function fromResponse(response: Response): Promise<FunctionUrlResult> {
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
    // Every route here answers JSON, so text is always the right reading and
    // base64 is never needed. A route returning binary would have to revisit
    // this — hence stating it rather than leaving it implied.
    body: await response.text(),
    isBase64Encoded: false,
  };
}

/**
 * Lambda entry point.
 *
 * @param event — Function URL invocation, payload format 2.0.
 * @returns The route's response, or 404 for an unknown path.
 */
export async function handler(event: FunctionUrlEvent): Promise<FunctionUrlResult> {
  // Trailing slashes are stripped so `/api/publish/` and `/api/publish` are the
  // same route; the root path is left alone so it cannot become the empty
  // string and match nothing recognisable.
  const raw = event.rawPath ?? '/';
  const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;

  const route = ROUTES[path];
  if (!route) return json({ error: `No such route: ${path}` }, 404);

  try {
    return await fromResponse(await route(toRequest(event)));
  } catch (err) {
    // An uncaught throw would surface to the browser as a bare Lambda error
    // with no CORS-safe shape and nothing actionable in it. Log the detail for
    // CloudWatch, return something the studio can display.
    console.error('Unhandled error in', path, err);
    return json({ error: 'Internal error. Check the function logs.' }, 500);
  }
}
