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
import { useStudioDraft } from './studioDraftStore';
import { isStoryHostConfigured } from '@/services/storyApi';
import './studio.css';

export const StudioApp: React.FC = () => {
  const title = useStudioDraft((s) => s.doc.title);
  const canUndo = useStudioDraft((s) => s.canUndo);
  const selected = useStudioDraft((s) => s.selected);
  const { patchDoc, undo, reset } = useStudioDraft.getState();
  const [stageOpen, setStageOpen] = useState(false);

  const publishable = isStoryHostConfigured();

  return (
    <div className="st-root">
      <div className="st-topbar">
        <div className="st-logo">
          <div className="st-cube" aria-hidden="true">
            <i className="t" />
            <i className="l" />
            <i className="r" />
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
              if (window.confirm('Discard this draft and start again from the bundled story?')) {
                reset();
              }
            }}
          >
            ⟲ RESET
          </button>
          <a
            className="st-btn green"
            href="/?draft=1"
            target="_blank"
            rel="noreferrer"
            title="Open this draft in the real viewer"
          >
            ▶ PREVIEW
          </a>
          <button
            className="st-btn orange"
            disabled={!publishable}
            title={
              publishable
                ? 'Publish this story'
                : 'Publishing needs a story host — set VITE_STORY_BASE_URL'
            }
          >
            ⬆ PUBLISH
          </button>
        </div>
      </div>

      <div className="st-wrap">
        <FramesRail />
        <PhonePreview />
        <Inspector onOpenStage={() => setStageOpen(true)} />
      </div>

      {stageOpen && (
        <StageEditor frameIndex={selected} onClose={() => setStageOpen(false)} />
      )}
    </div>
  );
};

export default StudioApp;
