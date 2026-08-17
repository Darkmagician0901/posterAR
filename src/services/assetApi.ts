/**
 * assetApi.ts — uploading content-addressed story assets.
 *
 * Uploads happen the moment a file is dropped, not at publish time. That is
 * what keeps the draft free of base64: from the first instant, the document
 * holds only an assetId.
 *
 * There is no commit step and no owner header. The asset's identity is the
 * SHA-256 of its bytes, so storing it is idempotent and the stored object is
 * itself the record that it happened — no row to write, nothing to reconcile.
 *
 * An asset optionally carries a display derivative: a smaller re-encode stored
 * as an ORDINARY asset under its own hash, referenced by a second id. It is
 * deliberately not a slot under the parent's address — see
 * `src/story/assetStorage.ts` for why an address nobody can verify is a
 * public write token when the presign endpoint is unauthenticated.
 */

import { uploadContent } from './contentUpload';

/**
 * Upload types the server accepts. Mirrors the server-side allowlist in
 * `api/story-assets.ts`, which is webp-only — the read path
 * (`src/story/assetResolver.ts`) fetches `full.webp`, so any other extension
 * would write a key nothing ever reads.
 */
export type AssetContentType = 'image/webp';

/** What one upload produced: the asset, and its derivative when there is one. */
export interface UploadedAsset {
  /** Content address of the canonical bytes. */
  assetId: string;
  /** Content address of the display derivative, when one was stored. */
  r1024Id?: string;
}

/**
 * Stores an asset (and optionally a display derivative) and returns their
 * content addresses.
 *
 * @param blob — The canonical bytes to store, after compression.
 * @param contentType — MIME type of those bytes.
 * @param derivative — Optional smaller re-encode of the same image, stored as
 *   an asset in its own right. A failure uploading it is caught and swallowed:
 *   the derivative rides alongside the canonical asset, so losing it degrades
 *   to "the document carries no r1024Id" rather than costing the author their
 *   upload. This catch only wraps the derivative step — a failure in the
 *   primary upload above still throws.
 * @returns The assetId, plus r1024Id when a derivative was stored.
 * @throws When the PRIMARY presign or upload fails for any reason other than
 *   the object already existing. Derivative failures never throw here.
 */
export async function uploadStoryAsset(
  blob: Blob,
  contentType: AssetContentType,
  derivative?: Blob | null,
): Promise<UploadedAsset> {
  const assetId = await uploadContent(blob, contentType, 'asset');

  if (derivative) {
    try {
      return { assetId, r1024Id: await uploadContent(derivative, contentType, 'asset') };
    } catch {
      // Non-fatal by design — see the `derivative` param doc above. The asset
      // stands on `assetId` alone, which is exactly what a pre-derivative
      // asset looks like, and the resolver already handles that.
    }
  }

  return { assetId };
}
