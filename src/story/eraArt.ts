/**
 * eraArt.ts — pixel-art scene SVGs for each era of the bundled story.
 *
 * These are hand-composed scenes. Some elements came from the design
 * prototype's builders (sunflowers in heal.svg, car bodies in wreck.svg, the
 * fence mesh in toxic.svg); the rest — backgrounds, gradients, oil pools, the
 * leaking pipe — were authored by hand, and oil.svg is entirely hand-drawn.
 * The viewBoxes disagree too (330x168 vs 330x175), so these did not come off
 * one pipeline. They are therefore NOT regenerable from prop builders, which
 * is why the bundled StoryDoc carries them verbatim rather than composing
 * them. See docs/arcade-studio-plan.md.
 *
 * They are imported with Vite's `?raw` suffix so the build inlines them as
 * strings — no fetch at runtime.
 *
 * Each SVG is transparent (no opaque background): when rasterized and laid on
 * the detected ground (see svgTexture.ts + storyTile.ts), the real ground
 * shows through the gaps, so the diorama appears to grow out of the dirt.
 *
 * KNOWN DEFECT: these files reference animation classes (a-sway, a-ripple,
 * a-drip, …) whose keyframes are defined nowhere, and svgTexture rasterizes
 * once via drawImage — so the art is static in AR despite being authored for
 * motion. Tracked in docs/arcade-studio-plan.md.
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
