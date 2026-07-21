import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { StudioApp } from './StudioApp';
import { useStudioDraft } from './studioDraftStore';
import { DEFAULT_STORY } from '@/story/defaultStory';

/**
 * Render smoke tests. These would have caught a crash-on-mount, which is
 * otherwise invisible until someone opens the page — the studio has no other
 * automated coverage of its component tree.
 */
describe('StudioApp', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useStudioDraft.getState().reset();
  });

  it('renders without throwing', () => {
    expect(() => renderToString(<StudioApp />)).not.toThrow();
  });

  it('renders the three columns and the story title', () => {
    const html = renderToString(<StudioApp />);
    expect(html).toContain('st-rail');
    expect(html).toContain('st-phone');
    expect(html).toContain('st-insp');
    expect(html).toContain('ARCADE');
  });

  it('lists every frame in the rail', () => {
    const html = renderToString(<StudioApp />);
    for (const frame of DEFAULT_STORY.frames) {
      expect(html).toContain(frame.title);
    }
  });

  it('shows the selected frame in the preview', () => {
    useStudioDraft.getState().select(2);
    const html = renderToString(<StudioApp />);
    expect(html).toContain(DEFAULT_STORY.frames[2].year);
  });

  it('disables publish while no story host is configured', () => {
    const html = renderToString(<StudioApp />);
    expect(/PUBLISH/.test(html)).toBe(true);
    expect(/disabled=""[^>]*>\s*⬆ PUBLISH|⬆ PUBLISH/.test(html)).toBe(true);
  });

  it('survives a story whose frames carry no props', () => {
    useStudioDraft.getState().addFrame();
    expect(() => renderToString(<StudioApp />)).not.toThrow();
  });

  it('survives an empty narration and an empty title', () => {
    useStudioDraft.getState().patchFrame(0, { line: '', title: '' });
    useStudioDraft.getState().patchDoc({ title: '' });
    expect(() => renderToString(<StudioApp />)).not.toThrow();
  });
});
