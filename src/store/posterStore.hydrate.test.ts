import { describe, it, expect, beforeEach } from 'vitest';
import { usePosterStore } from './posterStore';
import type { RemoteAsset } from '@/services/posterApi';

const remote = (id: string): RemoteAsset => ({
  id,
  url: `https://pub/${id}.webp`,
  contentType: 'image/webp',
  isAnimated: false,
  width: 100,
  height: 100,
  originalName: `${id}.webp`,
});

describe('hydrateUploads', () => {
  beforeEach(() => {
    usePosterStore.setState({
      uploadedPosters: [],
      currentPosterImage: '/posters/default-poster.png',
    });
  });

  it('adds remote assets to the gallery without changing currentPosterImage', () => {
    usePosterStore.getState().hydrateUploads([remote('a'), remote('b')]);
    const s = usePosterStore.getState();
    expect(s.uploadedPosters.map((p) => p.id)).toEqual(['a', 'b']);
    expect(s.currentPosterImage).toBe('/posters/default-poster.png');
  });

  it('does not duplicate already-present ids', () => {
    usePosterStore.getState().hydrateUploads([remote('a')]);
    usePosterStore.getState().hydrateUploads([remote('a'), remote('c')]);
    expect(usePosterStore.getState().uploadedPosters.map((p) => p.id)).toEqual(['a', 'c']);
  });
});
