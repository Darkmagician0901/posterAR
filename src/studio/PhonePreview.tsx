/**
 * PhonePreview — the centre panel, in two modes.
 *
 * EDITING shows the selected frame with the HUD chrome around it, so an author
 * can judge copy length and art framing while typing. Clicking a timeline stop
 * selects that frame for editing.
 *
 * PLAYING walks the story exactly as a visitor would: intro card, ground scan,
 * tap to place, then each frame with its narration typed out, and finally the
 * outro. It reuses the viewer's own useStoryTypewriter so pacing is identical
 * rather than approximated, and the scan prompts match the real overlay's copy.
 *
 * This is still a facsimile in one respect: it shows a painted sky-to-ground
 * gradient rather than a camera feed, because there is no camera on a desk.
 */

import React, { useState } from 'react';
import { useStudioDraft } from './studioDraftStore';
import { svgToDataUrl } from './svgPreview';
import { useStoryTypewriter } from '@/components/story/useStoryTypewriter';

/** Where a playthrough currently is. */
type PlayStage = 'intro' | 'scanning' | 'placed' | 'outro';

interface PhonePreviewProps {
  /** True while the studio is in playthrough mode. */
  playing: boolean;
  /** Leaves playthrough mode. */
  onExitPlay: () => void;
}

export const PhonePreview: React.FC<PhonePreviewProps> = ({ playing, onExitPlay }) => {
  const doc = useStudioDraft((s) => s.doc);
  const selected = useStudioDraft((s) => s.selected);
  const select = useStudioDraft((s) => s.select);

  const [stage, setStage] = useState<PlayStage>('intro');
  const [playIndex, setPlayIndex] = useState(0);
  // The real viewer only lets you tap once a surface is found; mirror that beat
  // rather than jumping straight to the story.
  const [surfaceReady, setSurfaceReady] = useState(false);

  // In play mode the index is the playthrough's own; in editing it follows the
  // rail selection.
  const index = playing ? playIndex : selected;
  const frame = doc.frames[index] ?? doc.frames[0];
  const isLast = index === doc.frames.length - 1;

  const showingFrame = !playing || stage === 'placed';
  const { shown, done, skip } = useStoryTypewriter(
    frame?.line ?? '',
    playing && stage === 'placed',
  );

  const startPlay = (): void => {
    setStage('scanning');
    setSurfaceReady(false);
    // The viewer reaches "surface found" after a moment of looking around.
    window.setTimeout(() => setSurfaceReady(true), 1200);
  };

  const restart = (): void => {
    setPlayIndex(0);
    setStage('intro');
    setSurfaceReady(false);
  };

  const advance = (): void => {
    if (isLast) {
      setStage('outro');
      return;
    }
    setPlayIndex((i) => i + 1);
  };

  return (
    <div className="st-center">
      <div className="st-mode-pill">
        {playing ? (
          <>
            <b>PLAYING</b> — as a visitor sees it
          </>
        ) : (
          <>
            <b>EDITING</b> — frame {selected + 1} of {doc.frames.length}
          </>
        )}
      </div>

      <div className="st-phone">
        <div className="st-notch" />
        <div className="st-screen">
          <div className="st-stage">{frame && <img src={svgToDataUrl(frame.art)} alt="" />}</div>

          {/* Era mood wash, matching StoryOverlay's vignette. */}
          <div
            className="st-wash"
            style={{
              background:
                frame && showingFrame
                  ? `radial-gradient(120% 90% at 50% 12%, ${frame.washColor}, transparent 70%)`
                  : 'transparent',
            }}
          />

          {showingFrame && (
            <>
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
                <button
                  className="st-bubble"
                  onClick={() => {
                    if (!playing) return;
                    if (done) advance();
                    else skip();
                  }}
                  style={{ textAlign: 'left', cursor: playing ? 'pointer' : 'default' }}
                >
                  {playing ? (
                    <>
                      {shown}
                      {!done && <span className="st-caret">▍</span>}
                    </>
                  ) : frame?.line.trim() ? (
                    frame.line
                  ) : (
                    <span className="st-empty">No narration yet — add it in the inspector.</span>
                  )}
                </button>
              </div>

              <div className="st-mini-tl">
                {doc.frames.map((f, i) => (
                  <button
                    key={f.key}
                    className={`st-mtl ${i === index ? 'cur' : ''} ${i < index ? 'done' : ''}`}
                    onClick={() => (playing ? setPlayIndex(i) : select(i))}
                    title={`${f.year} — ${f.title}`}
                    aria-label={`Go to frame ${i + 1}`}
                  />
                ))}
              </div>

              <button
                className="st-pnext"
                onClick={() => (playing ? advance() : select(Math.min(index + 1, doc.frames.length - 1)))}
                disabled={!playing && isLast}
              >
                {isLast ? 'FINISH' : 'NEXT ▶'}
              </button>
            </>
          )}

          {/* ── Intro card ─────────────────────────────────────────────── */}
          {playing && stage === 'intro' && (
            <div className="st-pcard">
              <div className="st-k">DEMO EXPERIENCE</div>
              <div className="st-t">{doc.intro.title}</div>
              <div className="st-s">{doc.intro.subtitle}</div>
              <button className="st-pbtn" onClick={startPlay}>
                ▶ BEGIN
              </button>
            </div>
          )}

          {/* ── Ground scan, mirroring the real overlay's two prompts ───── */}
          {playing && stage === 'scanning' && (
            <div className="st-pcard">
              <div className="st-k">DEMO EXPERIENCE</div>
              <div className="st-t">{doc.intro.title}</div>
              <div className="st-s">{doc.intro.subtitle}</div>
              <div className={`st-scan ${surfaceReady ? 'ready' : ''}`}>
                <span className="st-scan-ring" />
                {surfaceReady ? 'TAP THE GROUND TO PLACE' : 'MOVE PHONE TO FIND THE GROUND'}
              </div>
              {surfaceReady && (
                <button
                  className="st-pbtn"
                  onClick={() => {
                    setPlayIndex(0);
                    setStage('placed');
                  }}
                >
                  TAP TO PLACE
                </button>
              )}
            </div>
          )}

          {/* ── Outro card ─────────────────────────────────────────────── */}
          {playing && stage === 'outro' && (
            <div className="st-pcard">
              <div className="st-t">{doc.outro.title}</div>
              <div className="st-s">{doc.outro.subtitle}</div>
              <button className="st-pbtn" onClick={restart}>
                ↻ WALK IT AGAIN
              </button>
              <button className="st-pbtn ghost" onClick={onExitPlay}>
                ✎ BACK TO EDITING
              </button>
            </div>
          )}
        </div>
      </div>

      {playing && (
        <button className="st-btn paper" onClick={onExitPlay}>
          ✎ BACK TO EDITING
        </button>
      )}
    </div>
  );
};
