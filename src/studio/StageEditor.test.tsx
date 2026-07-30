import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { StageEditor } from './StageEditor';
import { useStudioDraft } from './studioDraftStore';
import { PROP_LIBRARY } from '@/story/props/library';

/**
 * Crash-on-mount coverage for the stage editor's chrome.
 *
 * IMPORTANT — what these tests cannot do: zustand 4's useStore passes
 * `getInitialState` as the server snapshot, so a renderToString render always
 * observes the store's *initial* state no matter what was committed first.
 * Assertions about staged props would silently pass against an empty stage and
 * prove nothing.
 *
 * Prop rendering is therefore covered where it is actually observable:
 * `story/props/compose.test.ts` asserts on the emitted markup, and
 * `stageGeometry.test.ts` asserts the placement maths and its round-trips.
 * Keep it that way rather than reintroducing tests here that look stronger
 * than they are.
 */
describe('StageEditor', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useStudioDraft.getState().reset();
  });

  it('renders without throwing', () => {
    expect(() => renderToString(<StageEditor frameIndex={0} onClose={() => {}} />)).not.toThrow();
  });

  it('does not throw when the frame index is out of range', () => {
    expect(() => renderToString(<StageEditor frameIndex={99} onClose={() => {}} />)).not.toThrow();
  });

  it('offers every library prop in the palette, plus upload', () => {
    const html = renderToString(<StageEditor frameIndex={0} onClose={() => {}} />);
    for (const def of Object.values(PROP_LIBRARY)) {
      expect(html).toContain(def.name);
    }
    expect(html).toContain('UPLOAD');
  });

  it('renders both views and the empty-selection hint', () => {
    const html = renderToString(<StageEditor frameIndex={0} onClose={() => {}} />);
    expect(html).toContain('CAMERA VIEW');
    expect(html).toContain('TOP-DOWN MAP');
    expect(html).toContain('tap a placed prop to edit it');
  });

  it('renders a palette thumbnail for every prop without throwing on any builder', () => {
    const html = renderToString(<StageEditor frameIndex={0} onClose={() => {}} />);
    const thumbs = html.match(/data:image\/svg\+xml/g) ?? [];
    // One per library prop, plus the camera view's composed preview.
    expect(thumbs.length).toBeGreaterThanOrEqual(Object.keys(PROP_LIBRARY).length);
  });
});
