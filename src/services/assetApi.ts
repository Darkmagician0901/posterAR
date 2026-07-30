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
 * An asset optionally carries a second stored form: a display derivative
 * (`r1024`) capped at the rasterizer's budget, uploaded under the SAME
 * (parent) content address as the canonical bytes. See
 * `src/story/assetVariants.ts` for why the derivative shares the parent's
 * hash rather than being addressed by its own.
 */

import { API_BASE_URL } from '@/utils/constants';
import { hexToBase64, sha256Hex } from '@/story/assetHash';
import type { AssetVariant } from '@/story/assetVariants';

/**
 * Upload types the server accepts. Mirrors the server-side allowlist in
 * `api/story-assets.ts`, which is webp-only — the read path
 * (`src/story/assetResolver.ts`) fetches `r1024.webp`, falling back to
 * `full.webp`, so any other extension would write a key nothing ever reads.
 */
export type AssetContentType = 'image/webp';

interface PresignResponse {
  exists: boolean;
  uploadUrl?: string;
  requiredHeaders?: Record<string, string>;
}

/**
 * Presigns and uploads one variant's bytes under a given (parent) content
 * address. Shared by both the canonical upload and the derivative upload
 * below, so the presign/PUT/412-is-success handling can't drift between them.
 *
 * @param sha256 — PARENT content address (path segment); identical to the
 *   digest of `bytes` for the `full` variant, but NOT for `r1024`.
 * @param variant — Which stored form these bytes represent.
 * @param contentType — MIME type of `bytes`.
 * @param bytes — The bytes actually being uploaded for this variant.
 * @throws When the presign or upload fails for any reason other than the
 *   object already existing.
 */
async function uploadVariantBytes(
  sha256: string,
  variant: AssetVariant,
  contentType: AssetContentType,
  bytes: Blob,
): Promise<void> {
  // The checksum header must match the bytes actually being uploaded, which
  // for a derivative is its own digest — not the parent's.
  const sha256Base64 = hexToBase64(await sha256Hex(await bytes.arrayBuffer()));

  const presignRes = await fetch(`${API_BASE_URL}/api/story-assets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sha256, sha256Base64, contentType, variant }),
  });
  if (!presignRes.ok) throw new Error(`presign failed: ${presignRes.status}`);

  const presign = (await presignRes.json()) as PresignResponse;
  // Already stored. Content addressing makes this a certainty rather than a
  // guess, so there is nothing to upload.
  if (presign.exists) return;

  if (!presign.uploadUrl) throw new Error('presign returned no upload URL');

  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    // Sent verbatim: these headers are part of the signature, so altering or
    // dropping one produces a mismatch rather than a silent success.
    headers: presign.requiredHeaders ?? {},
    body: bytes,
  });

  // 412 Precondition Failed means If-None-Match rejected the write because the
  // object already exists — a race with another uploader of identical bytes.
  // The bytes we wanted are stored, so this is success.
  if (!put.ok && put.status !== 412) {
    throw new Error(`upload failed: ${put.status}`);
  }
}

/**
 * Stores an asset (and optionally a display derivative) and returns its
 * content address.
 *
 * @param blob — The canonical bytes to store, after compression.
 * @param contentType — MIME type of those bytes.
 * @param derivative — Optional smaller re-encode of the same image, stored
 *   under the SAME content address as `variant: 'r1024'`. A failure uploading
 *   it is caught and swallowed: the derivative rides alongside the canonical
 *   asset, so losing it degrades to "the resolver falls back to full.webp"
 *   rather than costing the author their upload. This catch only wraps the
 *   derivative step — a failure in the primary upload above still throws.
 * @returns The assetId (SHA-256 hex of `blob`) to record in the document.
 * @throws When the PRIMARY presign or upload fails for any reason other than
 *   the object already existing. Derivative failures never throw here.
 */
export async function uploadStoryAsset(
  blob: Blob,
  contentType: AssetContentType,
  derivative?: Blob | null,
): Promise<string> {
  const sha256 = await sha256Hex(await blob.arrayBuffer());

  await uploadVariantBytes(sha256, 'full', contentType, blob);

  if (derivative) {
    try {
      await uploadVariantBytes(sha256, 'r1024', contentType, derivative);
    } catch {
      // Non-fatal by design — see the `derivative` param doc above. The
      // asset stands with only full.webp; the resolver already falls back.
    }
  }

  return sha256;
}
