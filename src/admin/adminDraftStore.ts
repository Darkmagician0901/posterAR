/**
 * adminDraftStore — the admin panel's working copy of the ContentDoc.
 *
 * Every edit autosaves the whole draft to localStorage (drafts are tiny), so
 * closing the tab never loses work and the visitor app's `/?preview=local`
 * mode can read the same key. Phase 2 replaces "persist to localStorage" with
 * "PUT draft to the API"; the editor components won't change.
 */

import { create } from 'zustand';
import {
  ContentDoc,
  ContentEra,
  DEFAULT_CONTENT,
  sanitizeContentDoc,
} from '@/content/contentDoc';
import { STORAGE_KEYS } from '@/utils/constants';
import type { EraKey } from '@/story/storyData';

/** Where the current draft came from. */
export type DraftSource = 'draft' | 'defaults';

/**
 * Reads and sanitizes the stored draft (pure; unit-tested). Malformed or
 * missing drafts yield the bundled defaults.
 */
export function loadDraft(storage: Pick<Storage, 'getItem'>): {
  draft: ContentDoc;
  source: DraftSource;
} {
  try {
    const raw = storage.getItem(STORAGE_KEYS.CONTENT_DRAFT);
    if (raw) return { draft: sanitizeContentDoc(JSON.parse(raw)), source: 'draft' };
  } catch {
    // fall through to defaults
  }
  return { draft: DEFAULT_CONTENT, source: 'defaults' };
}

interface AdminDraftState {
  draft: ContentDoc;
  source: DraftSource;
  /** Epoch ms of the last successful localStorage write; null before any. */
  savedAt: number | null;
  setIntro: (patch: Partial<ContentDoc['intro']>) => void;
  setOutro: (patch: Partial<ContentDoc['outro']>) => void;
  setEra: (key: EraKey, patch: Partial<Omit<ContentEra, 'key'>>) => void;
  setUi: (patch: Partial<ContentDoc['ui']>) => void;
  setTileWidthM: (v: number) => void;
  resetToDefaults: () => void;
}

/** Persists the draft and returns the state slice every setter shares. */
function save(draft: ContentDoc): Pick<AdminDraftState, 'draft' | 'source' | 'savedAt'> {
  window.localStorage.setItem(STORAGE_KEYS.CONTENT_DRAFT, JSON.stringify(draft));
  return { draft, source: 'draft', savedAt: Date.now() };
}

export const useAdminDraftStore = create<AdminDraftState>((set) => ({
  ...loadDraft(typeof window !== 'undefined' ? window.localStorage : { getItem: () => null }),
  savedAt: null,

  setIntro: (patch) =>
    set((s) => save({ ...s.draft, intro: { ...s.draft.intro, ...patch } })),

  setOutro: (patch) =>
    set((s) => save({ ...s.draft, outro: { ...s.draft.outro, ...patch } })),

  setEra: (key, patch) =>
    set((s) =>
      save({
        ...s.draft,
        eras: s.draft.eras.map((e) => (e.key === key ? { ...e, ...patch, key } : e)),
      }),
    ),

  setUi: (patch) => set((s) => save({ ...s.draft, ui: { ...s.draft.ui, ...patch } })),

  setTileWidthM: (v) =>
    set((s) => save({ ...s.draft, settings: { ...s.draft.settings, tileWidthM: v } })),

  resetToDefaults: () => {
    window.localStorage.removeItem(STORAGE_KEYS.CONTENT_DRAFT);
    set({ draft: DEFAULT_CONTENT, source: 'defaults', savedAt: null });
  },
}));
