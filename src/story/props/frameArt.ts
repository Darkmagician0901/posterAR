/**
 * frameArt.ts — composing a frame's saved `art` from its props.
 *
 * Saving in the stage editor and migrating a stored draft both have to turn a
 * frame's props back into the flat SVG the viewer reads, at the frame's own
 * native size. Keeping that in one place is what stops a migration from
 * composing a frame differently than a save would — a drift the author would
 * see as their scene shifting on reload.
 *
 * Pure string logic: no DOM, no store.
 */

import type { StoryAsset, StoryFrame } from '../storyDoc';
import { composeFrame, COMPOSE_DEFAULTS } from './compose';
import { deriveBackdrop, parseSvgDoc } from './backdrop';

/**
 * Composes a frame's art from its staged props.
 *
 * Composes at the backdrop's native size so its inner markup drops in unscaled
 * — the saved art stays byte-faithful to the original scene — with the props'
 * ground line and scale following the same proportion.
 *
 * @param frame — The frame to compose. Its `props` are the source of truth.
 * @param images — Uploaded assets keyed by any `t:'img'` prop's `k`.
 * @param backdropDoc — The frozen backdrop document. Defaults to the frame's
 *   own derived backdrop, which is what a fresh migration wants.
 * @returns A complete SVG document string.
 */
export function composeFrameArt(
  frame: StoryFrame,
  images: Record<string, StoryAsset> = {},
  backdropDoc: string = deriveBackdrop(frame),
): string {
  const backdrop = parseSvgDoc(backdropDoc);
  const groundScale = backdrop.height / COMPOSE_DEFAULTS.height;
  return composeFrame(frame.props ?? [], {
    width: backdrop.width,
    height: backdrop.height,
    groundY: COMPOSE_DEFAULTS.groundY * groundScale,
    ppm: COMPOSE_DEFAULTS.ppm * groundScale,
    images,
    backdrop: backdrop.inner,
  });
}
