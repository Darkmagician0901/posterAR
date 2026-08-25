/**
 * markerLock.ts — has the visitor found a picture, and have they started it.
 *
 * Marker mode replaces the ground reticle with a lock frame on the printed
 * picture and a tap to begin (`docs/marker-locator-design.md` §5). That is a
 * three-state machine, and it is pure, so it belongs here rather than tangled
 * into the engine callbacks in StoryARExperience.
 *
 * The transitions carry the whole of §5.3: once started, the SAME marker
 * coming back into view must not move anything, because the visitor has walked
 * around a scene many times the print's width and SLAM — not the tracker — is
 * the authority. A DIFFERENT marker still switches stories and re-latches,
 * without asking for a second tap.
 */

/** Where the visitor is in the marker-mode entry flow. */
export type LockStatus =
  /** No picture in view. The prompt reads POINT AT THE PICTURE. */
  | 'searching'
  /** A picture is tracked and framed. The prompt reads TAP TO BEGIN. */
  | 'locked'
  /** The tap has happened: the scene is latched and the story is running. */
  | 'started';

/** The lock state, plus which picture it belongs to. */
export interface LockState {
  status: LockStatus;
  /** markerId, or null while nothing has ever been locked. */
  markerId: string | null;
}

export const INITIAL_LOCK: LockState = { status: 'searching', markerId: null };

/**
 * The owning marker is visible.
 *
 * @param state — Current state.
 * @param markerId — The marker now owning the session.
 * @returns The next state. Returns `state` itself — the same reference — when
 *   nothing changed, so a caller can cheaply skip re-rendering.
 */
export function markerSeen(state: LockState, markerId: string): LockState {
  if (state.status === 'started') {
    // Same picture: the scene is already latched, leave it alone. Different
    // picture: point at the new one, still started, no second tap needed.
    return state.markerId === markerId ? state : { status: 'started', markerId };
  }
  if (state.status === 'locked' && state.markerId === markerId) return state;
  return { status: 'locked', markerId };
}

/**
 * No marker is being tracked any more.
 *
 * @param state — Current state.
 * @returns The next state. A started session is unaffected: the whole reason
 *   the pose latches is that the visitor has to step back out of the marker's
 *   reliable range to look at the scene.
 */
export function markerLost(state: LockState): LockState {
  if (state.status === 'started') return state;
  return INITIAL_LOCK;
}

/**
 * The visitor tapped the screen.
 *
 * @param state — Current state.
 * @returns The next state. A tap with nothing locked does nothing, rather than
 *   latching the scene to a pose that was never read.
 */
export function tapped(state: LockState): LockState {
  return state.status === 'locked' ? { status: 'started', markerId: state.markerId } : state;
}
