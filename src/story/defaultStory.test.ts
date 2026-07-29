import { describe, it, expect } from 'vitest';
import { DEFAULT_STORY } from './defaultStory';
import { STORY_ERAS, STORY_INTRO, STORY_OUTRO } from './storyData';
import { eraSvg } from './eraArt';
import { eraProps } from './eraProps';
import { composeFrame } from './props/compose';

describe('DEFAULT_STORY', () => {
  it('has one frame per shipped era, in order', () => {
    expect(DEFAULT_STORY.frames.map((f) => f.key)).toEqual(STORY_ERAS.map((e) => e.key));
  });

  it('composes each frame’s art from that era’s props', () => {
    for (const era of STORY_ERAS) {
      const frame = DEFAULT_STORY.frames.find((f) => f.key === era.key);
      expect(frame).toBeDefined();
      expect(frame!.art).toBe(composeFrame(eraProps(era.key)));
    }
  });

  it('no longer ships the flat hand-drawn scenes as art', () => {
    // The painted scenes were one unselectable layer, so opening a frame in the
    // stage editor offered nothing to move. era/*.svg stays on disk regardless.
    for (const era of STORY_ERAS) {
      const frame = DEFAULT_STORY.frames.find((f) => f.key === era.key);
      expect(frame!.art).not.toBe(eraSvg(era.key));
    }
  });

  it('composes art that actually draws something', () => {
    // composeFrame silently drops props it cannot draw, so a near-empty
    // document would mean every key in the frame was unknown.
    for (const f of DEFAULT_STORY.frames) {
      expect(f.art).toContain('<svg');
      expect(f.art.length).toBeGreaterThan(200);
    }
  });

  it('copies era copy and wash colors verbatim', () => {
    STORY_ERAS.forEach((era, i) => {
      const f = DEFAULT_STORY.frames[i];
      expect(f.year).toBe(era.year);
      expect(f.label).toBe(era.label);
      expect(f.title).toBe(era.title);
      expect(f.line).toBe(era.line);
      expect(f.washColor).toBe(era.washColor);
    });
  });

  it('copies the intro and outro cards', () => {
    expect(DEFAULT_STORY.intro.title).toBe(STORY_INTRO.title);
    expect(DEFAULT_STORY.intro.subtitle).toBe(STORY_INTRO.subtitle);
    expect(DEFAULT_STORY.outro.title).toBe(STORY_OUTRO.title);
    expect(DEFAULT_STORY.outro.subtitle).toBe(STORY_OUTRO.subtitle);
  });

  it('carries each era’s props, so every frame opens with movable objects', () => {
    for (const era of STORY_ERAS) {
      const f = DEFAULT_STORY.frames.find((fr) => fr.key === era.key);
      expect(f!.props).toEqual(eraProps(era.key));
    }
  });

  it('carries no frozen backdrop — the art is regenerable from the props', () => {
    for (const f of DEFAULT_STORY.frames) expect(f.backdrop).toBeUndefined();
  });

  it('survives its own validator unchanged', async () => {
    const { validateStoryDoc } = await import('./storyDoc');
    expect(validateStoryDoc(DEFAULT_STORY, DEFAULT_STORY)).toEqual(DEFAULT_STORY);
  });
});
