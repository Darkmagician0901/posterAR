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
 * The end-of-exhibition feedback flow needs the real harness, not
 * `renderToString`.
 *
 * These assertions depend on the store having been moved to 'outro' AND on
 * component state set by a click, and zustand 4 hands `renderToString` the
 * store's INITIAL state — so a server-rendered test here would render the scan
 * card, find nothing, and pass for entirely the wrong reason. `createRoot` +
 * `act` commits for real and lets us dispatch clicks.
 */
describe('StoryOverlay end-of-exhibition feedback', () => {
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

  const click = (el: Element | null): void => {
    act(() => {
      el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  const endButton = (): HTMLButtonElement | null =>
    container.querySelector('button.story-end');
  const popup = (): HTMLElement | null => container.querySelector('.story-feedback-pop');

  it('offers END EXHIBITION on the outro when the room has a link', () => {
    renderAt('outro', 'https://forms.example/abc');
    expect(endButton()).not.toBeNull();
    expect(endButton()?.textContent).toContain('END EXHIBITION');
  });

  // The popup is the payoff of the button, so it must not be on screen until
  // the visitor asks for it — the outro's own copy comes first.
  it('keeps the link hidden until END EXHIBITION is pressed', () => {
    renderAt('outro', 'https://forms.example/abc');
    expect(popup()).toBeNull();
    click(endButton());
    expect(popup()).not.toBeNull();
  });

  it('shows the link in the popup, pointing at the room URL', () => {
    renderAt('outro', 'https://forms.example/abc');
    click(endButton());
    const link = popup()?.querySelector('a.story-feedback');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://forms.example/abc');
  });

  // A visitor may want to type the address into another device, or simply see
  // where a tap is about to send them before taking it.
  it('prints the address as readable text, not only as a link target', () => {
    renderAt('outro', 'https://forms.example/abc');
    click(endButton());
    expect(popup()?.textContent).toContain('https://forms.example/abc');
  });

  // Opening in a new tab must not hand the target a window.opener handle back
  // into the experience.
  it('opens in a new tab without leaking an opener handle', () => {
    renderAt('outro', 'https://forms.example/abc');
    click(endButton());
    const link = popup()?.querySelector('a.story-feedback');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.getAttribute('rel')).toContain('noreferrer');
  });

  it('can be dismissed, returning the visitor to the outro', () => {
    renderAt('outro', 'https://forms.example/abc');
    click(endButton());
    expect(popup()).not.toBeNull();
    click(popup()?.querySelector('button.story-pop-close') ?? null);
    expect(popup()).toBeNull();
    expect(endButton()).not.toBeNull();
  });

  // Nothing to pop up means nothing to press. A button that opens an empty
  // dialog is worse than no button.
  it('shows no button at all when the room has no link', () => {
    renderAt('outro', null);
    expect(endButton()).toBeNull();
    expect(popup()).toBeNull();
  });

  // Asking for feedback before the visitor has seen anything is noise.
  it('does not offer it before the outro', () => {
    renderAt('placed', 'https://forms.example/abc');
    expect(endButton()).toBeNull();
    expect(popup()).toBeNull();
  });

  /*
   * Walking the story again must not leave the popup hanging over the eras.
   * The outro is the only phase that can open it, so leaving the outro has to
   * close it — otherwise the dialog outlives the moment it belongs to and
   * covers the diorama.
   */
  it('closes itself when the visitor leaves the outro', () => {
    renderAt('outro', 'https://forms.example/abc');
    click(endButton());
    expect(popup()).not.toBeNull();
    renderAt('placed', 'https://forms.example/abc');
    expect(popup()).toBeNull();
  });

  /*
   * The round trip is what actually pins the reset down.
   *
   * The test above passes even with the reset removed, because the sheet's own
   * `phase === 'outro'` guard hides it while the visitor is mid-story. Only
   * coming BACK to the outro reveals whether the open flag was cleared or
   * merely masked — and an un-cleared flag means the form is thrown at a
   * visitor who never asked for it a second time.
   */
  it('does not reopen itself when the visitor walks the story again', () => {
    renderAt('outro', 'https://forms.example/abc');
    click(endButton());
    expect(popup()).not.toBeNull();

    renderAt('placed', 'https://forms.example/abc');
    renderAt('outro', 'https://forms.example/abc');

    expect(popup()).toBeNull();
    expect(endButton()).not.toBeNull();
  });
});
