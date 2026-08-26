/**
 * Coverage for the scan card's prompt copy in both modes.
 *
 * The words are the entire interface at this moment: they are what tells a
 * visitor whether to look at the floor or at a picture on the wall. Marker
 * mode getting the ground copy is the shipped defect this flow removes
 * (`docs/marker-locator-design.md` §6), so it is worth a test rather than a
 * careful reading.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StoryOverlay } from './StoryOverlay';
import { useStoryStore } from '@/store/storyStore';

describe('StoryOverlay prompt copy', () => {
  beforeEach(() => {
    useStoryStore.getState().reset();
  });

  it('asks for the ground when there is no marker, exactly as it always has', () => {
    // Ground mode is the shipped experience and must not shift a character.
    expect(renderToString(<StoryOverlay surfaceReady={false} />)).toContain(
      'MOVE PHONE TO FIND THE GROUND',
    );
    expect(renderToString(<StoryOverlay surfaceReady={true} />)).toContain(
      'TAP THE GROUND TO PLACE',
    );
  });

  it('asks for the picture in marker mode, never for the ground', () => {
    const html = renderToString(<StoryOverlay surfaceReady={false} markerLock="searching" />);
    expect(html).toContain('POINT AT THE PICTURE');
    expect(html).not.toContain('GROUND');
  });

  it('invites the tap once the picture is locked', () => {
    const html = renderToString(<StoryOverlay surfaceReady={false} markerLock="locked" />);
    expect(html).toContain('TAP TO BEGIN');
  });

  it('ignores surfaceReady in marker mode, because the floor is irrelevant', () => {
    // A stale surface lock must never turn the marker prompt into a tap
    // invitation — that is the shipped defect this flow removes.
    const html = renderToString(<StoryOverlay surfaceReady={true} markerLock="searching" />);
    expect(html).toContain('POINT AT THE PICTURE');
    expect(html).not.toContain('TAP TO BEGIN');
  });
});

/**
 * The feedback link needs the real harness, not `renderToString`.
 *
 * These assertions depend on the store having been moved to 'outro', and
 * zustand 4 hands `renderToString` the store's INITIAL state — so a
 * server-rendered test here would render the scan card, find nothing, and pass
 * for entirely the wrong reason. `createRoot` + `act` commits for real.
 */
describe('StoryOverlay feedback link', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useStoryStore.getState().reset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderAt = (phase: 'outro' | 'placed', feedbackUrl: string | null): void => {
    act(() => {
      useStoryStore.getState().setPhase(phase);
    });
    act(() => {
      root.render(<StoryOverlay surfaceReady={true} feedbackUrl={feedbackUrl} />);
    });
  };

  it('offers the link on the outro when the room has one', () => {
    renderAt('outro', 'https://forms.example/abc');
    const link = container.querySelector('a.story-feedback');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://forms.example/abc');
  });

  // Opening in a new tab must not hand the target a window.opener handle back
  // into the experience.
  it('opens in a new tab without leaking an opener handle', () => {
    renderAt('outro', 'https://forms.example/abc');
    const link = container.querySelector('a.story-feedback');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.getAttribute('rel')).toContain('noreferrer');
  });

  it('shows nothing when the room has no link', () => {
    renderAt('outro', null);
    expect(container.querySelector('a.story-feedback')).toBeNull();
  });

  // Asking for feedback before the visitor has seen anything is noise.
  it('does not offer it before the outro', () => {
    renderAt('placed', 'https://forms.example/abc');
    expect(container.querySelector('a.story-feedback')).toBeNull();
  });
});
