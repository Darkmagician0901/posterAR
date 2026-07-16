/**
 * Regression test for the "NotFoundError: The object can not be found here."
 * crash on the live AR path (upload → tap).
 *
 * Root cause: 8th Wall's XRExtras.FullWindowCanvas reparents the React-rendered
 * <canvas> to document.body on session start. React fragments are flattened, so
 * if the canvas is a direct sibling of the other overlays in .app-container,
 * React uses the (now-moved) canvas as the insertBefore anchor whenever a
 * sibling mounts immediately before it — notably the DebugHUD panel toggled on
 * by the first placement tap (placePoster() → setHudVisible(true)). insertBefore
 * with a reference node that is no longer a child throws NotFoundError, which the
 * app's ErrorBoundary catches → the "Oops! Something went wrong" screen.
 *
 * The fix wraps the canvas in a stable holder <div> (see StoryARExperience.tsx) so
 * React always anchors on the holder, never on the canvas itself.
 *
 * Test 1 models the failing operation directly at the DOM level (deterministic;
 * happy-dom phrases the DOMException differently from WebKit but it is the same
 * NotFoundError). Test 2 drives the FIXED shape through real React reconciliation
 * to prove the wrapper keeps a valid insert anchor after the canvas is moved.
 */

import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { flushSync } from 'react-dom';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  try {
    root?.unmount();
  } catch {
    /* ignore */
  }
  root = null;
  container?.remove();
  container = null;
  document.querySelectorAll('#camerafeed, .app-container').forEach((n) => n.remove());
});

describe('AR canvas reparent vs. sibling insert', () => {
  it('reproduces the NotFoundError: insertBefore anchored on a reparented canvas', () => {
    // Flattened shape (no wrapper): .app-container directly contains the canvas.
    const appContainer = document.createElement('div');
    appContainer.className = 'app-container';
    document.body.appendChild(appContainer);

    const canvas = document.createElement('canvas');
    canvas.id = 'camerafeed';
    const overlay = document.createElement('div');
    appContainer.append(canvas, overlay); // children: [canvas, overlay]

    // 8th Wall's FullWindowCanvas moves the canvas out to document.body.
    document.body.appendChild(canvas);

    // React would now mount a sibling (the DebugHUD panel) immediately before
    // the canvas → insertBefore(panel, canvas), with canvas no longer a child.
    const panel = document.createElement('div');
    let caught: unknown = null;
    try {
      appContainer.insertBefore(panel, canvas);
    } catch (e) {
      caught = e;
    }

    // happy-dom and WebKit phrase this DOMException differently ("...not a
    // child of this node." vs "The object can not be found here.") but it is the
    // same NotFoundError that crashed the app.
    expect(caught).toBeInstanceOf(DOMException);
    expect((caught as DOMException).message).toMatch(/not a child of this node/i);

    appContainer.remove();
    canvas.remove();
  });

  it('wrapping the canvas keeps a valid anchor under React reconciliation', () => {
    function Fixed({ show }: { show: boolean }) {
      return (
        <>
          {show && <div className="panel">panel</div>}
          <div className="ar-canvas-holder">
            <canvas id="camerafeed" />
          </div>
          <div className="overlay">overlay</div>
        </>
      );
    }

    container = document.createElement('div');
    container.className = 'app-container';
    document.body.appendChild(container);
    root = createRoot(container);

    flushSync(() => root!.render(<Fixed show={false} />));

    // 8th Wall moves the canvas out from inside the holder to document.body.
    document.body.appendChild(container.querySelector('#camerafeed')!);

    // Toggling the panel on now anchors the insert on the holder (still a child
    // of .app-container), not the moved canvas — so the commit succeeds.
    expect(() => flushSync(() => root!.render(<Fixed show={true} />))).not.toThrow();
    expect(container.querySelector('.panel')).not.toBeNull();
  });
});
