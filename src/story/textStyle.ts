/**
 * textStyle — the fonts and colors an author can pick for a frame's text.
 *
 * Pure data + resolvers, no DOM, so the viewer, the studio preview, the
 * inspector, and the StoryDoc sanitizer all share one source of truth. A frame
 * stores a font *id* and a color *value*; both are optional and fall back to the
 * shipped default (the pixel font, each element's own CSS color).
 *
 * `scale` multiplies each text element's base font-size (which is tuned for the
 * pixel font). Non-pixel faces have smaller glyphs per em, so they need a larger
 * size to read at the same visual weight.
 */

export interface FontOption {
  /** Stable id stored on the frame. */
  id: string;
  /** Author-facing name in the picker. */
  label: string;
  /** CSS font-family stack. The family must be loaded in main.tsx. */
  family: string;
  /** Font-size multiplier vs the pixel font's tuned sizes. */
  scale: number;
}

/** The default font id — the shipped pixel look. */
export const DEFAULT_FONT_ID = 'pixel';

export const FONT_OPTIONS: FontOption[] = [
  { id: 'pixel', label: 'Pixel', family: "'Press Start 2P', monospace", scale: 1 },
  { id: 'terminal', label: 'Terminal', family: "'VT323', monospace", scale: 1.55 },
  { id: 'clean', label: 'Clean', family: "'Poppins', sans-serif", scale: 1.7 },
  { id: 'bold', label: 'Bold', family: "'Anton', sans-serif", scale: 1.95 },
  { id: 'marker', label: 'Marker', family: "'Permanent Marker', cursive", scale: 1.7 },
  { id: 'elegant', label: 'Elegant', family: "'Playfair Display', serif", scale: 1.85 },
  { id: 'rounded', label: 'Rounded', family: "'Fredoka', sans-serif", scale: 1.7 },
];

const FONT_BY_ID = new Map(FONT_OPTIONS.map((f) => [f.id, f]));

/** True when `v` is a known font id. */
export function isFontId(v: unknown): boolean {
  return typeof v === 'string' && FONT_BY_ID.has(v);
}

/** Resolves a stored font id (or undefined) to its family + scale, defaulting
 *  to the pixel font when the id is missing or unknown. */
export function resolveFont(id: string | undefined): { family: string; scale: number } {
  const f = (id !== undefined && FONT_BY_ID.get(id)) || FONT_BY_ID.get(DEFAULT_FONT_ID)!;
  return { family: f.family, scale: f.scale };
}

export interface ColorOption {
  label: string;
  value: string;
}

export const COLOR_OPTIONS: ColorOption[] = [
  { label: 'White', value: '#ffffff' },
  { label: 'Cream', value: '#f4efe2' },
  { label: 'Gold', value: '#f5c518' },
  { label: 'Orange', value: '#f08a1e' },
  { label: 'Coral', value: '#ff5a4d' },
  { label: 'Lime', value: '#86c24e' },
  { label: 'Sky', value: '#6ec4e8' },
  { label: 'Violet', value: '#c98cff' },
  { label: 'Ink', value: '#1a1712' },
];

const COLOR_VALUES = new Set(COLOR_OPTIONS.map((c) => c.value));

/** True when `v` is one of the offered text colors. */
export function isTextColor(v: unknown): boolean {
  return typeof v === 'string' && COLOR_VALUES.has(v);
}
