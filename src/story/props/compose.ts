/**
 * compose.ts — turns a frame's staged props into one SVG document.
 *
 * This is the bridge between authoring and the viewer: the studio stages props
 * in scene metres, this composes them into exactly the kind of SVG string that
 * story/era/*.svg already holds, and the existing svgTexture -> storyTile path
 * renders it unchanged.
 *
 * The perspective model is ported from the prototype's renderStage
 * (docs/prototypes/arcade-studio-v4.html:825): props further back are drawn
 * smaller and higher up the frame, and are painted far-to-near so nearer props
 * overlap. Metres here are scene-fiction metres — the diorama tile is rendered
 * at a fixed real-world width (TILE_WIDTH_M), so `ppm` is an artistic framing
 * choice, not an AR scale.
 *
 * Pure string logic: no DOM, no measurement. Prop extents come from the
 * measured constants in library.ts.
 */

import { StoryProp } from '../storyDoc';
import { MESH_DEF } from './builders';
import { PROP_LIBRARY } from './library';

/** Composition frame defaults, matching the shipped era art's proportions. */
export const COMPOSE_DEFAULTS = {
  /** Document width in user units. */
  width: 330,
  /** Document height in user units. */
  height: 175,
  /** Ground line, measured from the top. */
  groundY: 141,
  /** Pixels per scene-metre at z = 0. */
  ppm: 30,
} as const;

export interface ComposeOptions {
  width?: number;
  height?: number;
  groundY?: number;
  ppm?: number;
  /**
   * Raw SVG fragment painted behind every prop — gradient washes, pools, sky.
   * The shipped scenes lean heavily on this; props alone do not reach their
   * density. Any <defs> it needs must be included in the fragment.
   */
  backdrop?: string;
}

/** Depth foreshortening: how much a prop shrinks per metre of depth. */
function depthScale(z: number): number {
  return 1 / (1 + 0.16 * Math.max(0, z));
}

/** Rounds to 2dp and strips a trailing zero, keeping the markup compact. */
function n(v: number): string {
  return Number(v.toFixed(2)).toString();
}

/**
 * Composes staged props into a complete SVG document.
 *
 * @param props — The frame's staged props. Unknown prop keys are skipped.
 * @param options — Frame geometry and an optional backdrop fragment.
 * @returns A complete `<svg …>…</svg>` string ready for svgToTexture.
 */
export function composeFrame(props: StoryProp[], options: ComposeOptions = {}): string {
  const width = options.width ?? COMPOSE_DEFAULTS.width;
  const height = options.height ?? COMPOSE_DEFAULTS.height;
  const groundY = options.groundY ?? COMPOSE_DEFAULTS.groundY;
  const ppm = options.ppm ?? COMPOSE_DEFAULTS.ppm;

  const cx = width / 2;
  const depthRise = ppm * 0.3;

  // Only library props render today; uploaded images arrive with the studio's
  // upload path and are skipped rather than drawn as a broken reference.
  const placeable = props.filter((p) => p.t === 'lib' && PROP_LIBRARY[p.k]);

  // Far to near, so nearer props overlap further ones.
  const ordered = [...placeable].sort((a, b) => b.z - a.z);

  const needsMesh = ordered.some((p) => PROP_LIBRARY[p.k].needsMesh);

  const parts: string[] = [];
  for (const p of ordered) {
    const def = PROP_LIBRARY[p.k];
    const { bbox } = def;
    const s = depthScale(p.z);
    const hpx = p.h * ppm * s;
    const wpx = hpx * (bbox.w / bbox.h);
    const lift = p.e * ppm * s;
    const bx = cx + p.x * ppm * s;
    const byGround = groundY - p.z * depthRise * s;
    const by = byGround - lift;

    // Contact shadow sits on the ground even when the prop is lifted, fading
    // as it rises.
    const shadowOpacity = (0.22 * s) / (1 + p.e * 0.8);
    parts.push(
      `<ellipse cx="${n(bx)}" cy="${n(byGround)}" rx="${n(wpx * 0.34)}" ry="${n(wpx * 0.075)}" fill="#101408" opacity="${n(shadowOpacity)}"/>`,
    );

    // Map the builder's natural bbox onto the target rect, anchored at its
    // bottom centre. A negative x-scale mirrors about that same anchor.
    const sx = (wpx / bbox.w) * (p.f ? -1 : 1);
    const sy = hpx / bbox.h;
    const ax = bbox.x + bbox.w / 2;
    const ay = bbox.y + bbox.h;
    parts.push(
      `<g transform="translate(${n(bx)},${n(by)}) scale(${n(sx)},${n(sy)}) translate(${n(-ax)},${n(-ay)})">${def.make()}</g>`,
    );
  }

  const defs = needsMesh ? MESH_DEF : '';
  const backdrop = options.backdrop ?? '';

  return (
    `<svg width="${width * 2}" height="${height * 2}" viewBox="0 0 ${width} ${height}" ` +
    `shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">` +
    defs +
    backdrop +
    parts.join('') +
    `</svg>`
  );
}
