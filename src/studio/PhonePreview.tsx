/**
 * PhonePreview — the centre panel: what a visitor will see, in a phone shell.
 *
 * Renders the selected frame's composed art behind the same HUD chrome the
 * viewer draws (era card, docent bubble, timeline, NEXT) so an author can judge
 * copy length and art framing without leaving the desk. The timeline is live —
 * clicking a stop selects that frame, which is the fastest way to walk a story
 * while editing it.
 *
 * This is a facsimile, not the real viewer: it shows a static sky-to-ground
 * gradient rather than a camera feed, and does not type the narration out.
 */

import React from 'react';
import { useStudioDraft } from './studioDraftStore';
import { svgToDataUrl } from './svgPreview';

export const PhonePreview: React.FC = () => {
  const doc = useStudioDraft((s) => s.doc);
  const selected = useStudioDraft((s) => s.selected);
  const select = useStudioDraft((s) => s.select);

  const frame = doc.frames[selected] ?? doc.frames[0];
  const isLast = selected === doc.frames.length - 1;

  return (
    <div className="st-center">
      <div className="st-mode-pill">
        <b>EDITING</b> — frame {selected + 1} of {doc.frames.length}
      </div>

      <div className="st-phone">
        <div className="st-notch" />
        <div className="st-screen">
          <div className="st-stage">
            {frame && <img src={svgToDataUrl(frame.art)} alt="" />}
          </div>

          {/* Era mood wash, matching StoryOverlay's vignette. */}
          <div
            className="st-wash"
            style={{
              background: frame
                ? `radial-gradient(120% 90% at 50% 12%, ${frame.washColor}, transparent 70%)`
                : 'transparent',
            }}
          />

          <div className="st-era-head">
            <div className="st-era-year">{frame?.year}</div>
            <div className="st-era-title">{frame?.title}</div>
          </div>

          <div className="st-narr">
            <div className="st-cube" aria-hidden="true">
              <i className="t" />
              <i className="l" />
              <i className="r" />
            </div>
            <div className="st-bubble">
              {frame?.line.trim() ? (
                frame.line
              ) : (
                <span className="st-empty">No narration yet — add it in the inspector.</span>
              )}
            </div>
          </div>

          <div className="st-mini-tl">
            {doc.frames.map((f, i) => (
              <button
                key={f.key}
                className={`st-mtl ${i === selected ? 'cur' : ''} ${i < selected ? 'done' : ''}`}
                onClick={() => select(i)}
                title={`${f.year} — ${f.title}`}
                aria-label={`Go to frame ${i + 1}`}
              />
            ))}
          </div>

          <button
            className="st-pnext"
            onClick={() => select(Math.min(selected + 1, doc.frames.length - 1))}
            disabled={isLast}
          >
            {isLast ? 'FINISH' : 'NEXT ▶'}
          </button>
        </div>
      </div>
    </div>
  );
};
