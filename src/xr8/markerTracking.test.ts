/**
 * Coverage for the ONE part of markerTracking that is not engine plumbing:
 * telling a listener whether the owning picture is actually in view.
 *
 * It is tested because it is the signal most likely to silently never fire.
 * `stepSelection` deliberately never hands the session back to nobody — a
 * visitor lowering their phone mid-sentence must not lose the story — so
 * `onSelectionChange` cannot answer "is the picture in front of me right now".
 * The lock frame and the TAP TO BEGIN prompt both depend on that answer, and a
 * version of this that never fires looks perfectly fine until someone looks
 * away from a print and is still invited to tap.
 *
 * The XR8 global is declared as an existing-but-empty property rather than
 * left off entirely: `XR8?.Threejs` still throws a ReferenceError on an
 * undeclared identifier, and optional chaining cannot save it. With the
 * property present, `projectToScreen` returns null and markers park at screen
 * centre, which is all selection needs here.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createMarkerTracking, type ImageTargetEvent } from './markerTracking';

beforeEach(() => {
  (globalThis as { XR8?: unknown }).XR8 = undefined;
});

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

const event = (name: string): ImageTargetEvent => ({
  name,
  position: { x: 0, y: 0, z: -1 },
  rotation: { w: 1, x: 0, y: 0, z: 0 },
  scale: 1,
  scaledWidth: 0.1,
  scaledHeight: 0.13,
});

/** Reaches the listener for one engine event by name. */
function fire(module: unknown, eventName: string, detail: unknown): void {
  const listeners = (
    module as { listeners: { event: string; process: (e: { detail: unknown }) => void }[] }
  ).listeners;
  listeners.find((l) => l.event === eventName)!.process({ detail });
}

function step(module: unknown): void {
  (module as { onUpdate: () => void }).onUpdate();
}

describe('markerTracking visibility', () => {
  it('reports the picture as visible once one is found', () => {
    const onVisibilityChange = vi.fn();
    const { module } = createMarkerTracking({
      onSelectionChange: () => {},
      onVisibilityChange,
      now: () => 0,
    });

    step(module);
    expect(onVisibilityChange).not.toHaveBeenCalled();

    fire(module, 'reality.imagefound', event(A));
    step(module);
    expect(onVisibilityChange).toHaveBeenCalledWith(true);
  });

  it('reports it lost when it goes out of view, even though the story stays', () => {
    // The whole point: selection still owns marker A, so onSelectionChange is
    // silent, but the visitor is no longer looking at the print.
    const onSelectionChange = vi.fn();
    const onVisibilityChange = vi.fn();
    const { module } = createMarkerTracking({
      onSelectionChange,
      onVisibilityChange,
      now: () => 0,
    });

    fire(module, 'reality.imagefound', event(A));
    step(module);
    onSelectionChange.mockClear();

    fire(module, 'reality.imagelost', { name: A });
    step(module);

    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
    // Ownership is unchanged — that is why this signal has to exist at all.
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('fires only on the flip, not every frame', () => {
    // It runs in the render loop. A per-frame callback here would re-render
    // React sixty times a second to say the same thing.
    const onVisibilityChange = vi.fn();
    const { module } = createMarkerTracking({
      onSelectionChange: () => {},
      onVisibilityChange,
      now: () => 0,
    });

    fire(module, 'reality.imagefound', event(A));
    step(module);
    step(module);
    step(module);
    expect(onVisibilityChange).toHaveBeenCalledTimes(1);
  });

  it('comes back when the picture is seen again', () => {
    const onVisibilityChange = vi.fn();
    const { module } = createMarkerTracking({
      onSelectionChange: () => {},
      onVisibilityChange,
      now: () => 0,
    });

    fire(module, 'reality.imagefound', event(A));
    step(module);
    fire(module, 'reality.imagelost', { name: A });
    step(module);
    fire(module, 'reality.imagefound', event(A));
    step(module);

    expect(onVisibilityChange.mock.calls.map((c) => c[0])).toEqual([true, false, true]);
  });

  it('stays visible while a different picture is only a candidate', () => {
    // B has not held centre for the dwell yet, so A still owns the session and
    // A is still on screen. Nothing has been lost.
    const onVisibilityChange = vi.fn();
    const { module } = createMarkerTracking({
      onSelectionChange: () => {},
      onVisibilityChange,
      now: () => 0,
    });

    fire(module, 'reality.imagefound', event(A));
    step(module);
    fire(module, 'reality.imagefound', event(B));
    step(module);

    expect(onVisibilityChange).toHaveBeenCalledTimes(1);
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
  });

  it('forgets it was visible when the session is reset', () => {
    // Otherwise a re-entered session starts believing the last one's picture
    // is still on screen, and never sends the first `true`.
    const onVisibilityChange = vi.fn();
    const { module, reset } = createMarkerTracking({
      onSelectionChange: () => {},
      onVisibilityChange,
      now: () => 0,
    });

    fire(module, 'reality.imagefound', event(A));
    step(module);
    reset();
    onVisibilityChange.mockClear();

    fire(module, 'reality.imagefound', event(A));
    step(module);
    expect(onVisibilityChange).toHaveBeenCalledWith(true);
  });
});
