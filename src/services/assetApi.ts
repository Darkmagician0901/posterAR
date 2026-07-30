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
 */

import { API_BASE_URL } from '@/utils/constants';
import { hexToBase64, sha256Hex } from '@/story/assetHash';

/** Upload types the server accepts. Mirrors the server-side allowlist. */
export type AssetContentType = 'image/webp' | 'image/gif' | 'image/png' | 'image/jpeg';

interface PresignResponse {
  exists: boolean;
  uploadUrl?: string;
  requiredHeaders?: Record<string, string>;
}

/**
 * Stores an asset and returns its content address.
 *
 * @param blob — The canonical bytes to store, after compression.
 * @param contentType — MIME type of those bytes.
 * @returns The assetId (SHA-256 hex) to record in the document.
 * @throws When the presign or upload fails for any reason other than the
 *   object already existing.
 */
export async function uploadStoryAsset(
  blob: Blob,
  contentType: AssetContentType,
): Promise<string> {
  const sha256 = await sha256Hex(await blob.arrayBuffer());

  const presignRes = await fetch(`${API_BASE_URL}/api/story-assets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sha256, sha256Base64: hexToBase64(sha256), contentType }),
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
    body: blob,
  });

  // 412 Precondition Failed means If-None-Match rejected the write because the
  // object already exists — a race with another uploader of identical bytes.
  // The bytes we wanted are stored, so this is success.
  if (!put.ok && put.status !== 412) {
    throw new Error(`upload failed: ${put.status}`);
  }

  return sha256;
}
