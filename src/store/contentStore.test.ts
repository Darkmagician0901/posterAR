import { describe, it, expect, beforeEach } from 'vitest';
import { useContentStore } from './contentStore';
import { DEFAULT_STORY } from '@/story/defaultStory';

describe('contentStore', () => {
  beforeEach(() => useContentStore.getState().reset());

  it('starts holding the bundled default story', () => {
    expect(useContentStore.getState().doc).toEqual(DEFAULT_STORY);
  });

  it('load() replaces the doc with a validated version', () => {
    useContentStore.getState().load({
      title: 'AUTHORED',
      frames: [
        {
          key: 'z',
          year: '2026',
          label: 'Z',
          title: 'TZ',
          line: 'lz',
          washColor: '#123',
          art: '<svg viewBox="0 0 1 1"/>',
        },
      ],
    });
    const { doc } = useContentStore.getState();
    expect(doc.title).toBe('AUTHORED');
    expect(doc.frames.map((f) => f.key)).toEqual(['z']);
  });

  it('load() falls back to the default rather than throwing on junk', () => {
    useContentStore.getState().load('not a doc');
    expect(useContentStore.getState().doc).toEqual(DEFAULT_STORY);
  });

  it('reset() restores the bundled default', () => {
    useContentStore.getState().load({ title: 'TEMP' });
    useContentStore.getState().reset();
    expect(useContentStore.getState().doc).toEqual(DEFAULT_STORY);
  });
});
