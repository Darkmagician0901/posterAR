/**
 * phoneScene.ts — the phone preview's perspective scene, as an SVG string.
 *
 * Ported from v4's renderPhone (docs/prototypes/arcade-studio-v4.html:926-980).
 * Draws sky, a gently-parallaxing skyline, horizon haze, the converging ground
 * grid, the frame's painted backdrop standing at the back, then the staged props
 * far -> near with contact shadows and distance fade. The v4 marker is not drawn
 * — this build places by tap.
 *
 * Structure note: the 2026-07-22 spec put SVG assembly inside PhonePreview; it
 * lives here instead so the scene is unit-testable per CLAUDE.md and the
 * component stays thin — mirroring the existing compose.ts / backdrop.ts pattern.
 *
 * Pure string logic (no DOM).
 */

import type { StoryFrame } from '@/story/storyDoc';
import { PROP_LIBRARY } from '@/story/props/library';
import { MESH_DEF } from '@/story/props/builders';
import type { ComposedImage } from '@/story/props/compose';
import { deriveBackdrop, parseSvgDoc, scaledBackdrop } from './backdrop';
import { CAMERA, VIEW, GROUND, project, groundGrid } from './perspective';

const HORIZON = Math.round(VIEW.h * CAMERA.horizonRatio);
/** Far-plane depth, setting the skyline/backdrop parallax rate (matches v4's CAMZ). */
const FAR = CAMERA.nearM + GROUND.zMax;

const n = (v: number): string => Number(v.toFixed(1)).toString();
const escapeAttr = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Sky gradient + horizon-haze defs (verbatim palette from renderPhone). */
function defs(): string {
  return (
    '<defs>' +
    '<linearGradient id="camsky" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#8fb2c9"/><stop offset=".42" stop-color="#a9c4b8"/>' +
    '<stop offset=".6" stop-color="#7e9a6b"/><stop offset="1" stop-color="#3f5530"/>' +
    '</linearGradient>' +
    '<linearGradient id="hazeg" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#eaf2ea" stop-opacity="0"/>' +
    '<stop offset="1" stop-color="#eaf2ea" stop-opacity=".5"/></linearGradient>' +
    '</defs>'
  );
}

/** Sky, distant skyline silhouette (parallaxes gently), horizon haze, ground. */
function sky(pan: number): string {
  const sx = (-pan * CAMERA.focal) / FAR;
  const bars = [
    [6, 26, 10],
    [40, 18, 22],
    [78, 30, 14],
    [130, 22, 18],
    [186, 34, 12],
    [232, 20, 20],
    [268, 28, 16],
  ];
  const domes = [
    [26, 9],
    [110, 12],
    [160, 8],
    [214, 11],
    [290, 10],
  ];
  let s = `<rect width="${VIEW.w}" height="${VIEW.h}" fill="url(#camsky)"/>`;
  s += `<g opacity=".15" fill="#16210f" transform="translate(${n(sx)},0)">`;
  s += `<rect x="-40" y="${HORIZON - 13}" width="${VIEW.w + 80}" height="13"/>`;
  bars.forEach((b) => (s += `<rect x="${b[0]}" y="${HORIZON - 13 - b[1]}" width="${b[2]}" height="${b[1]}"/>`));
  domes.forEach((t) => (s += `<circle cx="${t[0]}" cy="${HORIZON - 15}" r="${t[1]}"/>`));
  s += '</g>';
  s += `<rect x="0" y="${HORIZON - 28}" width="${VIEW.w}" height="56" fill="url(#hazeg)" opacity=".85"/>`;
  s += `<rect x="0" y="${HORIZON}" width="${VIEW.w}" height="${VIEW.h - HORIZON}" fill="#3f5530" opacity=".16"/>`;
  return s;
}

/** The frame's painted art, standing on the ground as a flat billboard at the back. */
function backdrop(frame: StoryFrame, pan: number): string {
  const parsed = parseSvgDoc(deriveBackdrop(frame));
  if (parsed.inner === '') return '';
  const zb = GROUND.zMax * 0.85;
  const base = project(0, 0, zb, pan);
  const wm = 6.0; // scene-metres wide; tuned live in Task 4
  const wpx = wm * base.k;
  const hpx = wpx * (parsed.height / parsed.width);
  const inner = scaledBackdrop(parsed.inner, parsed.width, parsed.height, wpx, hpx);
  return `<g opacity=".9" transform="translate(${n(base.x - wpx / 2)},${n(base.y - hpx)})">${inner}</g>`;
}

/** The converging ground grid. */
function grid(pan: number): string {
  let s = '<g stroke="#86C24E" fill="none">';
  for (const l of groundGrid(pan)) {
    s += `<line x1="${n(l.x1)}" y1="${n(l.y1)}" x2="${n(l.x2)}" y2="${n(l.y2)}" opacity="${l.opacity.toFixed(2)}"/>`;
  }
  return s + '</g>';
}

/** Staged props, far -> near, with contact shadow, distance fade, flip, and sway. */
function props(frame: StoryFrame, pan: number, images: Record<string, ComposedImage>): string {
  const list = frame.props ?? [];
  const placeable = list.filter((p) =>
    p.t === 'img' ? images[p.k] !== undefined : PROP_LIBRARY[p.k] !== undefined,
  );
  const ordered = [...placeable].sort((a, b) => b.z - a.z); // far -> near
  let s = '';
  ordered.forEach((p, i) => {
    const aspect =
      p.t === 'img' ? images[p.k].aspect : PROP_LIBRARY[p.k].bbox.w / PROP_LIBRARY[p.k].bbox.h;
    const B = project(p.x, p.e, p.z, pan);
    const G = project(p.x, 0, p.z, pan);
    const hpx = p.h * B.k;
    const wpx = hpx * aspect;
    const fade = Math.max(0.55, Math.min(1, 1.22 - B.d * 0.1));
    const mirror = p.f ? -1 : 1;
    s += `<ellipse cx="${n(G.x)}" cy="${n(G.y)}" rx="${n(wpx * 0.34)}" ry="${n(wpx * 0.07)}" fill="#101408" opacity="${(0.2 * fade).toFixed(2)}"/>`;
    let mark: string;
    if (p.t === 'img') {
      // The caller has already resolved this to a usable href — see
      // ComposedImage.
      const src = images[p.k].href;
      mark = `<image href="${escapeAttr(src)}" x="${n(-wpx / 2)}" y="${n(-hpx)}" width="${n(wpx)}" height="${n(hpx)}"/>`;
    } else {
      const { bbox, make } = PROP_LIBRARY[p.k];
      const sxk = wpx / bbox.w;
      const syk = hpx / bbox.h;
      mark = `<g transform="scale(${n(sxk)},${n(syk)}) translate(${n(-(bbox.x + bbox.w / 2))},${n(-(bbox.y + bbox.h))})">${make()}</g>`;
    }
    s +=
      `<g opacity="${fade.toFixed(2)}" transform="translate(${n(B.x)},${n(B.y)})">` +
      `<g class="sway-prop" style="animation-delay:${((i % 5) * 0.7).toFixed(1)}s">` +
      `<g transform="scale(${mirror},1)">${mark}</g></g></g>`;
  });
  return s;
}

/**
 * Builds the full perspective preview scene for a frame under a lateral pan.
 *
 * @param frame — The frame to draw.
 * @param pan — Lateral camera pan in metres (0 = visitor viewpoint).
 * @param images — Uploaded assets keyed by any `t:'img'` prop's `k`.
 */
export function phoneScene(
  frame: StoryFrame,
  pan: number,
  images: Record<string, ComposedImage>,
): string {
  const needsMesh = (frame.props ?? []).some((p) => p.t === 'lib' && PROP_LIBRARY[p.k]?.needsMesh);
  return (
    `<svg class="drift" viewBox="0 0 ${VIEW.w} ${VIEW.h}" xmlns="http://www.w3.org/2000/svg">` +
    defs() +
    (needsMesh ? MESH_DEF : '') +
    sky(pan) +
    backdrop(frame, pan) +
    grid(pan) +
    props(frame, pan, images) +
    '</svg>'
  );
}
