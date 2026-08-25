import { describe, expect, it } from 'vitest';
import { INITIAL_LOCK, markerLost, markerSeen, tapped } from './markerLock';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

describe('markerLock', () => {
  it('starts searching, with nothing locked', () => {
    expect(INITIAL_LOCK).toEqual({ status: 'searching', markerId: null });
  });

  it('locks onto the first picture it sees', () => {
    expect(markerSeen(INITIAL_LOCK, A)).toEqual({ status: 'locked', markerId: A });
  });

  it('goes back to searching when the picture is lost before the tap', () => {
    // Spec §5.1 step 5: the prompt reverts to POINT AT THE PICTURE.
    expect(markerLost(markerSeen(INITIAL_LOCK, A))).toEqual(INITIAL_LOCK);
  });

  it('starts the story on a tap, but only once locked', () => {
    const locked = markerSeen(INITIAL_LOCK, A);
    expect(tapped(locked)).toEqual({ status: 'started', markerId: A });
  });

  it('ignores a tap while nothing is locked', () => {
    // Otherwise a tap on an empty wall would latch the scene to no pose at all.
    expect(tapped(INITIAL_LOCK)).toEqual(INITIAL_LOCK);
  });

  it('survives losing the picture once started, because SLAM holds the scene', () => {
    // This is the whole point of latching: the visitor must step back out of
    // the marker's reliable range to see a scene many times its width.
    const started = tapped(markerSeen(INITIAL_LOCK, A));
    expect(markerLost(started)).toBe(started);
  });

  it('stays started when the same picture comes back into view', () => {
    // Spec §5.3: re-detecting the SAME marker must not move the scene — the
    // visitor has walked around it and SLAM is the authority now.
    const started = tapped(markerSeen(INITIAL_LOCK, A));
    expect(markerSeen(started, A)).toBe(started);
  });

  it('follows a different picture without asking for another tap', () => {
    // Spec §5.3: a different marker still switches stories and re-latches.
    const started = tapped(markerSeen(INITIAL_LOCK, A));
    expect(markerSeen(started, B)).toEqual({ status: 'started', markerId: B });
  });

  it('does not mutate the state it is given', () => {
    const locked = markerSeen(INITIAL_LOCK, A);
    tapped(locked);
    markerLost(locked);
    expect(locked).toEqual({ status: 'locked', markerId: A });
  });
});
