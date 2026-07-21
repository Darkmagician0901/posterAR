/**
 * builders.ts — pixel-art prop builders, ported from the ARCADE STUDIO
 * prototype (docs/prototypes/arcade-studio-v4.html:486-723).
 *
 * Each builder returns an SVG fragment string drawn into a 330x200 coordinate
 * space with the ground line at y=141 (GROUND_Y). They are pure string
 * functions — no DOM, no measurement — so both the studio's stage editor and
 * the publish-time composer can call them, and both are unit-testable.
 *
 * The output is deliberately byte-compatible with the prototype's, so art
 * composed here looks like the art the prototype previews.
 *
 * NOTE: the animation classes these emit (a-sway, a-absorb, a-digest, …) have
 * no keyframes defined and the viewer rasterizes once, so they are inert in AR
 * today. They are kept so the motion can be restored without regenerating art.
 * See docs/arcade-studio-plan.md.
 */

/** Ground baseline within the 330x200 builder coordinate space. */
export const GROUND_Y = 141;

/** Cross-hatch pattern used by the fence. Must be emitted once per document. */
export const MESH_DEF =
  '<defs><pattern id="mesh" width="11" height="11" patternUnits="userSpaceOnUse">' +
  '<path d="M0 0 L11 11 M11 0 L0 11" stroke="#c9cdb0" stroke-width="1" opacity=".42" fill="none"/>' +
  '</pattern></defs>';

/** A single leaf blade, angled `dir` (-1 left, 1 right) from a stem. */
function leaf(cx: number, y: number, dir: number, len: number): string {
  const x2 = cx + dir * len;
  const y2 = y - len * 0.5;
  return (
    `<polygon points="${cx},${y} ${cx + dir * len * 0.5},${y - len * 0.66} ${x2},${y2} ${cx + dir * len * 0.55},${y + 3}" fill="#4f932e" stroke="#1c2410" stroke-width="1.4"/>` +
    `<path d="M${cx} ${y} L${(cx + dir * len * 0.8).toFixed(1)} ${(y2 + 2).toFixed(1)}" stroke="#2f5e1c" stroke-width="1.2" fill="none"/>`
  );
}

/** Hex-packed seed speckle filling a sunflower head of radius `r`. */
function seedTex(cx: number, cy: number, r: number): string {
  let s = '';
  const step = Math.max(3, Math.round(r / 2.6));
  for (let yy = cy - r + 2; yy <= cy + r - 2; yy += step) {
    const off = Math.round((yy - cy) / step) % 2 ? step / 2 : 0;
    for (let xx = cx - r + 2 + off; xx <= cx + r - 2; xx += step) {
      if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= (r - 1.8) * (r - 1.8)) {
        s += `<rect x="${(xx - 0.9).toFixed(1)}" y="${(yy - 0.9).toFixed(1)}" width="1.8" height="1.8" fill="#3a1c0c"/>`;
      }
    }
  }
  return s;
}

/** Contact shadow ellipse laid under a prop. */
function softShadow(cx: number, y: number, rx: number): string {
  return `<ellipse cx="${cx}" cy="${y}" rx="${rx}" ry="${(rx * 0.22).toFixed(1)}" fill="#1c2410" opacity=".16"/>`;
}

interface SunflowerOpts {
  cx: number;
  ground: number;
  hY: number;
  hR: number;
  sway: string;
  delay: string;
}

/** Sunflower: stem, two leaves, 12 petals, seeded head. */
export function sunflowerSVG(o: SunflowerOpts): string {
  const { cx, ground, hY, hR, sway, delay } = o;
  const headBottom = hY + hR;
  const mid = (headBottom + ground) / 2;
  const n = 12;
  const plen = hR * 1.15;
  const pw = Math.max(5, hR * 0.5);
  let petals = '';
  for (let i = 0; i < n; i++) {
    const a = i * (360 / n);
    const col = i % 2 ? '#F6A93A' : '#FBC766';
    petals += `<rect x="${(cx - pw / 2).toFixed(1)}" y="${(hY - hR - plen * 0.7).toFixed(1)}" width="${pw.toFixed(1)}" height="${plen.toFixed(1)}" fill="${col}" stroke="#7a3d12" stroke-width="1.1" transform="rotate(${a} ${cx} ${hY})"/>`;
  }
  const sr = hR * 0.6;
  return `<g class="${sway}" style="transform-origin:center bottom">
    <rect x="${cx - 4.5}" y="${(headBottom - 2).toFixed(1)}" width="9" height="${(ground - headBottom + 4).toFixed(1)}" fill="#3f7d28" stroke="#1c2410" stroke-width="1.5"/>
    <rect x="${cx - 3.5}" y="${headBottom.toFixed(1)}" width="3" height="${(ground - headBottom).toFixed(1)}" fill="#62a838"/>
    ${leaf(cx - 4, mid - 6, -1, 18)}
    ${leaf(cx + 4, mid + 8, 1, 16)}
    ${petals}
    <circle cx="${cx}" cy="${hY}" r="${hR}" fill="#F08A1E" stroke="#5a2d0e" stroke-width="1.6"/>
    <circle cx="${cx}" cy="${hY}" r="${(hR * 0.78).toFixed(1)}" fill="#C66A14"/>
    <g class="a-absorb" style="animation-delay:${delay};transform-origin:center">
      <circle cx="${cx}" cy="${hY}" r="${sr.toFixed(1)}" fill="#6a3a18" stroke="#3a1c0c" stroke-width="1"/>
      ${seedTex(cx, hY, sr)}
    </g>
    <circle cx="${(cx - hR * 0.32).toFixed(1)}" cy="${(hY - hR * 0.34).toFixed(1)}" r="${(hR * 0.18).toFixed(1)}" fill="#FBD46a" opacity=".55"/>
  </g>`;
}

interface MushroomOpts {
  cx: number;
  baseY: number;
  capW: number;
  capH: number;
  cap: string;
  capDk: string;
  delay: string;
  glint?: boolean;
}

/** Spotted mushroom with gills, cap and a drifting spore. */
export function mushroomSVG(o: MushroomOpts): string {
  const { cx, baseY, capW, capH, cap, capDk, delay, glint } = o;
  const stemW = capW * 0.46;
  const stemX = cx - stemW / 2;
  const stemTop = baseY - capH * 1.35;
  const gy = stemTop + capH * 0.55;
  return `<g>
    <rect x="${stemX.toFixed(1)}" y="${stemTop.toFixed(1)}" width="${stemW.toFixed(1)}" height="${(baseY - stemTop).toFixed(1)}" fill="#f0e6d2" stroke="#1c1810" stroke-width="2"/>
    <rect x="${stemX.toFixed(1)}" y="${stemTop.toFixed(1)}" width="${(stemW * 0.38).toFixed(1)}" height="${(baseY - stemTop).toFixed(1)}" fill="#d8cbb0"/>
    <path d="M${(stemX - 2).toFixed(1)} ${baseY} q ${(stemW / 2 + 2).toFixed(1)} 7 ${(stemW + 4).toFixed(1)} 0" fill="#e2d6ba" stroke="#1c1810" stroke-width="1.5"/>
    <g stroke="${capDk}" stroke-width="1.2" opacity=".55" fill="none"><path d="M${(cx - capW * 0.55).toFixed(1)} ${gy.toFixed(1)} V${(gy + capH * 0.4).toFixed(1)} M${(cx - capW * 0.2).toFixed(1)} ${(gy + 1).toFixed(1)} V${(gy + capH * 0.5).toFixed(1)} M${(cx + capW * 0.2).toFixed(1)} ${(gy + 1).toFixed(1)} V${(gy + capH * 0.5).toFixed(1)} M${(cx + capW * 0.55).toFixed(1)} ${gy.toFixed(1)} V${(gy + capH * 0.4).toFixed(1)}"/></g>
    <g class="a-digest" style="animation-delay:${delay};transform-origin:center bottom">
      <ellipse cx="${cx}" cy="${stemTop.toFixed(1)}" rx="${capW}" ry="${capH}" fill="${cap}" stroke="#1c1810" stroke-width="2"/>
      <ellipse cx="${cx}" cy="${(stemTop + capH * 0.34).toFixed(1)}" rx="${(capW * 0.92).toFixed(1)}" ry="${(capH * 0.55).toFixed(1)}" fill="${capDk}" opacity=".5"/>
      <ellipse cx="${(cx - capW * 0.22).toFixed(1)}" cy="${(stemTop - capH * 0.38).toFixed(1)}" rx="${(capW * 0.42).toFixed(1)}" ry="${(capH * 0.3).toFixed(1)}" fill="#fff" opacity=".22"/>
      <circle cx="${(cx - capW * 0.46).toFixed(1)}" cy="${(stemTop - capH * 0.05).toFixed(1)}" r="2.6" fill="#fff"/>
      <circle cx="${(cx + capW * 0.18).toFixed(1)}" cy="${(stemTop + capH * 0.22).toFixed(1)}" r="3" fill="#fff"/>
      <circle cx="${(cx + capW * 0.52).toFixed(1)}" cy="${(stemTop - capH * 0.12).toFixed(1)}" r="1.9" fill="#fff"/>
      <circle cx="${(cx - capW * 0.04).toFixed(1)}" cy="${(stemTop - capH * 0.5).toFixed(1)}" r="1.7" fill="#fff"/>
    </g>
    ${glint ? `<ellipse class="a-twinkle" cx="${(cx + capW * 0.28).toFixed(1)}" cy="${(stemTop - capH * 0.32).toFixed(1)}" rx="3" ry="1.6" fill="#fff"/>` : ''}
    <circle class="a-spore" style="animation-delay:${delay}" cx="${cx}" cy="${(stemTop - capH * 1.05).toFixed(1)}" r="1.6" fill="#efe7d0"/>
  </g>`;
}

interface TreeOpts {
  cx: number;
  ground: number;
  top: number;
  r: number;
  trunkW: number;
  sway: string;
  delay: string;
  fruit: string;
}

/** Broadleaf tree with a layered canopy and blossoms. */
export function treeSVG(o: TreeOpts): string {
  const { cx, ground, top, r, trunkW: tw, sway, delay, fruit } = o;
  const canopyBottom = top + r * 1.3;
  const pts = [
    [-r * 0.4, -r * 0.15],
    [r * 0.45, -r * 0.05],
    [-r * 0.1, -r * 0.55],
    [r * 0.2, r * 0.3],
    [-r * 0.55, r * 0.18],
  ];
  let blossoms = '';
  pts.forEach((p, i) => {
    blossoms += `<circle cx="${(cx + p[0]).toFixed(1)}" cy="${(top + r + p[1]).toFixed(1)}" r="2.4" fill="${i % 2 ? fruit : '#E84BC0'}" stroke="#1c2410" stroke-width="1"/>`;
  });
  return `${softShadow(cx, ground + 2, r * 0.72)}
  <g class="${sway}" style="transform-origin:center bottom;animation-delay:${delay}">
    <rect x="${(cx - tw / 2).toFixed(1)}" y="${canopyBottom.toFixed(1)}" width="${tw}" height="${(ground - canopyBottom).toFixed(1)}" fill="#7a5230" stroke="#1c2410" stroke-width="2"/>
    <rect x="${(cx - tw / 2).toFixed(1)}" y="${canopyBottom.toFixed(1)}" width="${(tw * 0.34).toFixed(1)}" height="${(ground - canopyBottom).toFixed(1)}" fill="#5e3e22"/>
    <path d="M${(cx - tw / 2 - 2).toFixed(1)} ${ground} q ${(tw / 2 + 2).toFixed(1)} 6 ${(tw + 4).toFixed(1)} 0" fill="#6a4626" stroke="#1c2410" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${(top + r).toFixed(1)}" r="${r}" fill="#3C6B1F" stroke="#1c2410" stroke-width="2"/>
    <circle cx="${(cx - r * 0.55).toFixed(1)}" cy="${(top + r * 1.15).toFixed(1)}" r="${(r * 0.6).toFixed(1)}" fill="#5E9E33"/>
    <circle cx="${(cx + r * 0.55).toFixed(1)}" cy="${(top + r * 1.1).toFixed(1)}" r="${(r * 0.6).toFixed(1)}" fill="#5E9E33"/>
    <circle cx="${cx}" cy="${(top + r * 0.7).toFixed(1)}" r="${(r * 0.66).toFixed(1)}" fill="#6FB23E"/>
    <circle cx="${(cx - r * 0.3).toFixed(1)}" cy="${(top + r * 0.5).toFixed(1)}" r="${(r * 0.4).toFixed(1)}" fill="#86C24E"/>
    ${blossoms}
  </g>`;
}

interface MeadowFlowerOpts {
  cx: number;
  ground: number;
  hY: number;
  hR: number;
  petal: string;
  petalDk: string;
  center: string;
  sway: string;
  delay: string;
}

/** Small meadow flower: 10 petals on a short stem. */
export function meadowFlowerSVG(o: MeadowFlowerOpts): string {
  const { cx, ground, hY, hR, petal, petalDk, center, sway, delay } = o;
  const headBottom = hY + hR;
  const mid = (headBottom + ground) / 2;
  const n = 10;
  const plen = hR * 1.25;
  const pw = Math.max(4, hR * 0.42);
  let petals = '';
  for (let i = 0; i < n; i++) {
    const a = i * (360 / n);
    const col = i % 2 ? petal : petalDk;
    petals += `<rect x="${(cx - pw / 2).toFixed(1)}" y="${(hY - hR * 0.2 - plen).toFixed(1)}" width="${pw.toFixed(1)}" height="${plen.toFixed(1)}" fill="${col}" stroke="#1c2410" stroke-width="1" transform="rotate(${a} ${cx} ${hY})"/>`;
  }
  return `<g class="${sway}" style="transform-origin:center bottom;animation-delay:${delay}">
    <rect x="${(cx - 2.5).toFixed(1)}" y="${headBottom.toFixed(1)}" width="5" height="${(ground - headBottom).toFixed(1)}" fill="#3f7d28" stroke="#1c2410" stroke-width="1.4"/>
    ${leaf(cx - 2, mid, -1, 12)}
    ${leaf(cx + 2, mid + 6, 1, 11)}
    ${petals}
    <circle cx="${cx}" cy="${hY}" r="${(hR * 0.5).toFixed(1)}" fill="${center}" stroke="#1c2410" stroke-width="1.2"/>
    <circle cx="${(cx - hR * 0.16).toFixed(1)}" cy="${(hY - hR * 0.16).toFixed(1)}" r="${(hR * 0.12).toFixed(1)}" fill="#fff" opacity=".5"/>
  </g>`;
}

interface BoxOpts {
  x: number;
  ground: number;
  w: number;
}

/** Small pitched-roof house with a door, window and water butt. */
export function homeSVG(o: BoxOpts): string {
  const { x, ground, w } = o;
  const wallH = 32;
  const bodyY = ground - wallH;
  const roofH = 20;
  const peak = bodyY - roofH;
  const cx = x + w / 2;
  const dx = x + w * 0.16;
  const wx = x + w * 0.58;
  return `${softShadow(cx, ground + 2, w * 0.66)}
  <g stroke="#1c1810" stroke-width="2">
    <rect x="${x}" y="${bodyY}" width="${w}" height="${wallH}" fill="#E8D2A4"/>
    <rect x="${x}" y="${bodyY}" width="${(w * 0.16).toFixed(1)}" height="${wallH}" fill="#d6ba84"/>
    <polygon points="${x - 4},${bodyY} ${cx},${peak} ${cx},${bodyY}" fill="#C2442E"/>
    <polygon points="${cx},${peak} ${x + w + 4},${bodyY} ${cx},${bodyY}" fill="#9a3522"/>
    <rect x="${dx.toFixed(1)}" y="${(ground - 18).toFixed(1)}" width="11" height="18" fill="#5E9E33"/>
    <circle cx="${(dx + 8.5).toFixed(1)}" cy="${(ground - 9).toFixed(1)}" r="1.1" fill="#1c1810"/>
    <rect x="${wx.toFixed(1)}" y="${(bodyY + 7).toFixed(1)}" width="13" height="13" fill="#bfe0ee"/>
    <path d="M${(wx + 6.5).toFixed(1)} ${(bodyY + 7).toFixed(1)} v13 M${wx.toFixed(1)} ${(bodyY + 13.5).toFixed(1)} h13" stroke="#1c1810" stroke-width="1.1" fill="none"/>
    <rect x="${(wx - 2).toFixed(1)}" y="${(bodyY + 20).toFixed(1)}" width="17" height="4" fill="#7a4a2c"/>
    <circle cx="${(wx + 2).toFixed(1)}" cy="${(bodyY + 19).toFixed(1)}" r="2" fill="#E84BC0"/><circle cx="${(wx + 11).toFixed(1)}" cy="${(bodyY + 19).toFixed(1)}" r="2" fill="#F7E038"/>
    <rect x="${(x + w + 1).toFixed(1)}" y="${(ground - 16).toFixed(1)}" width="10" height="16" fill="#3f7d6a"/>
    <rect x="${(x + w + 1).toFixed(1)}" y="${(ground - 16).toFixed(1)}" width="10" height="3" fill="#56a08a"/>
    <path d="M${(x + w).toFixed(1)} ${(bodyY + wallH * 0.5).toFixed(1)} q-3 4 1 ${(wallH * 0.5).toFixed(1)}" fill="none" stroke="#8a8f93" stroke-width="1.5"/>
  </g>`;
}

/** Composting toilet cabin with a vent pipe and leaf badge. */
export function bioToiletSVG(o: BoxOpts): string {
  const { x, ground, w } = o;
  const h = 42;
  const bodyY = ground - h;
  const cx = x + w / 2;
  return `${softShadow(cx, ground + 2, w * 0.72)}
  <g stroke="#1c1810" stroke-width="2">
    <rect x="${(x + w - 4).toFixed(1)}" y="${(bodyY - 16).toFixed(1)}" width="5" height="20" fill="#8a979c"/>
    <rect x="${(x + w - 6).toFixed(1)}" y="${(bodyY - 19).toFixed(1)}" width="9" height="4" fill="#5a6a6f"/>
    <rect x="${x}" y="${bodyY}" width="${w}" height="${h}" fill="#caa46a"/>
    <g stroke="#a07b44" stroke-width="1" fill="none"><path d="M${x} ${(bodyY + 11).toFixed(1)} h${w} M${x} ${(bodyY + 22).toFixed(1)} h${w} M${x} ${(bodyY + 33).toFixed(1)} h${w}"/></g>
    <rect x="${(x - 3).toFixed(1)}" y="${(bodyY - 5).toFixed(1)}" width="${(w + 6).toFixed(1)}" height="6" fill="#5E9E33"/>
    <rect x="${(x + 3).toFixed(1)}" y="${(bodyY + 6).toFixed(1)}" width="${(w - 6).toFixed(1)}" height="${(h - 6).toFixed(1)}" fill="#9a7038"/>
    <g transform="translate(${cx},${(bodyY + 18).toFixed(1)})" stroke="#1c2410" stroke-width="1"><path d="M0 0 q6 -6 0 -12 q-6 6 0 12 z" fill="#86C24E"/><path d="M0 0 V-10" fill="none"/></g>
    <circle cx="${(x + w - 7).toFixed(1)}" cy="${(bodyY + h * 0.62).toFixed(1)}" r="1.4" fill="#1c1810"/>
  </g>`;
}

interface DeadTreeOpts {
  cx: number;
  ground: number;
  s?: number;
  sway: string;
  delay: string;
}

/** Bare, branching dead tree. Drawn at unit scale then scaled by `s`. */
export function deadTreeSVG(o: DeadTreeOpts): string {
  const { cx, ground, s = 1, sway, delay } = o;
  const branches = `
    <rect x="-5" y="-80" width="10" height="80" fill="#2a2418" stroke="#120e08" stroke-width="2"/>
    <rect x="-5" y="-80" width="3.5" height="80" fill="#3e3526"/>
    <path d="M-1 -78 q-4 -22 1 -44" stroke="#120e08" stroke-width="1" fill="none" opacity=".5"/>
    <g stroke="#2a2418" stroke-linecap="round" fill="none">
      <path d="M0 -58 L-22 -78" stroke-width="6"/><path d="M-22 -78 L-35 -95" stroke-width="3.5"/><path d="M-22 -78 L-13 -98" stroke-width="3"/><path d="M-30 -87 L-41 -91" stroke-width="2"/>
      <path d="M0 -64 L22 -84" stroke-width="6"/><path d="M22 -84 L35 -99" stroke-width="3.5"/><path d="M22 -84 L13 -105" stroke-width="3"/><path d="M30 -92 L41 -97" stroke-width="2"/>
      <path d="M0 -78 L-4 -101" stroke-width="4.5"/><path d="M-4 -101 L-12 -112" stroke-width="2.5"/><path d="M-4 -101 L7 -109" stroke-width="2.5"/>
      <path d="M-2 -44 L-19 -52" stroke-width="4"/><path d="M-19 -52 L-29 -50" stroke-width="2"/>
      <path d="M2 -50 L18 -60" stroke-width="4"/><path d="M18 -60 L29 -67" stroke-width="2.5"/>
    </g>`;
  return `${softShadow(cx, ground + 1, 18 * s)}
  <g transform="translate(${cx} ${ground}) scale(${s})"><g class="${sway}" style="transform-origin:center bottom;animation-delay:${delay}">${branches}</g></g>`;
}

/** Rising column of sickly vapour. */
export function fume(cx: number, baseY: number, delay: string): string {
  return `<g class="a-rise" style="animation-delay:${delay}" opacity=".5">
    <ellipse cx="${cx}" cy="${baseY}" rx="9" ry="6" fill="#9aa83a"/>
    <ellipse cx="${cx + 4}" cy="${baseY - 10}" rx="7" ry="5" fill="#a8b64a"/>
    <ellipse cx="${cx - 2}" cy="${baseY - 19}" rx="5" ry="4" fill="#b6c24a"/>
    <circle cx="${cx + 3}" cy="${baseY - 26}" r="3" fill="#c2cc5a"/>
  </g>`;
}

interface ElementTagOpts {
  x: number;
  y: number;
  sym: string;
  num: string;
  tint?: string;
}

/** Periodic-table marker stake naming a soil contaminant. */
export function elementTagSVG(o: ElementTagOpts): string {
  const { x, y, sym, num, tint = '#9aa83a' } = o;
  const w = 22;
  const h = 24;
  return `<g>
    <line x1="${x + 4}" y1="${y - 4}" x2="${x + 4}" y2="${y + 1}" stroke="#3a3a2a" stroke-width="1.5"/>
    <line x1="${x + w - 4}" y1="${y - 4}" x2="${x + w - 4}" y2="${y + 1}" stroke="#3a3a2a" stroke-width="1.5"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1d2012" stroke="${tint}" stroke-width="2"/>
    <text x="${x + 3}" y="${y + 8}" font-size="5" fill="${tint}" font-family="'Press Start 2P',monospace">${num}</text>
    <text x="${x + w / 2}" y="${y + 19}" font-size="9" fill="#d6e07a" text-anchor="middle" font-family="'Press Start 2P',monospace">${sym}</text>
  </g>`;
}

interface FenceOpts {
  ground: number;
  top: number;
}

/** Full-width chain-link fence run with a chained gate and TOXIC sign. */
export function fenceSVG(o: FenceOpts): string {
  const { ground, top } = o;
  const x0 = 12;
  const x1 = 318;
  const gx0 = 140;
  const gx1 = 198;
  const gm = (gx0 + gx1) / 2;
  const post = (px: number, w = 6): string =>
    `<rect x="${px - w / 2}" y="${top - 3}" width="${w}" height="${ground - top + 3}" fill="#5a5e52" stroke="#1c1c14" stroke-width="1.5"/>`;
  const sx = gm - 28;
  const sy = top - 3;
  return `<rect x="${x0}" y="${top - 3}" width="${x1 - x0}" height="4" fill="#6a6e60" stroke="#1c1c14" stroke-width="1.5"/>
    <rect x="${x0}" y="${top}" width="${gx0 - x0}" height="${ground - top}" fill="url(#mesh)"/>
    <rect x="${gx1}" y="${top}" width="${x1 - gx1}" height="${ground - top}" fill="url(#mesh)"/>
    <rect x="${gx0}" y="${top}" width="${gx1 - gx0}" height="${ground - top}" fill="url(#mesh)"/>
    <rect x="${gx0 + 1}" y="${top}" width="${gx1 - gx0 - 2}" height="${ground - top}" fill="none" stroke="#6a6e60" stroke-width="2"/>
    <line x1="${gm}" y1="${top}" x2="${gm}" y2="${ground}" stroke="#6a6e60" stroke-width="2.5"/>
    <g stroke="#c2442e" stroke-width="3" opacity=".85"><line x1="${gx0 + 3}" y1="${top + 3}" x2="${gx1 - 3}" y2="${ground - 3}"/><line x1="${gx1 - 3}" y1="${top + 3}" x2="${gx0 + 3}" y2="${ground - 3}"/></g>
    <path d="M${gm - 7} ${top + 22} q7 6 14 0 q-7 9 -14 0" fill="none" stroke="#9a9a8a" stroke-width="2"/>
    <rect x="${gm - 4}" y="${top + 25}" width="8" height="7" fill="#c9a227" stroke="#1c1c14" stroke-width="1.5"/>
    ${post(x0)}${post(gx0)}${post(gx1)}${post(x1)}
    <line x1="${sx + 8}" y1="${top - 2}" x2="${sx + 8}" y2="${sy + 3}" stroke="#1c1c14" stroke-width="1"/><line x1="${sx + 48}" y1="${top - 2}" x2="${sx + 48}" y2="${sy + 3}" stroke="#1c1c14" stroke-width="1"/>
    <rect x="${sx}" y="${sy}" width="56" height="22" fill="#e8c020" stroke="#1c1c14" stroke-width="2"/>
    <rect x="${sx}" y="${sy}" width="56" height="22" fill="none" stroke="#1c1c14" stroke-width="2" stroke-dasharray="5 4"/>
    <text x="${sx + 28}" y="${sy + 15}" font-size="9" fill="#1c1c14" text-anchor="middle" font-family="'Press Start 2P',monospace">TOXIC</text>
    <circle class="a-blink" cx="${gx0}" cy="${top - 9}" r="3.5" fill="#e8503c" stroke="#1c1c14" stroke-width="1"/>`;
}

interface CarOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  dk: string;
  glass?: string;
  flip?: boolean;
  wheelL?: 'tire' | 'flat' | 'rim' | 'none';
  wheelR?: 'tire' | 'flat' | 'rim' | 'none';
  cracked?: boolean;
  rust?: boolean;
  door?: boolean;
}

/** Wrecked car. Wheels, rust patches, cracked glass and door are optional. */
export function carSVG(o: CarOpts): string {
  const {
    x,
    y,
    w,
    h,
    color,
    dk,
    glass = '#86b6c8',
    flip = false,
    wheelL = 'tire',
    wheelR = 'tire',
    cracked = true,
    rust = true,
    door = false,
  } = o;
  const cabinW = w * 0.6;
  const cabinH = h * 0.66;
  const cabinX = x + w * 0.18;
  const cabinY = y - cabinH + 3;
  const wlx = x + w * 0.22;
  const wrx = x + w * 0.78;
  const wy = y + h;
  const wr = Math.max(7, h * 0.42);
  const wheel = (wx: number, t: string): string =>
    t === 'none'
      ? `<path d="M${(wx - wr).toFixed(1)} ${wy} a ${wr} ${wr} 0 0 1 ${(wr * 2).toFixed(1)} 0 z" fill="#1a1610"/>`
      : t === 'flat'
        ? `<ellipse cx="${wx.toFixed(1)}" cy="${(wy + wr * 0.5).toFixed(1)}" rx="${(wr * 1.1).toFixed(1)}" ry="${(wr * 0.5).toFixed(1)}" fill="#241f18" stroke="#0e0b07" stroke-width="2"/>`
        : t === 'rim'
          ? `<circle cx="${wx.toFixed(1)}" cy="${wy}" r="${wr.toFixed(1)}" fill="#241f18" stroke="#0e0b07" stroke-width="2"/><circle cx="${wx.toFixed(1)}" cy="${wy}" r="${(wr * 0.55).toFixed(1)}" fill="#6a6258"/><circle cx="${wx.toFixed(1)}" cy="${wy}" r="${(wr * 0.2).toFixed(1)}" fill="#3a342c"/>`
          : `<circle cx="${wx.toFixed(1)}" cy="${wy}" r="${wr.toFixed(1)}" fill="#241f18" stroke="#0e0b07" stroke-width="2"/><circle cx="${wx.toFixed(1)}" cy="${wy}" r="${(wr * 0.45).toFixed(1)}" fill="#4a4038"/><circle cx="${wx.toFixed(1)}" cy="${wy}" r="${(wr * 0.16).toFixed(1)}" fill="#1a1610"/>`;
  const rustEls = rust
    ? `<g fill="#9a5230" opacity=".8"><polygon points="${(x + w * 0.1).toFixed(1)},${y + 2} ${(x + w * 0.22).toFixed(1)},${y + 4} ${(x + w * 0.16).toFixed(1)},${(y + h * 0.5).toFixed(1)} ${(x + w * 0.06).toFixed(1)},${(y + h * 0.4).toFixed(1)}"/><polygon points="${(x + w * 0.72).toFixed(1)},${(y + h * 0.3).toFixed(1)} ${(x + w * 0.86).toFixed(1)},${(y + h * 0.36).toFixed(1)} ${(x + w * 0.8).toFixed(1)},${(y + h * 0.8).toFixed(1)} ${(x + w * 0.7).toFixed(1)},${(y + h * 0.7).toFixed(1)}"/></g><g stroke="#7a3f24" stroke-width="1.4" opacity=".7" fill="none"><path d="M${(x + w * 0.16).toFixed(1)} ${(y + h * 0.5).toFixed(1)} V${y + h - 2}"/><path d="M${(x + w * 0.78).toFixed(1)} ${(y + h * 0.8).toFixed(1)} V${y + h - 1}"/></g>`
    : '';
  const crackEls = cracked
    ? `<g stroke="#e6eef2" stroke-width="0.8" opacity=".85" fill="none"><path d="M${(cabinX + cabinW * 0.18).toFixed(1)} ${(cabinY + 4).toFixed(1)} l5 6 l-3 5 l6 3"/></g>`
    : '';
  const doorEl = door
    ? `<rect x="${(x + w * 0.46).toFixed(1)}" y="${(y + 2).toFixed(1)}" width="${(w * 0.2).toFixed(1)}" height="${(h - 4).toFixed(1)}" fill="${dk}" stroke="#1c1410" stroke-width="2" transform="rotate(15 ${(x + w * 0.46).toFixed(1)} ${(y + h).toFixed(1)})"/>`
    : '';
  const body = `${wheel(wlx, wheelL)}${wheel(wrx, wheelR)}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="#1c1410" stroke-width="2"/>
    <rect x="${x}" y="${(y + h - 4).toFixed(1)}" width="${w}" height="4" fill="${dk}"/>
    <rect x="${x}" y="${y}" width="${w}" height="3" fill="#ffffff" opacity=".12"/>
    <path d="M${(wlx - wr - 2).toFixed(1)} ${y + h} a ${wr + 2} ${wr + 2} 0 0 1 ${((wr + 2) * 2).toFixed(1)} 0" fill="none" stroke="#1c1410" stroke-width="2"/>
    <path d="M${(wrx - wr - 2).toFixed(1)} ${y + h} a ${wr + 2} ${wr + 2} 0 0 1 ${((wr + 2) * 2).toFixed(1)} 0" fill="none" stroke="#1c1410" stroke-width="2"/>
    <polygon points="${cabinX.toFixed(1)},${y + 1} ${(cabinX + cabinW).toFixed(1)},${y + 1} ${(cabinX + cabinW - 6).toFixed(1)},${cabinY.toFixed(1)} ${(cabinX + 6).toFixed(1)},${cabinY.toFixed(1)}" fill="${color}" stroke="#1c1410" stroke-width="2"/>
    <rect x="${(cabinX + 4).toFixed(1)}" y="${(cabinY + 3).toFixed(1)}" width="${(cabinW * 0.42).toFixed(1)}" height="${(cabinH - 6).toFixed(1)}" fill="${glass}" opacity=".55"/>
    <rect x="${(cabinX + cabinW * 0.52).toFixed(1)}" y="${(cabinY + 3).toFixed(1)}" width="${(cabinW * 0.4).toFixed(1)}" height="${(cabinH - 6).toFixed(1)}" fill="${glass}" opacity=".5"/>
    ${crackEls}
    <line x1="${(x + w * 0.5).toFixed(1)}" y1="${y + 2}" x2="${(x + w * 0.5).toFixed(1)}" y2="${(y + h - 2).toFixed(1)}" stroke="#1c1410" stroke-width="1.5"/>
    <rect x="${(x + w * 0.34).toFixed(1)}" y="${(y + h * 0.42).toFixed(1)}" width="6" height="2.5" fill="#1c1410"/>
    <rect x="${(x - 3).toFixed(1)}" y="${(y + h * 0.4).toFixed(1)}" width="4" height="${(h * 0.4).toFixed(1)}" fill="#3a342c"/>
    <circle cx="${(x + 3).toFixed(1)}" cy="${(y + h * 0.36).toFixed(1)}" r="2.5" fill="#d8c468" stroke="#1c1410" stroke-width="1"/>
    ${rustEls}${doorEl}`;
  return flip
    ? `<g transform="translate(${(2 * (x + w / 2)).toFixed(1)} 0) scale(-1 1)">${body}</g>`
    : body;
}

/** Stack of `n` tyres resting on the ground line. */
export function tireStack(cx: number, groundY: number, n: number): string {
  let s = '';
  const rw = 10;
  const rh = 7;
  for (let i = 0; i < n; i++) {
    const cy = groundY - i * (rh * 1.4) - rh;
    s +=
      `<ellipse cx="${cx}" cy="${cy.toFixed(1)}" rx="${rw}" ry="${rh}" fill="#241f18" stroke="#0e0b07" stroke-width="2"/>` +
      `<ellipse cx="${cx}" cy="${cy.toFixed(1)}" rx="${(rw * 0.45).toFixed(1)}" ry="${(rh * 0.45).toFixed(1)}" fill="#3a342c"/>`;
  }
  return s;
}

/** Weathered wrecking-yard sign on a post. */
export function yardSign(x: number, groundY: number): string {
  const w = 78;
  const h = 26;
  const y = groundY - 66;
  return `<g stroke="#1c1410" stroke-width="2">
    <rect x="${x + w / 2 - 3}" y="${y + h}" width="6" height="${(groundY - (y + h)).toFixed(1)}" fill="#4a4038"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#8a9482"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#9a5230" opacity=".28"/>
    <text x="${x + w / 2}" y="${(y + 11).toFixed(1)}" font-size="5" fill="#23201a" text-anchor="middle" font-family="'Press Start 2P',monospace">10TH &amp; CENTER</text>
    <text x="${x + w / 2}" y="${(y + 21).toFixed(1)}" font-size="5" fill="#3a342c" text-anchor="middle" font-family="'Press Start 2P',monospace">AUTO WRECKING</text>
    <circle cx="${x + 5}" cy="${y + 5}" r="1.5" fill="#3a342c"/><circle cx="${x + w - 5}" cy="${y + 5}" r="1.5" fill="#3a342c"/>
  </g>`;
}
