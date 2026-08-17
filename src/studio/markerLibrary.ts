/**
 * markerLibrary.ts — the operator's uploaded markers, on this device.
 *
 * Deliberately NOT part of StoryDoc. A marker's durable metadata — its crop
 * and its thumbnail id — lives in `StoryAnchor` once the marker is bound to a
 * story, so the library is only a staging area for markers not yet bound. A
 * published `markers/index.json` would make it portable and is declined in
 * `docs/marker-layer-design.md` §11, because it reintroduces a mutable
 * document that can disagree with the stories.
 *
 * The bytes are always safe in S3 regardless: re-uploading the same crop of
 * the same photo is deterministic under content addressing, so a lost library
 * costs the operator a re-crop, never a marker.
 *
 * Read is defensive because localStorage is user-writable and every id here
 * becomes a path segment.
 */

import { ASSET_ID_RE } from '@/story/assetHash';
import type { MarkerCrop } from '@/markers/markerCrop';

/** localStorage key. Separate from the draft, which is published. */
export const MARKER_LIBRARY_KEY = 'arcade.studio.markers';

/** One uploaded marker, as the Studio remembers it. */
export interface MarkerLibraryEntry {
  /** SHA-256 of the luminance PNG. */
  markerId: string;
  /** SHA-256 of the thumbnail PNG. */
  thumbId: string;
  /** The operator's own label. Studio-side only — never reaches the engine. */
  name: string;
  /** The crop this marker was cut with; feeds the synthesized target. */
  crop: MarkerCrop;
  /** Epoch millis, for stable ordering. */
  addedAt: number;
}

/** True when `v` is a usable library entry. */
function isEntry(v: unknown): v is MarkerLibraryEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  // Both ids become path segments, so they must be hashes and nothing else.
  if (typeof e.markerId !== 'string' || !ASSET_ID_RE.test(e.markerId)) return false;
  if (typeof e.thumbId !== 'string' || !ASSET_ID_RE.test(e.thumbId)) return false;
  // Without a crop the synthesized target would be malformed, so an entry
  // missing one is unusable rather than merely incomplete.
  if (typeof e.crop !== 'object' || e.crop === null) return false;
  const c = e.crop as Record<string, unknown>;
  return ['top', 'left', 'width', 'height'].every((k) => typeof c[k] === 'number');
}

/**
 * Reads the library.
 *
 * @returns Every well-formed entry. Corrupt storage yields an empty library
 *   rather than throwing, and one bad entry is dropped on its own.
 */
export function readMarkerLibrary(): MarkerLibraryEntry[] {
  try {
    const raw = window.localStorage.getItem(MARKER_LIBRARY_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/**
 * Writes the library.
 *
 * @param entries — The full library.
 * @returns An error message when the write failed (a full quota, private
 *   browsing), or null on success.
 */
export function writeMarkerLibrary(entries: MarkerLibraryEntry[]): string | null {
  try {
    window.localStorage.setItem(MARKER_LIBRARY_KEY, JSON.stringify(entries));
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'could not save the marker library';
  }
}

/**
 * Adds one marker, replacing any entry with the same id.
 *
 * Replacement rather than append, because content addressing makes the same
 * crop of the same photo produce the same markerId every time — which is what
 * makes a lost library recoverable, and what would otherwise fill the library
 * with identical rows.
 *
 * @param entries — The current library.
 * @param entry — The marker to record.
 * @returns A new array; the input is not mutated.
 */
export function addToLibrary(
  entries: MarkerLibraryEntry[],
  entry: MarkerLibraryEntry,
): MarkerLibraryEntry[] {
  return [...entries.filter((e) => e.markerId !== entry.markerId), entry];
}
