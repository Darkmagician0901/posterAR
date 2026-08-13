/**
 * assetStorage.ts — where an asset's bytes live.
 *
 * Every asset is content-addressed: the key carries the SHA-256 of the bytes
 * stored under it, and nothing else. That is what makes an address
 * self-enforcing — the presign endpoint checks the caller's checksum against
 * the address it is asking to write, so no one can claim an address for bytes
 * that do not hash to it.
 *
 * There is exactly ONE key-construction function, imported from both `api/`
 * (the presign endpoint that writes a key, the publish endpoint that probes it)
 * and `src/` (the resolver that reads it). A second, hand-written copy of this
 * string is the classic way this design fails: the two drift, the read 404s,
 * and the 404 resolves to a silent transparent pixel that re-uploading cannot
 * fix, because the address is derived from content rather than assigned.
 *
 * A display derivative is deliberately NOT a second slot beside its parent.
 * It is an ordinary asset under its own hash, named by the document's
 * `r1024Id`. The earlier `variant` design wrote `assets/<parentSha>/r1024.webp`
 * — an address whose content nobody could verify — so anyone holding a
 * published story's assetId could presign that (usually empty) slot and upload
 * whatever they liked, permanently. Self-addressing removes the possibility
 * rather than guarding it.
 */

/**
 * Longest-axis cap for the display derivative.
 *
 * Matches RASTER_MAX in svgTexture.ts, which rasterizes the whole composed
 * frame at 1024 on its longest axis — so a single prop inside that frame can
 * never need more.
 */
export const RASTER_LONGEST_AXIS = 1024;

/**
 * Object key for one asset's stored bytes.
 *
 * @param assetId — 64-hex SHA-256 of the bytes stored under this key. A
 *   derivative passes its OWN id here, never its parent's.
 * @returns The S3 key, relative to the bucket root.
 */
export function assetKey(assetId: string): string {
  return `assets/${assetId}/full.webp`;
}
