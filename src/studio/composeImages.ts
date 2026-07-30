/**
 * composeImages.ts — bridging document assets to the prop composer.
 *
 * `compose()` (and `phoneScene()`) take an `images` map of `ComposedImage`
 * ({ href, aspect }) and interpolate `href` straight into `<image href="...">`.
 * What that href should be depends entirely on where the output is going:
 *
 *   PERSISTED ART  → `asset:<alias>`, a token. The composed SVG is stored in
 *                    the document, so it must not carry bytes.
 *   LIVE PREVIEW   → a real `data:` URL, because the preview needs to display
 *                    something now and is never persisted.
 *
 * One adapter serves both, which keeps compose.ts itself unaware of storage —
 * it imports neither `StoryAsset` nor `isAssetRef`.
 */

import type { ComposedImage } from '@/story/props/compose';
import { isAssetRef, type StoryAsset } from '@/story/storyDoc';

/**
 * Builds the `images` map `compose()` / `phoneScene()` expect.
 *
 * @param assets — The document's asset map.
 * @param resolved — Optional alias to `data:` URL. Supply it for previews that
 *   must render now; omit it when composing art destined for the document.
 * @returns The map to pass as `ComposeOptions.images`.
 */
export function toComposeImages(
  assets: Record<string, StoryAsset>,
  resolved?: ReadonlyMap<string, string>,
): Record<string, ComposedImage> {
  const out: Record<string, ComposedImage> = {};
  for (const [alias, asset] of Object.entries(assets)) {
    // A v3 inline asset already holds its own bytes. A v4 reference resolves
    // to real bytes when a preview map is supplied, else to a persisted token.
    const href = isAssetRef(asset) ? (resolved?.get(alias) ?? `asset:${alias}`) : asset.href;
    out[alias] = { href, aspect: asset.aspect };
  }
  return out;
}
