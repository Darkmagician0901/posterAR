/**
 * demoMode.ts — what changes when the studio is built as a standalone demo.
 *
 * `npm run build:demo` emits one self-contained HTML file with nothing behind
 * it: no /api/publish, no viewer route, no story host. Two header actions
 * depend on that missing infrastructure, so the demo build disables them and
 * says why. This module holds the flag, the copy, and the small predicates the
 * intro card needs — kept out of the components so they can be tested without
 * a DOM or a build.
 */

import { LOCAL_DRAFT_KEY } from '@/services/storyApi';

/** True only in the standalone demo build. Substituted at build time by Vite. */
export const IS_DEMO: boolean = __DEMO_BUILD__;

/** Why PUBLISH and ON DEVICE are greyed out. Shown as their tooltip and in the intro card. */
export const DEMO_NOTE =
  'Publishing and on-device preview need the live backend — this is a standalone build.';

/** localStorage key recording that the intro card has been dismissed. */
export const INTRO_DISMISSED_KEY = 'arcade.demo.introSeen';

/** Below this width the three-column authoring layout stops being usable. */
export const NARROW_VIEWPORT_PX = 1000;

/**
 * Whether the viewport is too narrow for the studio's desktop layout.
 *
 * @param width — Viewport width in CSS pixels.
 * @returns True when the desktop-only notice should be shown.
 */
export function isNarrowViewport(width: number): boolean {
  return width < NARROW_VIEWPORT_PX;
}

/**
 * Whether the intro card has already been dismissed.
 *
 * @param storage — Where the flag lives; localStorage in the browser.
 * @returns True only on a confirmed dismissal. Unreadable storage (private
 *   mode, blocked cookies) reads as "not yet dismissed" rather than throwing.
 */
export function readIntroDismissed(storage: Storage): boolean {
  try {
    return storage.getItem(INTRO_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Records that the intro card was dismissed.
 *
 * @param storage — Where to write the flag. A storage that refuses the write
 *   costs the reviewer one extra dismissal, which is not worth an exception.
 */
export function dismissIntro(storage: Storage): void {
  try {
    storage.setItem(INTRO_DISMISSED_KEY, '1');
  } catch {
    /* A demo that can't remember a dismissal still works. */
  }
}

/**
 * Discards the working draft so the next load rebuilds the default story.
 *
 * Deliberately leaves the intro dismissal alone: someone resetting the canvas
 * has already read the card and does not need it again.
 *
 * @param storage — Where the draft lives.
 */
export function resetDemo(storage: Storage): void {
  try {
    storage.removeItem(LOCAL_DRAFT_KEY);
  } catch {
    /* Nothing to undo if the draft was never persisted. */
  }
}
