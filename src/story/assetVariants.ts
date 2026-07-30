/**
 * assetVariants.ts — the stored forms of one asset.
 *
 * An asset is stored twice under a single content address: the canonical bytes
 * (`full`) and a display derivative (`r1024`) capped at the rasterizer's
 * budget.
 *
 * The derivative is not merely a performance nicety. Every hydrated byte
 * inflates the data: URL that gets assigned to img.src, and that is the one
 * place this design carries an unquantified device limit (§14.2). Keeping the
 * hydrated payload small is a correctness margin.
 *
 * Both variants live under the same content address — the SHA-256 of the
 * *original* (parent) bytes — never the derivative's own hash. That is what
 * lets the resolver find the derivative knowing only the parent id, and it is
 * why adding or removing the derivative never changes the document schema.
 *
 * This module is imported from both `api/` (the presign endpoint, which
 * writes the key) and `src/` (the client, which requests it, and the
 * resolver, which reads it) so the three can never diverge on what a key
 * looks like.
 */

/**
 * Longest-axis cap for the display derivative.
 *
 * Matches RASTER_MAX in svgTexture.ts, which rasterizes the whole composed
 * frame at 1024 on its longest axis — so a single prop inside that frame can
 * never need more.
 */
export const RASTER_LONGEST_AXIS = 1024;

/** Which stored form of an asset. */
export type AssetVariant = 'full' | 'r1024';

/** Every valid variant, for validating untrusted input against the set. */
export const ASSET_VARIANTS: readonly AssetVariant[] = ['full', 'r1024'];

/**
 * Object key for one variant.
 *
 * @param assetId — 64-hex content address of the PARENT (original) bytes —
 *   shared by both variants, never the derivative's own hash.
 * @param variant — Which stored form.
 * @returns The S3 key, relative to the bucket root.
 */
export function variantKey(assetId: string, variant: AssetVariant): string {
  return `assets/${assetId}/${variant}.webp`;
}
