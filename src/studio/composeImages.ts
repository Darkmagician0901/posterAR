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

/**
 * Guards the PERSISTED path against re-inlining bytes into `frame.art`.
 *
 * A v3 legacy asset's `href` is already a `data:` URL (see `toComposeImages`
 * above), and that function passes it through unchanged regardless of whether
 * it was called for a preview or for persistence — there is no v3 draft
 * migration yet, so a document can still hold one. If that map reaches
 * `composeFrame`/`phoneScene` on the persist path, the full base64 payload
 * gets baked into `frame.art` — exactly the ballooning the v4 content-address
 * migration removed, and silently, since nothing else would catch it.
 *
 * Call this on the map built with no `resolved` argument, right before it is
 * composed into art that gets saved. Building an actual v3->v4 migration is
 * deliberate future work; this only makes the alternative (silent re-inlining)
 * loud instead.
 *
 * @param images — The map about to be composed into persisted art.
 * @throws When any entry's href is a `data:` URL.
 */
export function assertPersistable(images: Record<string, ComposedImage>): void {
  for (const [alias, { href }] of Object.entries(images)) {
    if (href.startsWith('data:')) {
      throw new Error(
        `"${alias}" is stored in an older format that cannot be saved without embedding its full ` +
          'bytes into the story. Remove it from the stage and re-upload the image, then place it again.',
      );
    }
  }
}
