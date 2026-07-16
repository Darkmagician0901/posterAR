/**
 * gifAnimator.ts — turn an image URL into a three.js poster texture.
 *
 * GIFs are decoded with gifuct-js, composited frame-by-frame onto a
 * dimension-capped canvas, and exposed as a self-updating CanvasTexture driven
 * by GifPlayhead. Every other format falls back to a static TextureLoader
 * texture (animator === null).
 */

import { CanvasTexture, SRGBColorSpace, Texture, TextureLoader } from 'three';

import { DecodedFrame, decodeGifFrames, readGifSize } from '@/utils/gifDecode';
import { GifPlayhead } from '@/xr8/gifPlayhead';
import { MAX_IMAGE_DIMENSION } from '@/utils/imageUpload';

/** Minimal interface PosterPlacement / ARExperience depend on. */
export interface PosterAnimator {
  /**
   * Advances playback. If the visible frame changed, redraws the canvas and
   * flags the texture so three.js re-uploads it to the GPU.
   *
   * @param deltaMs — Milliseconds elapsed since the previous frame.
   */
  update(deltaMs: number): void;
  /** Releases the canvases and the GPU texture. Call exactly once. */
  dispose(): void;
}

/** Result of createPosterTexture: a texture plus animation metadata. */
export interface PosterTexture {
  /** The three.js texture to map onto the poster mesh. */
  texture: Texture;
  /** Per-frame animator for animated GIFs; null for static textures. */
  animator: PosterAnimator | null;
  /** height / width of the source image. */
  aspect: number;
  /** Set when the GIF could not animate and we fell back to a static frame-0 texture. */
  fallbackReason?: string;
  /**
   * Bytes of decoded RGBA frame data held in memory by this animator.
   * 0 for static textures and budget-exceeded fallbacks.
   */
  decodedBytes: number;
}

/**
 * Detects whether a URL points at a GIF (data: URL MIME type or .gif suffix).
 *
 * @param url — Image URL (data: or network).
 * @returns True when the URL should go through the GIF decode path.
 */
const isGifUrl = (url: string): boolean =>
  url.startsWith('data:image/gif') || /\.gif($|\?)/i.test(url);

/**
 * Shrinks a width/height pair to fit inside `max` on its longest side while
 * keeping the aspect ratio. Dimensions already within the cap pass through
 * unchanged; results are rounded and never below 1 px.
 *
 * @param w — Source width in pixels.
 * @param h — Source height in pixels.
 * @param max — Maximum allowed size of the longest side, in pixels.
 * @returns The (possibly scaled-down) width and height.
 */
const fitWithin = (w: number, h: number, max: number): { w: number; h: number } => {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const s = max / longest;
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
};

/**
 * Plays a decoded GIF into a three.js CanvasTexture.
 *
 * GIF frames are usually stored as small "patches" — only the rectangle of
 * pixels that changed since the previous frame. So to show frame N we must
 * composite: draw frame patches on top of each other, in order, on a
 * persistent canvas. This class owns that canvas plus a GifPlayhead (the
 * timing state machine that decides which frame should be visible) and
 * re-composites whenever the playhead moves.
 *
 * Three canvases are involved:
 *   - frameCanvas: full-size compositing surface in GIF pixel coordinates.
 *   - patchCanvas: scratch surface used to convert one frame's raw RGBA
 *     patch bytes into something drawImage can draw.
 *   - displayCanvas: the dimension-capped surface that actually backs the
 *     CanvasTexture (kept small so the GPU upload stays cheap).
 */
class GifAnimator implements PosterAnimator {
  private readonly playhead: GifPlayhead;
  private readonly frames: DecodedFrame[];
  private readonly texture: CanvasTexture;
  // Full-size compositing surface (logical GIF coordinates).
  private readonly frameCanvas: HTMLCanvasElement;
  private readonly frameCtx: CanvasRenderingContext2D;
  // Scratch canvas for putImageData of a single patch.
  private readonly patchCanvas: HTMLCanvasElement;
  private readonly patchCtx: CanvasRenderingContext2D;
  // Display surface (capped) — the CanvasTexture source.
  private readonly displayCanvas: HTMLCanvasElement;
  private readonly displayCtx: CanvasRenderingContext2D;
  private readonly gifW: number;
  private readonly gifH: number;
  /** Index of the frame currently composited onto frameCanvas (-1 = none). */
  private compositedIndex = -1;
  /** Disposal method of the previously drawn frame (see applyFrame). */
  private prevDisposal = 0;
  /** Patch rectangle of the previously drawn frame (for disposal 2). */
  private prevRect: DecodedFrame['dims'] | null = null;

  /**
   * Builds the canvases, seeks to frame 0, and creates the CanvasTexture.
   *
   * @param frames — Decoded GIF frames (patch pixels, geometry, timing) in
   *   playback order. Must contain at least one frame.
   * @param gifW — Logical GIF width in pixels (from the GIF header).
   * @param gifH — Logical GIF height in pixels (from the GIF header).
   */
  constructor(frames: DecodedFrame[], gifW: number, gifH: number) {
    this.frames = frames;
    this.gifW = gifW;
    this.gifH = gifH;
    this.playhead = new GifPlayhead(frames.map((f) => f.delayMs));

    this.frameCanvas = document.createElement('canvas');
    this.frameCanvas.width = gifW;
    this.frameCanvas.height = gifH;
    this.frameCtx = this.frameCanvas.getContext('2d')!;

    this.patchCanvas = document.createElement('canvas');
    this.patchCtx = this.patchCanvas.getContext('2d')!;

    const capped = fitWithin(gifW, gifH, MAX_IMAGE_DIMENSION);
    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.width = capped.w;
    this.displayCanvas.height = capped.h;
    this.displayCtx = this.displayCanvas.getContext('2d')!;

    this.texture = new CanvasTexture(this.displayCanvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.seekTo(0);
  }

  /** The self-updating texture to map onto the poster mesh. */
  get canvasTexture(): CanvasTexture {
    return this.texture;
  }

  /**
   * Advances playback; re-composites only when the visible frame changes.
   *
   * @param deltaMs — Milliseconds elapsed since the previous frame.
   */
  update(deltaMs: number): void {
    if (this.playhead.advance(deltaMs)) {
      this.seekTo(this.playhead.frameIndex);
    }
  }

  /**
   * Frees the GPU texture and the canvas memory. Setting a canvas's width
   * and height to 0 is the standard way to make the browser release its
   * pixel buffer immediately instead of waiting for garbage collection.
   */
  dispose(): void {
    this.texture.dispose();
    this.frameCanvas.width = this.frameCanvas.height = 0;
    this.displayCanvas.width = this.displayCanvas.height = 0;
    this.patchCanvas.width = this.patchCanvas.height = 0;
  }

  /**
   * Composites forward one frame at a time until `target` is shown.
   *
   * Because each GIF frame may be only a delta on top of the previous one,
   * we cannot jump straight to an arbitrary frame — every intermediate frame
   * must be applied in order.
   *
   * @param target — Index of the frame that should end up visible.
   */
  private seekTo(target: number): void {
    if (target === this.compositedIndex) return;
    // Walk forward (wrapping past the last frame back to 0) so each frame's
    // delta is applied in order. `guard` caps the loop at one full cycle in
    // case `target` is somehow unreachable.
    let i = this.compositedIndex;
    let guard = this.frames.length + 1;
    do {
      i = (i + 1) % this.frames.length;
      this.applyFrame(i);
      guard--;
    } while (i !== target && guard > 0);
    this.compositedIndex = target;
    this.blitToDisplay();
    this.texture.needsUpdate = true;
  }

  /**
   * Draws frame `i` onto the compositing canvas, honouring the previous
   * frame's disposal method.
   *
   * A GIF "disposal method" is per-frame metadata telling the decoder what
   * to do with the frame's area before drawing the NEXT frame: 0/1 = leave
   * the pixels in place, 2 = clear the area back to transparent, 3 = restore
   * whatever was there before the frame (rare).
   *
   * @param i — Index of the frame to draw.
   */
  private applyFrame(i: number): void {
    const frame = this.frames[i];

    // Disposal handling for the *previous* frame before drawing this one.
    if (i === 0) {
      // Fresh loop — start from a clean surface.
      this.frameCtx.clearRect(0, 0, this.gifW, this.gifH);
    } else if (this.prevDisposal === 2 && this.prevRect) {
      this.frameCtx.clearRect(
        this.prevRect.left,
        this.prevRect.top,
        this.prevRect.width,
        this.prevRect.height,
      );
    }
    // (disposalType 3 "restore to previous" is rare; treated like leave-as-is.)

    // Convert the frame's raw RGBA byte patch into pixels: putImageData
    // writes the bytes onto the scratch canvas, then drawImage stamps that
    // scratch canvas onto the compositing canvas at the patch's offset.
    this.patchCanvas.width = frame.dims.width;
    this.patchCanvas.height = frame.dims.height;
    // gifuct-js types patch as Uint8ClampedArray<ArrayBufferLike> which includes
    // SharedArrayBuffer — ImageData requires the plain-ArrayBuffer overload.
    // Copying via Uint8ClampedArray constructor guarantees a fresh ArrayBuffer.
    const patchData = new Uint8ClampedArray(
      frame.patch,
    ) as unknown as Uint8ClampedArray<ArrayBuffer>;
    const imageData = new ImageData(patchData, frame.dims.width, frame.dims.height);
    this.patchCtx.putImageData(imageData, 0, 0);
    this.frameCtx.drawImage(this.patchCanvas, frame.dims.left, frame.dims.top);

    this.prevDisposal = frame.disposalType;
    this.prevRect = frame.dims;
  }

  /**
   * Copies ("blits") the full-size composited frame onto the dimension-capped
   * display canvas, scaling down if needed. The display canvas is what the
   * CanvasTexture uploads to the GPU.
   */
  private blitToDisplay(): void {
    this.displayCtx.clearRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
    this.displayCtx.drawImage(
      this.frameCanvas,
      0,
      0,
      this.gifW,
      this.gifH,
      0,
      0,
      this.displayCanvas.width,
      this.displayCanvas.height,
    );
  }
}

/**
 * Decodes a base64 data: URL to an ArrayBuffer WITHOUT fetch(). iOS Safari can
 * reject or stall on fetch() of large (~10 MB) data URLs — atob is synchronous,
 * local, and what the old <img> path effectively relied on.
 *
 * @param dataUrl — A `data:` URL, base64-encoded or percent-encoded.
 * @returns The raw decoded bytes.
 * @throws Error('malformed data URL') when the URL has no comma separating
 *   the metadata from the payload.
 */
export function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) throw new Error('malformed data URL');
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (meta.includes(';base64')) {
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  // Non-base64 (percent-encoded) data URL — rare for GIFs.
  const decoded = decodeURIComponent(payload);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Gets the raw GIF bytes: decodes data: URLs locally (see
 * dataUrlToArrayBuffer); only real network URLs go through fetch().
 *
 * @param url — GIF URL (data: or network).
 * @returns The GIF file bytes.
 * @throws Rejects on network failure, or throws on a malformed data URL.
 */
async function loadGifBuffer(url: string): Promise<ArrayBuffer> {
  if (url.startsWith('data:')) return dataUrlToArrayBuffer(url);
  const res = await fetch(url);
  return res.arrayBuffer();
}

/**
 * Loads a static (non-animated) texture via three.js TextureLoader.
 *
 * @param url — Image URL (data: or network).
 * @returns Resolves with the loaded texture (anisotropy preset to 4).
 * @throws Rejects with an Error when the browser fails to load the image.
 */
const loadStaticTexture = (url: string): Promise<Texture> =>
  new Promise((resolve, reject) => {
    new TextureLoader().load(
      url,
      (tex) => {
        tex.anisotropy = 4;
        resolve(tex);
      },
      undefined,
      (err) => reject(err instanceof Error ? err : new Error('Texture load failed')),
    );
  });

/**
 * Diagnostic: prefixes the GIF-pipeline stage that threw onto the error
 * message, so a minified production stack (no source maps on-device) still
 * localizes the failure when it surfaces on the DebugHUD.
 *
 * @param stage — Pipeline stage that failed ('fetch' | 'decode' | 'composite').
 * @param err — The original thrown value (Error or otherwise).
 * @returns A new Error tagged `[gif:<stage>]`, preserving the original stack.
 */
function stageError(stage: 'fetch' | 'decode' | 'composite', err: unknown): Error {
  const base = err instanceof Error ? err.message : String(err);
  const tagged = new Error(`[gif:${stage}] ${base}`);
  if (err instanceof Error && err.stack) tagged.stack = err.stack;
  return tagged;
}

/**
 * Decodes a GIF buffer into its logical size and per-frame patches.
 *
 * @param buffer — Raw GIF file bytes.
 * @returns The GIF's width, height, and decoded frames.
 * @throws An Error tagged `[gif:decode]` when the buffer is not a valid GIF
 *   or decoding fails.
 */
function decodeGif(buffer: ArrayBuffer): {
  width: number;
  height: number;
  frames: DecodedFrame[];
} {
  try {
    const { width, height } = readGifSize(buffer);
    const frames = decodeGifFrames(buffer);
    return { width, height, frames };
  } catch (err) {
    throw stageError('decode', err);
  }
}

/**
 * Constructs a GifAnimator, re-tagging any construction failure.
 *
 * @param frames — Decoded GIF frames in playback order.
 * @param width — Logical GIF width in pixels.
 * @param height — Logical GIF height in pixels.
 * @returns The ready-to-tick animator (already showing frame 0).
 * @throws An Error tagged `[gif:composite]` when canvas creation or the
 *   initial composite fails (e.g. canvas size limits on the device).
 */
function makeAnimator(frames: DecodedFrame[], width: number, height: number): GifAnimator {
  try {
    return new GifAnimator(frames, width, height);
  } catch (err) {
    throw stageError('composite', err);
  }
}

/**
 * Builds a poster texture from any supported URL. GIFs animate; everything
 * else is static. If anything in the GIF path fails, we degrade to a static
 * frame-0 texture (with `fallbackReason` set) rather than failing the
 * placement. The caller owns disposal (PosterPlacement.remove handles it).
 *
 * @param url — Image URL (data: or network), GIF or otherwise.
 * @param opts — Optional settings. `opts.animationByteBudget`: when provided,
 *   animated GIFs whose decoded frames exceed this number of bytes are
 *   silently demoted to a static frame-0 texture instead, saving memory.
 *   Pass the *remaining* budget from the global cap.
 * @returns The texture, its animator (null when static), the image aspect
 *   ratio, the decoded-byte count charged against the budget, and the
 *   fallback reason when a GIF could not animate.
 * @throws Rejects only when even the static-texture load fails (e.g. the URL
 *   is not a loadable image at all).
 */
export async function createPosterTexture(
  url: string,
  opts?: { animationByteBudget?: number },
): Promise<PosterTexture> {
  if (isGifUrl(url)) {
    try {
      const buffer = await loadGifBuffer(url).catch((err) => {
        throw stageError('fetch', err);
      });
      const { width, height, frames } = decodeGif(buffer);
      const aspect = height / Math.max(1, width);

      // Single-frame or zero-sized GIF: nothing to animate, so fall back to a
      // plain static texture rather than paying the per-frame GPU upload cost
      // of a CanvasTexture for nothing.
      if (frames.length <= 1 || width < 1 || height < 1) {
        const texture = await loadStaticTexture(url);
        return { texture, animator: null, aspect, decodedBytes: 0 };
      }

      // Compute how many bytes this animation would hold in memory.
      const bytes = frames.reduce((s, f) => s + f.patch.byteLength, 0);

      // Budget guard: if remaining budget is specified and this GIF would exceed
      // it, degrade to a static frame-0 to stay within the memory cap.
      if (opts?.animationByteBudget !== undefined && bytes > opts.animationByteBudget) {
        const texture = await loadStaticTexture(url);
        const img = texture.image as {
          width?: number;
          naturalWidth?: number;
          height?: number;
          naturalHeight?: number;
        };
        const w = img.naturalWidth ?? img.width ?? 1;
        const h = img.naturalHeight ?? img.height ?? 1;
        const fallbackReason = `memory budget — ${(bytes / 1048576).toFixed(0)}MB GIF exceeds remaining cap`;
        return {
          texture,
          animator: null,
          aspect: h / Math.max(1, w),
          fallbackReason,
          decodedBytes: 0,
        };
      }

      const animator = makeAnimator(frames, width, height);
      return { texture: animator.canvasTexture, animator, aspect, decodedBytes: bytes };
    } catch (err) {
      // No-regret fallback: never do worse than the old static-frame-0 path.
      const reason = err instanceof Error ? err.message : String(err);
      const texture = await loadStaticTexture(url);
      const img = texture.image as {
        width?: number;
        naturalWidth?: number;
        height?: number;
        naturalHeight?: number;
      };
      const w = img.naturalWidth ?? img.width ?? 1;
      const h = img.naturalHeight ?? img.height ?? 1;
      return {
        texture,
        animator: null,
        aspect: h / Math.max(1, w),
        fallbackReason: reason,
        decodedBytes: 0,
      };
    }
  }

  const texture = await loadStaticTexture(url);
  const img = texture.image as {
    width?: number;
    naturalWidth?: number;
    height?: number;
    naturalHeight?: number;
  };
  const w = img.naturalWidth ?? img.width ?? 1;
  const h = img.naturalHeight ?? img.height ?? 1;
  return { texture, animator: null, aspect: h / Math.max(1, w), decodedBytes: 0 };
}
