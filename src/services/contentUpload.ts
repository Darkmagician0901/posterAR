/**
 * contentUpload.ts — the one place bytes are put into the bucket.
 *
 * Shared by story assets and marker images so the presign/PUT/412 handling
 * cannot drift between them, and so both obey the same rule: the address
 * written is the hash of the bytes written. The server enforces exactly that
 * and refuses any request where the two disagree — which is the only reason
 * the endpoint is safe to leave unauthenticated.
 */

import { API_BASE_URL } from '@/utils/constants';
import { hexToBase64, sha256Hex } from '@/story/assetHash';

/** Which prefix the bytes are destined for. Mirrors `api/story-assets.ts`. */
export type UploadKind = 'asset' | 'marker';

interface PresignResponse {
  exists: boolean;
  uploadUrl?: string;
  requiredHeaders?: Record<string, string>;
}

/**
 * Presigns and uploads one blob under its own content address.
 *
 * @param bytes — The bytes being uploaded.
 * @param contentType — MIME type of `bytes`. Must match what the server's
 *   allowlist accepts for `kind`, or the presign is refused.
 * @param kind — Selects the prefix: 'asset' ⇒ `assets/<sha>/full.webp`,
 *   'marker' ⇒ `markers/<sha>.png`.
 * @returns The content address the bytes are stored under.
 * @throws When the presign or upload fails for any reason other than the
 *   object already existing.
 */
export async function uploadContent(
  bytes: Blob,
  contentType: string,
  kind: UploadKind,
): Promise<string> {
  const sha256 = await sha256Hex(await bytes.arrayBuffer());
  // Same digest as the key, in the encoding S3's checksum header takes. The
  // server rejects the request unless these two agree.
  const sha256Base64 = hexToBase64(sha256);

  const presignRes = await fetch(`${API_BASE_URL}/api/story-assets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sha256, sha256Base64, contentType, kind }),
  });
  if (!presignRes.ok) throw new Error(`presign failed: ${presignRes.status}`);

  const presign = (await presignRes.json()) as PresignResponse;
  // Already stored. Content addressing makes this a certainty rather than a
  // guess, so there is nothing to upload.
  if (presign.exists) return sha256;

  if (!presign.uploadUrl) throw new Error('presign returned no upload URL');

  const put = await fetch(presign.uploadUrl, {
    // Sent verbatim: these headers are part of the signature, so altering or
    // dropping one produces a mismatch rather than a silent success.
    method: 'PUT',
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
