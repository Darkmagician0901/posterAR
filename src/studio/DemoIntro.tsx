/**
 * DemoIntro — the demo build's only added surface.
 *
 * Two pieces, both absent from the real studio: a dismissible card that tells a
 * visitor with no context what they are looking at and what to try, and a
 * persistent RESET DEMO chip so a thoroughly poked-at studio can be put back to
 * the default story. Rendered by src/demoMain.tsx, never by StudioApp, so none
 * of it can reach the production bundle.
 *
 * The card takes its viewport width and storage as optional props: the defaults
 * are the real window, and the injection points exist so both branches are
 * testable without a browser.
 */

import React, { useState } from 'react';
import { DEMO_NOTE, isNarrowViewport, readIntroDismissed, dismissIntro, resetDemo } from './demoMode';

export interface DemoIntroProps {
  /** Viewport width driving the desktop-only notice. Defaults to the window. */
  width?: number;
  /** Where the dismissal and the draft live. Defaults to localStorage. */
  storage?: Storage;
}

/** Falls back to a desktop width when there is no window (server render, tests). */
function viewportWidth(): number {
  return typeof window === 'undefined' ? 1440 : window.innerWidth;
}

export const DemoIntro: React.FC<DemoIntroProps> = ({ width, storage }) => {
  const store = storage ?? window.localStorage;
  const [open, setOpen] = useState(() => !readIntroDismissed(store));
  const narrow = isNarrowViewport(width ?? viewportWidth());

  const onReset = () => {
    if (window.confirm('Reset the demo? This discards your changes and restores the original story.')) {
      resetDemo(store);
      window.location.reload();
    }
  };

  return (
    <>
      {open && (
        <div className="st-demo-scrim">
          <div className="st-demo-card" role="dialog" aria-label="About this demo">
            <div className="st-demo-kicker">ARCADE STUDIO</div>
            <p className="st-demo-lead">
              A browser story builder for AR poster experiences, made for the UBC Emerging Media
              Lab. This is the real authoring tool, running entirely in this tab — built by Chirag
              Deepak.
            </p>
            <ul className="st-demo-try">
              <li>Open a frame&rsquo;s stage and drag a prop around the map.</li>
              <li>Give a frame its own font and color in the inspector.</li>
              <li>Drag inside the phone preview to look around the scene.</li>
            </ul>
            {narrow && (
              <p className="st-demo-warn">
                Built for a desktop layout — open this on a laptop for the full studio.
              </p>
            )}
            <p className="st-demo-note">{DEMO_NOTE}</p>
            <button
              className="st-btn green st-demo-go"
              onClick={() => {
                dismissIntro(store);
                setOpen(false);
              }}
            >
              START EXPLORING
            </button>
          </div>
        </div>
      )}
      <button className="st-demo-reset" onClick={onReset} title="Restore the original demo story">
        ↺ RESET DEMO
      </button>
    </>
  );
};
