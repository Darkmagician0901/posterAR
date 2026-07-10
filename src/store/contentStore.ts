/**
 * contentStore — the visitor app's read-only view of editable content.
 *
 * Normally serves DEFAULT_CONTENT (the bundled copy). When the page is opened
 * with `/?preview=local`, it instead serves the admin panel's localStorage
 * draft (sanitized), so an editor can see their changes in the real
 * experience before any backend exists. Phase 2 will add "fetch published doc
 * from the API" as a third source; consumers won't change.
 *
 * Like storyStore, this is a Zustand store, not a hook — call it anywhere.
 */

import { create } from 'zustand';
import { ContentDoc, DEFAULT_CONTENT, sanitizeContentDoc } from '@/content/contentDoc';
import { STORAGE_KEYS } from '@/utils/constants';

/** What the store resolved at boot: the doc and whether it's a draft preview. */
export interface ResolvedContent {
  doc: ContentDoc;
  isPreview: boolean;
}

/**
 * Pure resolver (unit-tested): decides which content the app should show.
 * Preview requires BOTH the `?preview=local` param and a readable draft;
 * any failure degrades silently to the bundled defaults.
 */
export function resolveInitialContent(
  search: string,
  storage: Pick<Storage, 'getItem'>,
): ResolvedContent {
  if (new URLSearchParams(search).get('preview') !== 'local') {
    return { doc: DEFAULT_CONTENT, isPreview: false };
  }
  try {
    const raw = storage.getItem(STORAGE_KEYS.CONTENT_DRAFT);
    if (!raw) return { doc: DEFAULT_CONTENT, isPreview: false };
    return { doc: sanitizeContentDoc(JSON.parse(raw)), isPreview: true };
  } catch {
    return { doc: DEFAULT_CONTENT, isPreview: false };
  }
}

const NO_STORAGE: Pick<Storage, 'getItem'> = { getItem: () => null };

export const useContentStore = create<ResolvedContent>(() =>
  resolveInitialContent(
    typeof window !== 'undefined' ? window.location.search : '',
    typeof window !== 'undefined' ? window.localStorage : NO_STORAGE,
  ),
);
