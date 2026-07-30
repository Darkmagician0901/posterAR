/**
 * assetGuard.ts — what may be composed into frame art.
 *
 * Composed art is rasterized into a single CanvasTexture, so a GIF placed in a
 * frame — animated or not — would render as one still and nothing else, with
 * no error. Rather than let that surprise an author, every GIF is refused at
 * upload with an explanation.
 *
 * Also: story-asset storage only ever writes and reads `full.webp` (see
 * `api/story-assets.ts`), so a GIF has nowhere valid to land regardless of
 * frame count. Refusing here keeps this guard the single place that decides
 * "is this composable", rather than splitting that decision between here and
 * the upload allowlist.
 *
 * This restricts COMPOSED FRAME ASSETS only. The poster path's GIF pipeline
 * (gifDecode → gifPlayhead → gifAnimator) is a different render path and is
 * unaffected.
 */

/** Whether a file may be placed into a frame, and why not if it may not. */
export type ComposableCheck = { ok: true } | { ok: false; reason: string };

/**
 * Decides whether an uploaded file can be composed into frame art.
 *
 * @param mimeType — The processed payload's MIME type.
 * @returns `{ ok: true }`, or a refusal carrying a message to show the author.
 */
export function checkComposable(mimeType: string): ComposableCheck {
  if (mimeType !== 'image/gif') return { ok: true };

  return {
    ok: false,
    reason:
      'GIFs cannot be placed in a frame — frame art is drawn as a single still image, so a GIF ' +
      'gains nothing over PNG or JPEG, and an animated one would show only its first frame. ' +
      'Use a PNG or JPEG instead.',
  };
}
