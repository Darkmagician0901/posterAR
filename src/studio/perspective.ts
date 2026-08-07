/**
 * perspective.ts — the phone preview's pinhole camera.
 *
 * A true perspective projection ported from the v4 prototype's renderPhone
 * (docs/prototypes/arcade-studio-v4.html:926-980) with one change: depth reads
 * the way the rest of the studio reads it. v4 used d = CAMZ - z (bigger z =
 * nearer); here d = nearM + z (bigger z = farther), matching compose.ts and the
 * stage map. nearM = 1.9 is CAMZ - zMax, so the projection is numerically
 * identical to v4's across the scene's z-range — the look is preserved exactly.
 *
 * Pure math: no DOM, no React, no SVG strings.
 */

import { SCENE, NEAR_M, cameraDepth } from '@/story/projection';

/** Re-exported so the preview modules read the scene from one place. */
export { SCENE, cameraDepth };

/** Camera intrinsics. Metres for eye height; px for focal length. */
export const CAMERA = { eyeM: 1.5, nearM: NEAR_M, focal: 230, horizonRatio: 0.4 } as const;
/** Preview canvas, matching v4's phone. */
export const VIEW = { w: 302, h: 632 } as const;

/** A projected point: screen position (px), scale factor, and depth. */
export interface Projected {
  x: number;
  y: number;
  /** Screen px per scene-metre at this depth (focal / d). */
  k: number;
  /** Camera-space depth, floored at 0.5. */
  d: number;
}

const CX = VIEW.w / 2;
const HORIZON = Math.round(VIEW.h * CAMERA.horizonRatio);

/**
 * Projects a scene point (metres) to screen px under a lateral pan.
 *
 * @param x — Horizontal offset from centre.
 * @param y — Height above the ground line.
 * @param z — Depth into the scene (bigger = farther).
 * @param pan — Lateral camera pan; 0 is the visitor's viewpoint.
 */
export function project(x: number, y: number, z: number, pan: number): Projected {
  const d = cameraDepth(z);
  const k = CAMERA.focal / d;
  return { x: CX + (x - pan) * k, y: HORIZON + (CAMERA.eyeM - y) * k, k, d };
}

/** One line of the ground grid, in screen px. */
export interface GridLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity: number;
}

/**
 * The converging ground grid: constant-z lines across, then constant-x lines
 * into the scene. Nearer lines are drawn more opaque, as in v4 (there nearer
 * meant bigger z; here it means smaller z, so the ratio is inverted).
 */
export function groundGrid(pan: number): GridLine[] {
  const lines: GridLine[] = [];
  for (let z = 0; z <= SCENE.zMax; z += 0.5) {
    const a = project(-SCENE.xHalf, 0, z, pan);
    const b = project(SCENE.xHalf, 0, z, pan);
    // Nearer lines stay more opaque, and nearer is now large z.
    lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, opacity: 0.05 + 0.16 * (z / SCENE.zMax) });
  }
  for (let x = -3; x <= 3; x++) {
    const a = project(x, 0, 0, pan);
    const b = project(x, 0, SCENE.zMax, pan);
    lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, opacity: x === 0 ? 0.22 : 0.1 });
  }
  return lines;
}
