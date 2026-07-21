/**
 * storyStore — Zustand store for the "THE GROUND REMEMBERS" walkthrough.
 *
 * Separate from posterStore (which is generic poster placement) and from
 * contentStore (which owns *what* the story is). This holds only the narrative
 * position: whether the story has been planted on the ground yet, and which
 * frame is currently showing. The AR layer (StoryARExperience) subscribes to
 * `eraIndex` to swap the diorama tile's texture, and the 2D HUD (StoryOverlay)
 * reads `phase` / `currentFrame` to drive the title card, narration, and
 * timeline.
 *
 * The frame list comes from contentStore, so bounds follow the loaded document
 * rather than a fixed era count.
 *
 * Despite the `use*` name it is a store, not a hook — call it anywhere.
 */

import { create } from 'zustand';
import { currentFrames } from './contentStore';
import { StoryFrame } from '@/story/storyDoc';

/** High-level phase of the experience. */
export type StoryPhase =
  /** Engine is still searching for the ground plane (reticle unlocked). */
  | 'scanning'
  /** A surface is locked; the intro title card invites a tap-to-place. */
  | 'ready'
  /** The story tile is planted; the user is walking the eras. */
  | 'placed'
  /** Past the final era; the outro card is shown. */
  | 'outro';

interface StoryState {
  /** Current phase. */
  phase: StoryPhase;
  /** Index into STORY_ERAS (0..4); meaningful once `phase === 'placed'`. */
  eraIndex: number;
  /** True once the diorama has been planted on the ground. */
  placed: boolean;

  /**
   * Sets the phase. The AR layer calls this with 'ready' the first time the
   * reticle locks a surface, so the overlay can switch the scan prompt to
   * "tap to place".
   */
  setPhase: (phase: StoryPhase) => void;
  /** Plants the story: marks it placed and shows era 0 (the wrecking yard). */
  place: () => void;
  /** Advances to the next era, or to the outro past the last one. */
  next: () => void;
  /** Steps back one era (no-op at era 0). */
  prev: () => void;
  /** Jumps directly to an era by index (timeline taps). */
  jumpTo: (index: number) => void;
  /** Returns to the intro so the user can re-place the story. */
  reset: () => void;
  /** The frame object for the current index. */
  currentFrame: () => StoryFrame;
}

export const useStoryStore = create<StoryState>((set, get) => ({
  phase: 'scanning',
  eraIndex: 0,
  placed: false,

  setPhase: (phase) => {
    // Don't downgrade out of an interactive phase just because tracking
    // momentarily drops — only honor 'scanning'→'ready' before placement.
    const { placed } = get();
    if (placed && (phase === 'scanning' || phase === 'ready')) return;
    set({ phase });
  },

  place: () => set({ placed: true, phase: 'placed', eraIndex: 0 }),

  next: () =>
    set((s) => {
      if (s.eraIndex >= currentFrames().length - 1) return { phase: 'outro' };
      return { eraIndex: s.eraIndex + 1, phase: 'placed' };
    }),

  prev: () => set((s) => ({ eraIndex: Math.max(0, s.eraIndex - 1), phase: 'placed' })),

  jumpTo: (index) =>
    set(() => ({
      eraIndex: Math.min(currentFrames().length - 1, Math.max(0, index)),
      phase: 'placed',
    })),

  reset: () => set({ phase: 'scanning', eraIndex: 0, placed: false }),

  currentFrame: () => currentFrames()[get().eraIndex],
}));
