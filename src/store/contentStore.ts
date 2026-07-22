/**
 * contentStore — holds the StoryDoc the viewer is currently rendering.
 *
 * Separate from storyStore (walkthrough position) and posterStore (generic
 * poster placement). This one owns *what* the story is; storyStore owns *where
 * in it* the visitor stands.
 *
 * Phase 1 holds the bundled default and nothing fetches. `load()` exists so the
 * publish path and the studio's local preview can swap the doc in without any
 * consumer changing.
 *
 * Despite the `use*` name it is a store, not a hook — call it anywhere.
 */

import { create } from 'zustand';
import { DEFAULT_STORY } from '@/story/defaultStory';
import { StoryDoc, StoryFrame, validateStoryDoc } from '@/story/storyDoc';

interface ContentState {
  /** The story currently being rendered. Never null. */
  doc: StoryDoc;
  /** Validates an untrusted document and adopts it. Never throws. */
  load: (raw: unknown) => void;
  /** Restores the bundled default story. */
  reset: () => void;
}

export const useContentStore = create<ContentState>((set) => ({
  doc: DEFAULT_STORY,
  load: (raw) => set({ doc: validateStoryDoc(raw, DEFAULT_STORY) }),
  reset: () => set({ doc: DEFAULT_STORY }),
}));

/**
 * Reads the current frame list outside React.
 *
 * @returns The active document's frames.
 */
export function currentFrames(): StoryFrame[] {
  return useContentStore.getState().doc.frames;
}
