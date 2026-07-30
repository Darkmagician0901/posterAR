import { describe, expect, it } from 'vitest';
import { unreachableAssets } from './gc-assets';
import type { StoryDoc } from '../src/story/storyDoc';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

const story = (assets: StoryDoc['assets'], id = 's'): StoryDoc => ({
  schemaVersion: 4,
  id,
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

  // Two distinct documents must both be walked. An implementation that only
  // inspected published[0] would still pass a same-shape single-doc test, but
  // would silently delete an asset referenced only by a later story — data
  // loss proportional to how many stories exist. The shared-only doc is
  // placed first and the doc with the exclusive asset second, so that bug
  // would surface here.
  it('keeps an asset shared by two stories, and one exclusive to the second', () => {
    const storyA = story({ logo: { assetId: A, aspect: 1 } }, 'story-a');
    const storyB = story({ logo: { assetId: A, aspect: 1 }, hero: { assetId: C, aspect: 1 } }, 'story-b');
    expect(unreachableAssets([storyA, storyB], [A, C], 0)).toEqual([]);
  });

  // A v3 legacy asset carries its bytes inline (no S3 object) and must
  // contribute nothing to reachability. `legacy.href` is deliberately set
  // equal to the stored id B: if a future refactor ever treated a legacy
  // entry as reachable by any field other than `assetId`, B would wrongly
  // survive here.
  it('ignores a v3 legacy asset entry when computing reachability', () => {
    const doc = story({ ref: { assetId: A, aspect: 1 }, legacy: { href: B, aspect: 1 } });
    expect(unreachableAssets([doc], [A, B], 0)).toEqual([B]);
  });

  it('reclaims nothing when there is nothing stored', () => {
    expect(unreachableAssets([], [], 0)).toEqual([]);
  });
});
