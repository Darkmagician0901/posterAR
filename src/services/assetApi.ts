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

import { API_BASE_URL } from '@/utils/constants';
import { hexToBase64, sha256Hex } from '@/story/assetHash';

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

interface PresignResponse {
  exists: boolean;
  uploadUrl?: string;
  requiredHeaders?: Record<string, string>;
}

/**
 * Presigns and uploads one blob under its own content address.
 *
 * Shared by the canonical upload and the derivative upload below, so the
 * presign/PUT/412-is-success handling can't drift between them — and so both
 * obey the same rule: the address written is the hash of the bytes written.
 * The server enforces exactly that, and refuses any request where the two
 * disagree.
 *
 * @param contentType — MIME type of `bytes`.
 * @param bytes — The bytes being uploaded.
 * @returns The content address the bytes are stored under.
 * @throws When the presign or upload fails for any reason other than the
 *   object already existing.
 */
async function uploadBytes(contentType: AssetContentType, bytes: Blob): Promise<string> {
  const sha256 = await sha256Hex(await bytes.arrayBuffer());
  // Same digest as the key, in the encoding S3's checksum header takes. The
  // server rejects the request unless these two agree.
  const sha256Base64 = hexToBase64(sha256);

  const presignRes = await fetch(`${API_BASE_URL}/api/story-assets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sha256, sha256Base64, contentType }),
  });
  if (!presignRes.ok) throw new Error(`presign failed: ${presignRes.status}`);

  const presign = (await presignRes.json()) as PresignResponse;
  // Already stored. Content addressing makes this a certainty rather than a
  // guess, so there is nothing to upload.
  if (presign.exists) return sha256;

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

  return sha256;
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
  const assetId = await uploadBytes(contentType, blob);

  if (derivative) {
    try {
      return { assetId, r1024Id: await uploadBytes(contentType, derivative) };
    } catch {
      // Non-fatal by design — see the `derivative` param doc above. The asset
      // stands on `assetId` alone, which is exactly what a pre-derivative
      // asset looks like, and the resolver already handles that.
    }
  }

  return { assetId };
}
