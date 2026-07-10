/**
 * StoryOverlay — the 2D HUD for "THE GROUND REMEMBERS".
 *
 * Renders over the live 8th Wall camera feed (the diorama itself is the
 * AR-anchored tile drawn by the engine; this is the chrome around it). Ported
 * from the design prototype: an era-colored vignette, the docent cube +
 * typewritten narration, a year/title card, the five-stop timeline, and the
 * scan / NEXT / BACK controls. All state comes from useStoryStore.
 *
 * Pointer events: the root is transparent to touches so taps fall through to
 * the canvas (to place the tile and look around); only the bottom control bar
 * and timeline opt back in, so buttons remain tappable.
 */

import React from 'react';
import { useStoryStore } from '@/store/storyStore';
import { useContentStore } from '@/store/contentStore';
import { useStoryTypewriter } from './useStoryTypewriter';
import './StoryOverlay.css';

/**
 * Whether a surface lock has been reported. Passed from StoryARExperience so
 * the intro card can switch its prompt from "find the ground" to "tap to
 * place" without the overlay needing engine access.
 */
interface StoryOverlayProps {
  /** True once the reticle has locked a surface (tap will place). */
  surfaceReady: boolean;
}

export const StoryOverlay: React.FC<StoryOverlayProps> = ({ surfaceReady }) => {
  const { phase, eraIndex, placed, next, prev, jumpTo, reset } = useStoryStore();
  const { doc, isPreview } = useContentStore();
  const era = doc.eras[eraIndex];

  // Type the narration only while an era is on screen.
  const { shown, done, skip } = useStoryTypewriter(
    era.line,
    phase === 'placed'
  );

  const isLast = eraIndex === doc.eras.length - 1;

  return (
    <div className="story-overlay" aria-live="polite">
      {isPreview && <div className="story-preview-badge">DRAFT PREVIEW</div>}
      {/* Era mood vignette (the prototype's "wash"). */}
      <div
        className="story-vignette"
        style={{
          background:
            phase === 'placed'
              ? `radial-gradient(120% 90% at 50% 12%, ${era.washColor}, transparent 70%)`
              : 'transparent',
        }}
      />

      {/* ── Intro / scan card ─────────────────────────────────────────── */}
      {!placed && phase !== 'outro' && (
        <div className="story-card story-card-intro">
          <div className="story-kicker">{doc.intro.kicker}</div>
          <h1 className="story-title">{doc.intro.title}</h1>
          <p className="story-sub">{doc.intro.subtitle}</p>
          <div className={`story-scan ${surfaceReady ? 'ready' : ''}`}>
            <span className="story-scan-ring" />
            {surfaceReady ? doc.ui.tapPrompt : doc.ui.scanPrompt}
          </div>
        </div>
      )}

      {/* ── Era title card (top) ──────────────────────────────────────── */}
      {phase === 'placed' && (
        <div className="story-era-head" key={era.key}>
          <div className="story-year">{era.year}</div>
          <div className="story-era-title">{era.title}</div>
        </div>
      )}

      {/* ── Docent + narration (bottom sheet) ─────────────────────────── */}
      {phase === 'placed' && (
        <div className="story-docent-row">
          <div className="story-cube" aria-hidden="true">
            <span className="story-cube-top" />
            <span className="story-cube-left" />
            <span className="story-cube-right" />
          </div>
          <button
            type="button"
            className="story-narration"
            onClick={() => (done ? next() : skip())}
            aria-label={done ? 'Next era' : 'Reveal full text'}
          >
            <span>{shown}</span>
            {!done && <span className="story-caret">▍</span>}
          </button>
        </div>
      )}

      {/* ── Outro card ────────────────────────────────────────────────── */}
      {phase === 'outro' && (
        <div className="story-card story-card-outro">
          <h1 className="story-title">{doc.outro.title}</h1>
          <p className="story-sub">{doc.outro.subtitle}</p>
          <button className="story-btn" onClick={() => jumpTo(0)}>
            {doc.outro.replayLabel}
          </button>
          <button className="story-btn story-btn-ghost" onClick={reset}>
            {doc.outro.resetLabel}
          </button>
        </div>
      )}

      {/* ── Timeline + controls (bottom bar) ──────────────────────────── */}
      {phase === 'placed' && (
        <div className="story-bottom">
          <div className="story-timeline" role="tablist" aria-label="Eras">
            {doc.eras.map((e, i) => (
              <button
                key={e.key}
                role="tab"
                aria-selected={i === eraIndex}
                className={`story-stop ${i === eraIndex ? 'active' : ''} ${
                  i < eraIndex ? 'done' : ''
                }`}
                onClick={() => jumpTo(i)}
                title={`${e.year} — ${e.title}`}
              >
                <span className="story-stop-dot" />
                <span className="story-stop-label">{e.label}</span>
              </button>
            ))}
          </div>

          <div className="story-nav">
            <button
              className="story-btn story-btn-ghost"
              onClick={prev}
              disabled={eraIndex === 0}
            >
              {doc.ui.backLabel}
            </button>
            <button className="story-btn" onClick={next}>
              {isLast ? doc.ui.finishLabel : doc.ui.nextLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
