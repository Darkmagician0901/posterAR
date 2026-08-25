/**
 * storyDoc.ts — the authored story document.
 *
 * One StoryDoc describes a whole experience: its copy and its ordered frames.
 * Each frame carries `art` (an SVG document string, exactly what the viewer
 * rasterizes) and optionally `props` (the authored source the studio composed
 * that art from). The viewer reads only `art`; `props` exists so a published
 * story stays re-editable.
 *
 * Pure data and pure validation — no DOM, no engine, no store — so it is safe
 * to import anywhere and cheap to unit-test.
 */

import { ASSET_ID_RE } from './assetHash';
import { ASSET_ALIAS_RE } from './artTokens';
import type { MarkerCrop } from '@/markers/markerCrop';

/** One staged element within a frame. Positions are in metres. */
export interface StoryProp {
  /** 'lib' = built-in builder keyed by `k`; 'img' = uploaded asset id `k`. */
  t: 'lib' | 'img';
  /** Builder key or asset id. */
  k: string;
  /** Horizontal offset from the frame centre. */
  x: number;
  /** Depth into the scene. */
  z: number;
  /** Height in metres. */
  h: number;
  /** Horizontally flipped. */
  f: boolean;
  /** Elevation above the ground line. */
  e: number;
}

/** One chapter of a story — the runtime successor to StoryEra. */
export interface StoryFrame {
  /** Stable identifier, unique within the doc. */
  key: string;
  /** Year badge on the title card ("1951" … "TODAY"). */
  year: string;
  /** Short timeline-stop label. */
  label: string;
  /** Title-card headline. */
  title: string;
  /** Docent narration. */
  line: string;
  /** Mood color for the HUD vignette. */
  washColor: string;
  /** Complete SVG document string for the diorama tile. */
  art: string;
  /** Authored composition source. Absent on the bundled default story. */
  props?: StoryProp[];
  /**
   * Frozen art layer drawn behind the staged props, as a full SVG document.
   * Set when a hand-authored frame is first staged so its original scene is
   * preserved and composition never blanks it. Absent until then.
   */
  backdrop?: string;
}

/**
 * A v4 asset reference: an opaque content address, never a URL.
 *
 * The document deliberately cannot name a host. `assetId` is 64 hex characters
 * and the base URL comes from build configuration, so a published document —
 * which is untrusted input — has no way to point a viewer's browser anywhere.
 * v3 achieved the same property by permitting only `data:`; this is the same
 * guarantee carried across the move to remote bytes.
 */
export interface StoryAssetRef {
  /** SHA-256 of the stored bytes, 64 lowercase hex characters. */
  assetId: string;
  /** Natural width / height, used to size placements. */
  aspect: number;
  /** Original filename, shown in the studio. */
  name?: string;
  /**
   * Optional display derivative: the same image re-encoded at the rasterizer's
   * budget, stored as an ORDINARY asset under its own content address.
   *
   * It is a second id rather than a second slot under `assetId` on purpose.
   * A derivative addressed by its parent's hash would be an address whose
   * content nothing could verify — and the presign endpoint is
   * unauthenticated, so an unverifiable address is a public write token. Same
   * 64-hex rule as `assetId`, for the same reason: it becomes a path segment.
   */
  r1024Id?: string;
}

/**
 * A v3 inline asset. Retained so documents published before the move keep
 * rendering unchanged and forever; nothing new is written in this shape.
 */
export interface StoryAssetLegacy {
  /** Must be a `data:` URL — see the restricted-mode note in artTokens.ts. */
  href: string;
  aspect: number;
  name?: string;
}

export type StoryAsset = StoryAssetRef | StoryAssetLegacy;

/**
 * Narrows an asset to the v4 reference form.
 *
 * @param a — Either asset shape.
 * @returns True when `a` carries an `assetId` and must be resolved remotely.
 */
export function isAssetRef(a: StoryAsset): a is StoryAssetRef {
  return typeof (a as StoryAssetRef).assetId === 'string';
}

/** A rigid transform in the marker's own space. */
export interface LocalTransform {
  /**
   * Where the scene's centre sits relative to the marker, in MARKER-WIDTHS —
   * not metres. `[ox, oy, 0]` points from the marker to the scene's centre in
   * the marker's own frame, `+x` right and `+y` up as seen by someone facing
   * the print. `z` is always 0: the scene is coplanar with the print.
   */
  position: [number, number, number];
  /** Rotation as a quaternion, `[x, y, z, w]`. Identity — see `sanitizeAnchor`. */
  rotation: [number, number, number, number];
}

/**
 * The only transform v1 renders.
 *
 * Offset placement is deliberately unbuilt (`docs/marker-layer-design.md`
 * §11): it needs a Studio positioning UI and the marker-normal-axis
 * verification this design currently avoids needing, because pinning the art
 * flush onto the picture makes the question moot.
 */
export const IDENTITY_LOCAL: LocalTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
};

/**
 * What real-world thing a story is attached to.
 *
 * Absent means today's behaviour: a centre-screen ground hit-test and
 * tap-to-place. The five-era landscape story has no anchor and is untouched.
 *
 * The marker LOCATES the scene; it does not size it. A small print can carry
 * artwork many times its own width — see `docs/marker-locator-design.md`.
 */
export interface StoryAnchor {
  type: 'marker';
  /** SHA-256 of the luminance PNG — the image the tracker matches. */
  markerId: string;
  /** SHA-256 of the thumbnail PNG, addressed on its own bytes. */
  thumbId: string;
  /** The crop the marker was cut with; feeds the synthesized target. */
  crop: MarkerCrop;
  /** Marker → scene-centre offset, in marker-widths. */
  local: LocalTransform;
  /** How many marker-widths wide the whole scene is. Bounded to (0, 100]. */
  widthInMarkers: number;
  /**
   * Always `'latch'` in practice: the pose is taken once, on the tap that
   * starts the story, and SLAM holds the scene afterwards. `'follow'` stays in
   * the type because the type is the documented vocabulary, but nothing
   * produces it and nothing renders it.
   */
  mode: 'latch' | 'follow';
}

/** A complete authored experience. */
export interface StoryDoc {
  schemaVersion: 4;
  /** Published identity; also the `?s=` value. */
  id: string;
  title: string;
  /** Location line ("You're standing on 10th & Center."). */
  loc: string;
  intro: { title: string; subtitle: string };
  outro: { title: string; subtitle: string };
  frames: StoryFrame[];
  /** Uploaded images keyed by the id that `t: 'img'` props reference. */
  assets?: Record<string, StoryAsset>;
  /** The printed picture this story lives on. Absent ⇒ tap-to-place. */
  anchor?: StoryAnchor;
}

/** Current schema version. Bump only on a breaking shape change. */
export const STORY_SCHEMA_VERSION = 4;

/**
 * Anchor bounds, kept in the file that ENFORCES them so a Studio control and
 * the validator cannot drift apart. Studio imports these to size its own
 * limits, so anything the UI can author is something `sanitizeAnchor` accepts
 * back.
 */

/** Scene exactly covers the marker. The safe fallback, and the legacy value. */
export const DEFAULT_WIDTH_IN_MARKERS = 1;
/** A 100 mm print locating a 10 m scene. Beyond this is a mistake, not intent. */
export const MAX_WIDTH_IN_MARKERS = 100;
/** Same reasoning, applied to how far off-centre the print may hang. */
export const MAX_OFFSET_IN_MARKERS = 100;

/** Returns `v` when it is a non-blank string, else `fb`. */
function str(v: unknown, fb: string): string {
  return typeof v === 'string' && v.trim() !== '' ? v : fb;
}

/** Returns `v` when it is a finite number, else `fb`. */
function num(v: unknown, fb: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fb;
}

/** Narrows unknown to a plain object bag, or an empty bag. */
function bag(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

/** Sanitizes one prop. Returns null when it has no usable key. */
function sanitizeProp(raw: unknown): StoryProp | null {
  const r = bag(raw);
  const k = str(r.k, '');
  if (k === '') return null;
  return {
    t: r.t === 'img' ? 'img' : 'lib',
    k,
    x: num(r.x, 0),
    z: num(r.z, 0),
    h: num(r.h, 1),
    f: r.f === true,
    e: num(r.e, 0),
  };
}

/**
 * Sanitizes one frame. Returns null when the frame carries no usable art —
 * an artless frame would render as a blank tile, which is worse than being
 * dropped.
 */
function sanitizeFrame(raw: unknown): StoryFrame | null {
  const r = bag(raw);
  const art = str(r.art, '');
  if (!art.includes('<svg')) return null;

  const frame: StoryFrame = {
    key: str(r.key, 'frame'),
    year: str(r.year, ''),
    label: str(r.label, ''),
    title: str(r.title, ''),
    line: str(r.line, ''),
    washColor: str(r.washColor, 'rgba(0,0,0,0)'),
    art,
  };

  if (Array.isArray(r.props)) {
    frame.props = r.props.map(sanitizeProp).filter((p): p is StoryProp => p !== null);
  }
  // Only keep a backdrop that is itself an SVG document; anything else would
  // compose into a broken layer.
  const backdrop = str(r.backdrop, '');
  if (backdrop.includes('<svg')) frame.backdrop = backdrop;
  return frame;
}

/**
 * Sanitizes the asset map, accepting both schema versions.
 *
 * A published document is untrusted input, so each entry must prove its shape:
 * a v4 entry's `assetId` — and its optional `r1024Id`, by the same rule, since
 * both become path segments — must be exactly 64 lowercase hex characters,
 * which cannot express a scheme, a host, or a traversal; a v3 entry's `href`
 * must still be a `data:` URL. The alias (the map key) is checked too, because
 * it is interpolated into an SVG attribute as `asset:<alias>`.
 *
 * Entries are dropped individually rather than failing the map, matching the
 * per-field fallback the rest of this validator uses.
 */
function sanitizeAssets(raw: unknown): Record<string, StoryAsset> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const out: Record<string, StoryAsset> = {};

  for (const [alias, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ASSET_ALIAS_RE.test(alias)) continue;

    const v = bag(value);
    const aspect = num(v.aspect, 0);
    if (aspect <= 0) continue;

    const name = str(v.name, '');
    const assetId = str(v.assetId, '');
    const href = str(v.href, '');

    if (assetId !== '') {
      if (!ASSET_ID_RE.test(assetId)) continue;
      const ref: StoryAssetRef = { assetId, aspect };
      if (name !== '') ref.name = name;
      // A bad derivative id is dropped on its own rather than taking the entry
      // with it: the asset still resolves from `assetId`, so losing the
      // derivative costs a few kilobytes, while dropping the entry would cost
      // the image entirely.
      const r1024Id = str(v.r1024Id, '');
      if (ASSET_ID_RE.test(r1024Id)) ref.r1024Id = r1024Id;
      out[alias] = ref;
      continue;
    }

    if (/^data:image\//i.test(href)) {
      out[alias] = name === '' ? { href, aspect } : { href, aspect, name };
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Sanitizes an anchor. Returns undefined when it is unusable.
 *
 * All-or-nothing, unlike the per-field fallback elsewhere, because a partial
 * anchor is worse than none: a story with a malformed marker binding would
 * configure a target that never matches, leaving a picture that silently does
 * nothing. Falling back to "no anchor" degrades to tap-to-place, which at
 * least puts something on screen.
 *
 * Both ids are checked against ASSET_ID_RE because both become path segments,
 * and a published document is untrusted input — 64 hex characters cannot
 * express a scheme, a host, or a traversal.
 */
function sanitizeAnchor(raw: unknown): StoryAnchor | undefined {
  const r = bag(raw);
  if (r.type !== 'marker') return undefined;

  const markerId = str(r.markerId, '');
  const thumbId = str(r.thumbId, '');
  if (!ASSET_ID_RE.test(markerId) || !ASSET_ID_RE.test(thumbId)) return undefined;

  const c = bag(r.crop);
  const nums = ['top', 'left', 'width', 'height'] as const;
  if (!nums.every((k) => typeof c[k] === 'number' && Number.isFinite(c[k]))) return undefined;

  const crop: MarkerCrop = {
    top: c.top as number,
    left: c.left as number,
    width: c.width as number,
    height: c.height as number,
    isRotated: c.isRotated === true,
    originalWidth: num(c.originalWidth, c.width as number),
    originalHeight: num(c.originalHeight, c.height as number),
  };

  // Bounded, not forced. These now arrive both from Studio and from published
  // JSON, which is untrusted input — but a bad value here should degrade to
  // the legacy 1:1 behaviour rather than drop a binding that is otherwise
  // sound, because a dropped anchor means a picture that does nothing at all.
  const k = num(r.widthInMarkers, DEFAULT_WIDTH_IN_MARKERS);
  const widthInMarkers = k > 0 && k <= MAX_WIDTH_IN_MARKERS ? k : DEFAULT_WIDTH_IN_MARKERS;

  const localBag = bag(r.local);
  const rawPosition: unknown[] = Array.isArray(localBag.position)
    ? (localBag.position as unknown[])
    : [];
  const offset = (v: unknown): number => {
    const n = num(v, 0);
    return Math.max(-MAX_OFFSET_IN_MARKERS, Math.min(MAX_OFFSET_IN_MARKERS, n));
  };

  return {
    type: 'marker',
    markerId,
    thumbId,
    crop,
    local: {
      // z forced to 0 and rotation to identity: this design is coplanar by
      // construction, so a non-zero z or a real rotation from anywhere means
      // something upstream is wrong, and rendering it would put art where no
      // Studio control can put it back.
      position: [offset(rawPosition[0]), offset(rawPosition[1]), 0],
      rotation: [0, 0, 0, 1],
    },
    widthInMarkers,
    // Forced. Every story published before this change carries 'follow', and
    // there is no longer a follow code path (marker-locator-design §5.2), so
    // honouring a stored 'follow' would mean rendering nothing.
    mode: 'latch',
  };
}

/**
 * Validates an untrusted document against a known-good fallback.
 *
 * Falls back **per field** rather than all-or-nothing, so one bad value cannot
 * blank the whole experience. Frames are all-or-nothing as a group: if no frame
 * survives sanitizing there is nothing to walk, so the fallback's frames are
 * used instead.
 *
 * @param raw — Parsed JSON of unknown shape.
 * @param fallback — Known-good document (the bundled default story).
 * @returns A well-formed StoryDoc. Never throws.
 */
export function validateStoryDoc(raw: unknown, fallback: StoryDoc): StoryDoc {
  if (typeof raw !== 'object' || raw === null) return fallback;
  const r = raw as Record<string, unknown>;

  const frames = Array.isArray(r.frames)
    ? r.frames.map(sanitizeFrame).filter((f): f is StoryFrame => f !== null)
    : [];

  const intro = bag(r.intro);
  const outro = bag(r.outro);
  const assets = sanitizeAssets(r.assets);
  const anchor = sanitizeAnchor(r.anchor);

  const doc: StoryDoc = {
    schemaVersion: STORY_SCHEMA_VERSION,
    id: str(r.id, fallback.id),
    title: str(r.title, fallback.title),
    loc: str(r.loc, fallback.loc),
    intro: {
      title: str(intro.title, fallback.intro.title),
      subtitle: str(intro.subtitle, fallback.intro.subtitle),
    },
    outro: {
      title: str(outro.title, fallback.outro.title),
      subtitle: str(outro.subtitle, fallback.outro.subtitle),
    },
    frames: frames.length > 0 ? frames : fallback.frames,
  };
  if (assets !== undefined) doc.assets = assets;
  if (anchor !== undefined) doc.anchor = anchor;
  return doc;
}
