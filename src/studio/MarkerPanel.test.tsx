import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { MarkerPanel } from './MarkerPanel';
import { useStudioDraft } from './studioDraftStore';
import { DEFAULT_MARKER } from '@/story/marker';

/**
 * Render-level coverage for the poster panel. Like StudioApp's tests these use
 * renderToString, which always observes the store's *initial* state — so what
 * is asserted here is what an author is shown, not what an edit does. The edit
 * rules are covered directly in story/marker.test.ts (applyMarkerEdit).
 */
describe('MarkerPanel', () => {
  beforeEach(() => {
    useStudioDraft.getState().reset();
  });

  it('states the poster’s printed size in metres', () => {
    const html = renderToString(<MarkerPanel />);
    expect(html).toContain('POSTER');
    // A3 portrait: 0.297 m x 0.42 m.
    expect(html).toContain('0.30 m wide');
    expect(html).toContain('0.42 m tall');
  });

  it('offers both measurements as fields', () => {
    const html = renderToString(<MarkerPanel />);
    expect(html).toContain('Printed width');
    expect(html).toContain('Hangs at');
  });

  it('asks for an image when the story has no poster yet', () => {
    const html = renderToString(<MarkerPanel />);
    expect(html).toContain('POSTER IMAGE');
    expect(html).toContain('no image');
  });

  it('explains what depth is measured from', () => {
    // The whole point of the marker is that 0 m means the wall, not the viewer.
    expect(renderToString(<MarkerPanel />)).toContain('flat against the wall');
  });

  it('renders a story that carries no marker at all', () => {
    useStudioDraft.getState().patchDoc({ marker: undefined });
    expect(() => renderToString(<MarkerPanel />)).not.toThrow();
    expect(renderToString(<MarkerPanel />)).toContain(
      `${DEFAULT_MARKER.widthM.toFixed(2)} m wide`,
    );
  });
});
