/**
 * studioDraftStore — the story being authored in ARCADE STUDIO.
 *
 * Holds a working StoryDoc, the selected frame, an undo history, and mirrors
 * every change to localStorage under the key the viewer's ?draft=1 path reads.
 * That mirror is what makes the studio testable with no backend: author on
 * desktop, open ?draft=1, see it.
 *
 * Separate from contentStore, which holds the doc the *viewer* is rendering.
 * The studio must be able to edit a draft without disturbing a live preview.
 *
 * Persistence is best-effort: a full or unavailable localStorage must never
 * break editing, so writes are wrapped and failures are reported through
 * `persistError` rather than thrown.
 */

import { create } from 'zustand';
import {
  StoryAsset,
  StoryDoc,
  StoryFrame,
  StoryProp,
  STORY_SCHEMA_VERSION,
  validateStoryDoc,
} from '@/story/storyDoc';
import { DEFAULT_STORY } from '@/story/defaultStory';
import { backfillEraProps } from '@/story/eraBackfill';
import { migrateDraftDepth } from '@/story/markerBackfill';
import { DEFAULT_MARKER } from '@/story/marker';
import { LOCAL_DRAFT_KEY } from '@/services/storyApi';

/** How many undo steps to retain. */
const HISTORY_LIMIT = 50;

/** A blank frame, used when adding to the rail. */
export function blankFrame(index: number): StoryFrame {
  return {
    key: `frame-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
    year: 'YEAR',
    label: `F${index + 1}`,
    title: 'NEW FRAME',
    line: '',
    washColor: 'rgba(150,150,150,0.25)',
    art: '<svg viewBox="0 0 330 175" xmlns="http://www.w3.org/2000/svg"></svg>',
    props: [],
  };
}

/** A pristine story to build from scratch. Copy carries light placeholders
 *  rather than empty strings so it survives the per-field validator on reload. */
function blankStory(): StoryDoc {
  return {
    schemaVersion: STORY_SCHEMA_VERSION,
    id: '',
    title: 'Untitled story',
    loc: '',
    intro: { title: 'Welcome', subtitle: 'Step in to begin' },
    outro: { title: 'The end', subtitle: 'Thanks for visiting' },
    frames: [blankFrame(0)],
    marker: { ...DEFAULT_MARKER },
  };
}

interface StudioState {
  /** The story being authored. */
  doc: StoryDoc;
  /** Index of the frame open in the inspector. */
  selected: number;
  /** True once the draft differs from what was last loaded. */
  dirty: boolean;
  /** Set when persistence failed, so the UI can warn instead of losing work silently. */
  persistError: string | null;
  /** Number of undo steps available. */
  canUndo: boolean;

  /** Replaces the whole document (import, or seeding from a template). */
  setDoc: (raw: unknown) => void;
  /** Applies a partial update to the document's top-level copy. */
  patchDoc: (patch: Partial<Omit<StoryDoc, 'frames' | 'schemaVersion'>>) => void;
  /** Applies a partial update to one frame. */
  patchFrame: (index: number, patch: Partial<StoryFrame>) => void;
  /** Replaces one frame's staged props. */
  setProps: (index: number, props: StoryProp[]) => void;
  /** Stores an uploaded image and returns the id props should reference. */
  addAsset: (asset: StoryAsset) => string;
  /** Appends a blank frame and selects it. */
  addFrame: () => void;
  /** Removes a frame. Refuses to remove the last one. */
  removeFrame: (index: number) => void;
  /** Moves a frame to a new position (rail drag-reorder). */
  moveFrame: (from: number, to: number) => void;
  /** Selects a frame for the inspector. */
  select: (index: number) => void;
  /** Reverts the last change. */
  undo: () => void;
  /** Discards the draft and starts again from the bundled story. */
  reset: () => void;
  /** Discards the draft and starts a fresh blank story. */
  newStory: () => void;
}

/** Serialized snapshots for undo. */
const history: string[] = [];

/** Writes the draft to localStorage. Returns an error message, or null. */
function persist(doc: StoryDoc): string | null {
  try {
    window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(doc));
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'could not save draft';
  }
}

/**
 * Reads a previously saved draft, or the bundled story when there is none.
 *
 * A saved draft shadows the bundled story, so an author who already has one
 * would keep the old flat era art forever. backfillEraProps stages those frames
 * on the way in, leaving every other edit they made alone. migrateDraftDepth
 * then re-bases depth on the wall, which a pre-marker draft still measures from
 * the viewer.
 */
function initialDoc(): StoryDoc {
  try {
    const raw = window.localStorage.getItem(LOCAL_DRAFT_KEY);
    if (raw !== null) {
      return migrateDraftDepth(
        backfillEraProps(validateStoryDoc(JSON.parse(raw) as unknown, DEFAULT_STORY)),
      );
    }
  } catch {
    // Corrupt draft — fall through to the bundled story rather than blocking.
  }
  return DEFAULT_STORY;
}

/** Clamps an index into a frame list. */
function clamp(index: number, length: number): number {
  return Math.min(Math.max(0, index), Math.max(0, length - 1));
}

export const useStudioDraft = create<StudioState>((set, get) => {
  /** Commits a new document: pushes undo history, persists, updates state. */
  const commit = (doc: StoryDoc, selected?: number): void => {
    history.push(JSON.stringify(get().doc));
    if (history.length > HISTORY_LIMIT) history.shift();
    const persistError = persist(doc);
    set({
      doc,
      dirty: true,
      persistError,
      canUndo: history.length > 0,
      ...(selected === undefined ? {} : { selected: clamp(selected, doc.frames.length) }),
    });
  };

  return {
    doc: initialDoc(),
    selected: 0,
    dirty: false,
    persistError: null,
    canUndo: false,

    setDoc: (raw) => commit(validateStoryDoc(raw, DEFAULT_STORY), 0),

    patchDoc: (patch) => commit({ ...get().doc, ...patch }),

    patchFrame: (index, patch) => {
      const { doc } = get();
      if (index < 0 || index >= doc.frames.length) return;
      const frames = doc.frames.map((f, i) => (i === index ? { ...f, ...patch } : f));
      commit({ ...doc, frames });
    },

    setProps: (index, props) => get().patchFrame(index, { props }),

    addAsset: (asset) => {
      const { doc } = get();
      const id = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      commit({ ...doc, assets: { ...(doc.assets ?? {}), [id]: asset } });
      return id;
    },

    addFrame: () => {
      const { doc } = get();
      const frames = [...doc.frames, blankFrame(doc.frames.length)];
      commit({ ...doc, frames }, frames.length - 1);
    },

    removeFrame: (index) => {
      const { doc, selected } = get();
      // A story with no frames has nothing to walk and would fail validation.
      if (doc.frames.length <= 1 || index < 0 || index >= doc.frames.length) return;
      const frames = doc.frames.filter((_, i) => i !== index);
      commit({ ...doc, frames }, selected >= index ? selected - 1 : selected);
    },

    moveFrame: (from, to) => {
      const { doc } = get();
      const n = doc.frames.length;
      if (from === to || from < 0 || from >= n || to < 0 || to >= n) return;
      const frames = [...doc.frames];
      const [moved] = frames.splice(from, 1);
      frames.splice(to, 0, moved);
      commit({ ...doc, frames }, to);
    },

    select: (index) => set({ selected: clamp(index, get().doc.frames.length) }),

    undo: () => {
      const prev = history.pop();
      if (prev === undefined) return;
      const doc = validateStoryDoc(JSON.parse(prev) as unknown, DEFAULT_STORY);
      const persistError = persist(doc);
      set((s) => ({
        doc,
        persistError,
        canUndo: history.length > 0,
        selected: clamp(s.selected, doc.frames.length),
      }));
    },

    reset: () => {
      history.length = 0;
      const persistError = persist(DEFAULT_STORY);
      set({
        doc: DEFAULT_STORY,
        selected: 0,
        dirty: false,
        persistError,
        canUndo: false,
      });
    },

    newStory: () => {
      history.length = 0;
      const doc = blankStory();
      const persistError = persist(doc);
      set({
        doc,
        selected: 0,
        dirty: false,
        persistError,
        canUndo: false,
      });
    },
  };
});
