/**
 * assetResolver.ts — turning asset references into inlinable bytes.
 *
 * Composed art is rasterized through `<img>`, which runs SVG in restricted
 * mode: external references are not fetched and render blank. So an asset's
 * bytes have to be present as a `data:` URL at that moment, which means
 * fetching them ourselves and re-encoding.
 *
 * The base URL comes from build configuration, never from the document. That
 * is the whole security property: a published document is untrusted input, and
 * because it carries only a 64-hex content address it has no way to name a
 * host.
 *
 * Every failure resolves to a transparent pixel rather than rejecting. A gap
 * in one frame is recoverable; a rejected promise on the render path is not.
 */

import { isAssetRef, type StoryAsset, type StoryAssetRef } from './storyDoc';
import { TRANSPARENT_PIXEL } from './artTokens';
import { assetKey } from './assetStorage';

/** Origin serving `assets/`. Empty means same-origin, which is the default. */
const ASSET_BASE_URL: string = import.meta.env.VITE_ASSET_BASE_URL || '';

/**
 * Whether an origin for `assets/` has been configured at build time.
 *
 * Exported so the studio can say so before an operator walks away: unset, every
 * uploaded image in every published story renders as a transparent gap, and the
 * only other signal is one console.warn nobody is looking at.
 *
 * @returns True when VITE_ASSET_BASE_URL was set for this build.
 */
export function isAssetHostConfigured(): boolean {
  return ASSET_BASE_URL !== '';
}

/**
 * Whether the one-time "unset asset base URL" warning has already fired.
 *
 * Module-scope, not per-call: an unset base URL affects every v4 asset in
 * every document a session resolves, so warning once is a signal an operator
 * can act on; warning per asset would just be noise that gets ignored.
 */
let warnedUnsetBaseUrl = false;

/**
 * Resolved `data:` URLs keyed by assetId.
 *
 * Bounded because a data: URL holds the whole payload as a string; an
 * unbounded map would grow with every story a session visits. Mirrors the
 * budgeting `posterTextureCache` already applies to textures.
 */
const CACHE_LIMIT = 24;
const cache = new Map<string, string>();

/** Drops every cached asset. For teardown and tests. */
export function clearAssetCache(): void {
  cache.clear();
}

/** Re-arms the one-time unset-base-URL warning. For tests only. */
export function resetAssetResolverWarnings(): void {
  warnedUnsetBaseUrl = false;
}

/** Records a resolved asset, evicting the oldest entry when over budget. */
function remember(assetId: string, dataUrl: string): void {
  cache.set(assetId, dataUrl);
  if (cache.size > CACHE_LIMIT) {
    // Map preserves insertion order, so the first key is the oldest.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** Reads a blob as a `data:` URL. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('asset read failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * The id whose bytes this reference would rather have.
 *
 * The derivative is preferred because every hydrated byte inflates the `data:`
 * URL assigned to img.src, which is the one device limit this design carries
 * unquantified. It doubles as the cache key: two references wanting the same
 * bytes want the same id.
 *
 * @param asset — A v4 reference.
 * @returns `r1024Id` when the reference carries one, else `assetId`.
 */
function preferredId(asset: StoryAssetRef): string {
  return asset.r1024Id ?? asset.assetId;
}

/**
 * Fetches one asset's bytes and encodes them inline.
 *
 * Both ids are 64-hex content addresses already validated by the document
 * validator, and are interpolated into a path, never into a host.
 *
 * @param asset — The reference to resolve. Its derivative is tried first; a
 *   non-2xx or a network failure falls through to the canonical bytes, which
 *   is also what a pre-derivative asset looks like.
 * @returns The bytes as a `data:` URL, or {@link TRANSPARENT_PIXEL} on any
 *   failure. Never rejects.
 */
async function fetchAsDataUrl(asset: StoryAssetRef): Promise<string> {
  if (ASSET_BASE_URL === '' && !warnedUnsetBaseUrl) {
    warnedUnsetBaseUrl = true;
    // Not fatal — the fetch below still runs same-origin — but it will 404 in
    // any environment that doesn't also serve assets/ itself, and that 404
    // resolves to a silent transparent pixel with no other signal. See
    // .env.example for VITE_ASSET_BASE_URL.
    console.warn(
      'VITE_ASSET_BASE_URL is unset — story assets resolve same-origin and will silently render as ' +
        'transparent pixels unless this origin also serves assets/.',
    );
  }
  const base = ASSET_BASE_URL.replace(/\/$/, '');
  // Prefer the display derivative; fall back to the canonical bytes so an
  // asset with no derivative — or one whose derivative never landed — still
  // resolves. A failure on one tries the next rather than giving up
  // immediately; only exhausting both falls through to the transparent pixel.
  const candidates =
    asset.r1024Id === undefined ? [asset.assetId] : [asset.r1024Id, asset.assetId];
  for (const id of candidates) {
    try {
      const res = await fetch(`${base}/${assetKey(id)}`, { credentials: 'omit' });
      if (!res.ok) continue;
      return await blobToDataUrl(await res.blob());
    } catch {
      // Try the next candidate; a transparent pixel is the last resort only.
    }
  }
  return TRANSPARENT_PIXEL;
}

/**
 * Resolves every asset a document declares.
 *
 * @param assets — The document's `assets` map. v3 inline entries pass straight
 *   through; v4 references are fetched once each and cached.
 * @returns Alias to `data:` URL, ready for `hydrateArt`.
 */
export async function resolveAssets(
  assets: Record<string, StoryAsset>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  // Fetch each distinct set of bytes once even when several aliases share it.
  const pending = new Map<string, Promise<string>>();

  for (const [alias, asset] of Object.entries(assets)) {
    if (!isAssetRef(asset)) {
      out.set(alias, asset.href);
      continue;
    }
    const id = preferredId(asset);
    const cached = cache.get(id);
    if (cached !== undefined) {
      out.set(alias, cached);
      continue;
    }
    if (!pending.has(id)) pending.set(id, fetchAsDataUrl(asset));
  }

  const ids = [...pending.keys()];
  const results = await Promise.all(pending.values());
  ids.forEach((id, i) => {
    if (results[i] !== TRANSPARENT_PIXEL) remember(id, results[i]);
  });

  for (const [alias, asset] of Object.entries(assets)) {
    if (!isAssetRef(asset) || out.has(alias)) continue;
    const id = preferredId(asset);
    const i = ids.indexOf(id);
    out.set(alias, i >= 0 ? results[i] : (cache.get(id) ?? TRANSPARENT_PIXEL));
  }

  return out;
}
