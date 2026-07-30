/**
 * library.ts — the prop catalogue.
 *
 * Each entry pairs a builder (from builders.ts) with the metadata composition
 * needs: a display name, a default real-world height in metres, and the
 * builder's natural bounding box in the 330x200 drawing space.
 *
 * The bounding boxes were measured once by running every builder in a real
 * browser and calling getBBox() (plus 2px padding, matching the prototype's
 * libAsset). They are baked in as constants so composition stays pure — no DOM,
 * no layout, fully unit-testable. If a builder's geometry changes, re-measure.
 */

import {
  GROUND_Y,
  bioToiletSVG,
  carSVG,
  deadTreeSVG,
  elementTagSVG,
  fenceSVG,
  fume,
  homeSVG,
  meadowFlowerSVG,
  mushroomSVG,
  sunflowerSVG,
  tireStack,
  treeSVG,
  yardSign,
} from './builders';

/** A builder's natural extent in the 330x200 drawing space. */
export interface PropBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One catalogue entry. */
export interface PropDef {
  /** Display name shown in the studio palette. */
  name: string;
  /** Default height in metres when first placed. */
  heightM: number;
  /** Measured natural bounding box, including 2px padding. */
  bbox: PropBBox;
  /** Draws the prop at its natural position. */
  make: () => string;
  /** True when the builder references the `mesh` pattern from MESH_DEF. */
  needsMesh?: boolean;
}

/** Every placeable prop, keyed by the `k` stored in a StoryProp. */
export const PROP_LIBRARY: Record<string, PropDef> = {
  sunflower: {
    name: 'SUNFLOWER',
    heightM: 1.6,
    bbox: { x: 137.7, y: 37.7, w: 54.6, h: 107.3 },
    make: () =>
      sunflowerSVG({ cx: 165, ground: GROUND_Y, hY: GROUND_Y - 76, hR: 14, sway: 'a-sway', delay: '0s' }),
  },
  flower: {
    name: 'WILDFLOWER',
    heightM: 0.5,
    bbox: { x: 149, y: 101.2, w: 31.74, h: 43.55 },
    make: () =>
      meadowFlowerSVG({
        cx: 165,
        ground: GROUND_Y,
        hY: GROUND_Y - 24,
        hR: 9.5,
        petal: '#F4B6D6',
        petalDk: '#E27FB4',
        center: '#F7E038',
        sway: 'a-sway',
        delay: '0s',
      }),
  },
  mushroom: {
    name: 'MUSHROOM',
    heightM: 0.35,
    bbox: { x: 148, y: 115.8, w: 34, h: 30.7 },
    make: () =>
      mushroomSVG({
        cx: 165,
        baseY: GROUND_Y,
        capW: 15,
        capH: 9,
        cap: '#c2442e',
        capDk: '#8a2a1e',
        delay: '0s',
        glint: true,
      }),
  },
  tree: {
    name: 'TREE',
    heightM: 4.5,
    bbox: { x: 133.1, y: 27, w: 63.8, h: 122.1 },
    make: () =>
      treeSVG({
        cx: 165,
        ground: GROUND_Y,
        top: GROUND_Y - 112,
        r: 26,
        trunkW: 12,
        sway: 'a-swaysm',
        delay: '0s',
        fruit: '#F08A1E',
      }),
  },
  deadtree: {
    name: 'DEAD TREE',
    heightM: 3.2,
    bbox: { x: 126.1, y: 29.2, w: 77.8, h: 118.4 },
    make: () => deadTreeSVG({ cx: 165, ground: GROUND_Y, s: 0.9, sway: 'a-swaysm', delay: '0s' }),
  },
  home: {
    name: 'TINY HOME',
    heightM: 2.6,
    bbox: { x: 130, y: 87, w: 73, h: 65.3 },
    make: () => homeSVG({ x: 140, ground: GROUND_Y, w: 50 }),
  },
  biotoilet: {
    name: 'BIO-TOILET',
    heightM: 2.2,
    bbox: { x: 141.4, y: 78, w: 47.2, h: 71.8 },
    make: () => bioToiletSVG({ x: 150, ground: GROUND_Y, w: 30 }),
  },
  car: {
    name: 'OLD CAR',
    heightM: 1.35,
    bbox: { x: 120, y: 98.8, w: 87, h: 55.2 },
    make: () =>
      carSVG({
        x: 125,
        y: GROUND_Y - 26,
        w: 80,
        h: 26,
        color: '#7a4a2c',
        dk: '#5a3420',
        wheelL: 'tire',
        wheelR: 'flat',
        door: false,
      }),
  },
  fence: {
    name: 'FENCE RUN',
    heightM: 1.8,
    bbox: { x: 7, y: 85.5, w: 316, h: 57.5 },
    needsMesh: true,
    make: () => fenceSVG({ ground: GROUND_Y, top: GROUND_Y - 41 }),
  },
  tirestack: {
    name: 'TIRES',
    heightM: 0.8,
    bbox: { x: 153, y: 110.4, w: 24, h: 37.6 },
    make: () => tireStack(165, GROUND_Y + 5, 3),
  },
  sign: {
    name: 'YARD SIGN',
    heightM: 2.0,
    bbox: { x: 124, y: 73, w: 82, h: 70 },
    make: () => yardSign(126, GROUND_Y),
  },
  fume: {
    name: 'FUMES',
    heightM: 1.4,
    bbox: { x: 154, y: 106, w: 24, h: 39 },
    make: () => fume(165, GROUND_Y - 4, '0s'),
  },
  tag: {
    name: 'ELEMENT TAG',
    heightM: 0.5,
    bbox: { x: 152, y: 97, w: 26, h: 32 },
    make: () => elementTagSVG({ x: 154, y: 103, sym: 'Pb', num: '82' }),
  },
};

/** Width / height of a prop's natural bounding box. */
export function propAspect(key: string): number {
  const def = PROP_LIBRARY[key];
  return def ? def.bbox.w / def.bbox.h : 1;
}
