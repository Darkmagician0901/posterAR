/**
 * contentDoc.ts — the editable-content contract ("ContentDoc").
 *
 * Everything a site admin can change lives in one JSON-serializable document:
 * story text (intro/eras/outro), HUD copy, and scene settings. The bundled
 * story constants in storyData.ts remain the permanent defaults/fallback —
 * a fetched or locally drafted doc is sanitized field-by-field over them, so
 * a malformed draft can never break the experience.
 *
 * Phase 1 (no backend): drafts live in localStorage (see adminDraftStore) and
 * the visitor app only reads them in explicit preview mode (see contentStore).
 */

import { STORY_ERAS, STORY_INTRO, STORY_OUTRO, EraKey, StoryEra } from '@/story/storyData';

export const CONTENT_SCHEMA_VERSION = 1 as const;

/** Editable fields for one era; `key` binds it to the bundled art slot. */
export interface ContentEra {
  key: EraKey;
  year: string;
  title: string;
  label: string;
  line: string;
  washColor: string;
  particle: StoryEra['particle'];
}

/** The whole editable-content document. */
export interface ContentDoc {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  intro: { kicker: string; title: string; subtitle: string };
  outro: { title: string; subtitle: string; replayLabel: string; resetLabel: string };
  eras: ContentEra[];
  ui: {
    scanPrompt: string;
    tapPrompt: string;
    backLabel: string;
    nextLabel: string;
    finishLabel: string;
  };
  settings: { tileWidthM: number };
}

/** Diorama-tile width bounds (metres) enforced on any incoming doc. */
export const TILE_WIDTH_MIN_M = 0.4;
export const TILE_WIDTH_MAX_M = 2.0;

const VALID_PARTICLES: ReadonlyArray<StoryEra['particle']> = [
  'rust',
  'oil',
  'ash',
  'pollen',
  'firefly',
];

/**
 * Bundled defaults, derived from the storyData constants (single source of
 * truth for the shipped copy) plus the HUD strings that used to be JSX
 * literals in StoryOverlay.
 */
export const DEFAULT_CONTENT: ContentDoc = {
  schemaVersion: CONTENT_SCHEMA_VERSION,
  intro: {
    kicker: 'DEMO EXPERIENCE',
    title: STORY_INTRO.title,
    subtitle: STORY_INTRO.subtitle,
  },
  outro: {
    title: STORY_OUTRO.title,
    subtitle: STORY_OUTRO.subtitle,
    replayLabel: 'WALK IT AGAIN',
    resetLabel: 'PLACE SOMEWHERE ELSE',
  },
  eras: STORY_ERAS.map((e) => ({
    key: e.key,
    year: e.year,
    title: e.title,
    label: e.label,
    line: e.line,
    washColor: e.washColor,
    particle: e.particle,
  })),
  ui: {
    scanPrompt: 'MOVE PHONE TO FIND THE GROUND',
    tapPrompt: 'TAP THE GROUND TO PLACE',
    backLabel: '‹ BACK',
    nextLabel: 'NEXT ›',
    finishLabel: 'FINISH',
  },
  settings: { tileWidthM: 0.9 },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Non-empty (post-trim) string, else the fallback. */
function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim().length > 0 ? v : fallback;
}

function tileWidth(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(TILE_WIDTH_MAX_M, Math.max(TILE_WIDTH_MIN_M, v));
}

/**
 * Sanitizes untrusted input (localStorage draft now; API response later) into
 * a structurally valid ContentDoc. Field-by-field: every invalid or missing
 * field falls back to DEFAULT_CONTENT individually. Eras are matched to the
 * five fixed slots by `key`; unknown keys are dropped, missing ones filled
 * from defaults, so the era count and order are always canonical.
 */
export function sanitizeContentDoc(input: unknown): ContentDoc {
  const root = isRecord(input) ? input : {};
  const intro = isRecord(root.intro) ? root.intro : {};
  const outro = isRecord(root.outro) ? root.outro : {};
  const ui = isRecord(root.ui) ? root.ui : {};
  const settings = isRecord(root.settings) ? root.settings : {};
  const eras = Array.isArray(root.eras) ? root.eras : [];

  return {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    intro: {
      kicker: str(intro.kicker, DEFAULT_CONTENT.intro.kicker),
      title: str(intro.title, DEFAULT_CONTENT.intro.title),
      subtitle: str(intro.subtitle, DEFAULT_CONTENT.intro.subtitle),
    },
    outro: {
      title: str(outro.title, DEFAULT_CONTENT.outro.title),
      subtitle: str(outro.subtitle, DEFAULT_CONTENT.outro.subtitle),
      replayLabel: str(outro.replayLabel, DEFAULT_CONTENT.outro.replayLabel),
      resetLabel: str(outro.resetLabel, DEFAULT_CONTENT.outro.resetLabel),
    },
    eras: DEFAULT_CONTENT.eras.map((def) => {
      const found = eras.find((e) => isRecord(e) && e.key === def.key);
      const e = isRecord(found) ? found : {};
      const particle = VALID_PARTICLES.includes(e.particle as StoryEra['particle'])
        ? (e.particle as StoryEra['particle'])
        : def.particle;
      return {
        key: def.key,
        year: str(e.year, def.year),
        title: str(e.title, def.title),
        label: str(e.label, def.label),
        line: str(e.line, def.line),
        washColor: str(e.washColor, def.washColor),
        particle,
      };
    }),
    ui: {
      scanPrompt: str(ui.scanPrompt, DEFAULT_CONTENT.ui.scanPrompt),
      tapPrompt: str(ui.tapPrompt, DEFAULT_CONTENT.ui.tapPrompt),
      backLabel: str(ui.backLabel, DEFAULT_CONTENT.ui.backLabel),
      nextLabel: str(ui.nextLabel, DEFAULT_CONTENT.ui.nextLabel),
      finishLabel: str(ui.finishLabel, DEFAULT_CONTENT.ui.finishLabel),
    },
    settings: {
      tileWidthM: tileWidth(settings.tileWidthM, DEFAULT_CONTENT.settings.tileWidthM),
    },
  };
}
