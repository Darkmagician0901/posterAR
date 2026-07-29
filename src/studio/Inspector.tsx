/**
 * Inspector — the right panel, editing the selected frame.
 *
 * Frame identity (year, timeline label, title), narration, and the era wash
 * colour. Wash is offered as a palette rather than a free-text field: it is a
 * mood tint applied over the whole HUD, and arbitrary values are far easier to
 * get wrong than to get right.
 *
 * Story-level copy (intro and outro cards) lives here too, since it is short
 * and there is nowhere better for it until a settings modal exists.
 */

import React from 'react';
import { useStudioDraft } from './studioDraftStore';

/** Era mood tints, taken from the shipped story's five eras. */
const WASHES: Array<{ label: string; value: string }> = [
  { label: 'Rust', value: 'rgba(150,90,40,0.30)' },
  { label: 'Oil', value: 'rgba(40,40,55,0.42)' },
  { label: 'Toxic', value: 'rgba(120,120,50,0.30)' },
  { label: 'Warm', value: 'rgba(255,210,120,0.22)' },
  { label: 'Alive', value: 'rgba(150,230,120,0.18)' },
  { label: 'Cold', value: 'rgba(120,170,210,0.24)' },
  { label: 'None', value: 'rgba(0,0,0,0)' },
];

/** Rough reading time for narration, so authors can feel pacing. */
function readingSeconds(line: string): number {
  const words = line.trim() ? line.trim().split(/\s+/).length : 0;
  return Math.round(words / 2.3);
}

const NARRATION_MAX = 300;

interface InspectorProps {
  /** Opens the stage editor for the selected frame. */
  onOpenStage: () => void;
}

export const Inspector: React.FC<InspectorProps> = ({ onOpenStage }) => {
  const doc = useStudioDraft((s) => s.doc);
  const selected = useStudioDraft((s) => s.selected);
  const persistError = useStudioDraft((s) => s.persistError);
  const { patchFrame, patchDoc } = useStudioDraft.getState();

  const frame = doc.frames[selected];
  if (!frame) return <div className="st-insp" />;

  const propCount = frame.props?.length ?? 0;

  return (
    <div className="st-insp">
      {persistError !== null && (
        <div className="st-warn">
          <b>Draft not saved.</b> {persistError}. Your edits are still here, but they will be lost
          if you close this tab.
        </div>
      )}

      <div className="st-sec">
        <h3>
          FRAME <em>{selected + 1} of {doc.frames.length}</em>
        </h3>
        <div className="st-row">
          <div>
            <label className="st-lbl" htmlFor="st-year">
              Year / when
            </label>
            <input
              id="st-year"
              className="st-in"
              maxLength={8}
              value={frame.year}
              onChange={(e) => patchFrame(selected, { year: e.target.value })}
            />
          </div>
          <div>
            <label className="st-lbl" htmlFor="st-label">
              Timeline label
            </label>
            <input
              id="st-label"
              className="st-in"
              maxLength={6}
              value={frame.label}
              onChange={(e) => patchFrame(selected, { label: e.target.value })}
            />
          </div>
        </div>
        <label className="st-lbl" htmlFor="st-title">
          Frame title
        </label>
        <input
          id="st-title"
          className="st-in"
          maxLength={26}
          value={frame.title}
          onChange={(e) => patchFrame(selected, { title: e.target.value })}
        />
      </div>

      <div className="st-sec">
        <h3>NARRATION</h3>
        <textarea
          className="st-ta"
          maxLength={NARRATION_MAX}
          value={frame.line}
          placeholder="What does the docent say at this stop?"
          onChange={(e) => patchFrame(selected, { line: e.target.value })}
        />
        <div className="st-cnt">
          <span>≈ {readingSeconds(frame.line)}s to read aloud</span>
          <span>
            {frame.line.length}/{NARRATION_MAX}
          </span>
        </div>
      </div>

      <div className="st-sec">
        <h3>
          MOOD <em>tints the whole view</em>
        </h3>
        <div className="st-swatches">
          {WASHES.map((w) => (
            <button
              key={w.value}
              className={`st-swatch ${frame.washColor === w.value ? 'sel' : ''}`}
              style={{
                background:
                  w.value === 'rgba(0,0,0,0)'
                    ? 'repeating-linear-gradient(45deg,#fff 0 5px,#e6ddc8 5px 10px)'
                    : w.value.replace(/[\d.]+\)$/, '1)'),
              }}
              title={w.label}
              aria-label={w.label}
              onClick={() => patchFrame(selected, { washColor: w.value })}
            />
          ))}
        </div>
      </div>

      <div className="st-sec">
        <h3>
          STAGE <em>
            {propCount} prop{propCount === 1 ? '' : 's'}
          </em>
        </h3>
        <button className="st-abtn orange" onClick={onOpenStage}>
          ⬡ OPEN STAGE EDITOR
        </button>
        <div className="st-hintline">
          {propCount > 0
            ? 'This frame is composed from staged props — reopen the editor to rearrange them.'
            : 'This frame uses fixed art. Staging props replaces it with a composed scene.'}
        </div>
      </div>

      <div className="st-sec">
        <h3>STORY CARDS</h3>
        <label className="st-lbl" htmlFor="st-intro-t">
          Intro title
        </label>
        <input
          id="st-intro-t"
          className="st-in"
          maxLength={48}
          value={doc.intro.title}
          onChange={(e) => patchDoc({ intro: { ...doc.intro, title: e.target.value } })}
        />
        <label className="st-lbl" htmlFor="st-intro-s">
          Intro subtitle
        </label>
        <input
          id="st-intro-s"
          className="st-in"
          maxLength={120}
          value={doc.intro.subtitle}
          onChange={(e) => patchDoc({ intro: { ...doc.intro, subtitle: e.target.value } })}
        />
        <label className="st-lbl" htmlFor="st-outro-t">
          Outro title
        </label>
        <input
          id="st-outro-t"
          className="st-in"
          maxLength={48}
          value={doc.outro.title}
          onChange={(e) => patchDoc({ outro: { ...doc.outro, title: e.target.value } })}
        />
        <label className="st-lbl" htmlFor="st-outro-s">
          Outro subtitle
        </label>
        <input
          id="st-outro-s"
          className="st-in"
          maxLength={120}
          value={doc.outro.subtitle}
          onChange={(e) => patchDoc({ outro: { ...doc.outro, subtitle: e.target.value } })}
        />
      </div>
    </div>
  );
};
