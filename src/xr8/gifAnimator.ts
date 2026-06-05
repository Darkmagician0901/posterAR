/**
 * gifAnimator.ts — turn an image URL into a three.js poster texture.
 *
 * GIFs are decoded with gifuct-js, composited frame-by-frame onto a
 * dimension-capped canvas, and exposed as a self-updating CanvasTexture driven
 * by GifPlayhead. Every other format falls back to a static TextureLoader
 * texture (animator === null).
 */

import {
  CanvasTexture,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three'

import { DecodedFrame, decodeGifFrames, readGifSize } from '@/utils/gifDecode'
import { GifPlayhead } from '@/xr8/gifPlayhead'
import { MAX_IMAGE_DIMENSION } from '@/utils/imageUpload'

/** Minimal interface PosterPlacement / ARExperience depend on. */
export interface PosterAnimator {
  /** Advance playback by `deltaMs`; re-blits + flags the texture if the frame changed. */
  update(deltaMs: number): void
  /** Release the canvas + texture. */
  dispose(): void
}

export interface PosterTexture {
  texture: Texture
  animator: PosterAnimator | null
  /** height / width of the source image. */
  aspect: number
  /** Set when the GIF could not animate and we fell back to a static frame-0 texture. */
  fallbackReason?: string
}

const isGifUrl = (url: string): boolean =>
  url.startsWith('data:image/gif') || /\.gif($|\?)/i.test(url)

const fitWithin = (w: number, h: number, max: number): { w: number; h: number } => {
  const longest = Math.max(w, h)
  if (longest <= max) return { w, h }
  const s = max / longest
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) }
}

class GifAnimator implements PosterAnimator {
  private readonly playhead: GifPlayhead
  private readonly frames: DecodedFrame[]
  private readonly texture: CanvasTexture
  // Full-size compositing surface (logical GIF coordinates).
  private readonly frameCanvas: HTMLCanvasElement
  private readonly frameCtx: CanvasRenderingContext2D
  // Scratch canvas for putImageData of a single patch.
  private readonly patchCanvas: HTMLCanvasElement
  private readonly patchCtx: CanvasRenderingContext2D
  // Display surface (capped) — the CanvasTexture source.
  private readonly displayCanvas: HTMLCanvasElement
  private readonly displayCtx: CanvasRenderingContext2D
  private readonly gifW: number
  private readonly gifH: number
  private compositedIndex = -1
  private prevDisposal = 0
  private prevRect: DecodedFrame['dims'] | null = null

  constructor(frames: DecodedFrame[], gifW: number, gifH: number) {
    this.frames = frames
    this.gifW = gifW
    this.gifH = gifH
    this.playhead = new GifPlayhead(frames.map((f) => f.delayMs))

    this.frameCanvas = document.createElement('canvas')
    this.frameCanvas.width = gifW
    this.frameCanvas.height = gifH
    this.frameCtx = this.frameCanvas.getContext('2d')!

    this.patchCanvas = document.createElement('canvas')
    this.patchCtx = this.patchCanvas.getContext('2d')!

    const capped = fitWithin(gifW, gifH, MAX_IMAGE_DIMENSION)
    this.displayCanvas = document.createElement('canvas')
    this.displayCanvas.width = capped.w
    this.displayCanvas.height = capped.h
    this.displayCtx = this.displayCanvas.getContext('2d')!

    this.texture = new CanvasTexture(this.displayCanvas)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.anisotropy = 4

    this.seekTo(0)
  }

  get canvasTexture(): CanvasTexture {
    return this.texture
  }

  update(deltaMs: number): void {
    if (this.playhead.advance(deltaMs)) {
      this.seekTo(this.playhead.frameIndex)
    }
  }

  dispose(): void {
    this.texture.dispose()
    this.frameCanvas.width = this.frameCanvas.height = 0
    this.displayCanvas.width = this.displayCanvas.height = 0
    this.patchCanvas.width = this.patchCanvas.height = 0
  }

  /** Composite forward one frame at a time until `target` is shown. */
  private seekTo(target: number): void {
    if (target === this.compositedIndex) return
    // Walk forward (wrapping) so each frame's delta is applied in order.
    let i = this.compositedIndex
    let guard = this.frames.length + 1
    do {
      i = (i + 1) % this.frames.length
      this.applyFrame(i)
      guard--
    } while (i !== target && guard > 0)
    this.compositedIndex = target
    this.blitToDisplay()
    this.texture.needsUpdate = true
  }

  private applyFrame(i: number): void {
    const frame = this.frames[i]

    // Disposal handling for the *previous* frame before drawing this one.
    if (i === 0) {
      // Fresh loop — start from a clean surface.
      this.frameCtx.clearRect(0, 0, this.gifW, this.gifH)
    } else if (this.prevDisposal === 2 && this.prevRect) {
      this.frameCtx.clearRect(
        this.prevRect.left,
        this.prevRect.top,
        this.prevRect.width,
        this.prevRect.height,
      )
    }
    // (disposalType 3 "restore to previous" is rare; treated like leave-as-is.)

    this.patchCanvas.width = frame.dims.width
    this.patchCanvas.height = frame.dims.height
    // gifuct-js types patch as Uint8ClampedArray<ArrayBufferLike> which includes
    // SharedArrayBuffer — ImageData requires the plain-ArrayBuffer overload.
    // Copying via Uint8ClampedArray constructor guarantees a fresh ArrayBuffer.
    const patchData = new Uint8ClampedArray(frame.patch) as unknown as Uint8ClampedArray<ArrayBuffer>
    const imageData = new ImageData(patchData, frame.dims.width, frame.dims.height)
    this.patchCtx.putImageData(imageData, 0, 0)
    this.frameCtx.drawImage(this.patchCanvas, frame.dims.left, frame.dims.top)

    this.prevDisposal = frame.disposalType
    this.prevRect = frame.dims
  }

  private blitToDisplay(): void {
    this.displayCtx.clearRect(0, 0, this.displayCanvas.width, this.displayCanvas.height)
    this.displayCtx.drawImage(
      this.frameCanvas,
      0, 0, this.gifW, this.gifH,
      0, 0, this.displayCanvas.width, this.displayCanvas.height,
    )
  }
}

/**
 * Decode a base64 data: URL to an ArrayBuffer WITHOUT fetch(). iOS Safari can
 * reject or stall on fetch() of large (~10 MB) data URLs — atob is synchronous,
 * local, and what the old <img> path effectively relied on.
 */
export function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) throw new Error('malformed data URL')
  const meta = dataUrl.slice(0, comma)
  const payload = dataUrl.slice(comma + 1)
  if (meta.includes(';base64')) {
    const bin = atob(payload)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes.buffer
  }
  // Non-base64 (percent-encoded) data URL — rare for GIFs.
  const decoded = decodeURIComponent(payload)
  const bytes = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i)
  return bytes.buffer
}

/** Get GIF bytes: decode data: URLs locally; fetch only real network URLs. */
async function loadGifBuffer(url: string): Promise<ArrayBuffer> {
  if (url.startsWith('data:')) return dataUrlToArrayBuffer(url)
  const res = await fetch(url)
  return res.arrayBuffer()
}

const loadStaticTexture = (url: string): Promise<Texture> =>
  new Promise((resolve, reject) => {
    new TextureLoader().load(
      url,
      (tex) => {
        tex.anisotropy = 4
        resolve(tex)
      },
      undefined,
      (err) => reject(err instanceof Error ? err : new Error('Texture load failed')),
    )
  })

/**
 * Diagnostic: prefix the GIF-pipeline stage that threw onto the error message,
 * so a minified production stack (no source maps on-device) still localizes the
 * failure when it surfaces on the DebugHUD. Preserves the original stack.
 */
function stageError(stage: 'fetch' | 'decode' | 'composite', err: unknown): Error {
  const base = err instanceof Error ? err.message : String(err)
  const tagged = new Error(`[gif:${stage}] ${base}`)
  if (err instanceof Error && err.stack) tagged.stack = err.stack
  return tagged
}

function decodeGif(buffer: ArrayBuffer): {
  width: number
  height: number
  frames: DecodedFrame[]
} {
  try {
    const { width, height } = readGifSize(buffer)
    const frames = decodeGifFrames(buffer)
    return { width, height, frames }
  } catch (err) {
    throw stageError('decode', err)
  }
}

function makeAnimator(frames: DecodedFrame[], width: number, height: number): GifAnimator {
  try {
    return new GifAnimator(frames, width, height)
  } catch (err) {
    throw stageError('composite', err)
  }
}

/**
 * Build a poster texture from any supported URL. GIFs animate; everything else
 * is static. The caller owns disposal (PosterPlacement.remove handles it).
 */
export async function createPosterTexture(url: string): Promise<PosterTexture> {
  if (isGifUrl(url)) {
    try {
      const buffer = await loadGifBuffer(url).catch((err) => {
        throw stageError('fetch', err)
      })
      const { width, height, frames } = decodeGif(buffer)
      const aspect = height / Math.max(1, width)

      // Degenerate / single-frame GIF: fall back to static so we don't pay the
      // per-frame upload cost for nothing.
      if (frames.length <= 1 || width < 1 || height < 1) {
        const texture = await loadStaticTexture(url)
        return { texture, animator: null, aspect }
      }

      const animator = makeAnimator(frames, width, height)
      return { texture: animator.canvasTexture, animator, aspect }
    } catch (err) {
      // No-regret fallback: never do worse than the old static-frame-0 path.
      const reason = err instanceof Error ? err.message : String(err)
      const texture = await loadStaticTexture(url)
      const img = texture.image as { width?: number; naturalWidth?: number; height?: number; naturalHeight?: number }
      const w = img.naturalWidth ?? img.width ?? 1
      const h = img.naturalHeight ?? img.height ?? 1
      return { texture, animator: null, aspect: h / Math.max(1, w), fallbackReason: reason }
    }
  }

  const texture = await loadStaticTexture(url)
  const img = texture.image as { width?: number; naturalWidth?: number; height?: number; naturalHeight?: number }
  const w = img.naturalWidth ?? img.width ?? 1
  const h = img.naturalHeight ?? img.height ?? 1
  return { texture, animator: null, aspect: h / Math.max(1, w) }
}
