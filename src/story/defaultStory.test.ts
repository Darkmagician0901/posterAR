import { describe, it, expect } from 'vitest';
import { DEFAULT_STORY } from './defaultStory';
import { STORY_ERAS, STORY_INTRO, STORY_OUTRO } from './storyData';
import { eraSvg } from './eraArt';

describe('DEFAULT_STORY', () => {
  it('has one frame per shipped era, in order', () => {
    expect(DEFAULT_STORY.frames.map((f) => f.key)).toEqual(STORY_ERAS.map((e) => e.key));
  });

  it('carries each era SVG byte-for-byte', () => {
    for (const era of STORY_ERAS) {
      const frame = DEFAULT_STORY.frames.find((f) => f.key === era.key);
      expect(frame).toBeDefined();
      expect(frame!.art).toBe(eraSvg(era.key));
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

  it('carries no props — the bundled art is hand-authored, not composed', () => {
    for (const f of DEFAULT_STORY.frames) expect(f.props).toBeUndefined();
  });

  it('survives its own validator unchanged', async () => {
    const { validateStoryDoc } = await import('./storyDoc');
    expect(validateStoryDoc(DEFAULT_STORY, DEFAULT_STORY)).toEqual(DEFAULT_STORY);
  });
});
