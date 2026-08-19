import { describe, expect, it } from 'vitest';
import {
  DWELL_MS, INITIAL_SELECTION, nearestToCentre, stepSelection,
} from './markerSelection';

const a = { name: 'a', screenX: 0.05, screenY: 0 };
const b = { name: 'b', screenX: 0.6, screenY: 0.2 };

describe('nearestToCentre', () => {
  it('is null when nothing is tracked', () => {
    expect(nearestToCentre([])).toBeNull();
  });

  it('picks the marker closest to the middle of the screen', () => {
    expect(nearestToCentre([b, a])).toBe('a');
  });

  it('does not depend on the order events arrived in', () => {
    expect(nearestToCentre([a, b])).toBe(nearestToCentre([b, a]));
  });

  it('breaks an exact tie deterministically, so it cannot flicker', () => {
    const l = { name: 'l', screenX: -0.3, screenY: 0 };
    const r = { name: 'r', screenX: 0.3, screenY: 0 };
    expect(nearestToCentre([l, r])).toBe(nearestToCentre([r, l]));
  });
});

describe('stepSelection', () => {
  it('claims the session immediately when nothing is live yet', () => {
    expect(stepSelection(INITIAL_SELECTION, [a], 1000).current).toBe('a');
  });

  it('does not switch before the dwell has elapsed', () => {
    const live = stepSelection(INITIAL_SELECTION, [a], 0);
    expect(stepSelection(live, [b], DWELL_MS - 1).current).toBe('a');
  });

  it('switches once the new marker has held centre for the dwell', () => {
    const live = stepSelection(INITIAL_SELECTION, [a], 0);
    const pending = stepSelection(live, [b], 1);
    expect(stepSelection(pending, [b], 1 + DWELL_MS).current).toBe('b');
  });

  it('a glance across the room does not yank the story away', () => {
    const live = stepSelection(INITIAL_SELECTION, [a], 0);
    const glance = stepSelection(live, [b], 10);
    const back = stepSelection(glance, [a], 20);
    expect(stepSelection(back, [a], 10_000).current).toBe('a');
  });

  it('keeps the live story when every marker is lost', () => {
    const live = stepSelection(INITIAL_SELECTION, [a], 0);
    expect(stepSelection(live, [], 5000).current).toBe('a');
  });
});
