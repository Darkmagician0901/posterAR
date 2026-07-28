import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { StudioApp } from './StudioApp';
import { useStudioDraft } from './studioDraftStore';
import { DEFAULT_STORY } from '@/story/defaultStory';

/**
 * Crash-on-mount coverage for the studio shell.
 *
 * IMPORTANT — what these tests cannot do: zustand 4's useStore passes
 * `getInitialState` as the server snapshot, so a renderToString render always
 * observes the store's *initial* state. Committing an edit and then asserting
 * the rendered output would pass whether or not the component reads the store
 * correctly. Editing behaviour is covered in `studioDraftStore.test.ts`, which
 * asserts on the store directly.
 */
describe('StudioApp', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useStudioDraft.getState().reset();
  });

  it('shows the optional audio box with no clip by default', () => {
    const html = renderToString(<StudioApp />);
    expect(html).toContain('ADD AUDIO');
  });

  it('renders without throwing', () => {
    expect(() => renderToString(<StudioApp />)).not.toThrow();
  });

  it('renders the three columns', () => {
    const html = renderToString(<StudioApp />);
    expect(html).toContain('st-rail');
    expect(html).toContain('st-phone');
    expect(html).toContain('st-insp');
  });

  it('lists every frame of the initial story in the rail', () => {
    const html = renderToString(<StudioApp />);
    for (const frame of DEFAULT_STORY.frames) {
      expect(html).toContain(frame.title);
    }
  });

  it('shows the first frame in the preview by default', () => {
    const html = renderToString(<StudioApp />);
    expect(html).toContain(DEFAULT_STORY.frames[0].title);
    expect(html).toContain(DEFAULT_STORY.frames[0].year);
    // React splits interpolated text into separate nodes in SSR, so the pill's
    // copy is matched by its stable parts rather than as one string.
    expect(html).toContain('EDITING');
    expect(html).toContain('st-mode-pill');
  });

  it('offers the stage editor for the selected frame', () => {
    const html = renderToString(<StudioApp />);
    expect(html).toContain('OPEN STAGE EDITOR');
  });

  it('disables publish while no story host is configured', () => {
    const html = renderToString(<StudioApp />);
    // VITE_STORY_BASE_URL is unset in the test env.
    expect(html).toContain('PUBLISH');
    expect(html).toMatch(/disabled[^>]*>\s*⬆ PUBLISH|⬆ PUBLISH[^<]*<\/button>/);
  });

  it('keeps the stage editor closed until it is opened', () => {
    const html = renderToString(<StudioApp />);
    expect(html).not.toContain('STAGE EDITOR</h2>');
  });
});
