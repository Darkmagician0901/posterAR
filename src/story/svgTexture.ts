/**
 * svgTexture.ts — rasterize an SVG string into a three.js CanvasTexture.
 *
 * The era scenes are SVG (vector pixel-art). three.js can't map an SVG
 * directly, so we draw it once into a 2D canvas at a fixed raster size and
 * wrap that canvas in a CanvasTexture. The texture keeps transparency, so the
 * real ground shows through the art's gaps when the tile is laid flat.
 *
 * Mirrors the project's existing texture conventions: CanvasTexture,
 * SRGBColorSpace, and `needsUpdate` after the draw. Pure logic apart from the
 * Image/canvas browser APIs; resolves (never rejects) with a graceful 1×1
 * fallback so a malformed SVG can't break placement.
 */

import { CanvasTexture, SRGBColorSpace, Texture } from 'three';

/** Result of rasterizing an era scene. */
export interface EraTexture {
  /** The texture to map onto the diorama plane. */
  texture: Texture;
  /** height / width of the source art — used to size the plane. */
  aspect: number;
}

/** Source frame parsed from an SVG: width, height, and aspect (height/width). */
export interface SvgFrame {
  w: number
  h: number
  aspect: number
}

/** Longest-axis raster size in pixels. Pixel-art stays crisp; keep it modest. */
const RASTER_MAX = 1024;

/**
 * Parses width/height/aspect from an SVG's viewBox, falling back to a 660x350
 * frame when the viewBox is absent or malformed. Pure string logic (no DOM) so
 * it is unit-testable.
 *
 * @param svg — A complete `<svg …>…</svg>` string.
 * @returns The parsed `{ w, h, aspect }`.
 */
export function svgFrame(svg: string): SvgFrame {
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg)
  let w = 660
  let h = 350
  if (vb) {
    const parts = vb[1].trim().split(/\s+/).map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      w = parts[2]
      h = parts[3]
    }
  }
  return { w, h, aspect: h / w }
}

/**
 * Rasterizes an SVG document string to a CanvasTexture.
 *
 * @param svg — A complete `<svg …>…</svg>` string with a viewBox.
 * @returns A texture plus the art's aspect ratio. On any failure (decode,
 *   canvas), resolves with a transparent 1×1 texture and aspect 1 rather than
 *   rejecting, so the caller's placement path stays simple.
 */
export async function svgToTexture(svg: string): Promise<EraTexture> {
  // Pull width/height (or viewBox) to decide the raster dimensions + aspect.
  const { w, h, aspect } = svgFrame(svg)

  const scale = RASTER_MAX / Math.max(w, h);
  const pxW = Math.max(1, Math.round(w * scale));
  const pxH = Math.max(1, Math.round(h * scale));

  try {
    const img = await loadSvgImage(svg);
    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    // Keep pixel edges hard — these are pixel-art scenes.
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, pxW, pxH);
    ctx.drawImage(img, 0, 0, pxW, pxH);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return { texture, aspect };
  } catch {
    // Transparent 1×1 fallback so a bad SVG never throws into placement.
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return { texture, aspect: aspect || 1 };
  }
}

/**
 * Decodes an SVG string into an HTMLImageElement via a data: URL.
 *
 * Uses encodeURIComponent rather than btoa so non-Latin characters in the
 * markup can't throw, and avoids fetch entirely (works offline / under strict
 * CSP connect-src).
 *
 * @param svg — SVG document string.
 * @returns A decoded, ready-to-draw image.
 */
function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('SVG decode failed'));
    img.src = url;
  });
}
