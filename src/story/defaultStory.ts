/**
 * defaultStory.ts — the shipped story as a StoryDoc.
 *
 * Derived mechanically from the existing storyData constants and the committed
 * era SVGs. This is the bundled fallback: whatever happens to a fetch, a
 * publish, or a store, the viewer can always render this and get exactly the
 * experience that shipped.
 *
 * The `art` strings are the committed files verbatim via eraSvg(). They are
 * deliberately NOT regenerated from prop builders — the shipped scenes are
 * largely hand-authored and regeneration would not reproduce them. See
 * docs/arcade-studio-plan.md.
 */

import { STORY_ERAS, STORY_INTRO, STORY_OUTRO } from './storyData';
import { eraSvg } from './eraArt';
import { StoryDoc, STORY_SCHEMA_VERSION } from './storyDoc';

/** The shipped "THE GROUND REMEMBERS" experience, as data. */
export const DEFAULT_STORY: StoryDoc = {
  schemaVersion: STORY_SCHEMA_VERSION,
  id: 'the-ground-remembers',
  title: STORY_OUTRO.title,
  loc: '',
  intro: { title: STORY_INTRO.title, subtitle: STORY_INTRO.subtitle },
  outro: { title: STORY_OUTRO.title, subtitle: STORY_OUTRO.subtitle },
  frames: STORY_ERAS.map((era) => ({
    key: era.key,
    year: era.year,
    label: era.label,
    title: era.title,
    line: era.line,
    washColor: era.washColor,
    art: eraSvg(era.key),
  })),
};
