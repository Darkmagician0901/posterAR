/**
 * markerBackfill.ts — converts a pre-marker draft to wall-relative depth.
 *
 * Depth used to be measured from the viewer's feet across a 6.2 m map. It is
 * now measured out from the wall the marker hangs on, across 4.6 m. Reading a
 * stored z under the new meaning would flip every existing scene front-to-back,
 * so drafts are rescaled on load instead.
 *
 * The presence of `doc.marker` is the migration flag: a document that has one
 * was authored (or migrated) after the change, so it is returned untouched.
 * That follows eraBackfill.ts's guarded-upgrade pattern — run on load, never
 * twice, never over authored work.
 *
 * Pure data in, pure data out: no DOM, no storage, fully unit-testable.
 */

import { DEFAULT_MARKER } from './marker';
import { fromLegacyZ, LEGACY_Z_MAX } from './projection';
import { composeFrameArt } from './props/frameArt';
import type { StoryDoc, StoryFrame } from './storyDoc';

export { LEGACY_Z_MAX };

/** Rescales a frame's props and recomposes the art they produce. */
function convertFrame(frame: StoryFrame, doc: StoryDoc): StoryFrame {
  if (!Array.isArray(frame.props) || frame.props.length === 0) return frame;
  const props = frame.props.map((p) => ({ ...p, z: fromLegacyZ(p.z) }));
  const next = { ...frame, props };
  // Recompose, or the rail thumbnail and the viewer would keep rendering the
  // scene at its old depths while the stage editor showed the new ones.
  return { ...next, art: composeFrameArt(next, doc.assets ?? {}, frame.backdrop ?? '') };
}

/**
 * Converts a draft to wall-relative depth, once.
 *
 * @param doc — A document loaded from storage.
 * @returns The converted document, given a default marker. Returns the original
 *   object when it has already been converted, so nothing is churned.
 */
export function migrateDraftDepth(doc: StoryDoc): StoryDoc {
  if (doc.marker !== undefined) return doc;
  return {
    ...doc,
    marker: { ...DEFAULT_MARKER },
    frames: doc.frames.map((f) => convertFrame(f, doc)),
  };
}
