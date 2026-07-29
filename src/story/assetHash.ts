/**
 * assetHash.ts — content addressing for uploaded assets.
 *
 * An asset's identity is the SHA-256 of its bytes. That makes deduplication
 * automatic and global (the same image uploaded twice is one object), and it
 * makes every asset immutable, which is what lets them be served with a
 * far-future `immutable` cache directive.
 *
 * `crypto.subtle` requires a secure context. The app already requires HTTPS
 * for the camera and the 8th Wall engine, so this adds no new constraint.
 */

/** A valid asset id: exactly 64 lowercase hex characters. */
export const ASSET_ID_RE = /^[a-f0-9]{64}$/;

/**
 * Hashes bytes with SHA-256.
 *
 * @param bytes — The canonical stored bytes, after any compression. Hashing
 *   the compressed form (not the original file) is deliberate: it is what
 *   actually gets stored, so it is what must dedupe.
 * @returns The digest as 64 lowercase hex characters.
 */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Re-encodes a hex digest as base64.
 *
 * S3's `x-amz-checksum-sha256` header takes the digest base64-encoded, not
 * hex, while the object key uses hex. Both forms come from the same digest.
 *
 * @param hex — A hex digest, as produced by {@link sha256Hex}.
 * @returns The same digest, base64-encoded.
 */
export function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return btoa(String.fromCharCode(...bytes));
}
