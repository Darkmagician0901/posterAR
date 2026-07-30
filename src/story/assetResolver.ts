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

import { isAssetRef, type StoryAsset } from './storyDoc';
import { TRANSPARENT_PIXEL } from './artTokens';

/** Origin serving `assets/`. Empty means same-origin, which is the default. */
const ASSET_BASE_URL: string = import.meta.env.VITE_ASSET_BASE_URL || '';

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
 * Fetches one asset's bytes and encodes them inline.
 *
 * @param assetId — 64-hex content address, already validated by the document
 *   validator. Interpolated into a path, never into a host.
 * @returns The bytes as a `data:` URL, or {@link TRANSPARENT_PIXEL} on any
 *   failure.
 */
async function fetchAsDataUrl(assetId: string): Promise<string> {
  const base = ASSET_BASE_URL.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/assets/${assetId}/full.webp`, { credentials: 'omit' });
    if (!res.ok) return TRANSPARENT_PIXEL;
    return await blobToDataUrl(await res.blob());
  } catch {
    return TRANSPARENT_PIXEL;
  }
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

  // Fetch each distinct assetId once even when several aliases share it.
  const pending = new Map<string, Promise<string>>();

  for (const [alias, asset] of Object.entries(assets)) {
    if (!isAssetRef(asset)) {
      out.set(alias, asset.href);
      continue;
    }
    const { assetId } = asset;
    const cached = cache.get(assetId);
    if (cached !== undefined) {
      out.set(alias, cached);
      continue;
    }
    if (!pending.has(assetId)) pending.set(assetId, fetchAsDataUrl(assetId));
  }

  const ids = [...pending.keys()];
  const results = await Promise.all(pending.values());
  ids.forEach((id, i) => {
    if (results[i] !== TRANSPARENT_PIXEL) remember(id, results[i]);
  });

  for (const [alias, asset] of Object.entries(assets)) {
    if (!isAssetRef(asset) || out.has(alias)) continue;
    const i = ids.indexOf(asset.assetId);
    out.set(alias, i >= 0 ? results[i] : (cache.get(asset.assetId) ?? TRANSPARENT_PIXEL));
  }

  return out;
}
