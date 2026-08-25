import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStudioDraft, blankFrame } from './studioDraftStore';
import { DEFAULT_STORY } from '@/story/defaultStory';
import { LOCAL_DRAFT_KEY } from '@/services/storyApi';
import { IDENTITY_LOCAL, validateStoryDoc } from '@/story/storyDoc';

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
    const before = useStudioDraft.getState().doc.frames[0].props;
    useStudioDraft
      .getState()
      .setProps(2, [{ t: 'lib', k: 'sunflower', x: 1, z: 2, h: 1.6, f: false, e: 0 }]);
    expect(useStudioDraft.getState().doc.frames[2].props).toHaveLength(1);
    // Every other frame keeps whatever it had. The bundled frames now ship
    // staged props of their own, so "untouched" is no longer "undefined".
    expect(useStudioDraft.getState().doc.frames[0].props).toEqual(before);
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

  it('resolves an asset alias collision instead of overwriting', () => {
    const { addAsset } = useStudioDraft.getState();
    const first = addAsset('logo.png', {
      assetId: '1'.repeat(64),
      aspect: 1,
      name: 'logo.png',
    });
    const second = addAsset('logo.png', {
      assetId: '2'.repeat(64),
      aspect: 2,
      name: 'logo.png',
    });

    // Both survive under distinct keys — neither overwrote the other.
    expect(first).not.toBe(second);
    const { assets } = useStudioDraft.getState().doc;
    expect(assets?.[first]).toMatchObject({ assetId: '1'.repeat(64) });
    expect(assets?.[second]).toMatchObject({ assetId: '2'.repeat(64) });
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

describe('marker binding', () => {
  const crop = {
    top: 0, left: 0, width: 1200, height: 1600,
    isRotated: false, originalWidth: 1200, originalHeight: 1600,
  };
  const entry = {
    markerId: 'a'.repeat(64), thumbId: 'b'.repeat(64),
    name: 'Lobby poster', crop, addedAt: 1,
  };

  it('writes an anchor the validator accepts', () => {
    useStudioDraft.getState().bindMarker(entry);
    const { doc } = useStudioDraft.getState();
    expect(doc.anchor?.markerId).toBe(entry.markerId);
    expect(validateStoryDoc(doc, DEFAULT_STORY).anchor?.markerId).toBe(entry.markerId);
  });

  it('starts a new binding with the marker a quarter of the scene wide', () => {
    // Not 1. Under the locator design a fresh binding is a small print inside
    // a larger scene, and 1 would put a rectangle bigger than the stage.
    useStudioDraft.getState().bindMarker(entry);
    const { anchor } = useStudioDraft.getState().doc;
    expect(anchor?.widthInMarkers).toBe(4);
    expect(anchor?.mode).toBe('latch');
    expect(anchor?.local).toEqual(IDENTITY_LOCAL);
  });

  it('stores an authored layout on the bound anchor', () => {
    useStudioDraft.getState().bindMarker(entry);
    useStudioDraft.getState().setMarkerLayout({ widthInMarkers: 7.5, position: [-0.9, 0.6, 0] });
    const { anchor } = useStudioDraft.getState().doc;
    expect(anchor?.widthInMarkers).toBeCloseTo(7.5, 10);
    expect(anchor?.local.position).toEqual([-0.9, 0.6, 0]);
    // The binding itself must survive a layout edit untouched.
    expect(anchor?.markerId).toBe(entry.markerId);
    expect(anchor?.thumbId).toBe(entry.thumbId);
  });

  it('ignores a layout edit when nothing is bound', () => {
    // Otherwise a stray call would mint an anchor with no marker behind it,
    // which publishes as a picture that can never be recognised.
    useStudioDraft.getState().setMarkerLayout({ widthInMarkers: 7.5, position: [0, 0, 0] });
    expect(useStudioDraft.getState().doc.anchor).toBeUndefined();
  });

  it('makes a layout edit undoable like any other draft change', () => {
    useStudioDraft.getState().bindMarker(entry);
    useStudioDraft.getState().setMarkerLayout({ widthInMarkers: 9, position: [1, 1, 0] });
    useStudioDraft.getState().undo();
    expect(useStudioDraft.getState().doc.anchor?.widthInMarkers).toBe(4);
  });

  it('rebinding replaces rather than accumulating', () => {
    useStudioDraft.getState().bindMarker(entry);
    useStudioDraft.getState().bindMarker({ ...entry, markerId: 'c'.repeat(64) });
    expect(useStudioDraft.getState().doc.anchor?.markerId).toBe('c'.repeat(64));
  });

  it('unbinding restores a story with no anchor at all', () => {
    useStudioDraft.getState().bindMarker(entry);
    useStudioDraft.getState().unbindMarker();
    expect(useStudioDraft.getState().doc.anchor).toBeUndefined();
    expect('anchor' in useStudioDraft.getState().doc).toBe(false);
  });

  it('binding is undoable like every other edit', () => {
    useStudioDraft.getState().bindMarker(entry);
    useStudioDraft.getState().undo();
    expect(useStudioDraft.getState().doc.anchor).toBeUndefined();
  });
});
