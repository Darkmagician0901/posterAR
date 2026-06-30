/**
 * eraArt.ts — pixel-art scene SVGs for each era.
 *
 * The SVG strings are the exact output of the design prototype's scene
 * builders (sunflowerSVG, carSVG, fenceSVG, deadTreeSVG, …), extracted once
 * to static files under story/era/. They are imported with Vite's `?raw`
 * suffix so the build inlines them as strings — no fetch at runtime.
 *
 * Each SVG is transparent (no opaque background): when rasterized and laid on
 * the detected ground (see svgTexture.ts + storyTile.ts), the real ground
 * shows through the gaps, so the diorama appears to grow out of the dirt.
 */

import wreck from './era/wreck.svg?raw';
import oil from './era/oil.svg?raw';
import toxic from './era/toxic.svg?raw';
import heal from './era/heal.svg?raw';
import alive from './era/alive.svg?raw';
import type { EraKey } from './storyData';

const ERA_SVG: Record<EraKey, string> = { wreck, oil, toxic, heal, alive };

/**
 * Returns the raw SVG markup for an era.
 *
 * @param key — Era key (wreck | oil | toxic | heal | alive).
 * @returns The SVG document string for that era's scene.
 */
export function eraSvg(key: EraKey): string {
  return ERA_SVG[key];
}
