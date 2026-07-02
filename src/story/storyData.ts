/**
 * storyData.ts — "THE GROUND REMEMBERS" narrative content.
 *
 * The five eras of 10th & Center, ported verbatim from the design prototype
 * (arcade-history.html `STORY` array). Each era drives both the AR-anchored
 * diorama tile (its pixel-art SVG, see eraArt.ts) and the 2D HUD overlay
 * (title card, docent narration, timeline, era-colored vignette).
 *
 * This is plain data — no engine or DOM dependency — so it is safe to import
 * from the store, the overlay, and any test.
 */

/** Stable key for one era; also the basename of its SVG in story/era/. */
export type EraKey = 'wreck' | 'oil' | 'toxic' | 'heal' | 'alive';

/** One chapter of the site's history. */
export interface StoryEra {
  /** Stable identifier; matches the SVG filename in story/era/<key>.svg. */
  key: EraKey;
  /** Year badge shown on the title card ("1951" … "TODAY"). */
  year: string;
  /** Title-card headline. */
  title: string;
  /** Short label shown on the timeline stop. */
  label: string;
  /** Docent narration (typed out in the overlay). Verbatim from the script. */
  line: string;
  /**
   * Era mood color (the prototype's CSS "wash"), used for the HUD vignette and
   * the timeline accent. Approximated from the original radial/linear washes.
   */
  washColor: string;
  /**
   * Particle motif for the era (rust flecks, oil shimmer, ash, pollen,
   * fireflies). The overlay maps this to a light ambient particle layer.
   */
  particle: 'rust' | 'oil' | 'ash' | 'pollen' | 'firefly';
}

/** The five eras, in walk-through order: wreck → oil → toxic → heal → alive. */
export const STORY_ERAS: StoryEra[] = [
  {
    key: 'wreck',
    year: '1951',
    title: 'THE WRECKING YARD',
    label: 'WRECK',
    line: "Let's begin in 1951. Back then, this site was a wrecking yard. For decades, old cars were brought here, stripped for parts, and left to rust in the open air.",
    washColor: 'rgba(150,90,40,0.30)',
    particle: 'rust',
  },
  {
    key: 'oil',
    year: '1974',
    title: 'THE OIL YEARS',
    label: 'OIL',
    line: 'By the 1970s, all those engines had taken a toll. Oil and fuel leaked into the ground year after year. It left a colorful sheen on the surface, but underneath, it was quietly contaminating the soil.',
    washColor: 'rgba(40,40,55,0.42)',
    particle: 'oil',
  },
  {
    key: 'toxic',
    year: '1998',
    title: 'THE DEAD GROUND',
    label: 'TOXIC',
    line: 'By the time the yard closed in the 1990s, the soil here was too polluted to support life. The lot was fenced off and left empty for years, a piece of land the city had written off.',
    washColor: 'rgba(120,120,50,0.30)',
    particle: 'ash',
  },
  {
    key: 'heal',
    year: '2016',
    title: 'THE HEALING',
    line: 'Then, in the 2010s, something hopeful happened. Crews used a method called bioremediation. They planted sunflowers to draw heavy metals out of the soil, and used fungi to break down the contamination. Nature, doing the cleanup.',
    label: 'HEAL',
    washColor: 'rgba(255,210,120,0.22)',
    particle: 'pollen',
  },
  {
    key: 'alive',
    year: 'TODAY',
    title: 'LIVING SOIL',
    label: 'NOW',
    line: 'Today, the ground has recovered. What was once poisoned earth is healthy soil again. Even badly damaged land can come back to life, given time and care.',
    washColor: 'rgba(150,230,120,0.18)',
    particle: 'firefly',
  },
];

/** Title-card copy shown before the first era (the "place the story" moment). */
export const STORY_INTRO = {
  title: 'THE GROUND REMEMBERS',
  subtitle:
    "You're standing on 10th & Center. This soil has lived four lives. Tap the ground to begin.",
} as const;

/** Outro copy shown after the final era. */
export const STORY_OUTRO = {
  title: 'THE GROUND REMEMBERS',
  subtitle: 'Even badly damaged land can come back. Thanks for walking its history.',
} as const;
