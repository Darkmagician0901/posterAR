/**
 * eraProps.ts — the bundled story's frames as staged props.
 *
 * These lists are ported from the design prototype's TEMPLATE_FRAMES
 * (docs/prototypes/arcade-studio-v4.html:770), where every era was authored as
 * a list of library props rather than as a painted scene. The prototype's tuple
 * order — [key, x, z, height, flipped, elevation] — maps one-to-one onto
 * StoryProp, and every key it used already exists in PROP_LIBRARY.
 *
 * They replace the hand-drawn era/*.svg scenes as the source of the bundled
 * frames' art (see defaultStory.ts). The trade is deliberate: the painted
 * scenes were richer — crane, birds, smoke, oil pools, sky gradients — but were
 * one flat layer, so nothing in them could be selected or moved. As props, every
 * object in a frame gets a dot in the stage editor's top-down map and can be
 * dragged to set its depth.
 *
 * Heights are written out explicitly rather than defaulting to
 * PROP_LIBRARY[k].heightM, so a scene's proportions are readable here and do not
 * shift if a library default is ever re-tuned.
 *
 * Pure data: no DOM, no imports beyond types, so it is safe to import anywhere.
 */

import type { StoryProp } from './storyDoc';
import type { EraKey } from './storyData';
import { fromLegacyZ } from './projection';

/**
 * Builds one library prop. Mirrors the prototype's tplProps tuple order.
 *
 * The prototype authored `z` as metres from the viewer across a 6.2 m stage;
 * depth is now measured out from the wall the marker hangs on. The conversion
 * happens here rather than by rewriting the tuples below, so this list stays
 * diffable against arcade-studio-v4.html:770 and the scenes keep reading
 * exactly as they were composed — background props behind, clutter in front.
 *
 * @param zFromViewer — Depth as authored in the prototype, not as stored.
 */
function prop(k: string, x: number, zFromViewer: number, h: number, f = false, e = 0): StoryProp {
  return { t: 'lib', k, x, z: fromLegacyZ(zFromViewer), h, f, e };
}

/**
 * Staged props for each bundled era, in paint order.
 *
 * Composition sorts by depth, so the order here is for readability only.
 */
export const ERA_PROPS: Record<EraKey, StoryProp[]> = {
  wreck: [
    prop('car', -0.9, 1.3, 1.35),
    prop('car', 1.0, 2.2, 1.35, true),
    prop('tirestack', 1.9, 0.9, 0.8),
    prop('sign', -2.0, 0.8, 2.0),
  ],
  oil: [
    prop('car', 0.2, 1.6, 1.35),
    prop('fume', -0.7, 1.1, 1.4),
    prop('fume', 0.9, 2.3, 1.4),
    prop('tirestack', -1.8, 2.0, 0.8),
  ],
  toxic: [
    prop('fence', 0, 1.0, 1.8),
    prop('deadtree', -1.4, 2.6, 3.2),
    prop('deadtree', 1.5, 3.0, 2.6),
    prop('tag', -0.5, 0.85, 0.5),
    prop('tag', 0.6, 0.85, 0.5),
    prop('fume', 0.1, 2.0, 1.4, false, 0.35),
  ],
  heal: [
    prop('sunflower', -1.0, 1.4, 1.6),
    prop('sunflower', 0.2, 2.0, 1.9),
    prop('sunflower', 1.2, 1.2, 1.3),
    prop('mushroom', -0.3, 0.9, 0.35),
    prop('mushroom', 0.7, 0.8, 0.3),
  ],
  alive: [
    prop('tree', -2.0, 2.8, 4.5),
    prop('tree', 2.1, 3.2, 3.8),
    prop('home', -0.6, 2.2, 2.6),
    prop('biotoilet', 1.2, 1.8, 2.2),
    prop('flower', 0.2, 1.0, 0.5),
    prop('flower', -1.3, 0.9, 0.5),
    prop('flower', 1.9, 0.8, 0.5),
  ],
};

/**
 * Returns the staged props for an era.
 *
 * @param key — Era key (wreck | oil | toxic | heal | alive).
 * @returns A fresh copy of that era's props, safe for the caller to mutate.
 */
export function eraProps(key: EraKey): StoryProp[] {
  return ERA_PROPS[key].map((p) => ({ ...p }));
}
