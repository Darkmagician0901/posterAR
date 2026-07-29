/**
 * eraBackfill.ts — upgrades saved drafts to the propped era frames.
 *
 * The bundled story now composes its frames from staged props (eraProps.ts),
 * but an author with an existing draft in localStorage does not benefit: their
 * draft shadows the bundled story, so its era frames keep the old flat
 * hand-drawn art and stage nothing. Reset would fix that by discarding all of
 * their work, which is not a trade worth offering.
 *
 * This backfills the props on load instead, touching only `props`/`art` so the
 * author's own edits — narration, titles, mood, frame order, added frames —
 * survive untouched.
 *
 * A frame is only upgraded when all of these hold:
 *   - it stages no props, so nothing authored can be overwritten;
 *   - its key names a known era, so there are props to give it;
 *   - its art is byte-identical to that era's shipped SVG, so a frame whose art
 *     was customised is left exactly as it is;
 *   - it carries no frozen backdrop, which would mean it had been staged.
 *
 * Pure data in, pure data out: no DOM, no storage, fully unit-testable.
 */

import { composeFrame } from './props/compose';
import { eraProps, ERA_PROPS } from './eraProps';
import { eraSvg } from './eraArt';
import type { StoryDoc, StoryFrame } from './storyDoc';
import type { EraKey } from './storyData';

/** Whether a frame key names one of the shipped eras. */
function isEraKey(key: string): key is EraKey {
  return Object.prototype.hasOwnProperty.call(ERA_PROPS, key);
}

/**
 * Decides whether a frame is an untouched, unstaged era frame.
 *
 * @param frame — The frame to test.
 * @returns True when backfilling it cannot destroy authored work.
 */
export function needsEraProps(frame: StoryFrame): boolean {
  if (Array.isArray(frame.props) && frame.props.length > 0) return false;
  if (typeof frame.backdrop === 'string' && frame.backdrop !== '') return false;
  if (!isEraKey(frame.key)) return false;
  return frame.art === eraSvg(frame.key);
}

/**
 * Gives every eligible era frame in a document its staged props.
 *
 * @param doc — A document loaded from storage.
 * @returns The document with eligible frames staged. Returns the original
 *   object when nothing qualifies, so an already-current draft is not churned.
 */
export function backfillEraProps(doc: StoryDoc): StoryDoc {
  if (!doc.frames.some(needsEraProps)) return doc;

  return {
    ...doc,
    frames: doc.frames.map((frame) => {
      if (!needsEraProps(frame)) return frame;
      const props = eraProps(frame.key as EraKey);
      return { ...frame, props, art: composeFrame(props) };
    }),
  };
}
