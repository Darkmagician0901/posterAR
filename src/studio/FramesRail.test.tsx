import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { FramesRail } from './FramesRail';
import { useStudioDraft } from './studioDraftStore';

/**
 * Render-level coverage for the frames rail, in the renderToString style the
 * other studio component tests use. Reordering behaviour is covered directly in
 * studioDraftStore.test.ts; what matters here is what the rail shows.
 */
describe('FramesRail', () => {
  beforeEach(() => {
    useStudioDraft.getState().reset();
  });

  it('separates the reorder hint from the FRAMES label', () => {
    // Both were one text node in a 212px flex row, so the hint wrapped tight
    // against the label with no separation.
    const html = renderToString(<FramesRail />);
    expect(html).toContain('st-rail-title');
    expect(html).toContain('st-rail-hint');
    expect(html).toContain('drag to reorder');
  });

  it('keeps the arrow on the disabled move-up control', () => {
    // The glyph was always in the markup; it was rendered invisible by a
    // double fade. Guard the markup here, the styling in studio.css.
    const html = renderToString(<FramesRail />);
    expect(html).toContain('↑');
    expect(html).toContain('Move up');
  });

  it('lists every frame in the story', () => {
    const html = renderToString(<FramesRail />);
    for (const frame of useStudioDraft.getState().doc.frames) {
      expect(html).toContain(frame.title);
    }
  });
});
