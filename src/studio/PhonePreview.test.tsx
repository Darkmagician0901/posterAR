import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { PhonePreview } from './PhonePreview';
import { useStudioDraft } from './studioDraftStore';
import { DEFAULT_STORY } from '@/story/defaultStory';

/**
 * See the note in StudioApp.test.tsx: renderToString observes the store's
 * initial state, so these cover the mode-dependent chrome (which is driven by
 * props, not the store) rather than anything committed mid-test.
 */
describe('PhonePreview', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useStudioDraft.getState().reset();
  });

  it('renders the editing mode without throwing', () => {
    expect(() =>
      renderToString(<PhonePreview playing={false} onExitPlay={() => {}} />),
    ).not.toThrow();
  });

  it('renders the playthrough mode without throwing', () => {
    expect(() =>
      renderToString(<PhonePreview playing onExitPlay={() => {}} />),
    ).not.toThrow();
  });

  it('labels the mode so an author always knows which they are in', () => {
    expect(renderToString(<PhonePreview playing={false} onExitPlay={() => {}} />)).toContain(
      'EDITING',
    );
    expect(renderToString(<PhonePreview playing onExitPlay={() => {}} />)).toContain('PLAYING');
  });

  it('opens a playthrough on the intro card, not mid-story', () => {
    const html = renderToString(<PhonePreview playing onExitPlay={() => {}} />);
    expect(html).toContain(DEFAULT_STORY.intro.title);
    expect(html).toContain('BEGIN');
  });

  it('shows no intro card while editing', () => {
    const html = renderToString(<PhonePreview playing={false} onExitPlay={() => {}} />);
    expect(html).not.toContain('BEGIN');
    expect(html).not.toContain('st-pcard');
  });

  it('offers a way back to editing from a playthrough', () => {
    const html = renderToString(<PhonePreview playing onExitPlay={() => {}} />);
    expect(html).toContain('BACK TO EDITING');
  });

  it('shows the frame art and HUD while editing', () => {
    const html = renderToString(<PhonePreview playing={false} onExitPlay={() => {}} />);
    expect(html).toContain(DEFAULT_STORY.frames[0].year);
    expect(html).toContain(DEFAULT_STORY.frames[0].title);
    expect(html).toContain('st-mini-tl');
  });

  it('renders a timeline stop per frame', () => {
    const html = renderToString(<PhonePreview playing={false} onExitPlay={() => {}} />);
    expect(html.match(/class="st-mtl[^"]*"/g)).toHaveLength(DEFAULT_STORY.frames.length);
  });
});
