/**
 * markerStorage.ts — where a marker's bytes live.
 *
 * One key-construction function, imported by both `api/` (the presign endpoint
 * that writes, the exhibit publish endpoint that probes) and `src/` (the
 * viewer, which derives the same path). A second hand-written copy of this
 * string is how content addressing fails: the two drift, the read 404s, and
 * because the address comes from content rather than assignment, re-uploading
 * cannot fix it.
 *
 * A separate prefix from `assets/` on purpose. `api/publish.ts` derives
 * reachability from `doc.assets` alone, and marker ids live in `doc.anchor`, so
 * a marker stored under `assets/` would read as unreachable and be collected.
 *
 * Both of a marker's files — luminance and thumbnail — go through here, each
 * under the hash of ITS OWN bytes. Grouping them under the luminance's hash
 * would put the thumbnail at an address nobody can verify, which on an
 * unauthenticated `If-None-Match: *` endpoint is a permanent squattable slot.
 * See `docs/marker-layer-design.md` §3.4.
 */

/**
 * Object key for one marker image's stored bytes.
 *
 * @param markerId — 64-hex SHA-256 of the PNG stored under this key. A
 *   thumbnail passes its OWN id here, never its luminance image's.
 * @returns The S3 key, relative to the bucket root.
 */
export function markerKey(markerId: string): string {
  return `markers/${markerId}.png`;
}
