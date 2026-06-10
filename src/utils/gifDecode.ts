/**
 * gifDecode.ts — thin adapter over gifuct-js.
 *
 * Isolates the third-party API behind a typed surface so the rest of the app
 * (and its tests) depend on our shapes, not gifuct-js internals.
 */

import { parseGIF, decompressFrames, type ParsedFrame } from 'gifuct-js'

export interface GifFrameRect {
  top: number
  left: number
  width: number
  height: number
}

export interface DecodedFrame {
  /** RGBA pixels for this frame's sub-rectangle (dims.width * dims.height * 4). */
  patch: Uint8ClampedArray
  /** Where the patch sits within the logical screen. */
  dims: GifFrameRect
  /** Per-frame delay in milliseconds (gifuct already converts to ms). */
  delayMs: number
  /** GIF disposal method (0/1 = leave, 2 = restore to background, 3 = restore previous). */
  disposalType: number
}

/** Read the GIF's logical screen size without decoding every frame. */
export function readGifSize(buffer: ArrayBuffer): { width: number; height: number } {
  const gif = parseGIF(buffer)
  return { width: gif.lsd.width, height: gif.lsd.height }
}

/**
 * Decoding expands every frame to RGBA, so a small file can declare huge
 * dimensions and explode in memory ("decode bomb") before any byte-budget
 * check can run. Refuse to decompress when the worst-case estimate (logical
 * screen × 4 bytes × frame count) exceeds this cap. It sits far above
 * ANIMATION_BYTE_BUDGET (64 MB), so a rejected GIF could never have animated
 * anyway — callers fall back to a static frame-0 texture.
 */
export const MAX_ESTIMATED_DECODE_BYTES = 1024 * 1024 * 1024 // 1 GiB

/** Decode all frames (with built image patches) into our DecodedFrame shape.
 *  Throws (before any frame is decompressed) when the declared size would
 *  exceed MAX_ESTIMATED_DECODE_BYTES. */
export function decodeGifFrames(buffer: ArrayBuffer): DecodedFrame[] {
  const gif = parseGIF(buffer)

  // gif.frames mixes image frames and extension blocks — count only images.
  const frameCount = gif.frames.filter((f) => 'image' in f).length
  const estimatedBytes = gif.lsd.width * gif.lsd.height * 4 * frameCount
  if (estimatedBytes > MAX_ESTIMATED_DECODE_BYTES) {
    throw new Error(
      `GIF too large to decode safely — ${gif.lsd.width}×${gif.lsd.height} × ` +
      `${frameCount} frames ≈ ${(estimatedBytes / 1048576).toFixed(0)} MB decoded`,
    )
  }

  const frames = decompressFrames(gif, true)
  return frames.map((f: ParsedFrame) => ({
    patch: f.patch,
    dims: f.dims,
    delayMs: f.delay,
    disposalType: f.disposalType,
  }))
}
