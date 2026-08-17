/**
 * markerSelection.ts — which picture the visitor is looking at.
 *
 * Selection is by nearest to the centre of the screen, not by whichever event
 * fired most recently. Two pictures on one wall are both tracked at once, and
 * "most recent" flickers between them as the visitor's hand moves; "nearest
 * centre" is stable, and it matches what a visitor means by looking at
 * something. A short dwell keeps a glance across the room from yanking the
 * story away mid-sentence.
 *
 * Pure: screen positions are normalised to centre (0,0), edges ±1, so none of
 * this needs a device to test.
 */

/** How long a marker must hold centre before it claims the session. */
export const DWELL_MS = 400;

/** One marker the tracker currently sees. */
export interface TrackedMarker {
  /** The target's `name`, which is its markerId. */
  name: string;
  /** Normalised horizontal position; 0 is centre, ±1 the edges. */
  screenX: number;
  /** Normalised vertical position; 0 is centre, ±1 the edges. */
  screenY: number;
}

/** Which story is live, and which is trying to take over. */
export interface SelectionState {
  current: string | null;
  candidate: string | null;
  /** When `candidate` first took centre, in the caller's clock. */
  since: number;
}

export const INITIAL_SELECTION: SelectionState = { current: null, candidate: null, since: 0 };

/**
 * The tracked marker closest to the centre of the screen.
 *
 * @param tracked — Every marker currently visible.
 * @returns Its name, or null when nothing is tracked. Ties break on name so
 *   the result cannot depend on event order — an order-dependent tie is a
 *   flicker between two equidistant pictures.
 */
export function nearestToCentre(tracked: TrackedMarker[]): string | null {
  let best: TrackedMarker | null = null;
  let bestD = Infinity;

  for (const m of tracked) {
    const d = m.screenX * m.screenX + m.screenY * m.screenY;
    if (d < bestD || (d === bestD && best !== null && m.name < best.name)) {
      best = m;
      bestD = d;
    }
  }

  return best === null ? null : best.name;
}

/**
 * Advances the selection by one frame.
 *
 * @param state — The previous selection.
 * @param tracked — Every marker currently visible.
 * @param now — A monotonic clock in milliseconds.
 * @returns The next selection. The live story is never cleared by losing
 *   sight of its marker — only by another marker holding centre for the dwell.
 */
export function stepSelection(
  state: SelectionState,
  tracked: TrackedMarker[],
  now: number,
): SelectionState {
  const nearest = nearestToCentre(tracked);

  // Nothing visible: hold what is live. A visitor lowering their phone
  // mid-sentence must not lose the story.
  if (nearest === null) return { ...state, candidate: null, since: now };

  // Nothing live yet — the first picture seen claims the session at once,
  // because there is no story to interrupt.
  if (state.current === null) return { current: nearest, candidate: null, since: now };

  if (nearest === state.current) return { ...state, candidate: null, since: now };

  // A different picture. Start or continue its dwell.
  if (state.candidate !== nearest) return { ...state, candidate: nearest, since: now };

  return now - state.since >= DWELL_MS
    ? { current: nearest, candidate: null, since: now }
    : state;
}
