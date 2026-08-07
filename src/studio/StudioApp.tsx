/**
 * StudioApp — the ARCADE STUDIO shell.
 *
 * Three columns: the frames rail, the phone preview, and the inspector, under
 * a top bar carrying the story title and the session actions.
 *
 * Loaded only via the /studio lazy chunk, so none of this — including its CSS
 * and the prop builders it pulls in — reaches the visitor bundle.
 *
 * Publish is deliberately disabled until a story host is configured. Preview
 * works today with no backend: the draft store mirrors to localStorage and the
 * viewer's ?draft=1 path reads it back.
 */

import React, { useState } from 'react';
import { FramesRail } from './FramesRail';
import { PhonePreview } from './PhonePreview';
import { Inspector } from './Inspector';
import { StageEditor } from './StageEditor';
import { PublishDialog } from './PublishDialog';
import { useStudioDraft } from './studioDraftStore';
import { IS_DEMO, DEMO_NOTE } from './demoMode';
import './studio.css';

export interface StudioAppProps {
  /**
   * Demo mode: the two actions that need a backend render disabled. Defaults to
   * the build flag; taken as a prop so both branches are testable.
   */
  demo?: boolean;
}

export const StudioApp: React.FC<StudioAppProps> = ({ demo = IS_DEMO }) => {
  const title = useStudioDraft((s) => s.doc.title);
  const canUndo = useStudioDraft((s) => s.canUndo);
  const selected = useStudioDraft((s) => s.selected);
  const { patchDoc, undo, newStory } = useStudioDraft.getState();
  const [stageOpen, setStageOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  return (
    // The demo flag reaches the stylesheet so the rail can reserve room for the
    // floating RESET DEMO chip, which only exists in that build.
    <div className={`st-root ${demo ? 'demo' : ''}`}>
      <div className="st-topbar">
        <div className="st-logo">
          <div className="st-eml" aria-label="UBC Emerging Media Lab">
            <span>EML</span>
          </div>
          <div>
            <div className="st-word">
              ARCADE <b>STUDIO</b>
            </div>
            <div className="st-sub">story builder</div>
          </div>
        </div>

        <div className="st-title-field">
          <input
            value={title}
            maxLength={40}
            aria-label="Experience title"
            onChange={(e) => patchDoc({ title: e.target.value })}
          />
        </div>

        <div className="st-actions">
          {demo && (
            <span className="st-demo-badge" title={DEMO_NOTE}>
              DEMO BUILD
            </span>
          )}
          <button
            className="st-btn ghost"
            onClick={undo}
            disabled={!canUndo}
            title="Undo the last change"
          >
            ↶ UNDO
          </button>
          <button
            className="st-btn ghost"
            onClick={() => {
              if (window.confirm('Start a new blank story? This discards the current draft.')) {
                newStory();
              }
            }}
            title="Start a fresh story from scratch"
          >
            ✦ NEW
          </button>
          <button
            className="st-btn green"
            onClick={() => setPlaying((p) => !p)}
            title="Walk the story as a visitor would"
          >
            {playing ? '✎ EDIT' : '▶ PREVIEW'}
          </button>
          {demo ? (
            <button className="st-btn paper" disabled title={DEMO_NOTE}>
              ⧉ ON DEVICE
            </button>
          ) : (
            <a
              className="st-btn paper"
              href="/?draft=1"
              target="_blank"
              rel="noreferrer"
              title="Open this draft in the real app — use this to test on a phone"
            >
              ⧉ ON DEVICE
            </a>
          )}
          <button
            className="st-btn orange"
            onClick={() => setPublishOpen(true)}
            disabled={demo}
            title={demo ? DEMO_NOTE : 'Publish this story and get a shareable link'}
          >
            ⬆ PUBLISH
          </button>
        </div>
      </div>

      <div className="st-wrap">
        <FramesRail />
        <PhonePreview playing={playing} onExitPlay={() => setPlaying(false)} />
        <Inspector onOpenStage={() => setStageOpen(true)} />
      </div>

      {stageOpen && (
        <StageEditor frameIndex={selected} onClose={() => setStageOpen(false)} />
      )}

      {publishOpen && <PublishDialog onClose={() => setPublishOpen(false)} />}
    </div>
  );
};

export default StudioApp;
