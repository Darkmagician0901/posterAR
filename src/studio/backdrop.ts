/**
 * backdrop.ts — treating a frame's existing art as a composition backdrop.
 *
 * The five bundled frames carry hand-authored `art` but no `props`, so opening
 * the stage editor on them composed nothing and showed an empty stage — and
 * saving overwrote the art with that emptiness. The fix is to carry the
 * existing art as a *backdrop*: a frozen layer drawn behind any staged props.
 *
 * The backdrop is inlined as an SVG fragment (the art with its <svg> wrapper
 * stripped), not embedded as a data: URL image. That keeps the composed result
 * a single flat SVG — the same shape the viewer already rasterizes — rather
 * than a nested SVG-in-SVG, which iOS Safari rasterizes unreliably.
 *
 * Pure string logic: no DOM, so it is safe to import anywhere and unit-testable.
 */

import { COMPOSE_DEFAULTS } from '@/story/props/compose';
import type { StoryFrame } from '@/story/storyDoc';

/** An SVG document split into its drawable inner markup and its dimensions. */
export interface ParsedSvg {
  /** Everything between the opening <svg …> and closing </svg>. */
  inner: string;
  /** viewBox width, or the composer default when absent. */
  width: number;
  /** viewBox height, or the composer default when absent. */
  height: number;
}

/** Rounds a scale factor for compact, non-lossy markup. */
function n(v: number): string {
  return Number(v.toFixed(4)).toString();
}

/**
 * Parses an SVG document string into its inner markup and viewBox size.
 *
 * @param doc — A complete `<svg …>…</svg>` string, or anything that is not one.
 * @returns The inner markup (empty when unparseable) and the viewBox size
 *   (the composer defaults when there is no `viewBox`).
 */
export function parseSvgDoc(doc: string): ParsedSvg {
  const open = doc.indexOf('<svg');
  const close = doc.lastIndexOf('</svg>');
  let inner = '';
  if (open !== -1 && close !== -1) {
    const openEnd = doc.indexOf('>', open);
    if (openEnd !== -1 && openEnd < close) inner = doc.slice(openEnd + 1, close);
  }

  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(doc);
  const width = viewBox ? Number(viewBox[1]) : COMPOSE_DEFAULTS.width;
  const height = viewBox ? Number(viewBox[2]) : COMPOSE_DEFAULTS.height;

  return { inner, width, height };
}

/**
 * Wraps backdrop markup so it fills a target composition size.
 *
 * @param inner — The backdrop's inner SVG markup.
 * @param fromW — The markup's native width.
 * @param fromH — The markup's native height.
 * @param toW — The composition width to fill.
 * @param toH — The composition height to fill.
 * @returns The markup, wrapped in a scale transform only when a resize is
 *   needed. Empty markup stays empty.
 */
export function scaledBackdrop(
  inner: string,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): string {
  if (inner === '') return '';
  if (fromW === toW && fromH === toH) return inner;
  return `<g transform="scale(${n(toW / fromW)},${n(toH / fromH)})">${inner}</g>`;
}

/**
 * Resolves the backdrop art for a frame in the stage editor.
 *
 * Prefers a stored backdrop (set once the frame has been staged) and otherwise
 * falls back to the frame's own art, so a legacy frame that has never been
 * edited still shows its hand-authored scene behind the props.
 *
 * A frame that already carries props is the exception: its art was composed
 * *from* those props, so treating it as a backdrop would paint every object
 * twice — once in the frozen layer, once as the prop drawn over it — and saving
 * would then bake that doubling in permanently. Such a frame needs no backdrop,
 * because its art is regenerable from its props.
 *
 * @param frame — The frame being staged.
 * @returns The backdrop document string, or empty when the frame has no art or
 *   composes its own.
 */
export function deriveBackdrop(frame: StoryFrame): string {
  if (typeof frame.backdrop === 'string' && frame.backdrop !== '') return frame.backdrop;
  if (Array.isArray(frame.props) && frame.props.length > 0) return '';
  return frame.art.includes('<svg') ? frame.art : '';
}
