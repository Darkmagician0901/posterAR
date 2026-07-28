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
  /** Author-attached audio for this frame, as a data:audio/* URL. Plays alongside
   *  the narration in preview/play. Absent = silent. */
  audio?: string;
  /** Original filename of the attached audio, shown in the studio. */
  audioName?: string;
}

/** An author-uploaded image available to any frame. */
export interface StoryAsset {
  /**
   * Image source. Must be a `data:` URL: composed art is rasterized through an
   * `<img>`, which runs SVG in restricted mode and will not fetch external
   * references — an http(s) source renders blank rather than erroring.
   */
  href: string;
  /** Natural width / height, used to size placements. */
  aspect: number;
  /** Original filename, shown in the studio. */
  name?: string;
}

/** A complete authored experience. */
export interface StoryDoc {
  schemaVersion: 3;
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
export const STORY_SCHEMA_VERSION = 3;

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

  // Author audio, kept only as inline data (never an external URL), matching the
  // images-are-data:-only rule that keeps a published doc from reaching off-origin.
  const audio = str(r.audio, '');
  if (/^data:audio\//i.test(audio)) {
    frame.audio = audio;
    const audioName = str(r.audioName, '');
    if (audioName) frame.audioName = audioName;
  }
  return frame;
}

/**
 * Sanitizes the asset map.
 *
 * Only `data:image/...` sources are kept. A published document is untrusted
 * input, and an `<image href>` is a place a hostile author could try to point
 * at something else; restricting to inline image data means a composed frame
 * can never reach off-origin, and matches the only form that actually renders
 * once rasterized.
 */
function sanitizeAssets(raw: unknown): Record<string, StoryAsset> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const out: Record<string, StoryAsset> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const v = bag(value);
    const href = str(v.href, '');
    if (!/^data:image\//i.test(href)) continue;
    const aspect = num(v.aspect, 1);
    if (aspect <= 0) continue;
    const name = str(v.name, '');
    out[key] = name === '' ? { href, aspect } : { href, aspect, name };
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
