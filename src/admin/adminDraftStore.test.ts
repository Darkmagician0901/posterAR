import { describe, it, expect, beforeEach } from 'vitest';
import { loadDraft, useAdminDraftStore } from '@/admin/adminDraftStore';
import { DEFAULT_CONTENT } from '@/content/contentDoc';
import { STORAGE_KEYS } from '@/utils/constants';

describe('loadDraft', () => {
  it('returns defaults when nothing is stored', () => {
    const out = loadDraft({ getItem: () => null });
    expect(out.source).toBe('defaults');
    expect(out.draft).toEqual(DEFAULT_CONTENT);
  });

  it('returns the sanitized stored draft', () => {
    const raw = JSON.stringify({ intro: { title: 'EDITED' } });
    const out = loadDraft({ getItem: () => raw });
    expect(out.source).toBe('draft');
    expect(out.draft.intro.title).toBe('EDITED');
    expect(out.draft.eras).toHaveLength(5);
  });

  it('returns defaults on malformed JSON', () => {
    const out = loadDraft({ getItem: () => '{broken' });
    expect(out.source).toBe('defaults');
  });
});

describe('useAdminDraftStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAdminDraftStore.getState().resetToDefaults();
  });

  it('setIntro patches and persists', () => {
    useAdminDraftStore.getState().setIntro({ title: 'NEW TITLE' });
    const s = useAdminDraftStore.getState();
    expect(s.draft.intro.title).toBe('NEW TITLE');
    expect(s.draft.intro.subtitle).toBe(DEFAULT_CONTENT.intro.subtitle);
    expect(s.source).toBe('draft');
    expect(s.savedAt).not.toBeNull();
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.CONTENT_DRAFT) ?? '{}');
    expect(stored.intro.title).toBe('NEW TITLE');
  });

  it('setEra patches only the matching era and never its key', () => {
    useAdminDraftStore.getState().setEra('oil', { line: 'new oil line' });
    const eras = useAdminDraftStore.getState().draft.eras;
    expect(eras[1].key).toBe('oil');
    expect(eras[1].line).toBe('new oil line');
    expect(eras[0]).toEqual(DEFAULT_CONTENT.eras[0]);
  });

  it('setTileWidthM updates settings', () => {
    useAdminDraftStore.getState().setTileWidthM(1.2);
    expect(useAdminDraftStore.getState().draft.settings.tileWidthM).toBe(1.2);
  });

  it('resetToDefaults clears storage and state', () => {
    useAdminDraftStore.getState().setIntro({ title: 'X' });
    useAdminDraftStore.getState().resetToDefaults();
    const s = useAdminDraftStore.getState();
    expect(s.draft).toEqual(DEFAULT_CONTENT);
    expect(s.source).toBe('defaults');
    expect(s.savedAt).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.CONTENT_DRAFT)).toBeNull();
  });
});
