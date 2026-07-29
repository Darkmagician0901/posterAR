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
}

/** Current schema version. Bump only on a breaking shape change. */
export const STORY_SCHEMA_VERSION = 4;

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
 * a v4 entry's `assetId` must be exactly 64 lowercase hex characters — which
 * cannot express a scheme, a host, or a traversal — and a v3 entry's `href`
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
      out[alias] = name === '' ? { assetId, aspect } : { assetId, aspect, name };
      continue;
    }

    if (/^data:image\//i.test(href)) {
      out[alias] = name === '' ? { href, aspect } : { href, aspect, name };
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
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
  return doc;
}
