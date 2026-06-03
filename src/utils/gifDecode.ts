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

/** Decode all frames (with built image patches) into our DecodedFrame shape. */
export function decodeGifFrames(buffer: ArrayBuffer): DecodedFrame[] {
  const gif = parseGIF(buffer)
  const frames = decompressFrames(gif, true)
  return frames.map((f: ParsedFrame) => ({
    patch: f.patch,
    dims: f.dims,
    delayMs: f.delay,
    disposalType: f.disposalType,
  }))
}
