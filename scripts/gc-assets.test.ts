import { describe, expect, it } from 'vitest';
import { unreachableAssets } from './gc-assets';
import type { StoryDoc } from '../src/story/storyDoc';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

const story = (assets: Record<string, { assetId: string; aspect: number }>): StoryDoc => ({
  schemaVersion: 4,
  id: 's',
  title: '',
  loc: '',
  intro: { title: '', subtitle: '' },
  outro: { title: '', subtitle: '' },
  frames: [{ key: 'f', year: '', label: '', title: '', line: '', washColor: '', art: '<svg/>' }],
  assets,
});

describe('unreachableAssets', () => {
  it('keeps an asset a published story references', () => {
    expect(unreachableAssets([story({ logo: { assetId: A, aspect: 1 } })], [A], 0)).toEqual([]);
  });

  it('reclaims an asset nothing references', () => {
    expect(unreachableAssets([story({ logo: { assetId: A, aspect: 1 } })], [A, B], 0)).toEqual([B]);
  });

  // Assets are uploaded on drop, so one legitimately has no references
  // between being added and the story being published. Without the grace
  // window, GC would delete work in progress.
  it('spares a recently uploaded asset even when nothing references it', () => {
    const cutoff = 1_000;
    expect(unreachableAssets([], [B], cutoff, new Map([[B, 2_000]]))).toEqual([]);
    expect(unreachableAssets([], [B], cutoff, new Map([[B, 500]]))).toEqual([B]);
  });

  it('keeps an asset shared by two stories when only one is deleted', () => {
    const remaining = [story({ logo: { assetId: A, aspect: 1 } })];
    expect(unreachableAssets(remaining, [A], 0)).toEqual([]);
  });

  it('reclaims nothing when there is nothing stored', () => {
    expect(unreachableAssets([], [], 0)).toEqual([]);
  });
});
