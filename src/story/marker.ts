/**
 * marker.ts — the printed poster a story is anchored to.
 *
 * A SLAM world origin is invented fresh on every launch, so a position measured
 * from the viewer means nothing across sessions. A position measured from a
 * printed poster is a fact about the room. This is the record of that poster:
 * what it looks like, how wide it really is, and how high it hangs.
 *
 * One marker per story, not per frame — a visitor scans one poster and plays
 * every frame from it. Per-frame markers would demand five printed posters for
 * one story.
 *
 * Pure data and validation: no DOM, no upload, no tracking.
 */

/** The printed poster a story anchors to. */
export interface StoryMarker {
  /**
   * The poster image as a `data:` URL, via utils/imageUpload. Empty until the
   * author uploads one. Must be inline data: composed art is rasterized through
   * an `<img>`, which runs SVG in restricted mode and will not fetch external
   * references.
   */
  image: string;
  /** Printed width in metres. */
  widthM: number;
  /** Printed height / width, derived from the image. */
  aspect: number;
  /** Floor to marker centre, in metres. */
  mountHeight: number;
}

/** Bounds that keep a marker physically plausible. */
export const MARKER_LIMITS = {
  /** A postcard is about the smallest thing worth tracking. */
  widthMin: 0.05,
  /** Wider than a doorway stops being a poster. */
  widthMax: 3,
  /** Skirting-board height. */
  mountMin: 0,
  /** Above this it is out of reach to hang and to scan. */
  mountMax: 3,
} as const;

/** A3 portrait at eye height — the common case for a printed poster. */
export const DEFAULT_MARKER: StoryMarker = {
  image: '',
  widthM: 0.297,
  aspect: 420 / 297,
  mountHeight: 1.5,
};

/** Clamps a value into `[lo, hi]`. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Returns `v` when it is a finite number, else `fb`. */
function num(v: unknown, fb: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fb;
}

/**
 * The marker's printed height.
 *
 * @param marker — The story's marker.
 * @returns Height in metres.
 */
export function markerHeightM(marker: StoryMarker): number {
  return marker.widthM * marker.aspect;
}

/**
 * Validates an untrusted marker against the default.
 *
 * Falls back **per field** rather than all-or-nothing, matching storyDoc's
 * existing validator, so one bad value cannot cost the author their poster.
 *
 * @param raw — Parsed JSON of unknown shape.
 * @returns A well-formed StoryMarker. Never throws.
 */
export function sanitizeMarker(raw: unknown): StoryMarker {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_MARKER };
  const r = raw as Record<string, unknown>;

  const image = typeof r.image === 'string' && /^data:image\//i.test(r.image) ? r.image : '';
  const rawAspect = num(r.aspect, DEFAULT_MARKER.aspect);

  return {
    image,
    widthM: clamp(
      num(r.widthM, DEFAULT_MARKER.widthM),
      MARKER_LIMITS.widthMin,
      MARKER_LIMITS.widthMax,
    ),
    // A non-positive aspect would collapse the poster to nothing, so it falls
    // back rather than clamping to an arbitrary sliver.
    aspect: rawAspect > 0 ? rawAspect : DEFAULT_MARKER.aspect,
    mountHeight: clamp(
      num(r.mountHeight, DEFAULT_MARKER.mountHeight),
      MARKER_LIMITS.mountMin,
      MARKER_LIMITS.mountMax,
    ),
  };
}

/**
 * Applies an edit to a marker, keeping the result valid.
 *
 * Unlike sanitizeMarker, an unusable field falls back to the marker's *own*
 * current value rather than the A3 default: an emptied number input reads as
 * NaN mid-keystroke, and snapping the field to 0.297 while the author is still
 * typing would fight them.
 *
 * @param marker — The marker being edited.
 * @param patch — The fields to change.
 * @returns A new, valid marker.
 */
export function applyMarkerEdit(marker: StoryMarker, patch: Partial<StoryMarker>): StoryMarker {
  const base = sanitizeMarker(marker);
  const merged = { ...marker, ...patch };
  return sanitizeMarker({
    image: typeof merged.image === 'string' ? merged.image : base.image,
    widthM: Number.isFinite(merged.widthM) ? merged.widthM : base.widthM,
    aspect: Number.isFinite(merged.aspect) && merged.aspect > 0 ? merged.aspect : base.aspect,
    mountHeight: Number.isFinite(merged.mountHeight) ? merged.mountHeight : base.mountHeight,
  });
}
