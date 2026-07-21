/**
 * svgPreview.ts — turning an SVG document string into something an <img> can
 * show inside the studio.
 *
 * Deliberately mirrors how the viewer rasterizes art (svgTexture.ts): the same
 * data:-URL encoding, so what the studio previews is subject to the same
 * restrictions as what ships. In particular, external references inside the SVG
 * will not load in either place — which is exactly the behaviour an author
 * needs to see while composing.
 */

/**
 * Encodes an SVG document string as a data: URL.
 *
 * Uses encodeURIComponent rather than btoa so non-Latin characters in the
 * markup cannot throw.
 *
 * @param svg — A complete `<svg …>…</svg>` string.
 * @returns A `data:image/svg+xml` URL usable as an <img> src.
 */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
