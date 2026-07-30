/**
 * assetGuard.ts — what may be composed into frame art.
 *
 * Composed art is rasterized into a single CanvasTexture, so an animated GIF
 * placed in a frame would render as its first frame and nothing else — with no
 * error. Rather than let that surprise an author, it is refused at upload with
 * an explanation.
 *
 * This restricts COMPOSED FRAME ASSETS only. The poster path's GIF pipeline
 * (gifDecode → gifPlayhead → gifAnimator) is a different render path and is
 * unaffected.
 */

import { decodeGifFrames } from '@/utils/gifDecode';

/** Whether a file may be placed into a frame, and why not if it may not. */
export type ComposableCheck = { ok: true } | { ok: false; reason: string };

/**
 * Decides whether an uploaded file can be composed into frame art.
 *
 * @param mimeType — The processed payload's MIME type.
 * @param buffer — The payload bytes, needed to count GIF frames.
 * @returns `{ ok: true }`, or a refusal carrying a message to show the author.
 */
export function checkComposable(mimeType: string, buffer: ArrayBuffer): ComposableCheck {
  if (mimeType !== 'image/gif') return { ok: true };

  let frames: number;
  try {
    frames = decodeGifFrames(buffer).length;
  } catch {
    // Undecodable: refuse rather than assume it is a harmless still.
    return {
      ok: false,
      reason: 'That GIF could not be read. Try exporting it again, or use a PNG or JPEG instead.',
    };
  }

  if (frames > 1) {
    return {
      ok: false,
      reason:
        'Animated GIFs cannot be placed in a frame — frame art is drawn as a single still image, ' +
        'so only the first frame would ever show. Use a PNG or JPEG, or export one frame of the GIF.',
    };
  }

  return { ok: true };
}
