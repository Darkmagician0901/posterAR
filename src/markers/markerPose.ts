/**
 * markerPose.ts — how big the artwork is, and where it sits on the marker.
 *
 * Split out of the engine wiring because it is the one part of marker
 * placement that is arithmetic rather than plumbing, and arithmetic can be
 * tested without a phone. `markerTracking.ts` supplies the engine's numbers;
 * this decides what to do with them.
 *
 * The sizing rule is a RATIO, never a measurement. The engine reports a
 * marker's size in units it never names, so the tile is sized as
 * `reported x multiplier` — which is correct whatever those units mean,
 * because the same unknown appears on both sides and cancels. See
 * `docs/marker-layer-design.md` §5.1.
 */

/** The engine's reported dimensions for one tracked image. */
export interface MarkerDimensions {
  scaledWidth: number;
  scaledHeight: number;
}

/** How large the artwork should be drawn, in the engine's own units. */
export interface TileSize {
  width: number;
  height: number;
}

/**
 * v1 multiplier: artwork exactly covers the printed picture.
 *
 * **This is the value MOD-M1 exists to change** (`docs/marker-layer-design.md`
 * §10a.1). The installation wants a small marker locating much larger content,
 * which means a multiplier above 1. It is a named constant threaded through a
 * parameter rather than a literal baked into the geometry, so raising it is an
 * edit here plus a Studio control — not a hunt through engine code.
 */
export const DEFAULT_WIDTH_IN_MARKERS = 1;

/**
 * Sizes the artwork plane from what the engine reports.
 *
 * @param dims — The engine's `scaledWidth`/`scaledHeight` for this marker.
 * @param widthInMarkers — How many marker-widths wide the artwork should be.
 *   1 covers the marker exactly. Larger values scale both axes together, so
 *   the artwork keeps the marker's aspect and never stretches.
 * @returns The plane size, in the engine's units.
 */
export function tileSize(
  dims: MarkerDimensions,
  widthInMarkers: number = DEFAULT_WIDTH_IN_MARKERS,
): TileSize {
  // Guard rather than trust: a multiplier of 0 or below would collapse the
  // plane to nothing, which on a phone looks exactly like "tracking is broken"
  // and would send someone debugging the engine instead of the number.
  const k = Number.isFinite(widthInMarkers) && widthInMarkers > 0 ? widthInMarkers : 1;
  return { width: dims.scaledWidth * k, height: dims.scaledHeight * k };
}

/**
 * True when the engine's reported dimensions are usable.
 *
 * FLAT targets carry `scaledWidth`/`scaledHeight`; cylindrical and conical
 * ones do not, and Studio only ever generates PLANAR. A target arriving
 * without them means something upstream changed, and sizing from `undefined`
 * would silently produce a `NaN`-sized plane that never appears — the most
 * confusing failure available.
 */
export function hasDimensions(e: {
  scaledWidth?: number;
  scaledHeight?: number;
}): e is MarkerDimensions {
  return (
    typeof e.scaledWidth === 'number' &&
    typeof e.scaledHeight === 'number' &&
    Number.isFinite(e.scaledWidth) &&
    Number.isFinite(e.scaledHeight) &&
    e.scaledWidth > 0 &&
    e.scaledHeight > 0
  );
}
