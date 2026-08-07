/**
 * defaultStory.ts — the shipped story as a StoryDoc.
 *
 * Derived mechanically from the existing storyData constants and the committed
 * era SVGs. This is the bundled fallback: whatever happens to a fetch, a
 * publish, or a store, the viewer can always render this and get exactly the
 * experience that shipped.
 *
 * Each frame is composed from staged props (eraProps.ts) rather than carrying a
 * hand-drawn era/*.svg verbatim. The painted scenes were richer, but they were a
 * single flat layer: nothing in them could be selected, so opening one in the
 * stage editor offered nothing to move. Composing from props means every object
 * in a frame gets a dot in the top-down map and a real depth.
 *
 * `art` is composed at module load so it cannot drift from `props`. composeFrame
 * is pure string logic, so this stays DOM-free and cheap to import. The composed
 * art carries no background rect, so frames stay transparent and still read as a
 * diorama growing out of the real ground in AR.
 *
 * The hand-drawn scenes remain on disk in era/*.svg via eraArt.ts, unreferenced
 * here, so the painted look can be restored.
 */

import { STORY_ERAS, STORY_INTRO, STORY_OUTRO } from './storyData';
import { eraProps } from './eraProps';
import { composeFrame } from './props/compose';
import { StoryDoc, STORY_SCHEMA_VERSION } from './storyDoc';
import { DEFAULT_MARKER } from './marker';

/** The shipped "THE GROUND REMEMBERS" experience, as data. */
export const DEFAULT_STORY: StoryDoc = {
  schemaVersion: STORY_SCHEMA_VERSION,
  id: 'the-ground-remembers',
  title: STORY_OUTRO.title,
  loc: '',
  intro: { title: STORY_INTRO.title, subtitle: STORY_INTRO.subtitle },
  outro: { title: STORY_OUTRO.title, subtitle: STORY_OUTRO.subtitle },
  // Carried explicitly so the bundled story reads as already wall-relative:
  // its props come from eraProps, which converts, so the draft migration must
  // not convert them a second time.
  marker: { ...DEFAULT_MARKER },
  frames: STORY_ERAS.map((era) => {
    const props = eraProps(era.key);
    return {
      key: era.key,
      year: era.year,
      label: era.label,
      title: era.title,
      line: era.line,
      washColor: era.washColor,
      props,
      art: composeFrame(props),
    };
  }),
};
