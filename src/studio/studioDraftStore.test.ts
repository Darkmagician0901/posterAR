import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStudioDraft, blankFrame } from './studioDraftStore';
import { DEFAULT_STORY } from '@/story/defaultStory';
import { LOCAL_DRAFT_KEY } from '@/services/storyApi';

beforeEach(() => {
  window.localStorage.clear();
  useStudioDraft.getState().reset();
});

afterEach(() => vi.unstubAllGlobals());

describe('studioDraftStore', () => {
  it('starts from the bundled story', () => {
    expect(useStudioDraft.getState().doc).toEqual(DEFAULT_STORY);
    expect(useStudioDraft.getState().selected).toBe(0);
    expect(useStudioDraft.getState().dirty).toBe(false);
  });

  it('mirrors every change to the key the viewer draft path reads', () => {
    useStudioDraft.getState().patchDoc({ title: 'MIRRORED' });
    const stored = JSON.parse(window.localStorage.getItem(LOCAL_DRAFT_KEY)!) as { title: string };
    expect(stored.title).toBe('MIRRORED');
  });

  it('patches a single frame without touching its neighbours', () => {
    useStudioDraft.getState().patchFrame(1, { title: 'EDITED' });
    const { frames } = useStudioDraft.getState().doc;
    expect(frames[1].title).toBe('EDITED');
    expect(frames[0]).toEqual(DEFAULT_STORY.frames[0]);
    expect(frames[2]).toEqual(DEFAULT_STORY.frames[2]);
  });

  it('ignores frame patches that are out of range', () => {
    useStudioDraft.getState().patchFrame(99, { title: 'NOPE' });
    expect(useStudioDraft.getState().doc.frames).toEqual(DEFAULT_STORY.frames);
  });

  it('adds a frame and selects it', () => {
    const before = useStudioDraft.getState().doc.frames.length;
    useStudioDraft.getState().addFrame();
    const s = useStudioDraft.getState();
    expect(s.doc.frames).toHaveLength(before + 1);
    expect(s.selected).toBe(before);
  });

  it('gives every added frame a distinct key', () => {
    useStudioDraft.getState().addFrame();
    useStudioDraft.getState().addFrame();
    const keys = useStudioDraft.getState().doc.frames.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('removes a frame and pulls the selection back', () => {
    useStudioDraft.getState().select(3);
    useStudioDraft.getState().removeFrame(1);
    const s = useStudioDraft.getState();
    expect(s.doc.frames).toHaveLength(DEFAULT_STORY.frames.length - 1);
    expect(s.selected).toBe(2);
  });

  it('refuses to remove the last remaining frame', () => {
    const { removeFrame } = useStudioDraft.getState();
    while (useStudioDraft.getState().doc.frames.length > 1) removeFrame(0);
    removeFrame(0);
    expect(useStudioDraft.getState().doc.frames).toHaveLength(1);
  });

  it('reorders frames', () => {
    const original = useStudioDraft.getState().doc.frames.map((f) => f.key);
    useStudioDraft.getState().moveFrame(0, 2);
    const moved = useStudioDraft.getState().doc.frames.map((f) => f.key);
    expect(moved[2]).toBe(original[0]);
    expect(moved[0]).toBe(original[1]);
    expect(useStudioDraft.getState().selected).toBe(2);
  });

  it('ignores out-of-range reorders', () => {
    const before = useStudioDraft.getState().doc.frames.map((f) => f.key);
    useStudioDraft.getState().moveFrame(0, 99);
    useStudioDraft.getState().moveFrame(-1, 0);
    expect(useStudioDraft.getState().doc.frames.map((f) => f.key)).toEqual(before);
  });

  it('undoes the last change', () => {
    useStudioDraft.getState().patchDoc({ title: 'FIRST' });
    useStudioDraft.getState().patchDoc({ title: 'SECOND' });
    useStudioDraft.getState().undo();
    expect(useStudioDraft.getState().doc.title).toBe('FIRST');
    useStudioDraft.getState().undo();
    expect(useStudioDraft.getState().doc.title).toBe(DEFAULT_STORY.title);
  });

  it('reports canUndo accurately', () => {
    expect(useStudioDraft.getState().canUndo).toBe(false);
    useStudioDraft.getState().patchDoc({ title: 'X' });
    expect(useStudioDraft.getState().canUndo).toBe(true);
  });

  it('undo is a no-op with empty history', () => {
    useStudioDraft.getState().undo();
    expect(useStudioDraft.getState().doc).toEqual(DEFAULT_STORY);
  });

  it('clamps the selection when undo shortens the frame list', () => {
    useStudioDraft.getState().addFrame();
    const added = useStudioDraft.getState().selected;
    expect(added).toBeGreaterThan(0);
    useStudioDraft.getState().undo();
    const s = useStudioDraft.getState();
    expect(s.selected).toBeLessThan(s.doc.frames.length);
  });

  it('stores staged props on the right frame', () => {
    useStudioDraft
      .getState()
      .setProps(2, [{ t: 'lib', k: 'sunflower', x: 1, z: 2, h: 1.6, f: false, e: 0 }]);
    expect(useStudioDraft.getState().doc.frames[2].props).toHaveLength(1);
    expect(useStudioDraft.getState().doc.frames[0].props).toBeUndefined();
  });

  it('surfaces a persistence failure instead of losing the edit silently', () => {
    const setItem = vi.fn(() => {
      throw new Error('QuotaExceededError');
    });
    vi.stubGlobal('localStorage', { ...window.localStorage, setItem, getItem: () => null });
    useStudioDraft.getState().patchDoc({ title: 'TOO BIG' });
    const s = useStudioDraft.getState();
    // The edit is kept in memory even though it could not be saved.
    expect(s.doc.title).toBe('TOO BIG');
    expect(s.persistError).toContain('QuotaExceeded');
  });

  it('blankFrame produces something the validator accepts', async () => {
    const { validateStoryDoc } = await import('@/story/storyDoc');
    const doc = validateStoryDoc(
      { ...DEFAULT_STORY, frames: [blankFrame(0)] },
      DEFAULT_STORY,
    );
    expect(doc.frames).toHaveLength(1);
    expect(doc.frames[0].title).toBe('NEW FRAME');
  });
});
