import { beforeEach, describe, expect, it } from 'vitest';
import { useStoryStore } from './storyStore';
import { useContentStore } from './contentStore';
import { DEFAULT_STORY } from '@/story/defaultStory';

beforeEach(() => {
  useStoryStore.getState().reset();
  useContentStore.getState().reset();
});

describe('storyStore', () => {
  it('starts scanning, unplaced, at era 0', () => {
    const s = useStoryStore.getState();
    expect(s.phase).toBe('scanning');
    expect(s.placed).toBe(false);
    expect(s.eraIndex).toBe(0);
  });

  it('place() plants the story at era 0 in the placed phase', () => {
    useStoryStore.getState().place();
    const s = useStoryStore.getState();
    expect(s.placed).toBe(true);
    expect(s.phase).toBe('placed');
    expect(s.eraIndex).toBe(0);
  });

  it('next() advances eras then enters outro past the last', () => {
    useStoryStore.getState().place();
    for (let i = 1; i < DEFAULT_STORY.frames.length; i++) {
      useStoryStore.getState().next();
      expect(useStoryStore.getState().eraIndex).toBe(i);
      expect(useStoryStore.getState().phase).toBe('placed');
    }
    useStoryStore.getState().next();
    expect(useStoryStore.getState().phase).toBe('outro');
    expect(useStoryStore.getState().eraIndex).toBe(DEFAULT_STORY.frames.length - 1);
  });

  it('prev() steps back and clamps at era 0', () => {
    useStoryStore.getState().place();
    useStoryStore.getState().jumpTo(2);
    useStoryStore.getState().prev();
    expect(useStoryStore.getState().eraIndex).toBe(1);
    useStoryStore.getState().prev();
    useStoryStore.getState().prev();
    expect(useStoryStore.getState().eraIndex).toBe(0);
  });

  it('jumpTo() clamps within range and sets the placed phase', () => {
    useStoryStore.getState().place();
    useStoryStore.getState().jumpTo(99);
    expect(useStoryStore.getState().eraIndex).toBe(DEFAULT_STORY.frames.length - 1);
    useStoryStore.getState().jumpTo(-5);
    expect(useStoryStore.getState().eraIndex).toBe(0);
    expect(useStoryStore.getState().phase).toBe('placed');
  });

  it('setPhase() does not downgrade out of placed to scanning/ready', () => {
    useStoryStore.getState().place();
    useStoryStore.getState().setPhase('scanning');
    expect(useStoryStore.getState().phase).toBe('placed');
    useStoryStore.getState().setPhase('ready');
    expect(useStoryStore.getState().phase).toBe('placed');
  });

  it('reset() returns to the initial scanning state', () => {
    useStoryStore.getState().place();
    useStoryStore.getState().jumpTo(3);
    useStoryStore.getState().reset();
    const s = useStoryStore.getState();
    expect(s.phase).toBe('scanning');
    expect(s.placed).toBe(false);
    expect(s.eraIndex).toBe(0);
  });

  it('currentFrame() reflects the current index', () => {
    useStoryStore.getState().place();
    useStoryStore.getState().jumpTo(2);
    expect(useStoryStore.getState().currentFrame().key).toBe(DEFAULT_STORY.frames[2].key);
  });

  it('clamps to the loaded document, not the bundled era count', () => {
    useContentStore.getState().load({
      frames: [
        {
          key: 'only',
          year: '1',
          label: 'O',
          title: 'T',
          line: 'l',
          washColor: '#000',
          art: '<svg viewBox="0 0 1 1"/>',
        },
      ],
    });
    useStoryStore.getState().place();
    useStoryStore.getState().jumpTo(4);
    expect(useStoryStore.getState().eraIndex).toBe(0);
    expect(useStoryStore.getState().currentFrame().key).toBe('only');
  });
});
