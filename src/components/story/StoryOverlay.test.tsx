/**
 * Coverage for the scan card's prompt copy in both modes.
 *
 * The words are the entire interface at this moment: they are what tells a
 * visitor whether to look at the floor or at a picture on the wall. Marker
 * mode getting the ground copy is the shipped defect this flow removes
 * (`docs/marker-locator-design.md` §6), so it is worth a test rather than a
 * careful reading.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
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
