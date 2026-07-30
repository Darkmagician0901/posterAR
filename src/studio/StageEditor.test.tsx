import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { StageEditor, buildDisplayDerivative } from './StageEditor';
import { useStudioDraft } from './studioDraftStore';
import { PROP_LIBRARY } from '@/story/props/library';
import { downscaleToWebp } from '@/utils/imageUpload';
import { RASTER_LONGEST_AXIS } from '@/story/assetVariants';

// downscaleToWebp does real canvas encoding — not available in happy-dom, and
// not what these tests are pinning. What matters here is the WIRING: that
// buildDisplayDerivative decodes via createImageBitmap, calls downscaleToWebp
// with RASTER_LONGEST_AXIS, releases the bitmap, and never lets a decode or
// encode failure escape as a thrown error.
vi.mock('@/utils/imageUpload', async () => {
  const actual = await vi.importActual<typeof import('@/utils/imageUpload')>('@/utils/imageUpload');
  return { ...actual, downscaleToWebp: vi.fn() };
});

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

// This is the step onUpload calls before uploadStoryAsset — see task 4's
// "wire it up" fix. uploadStoryAsset's own handling of a provided/omitted
// derivative is covered in src/services/assetApi.test.ts; what's pinned here
// is that StageEditor actually produces one (or correctly doesn't) rather
// than the parameter sitting unused.
describe('buildDisplayDerivative', () => {
  const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(downscaleToWebp).mockReset();
  });

  it('generates and returns bytes for an oversized source', async () => {
    const bitmap = { close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    const derivativeBlob = new Blob([new Uint8Array([9, 9])], { type: 'image/webp' });
    vi.mocked(downscaleToWebp).mockResolvedValue(derivativeBlob);

    const result = await buildDisplayDerivative(blob());

    expect(result).toBe(derivativeBlob);
    // The cap has one home: RASTER_LONGEST_AXIS, not a repeated literal.
    expect(downscaleToWebp).toHaveBeenCalledWith(bitmap, RASTER_LONGEST_AXIS);
    // The bitmap is released once downscaleToWebp is done with it.
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  // downscaleToWebp returning null means "already within the cap" — the
  // normal case for a small image, not an error. uploadStoryAsset treats
  // this identically to no derivative being passed at all (see
  // assetApi.test.ts: "skips the derivative step entirely when none is
  // passed"), so together these pin that an undersized source still uploads
  // successfully, just without a derivative riding along.
  it('returns null for an undersized source instead of an error', async () => {
    const bitmap = { close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    vi.mocked(downscaleToWebp).mockResolvedValue(null);

    await expect(buildDisplayDerivative(blob())).resolves.toBeNull();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('swallows a decode failure — returns null rather than throwing', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('decode failed');
      }),
    );
    await expect(buildDisplayDerivative(blob())).resolves.toBeNull();
  });

  it('swallows a downscale failure — returns null rather than throwing', async () => {
    const bitmap = { close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    vi.mocked(downscaleToWebp).mockRejectedValue(new Error('encode failed'));

    await expect(buildDisplayDerivative(blob())).resolves.toBeNull();
    // Still released even though downscaleToWebp rejected.
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});
