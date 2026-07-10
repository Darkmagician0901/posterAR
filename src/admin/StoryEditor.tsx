/**
 * StoryEditor — intro card, the five era cards, and the outro card.
 * All inputs are controlled by the admin draft store (autosaves per change).
 */

import React from 'react';
import { useAdminDraftStore } from './adminDraftStore';
import type { ContentEra } from '@/content/contentDoc';

const PARTICLES: Array<ContentEra['particle']> = ['rust', 'oil', 'ash', 'pollen', 'firefly'];

export const StoryEditor: React.FC = () => {
  const { draft, setIntro, setOutro, setEra } = useAdminDraftStore();

  return (
    <>
      <section className="admin-card">
        <h2>Intro card</h2>
        <div className="admin-field">
          <label htmlFor="intro-kicker">Kicker</label>
          <input
            id="intro-kicker"
            value={draft.intro.kicker}
            onChange={(e) => setIntro({ kicker: e.target.value })}
          />
        </div>
        <div className="admin-field">
          <label htmlFor="intro-title">Title</label>
          <input
            id="intro-title"
            value={draft.intro.title}
            onChange={(e) => setIntro({ title: e.target.value })}
          />
        </div>
        <div className="admin-field">
          <label htmlFor="intro-subtitle">Subtitle</label>
          <input
            id="intro-subtitle"
            value={draft.intro.subtitle}
            onChange={(e) => setIntro({ subtitle: e.target.value })}
          />
        </div>
      </section>

      {draft.eras.map((era) => (
        <section className="admin-card" key={era.key}>
          <h2>
            Era: {era.key}
            <span className="admin-swatch" style={{ background: era.washColor }} />
          </h2>
          <div className="admin-row">
            <div className="admin-field">
              <label htmlFor={`${era.key}-year`}>Year badge</label>
              <input
                id={`${era.key}-year`}
                value={era.year}
                onChange={(e) => setEra(era.key, { year: e.target.value })}
              />
            </div>
            <div className="admin-field">
              <label htmlFor={`${era.key}-title`}>Title</label>
              <input
                id={`${era.key}-title`}
                value={era.title}
                onChange={(e) => setEra(era.key, { title: e.target.value })}
              />
            </div>
            <div className="admin-field">
              <label htmlFor={`${era.key}-label`}>Timeline label</label>
              <input
                id={`${era.key}-label`}
                value={era.label}
                onChange={(e) => setEra(era.key, { label: e.target.value })}
              />
            </div>
          </div>
          <div className="admin-field">
            <label htmlFor={`${era.key}-line`}>Docent narration</label>
            <textarea
              id={`${era.key}-line`}
              value={era.line}
              onChange={(e) => setEra(era.key, { line: e.target.value })}
            />
            <span className="admin-field-hint">{era.line.length} characters (typed out live)</span>
          </div>
          <div className="admin-row">
            <div className="admin-field">
              <label htmlFor={`${era.key}-wash`}>Wash color (any CSS color)</label>
              <input
                id={`${era.key}-wash`}
                value={era.washColor}
                onChange={(e) => setEra(era.key, { washColor: e.target.value })}
              />
            </div>
            <div className="admin-field">
              <label htmlFor={`${era.key}-particle`}>Particle motif</label>
              <select
                id={`${era.key}-particle`}
                value={era.particle}
                onChange={(e) =>
                  setEra(era.key, { particle: e.target.value as ContentEra['particle'] })
                }
              >
                {PARTICLES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      ))}

      <section className="admin-card">
        <h2>Outro card</h2>
        <div className="admin-field">
          <label htmlFor="outro-title">Title</label>
          <input
            id="outro-title"
            value={draft.outro.title}
            onChange={(e) => setOutro({ title: e.target.value })}
          />
        </div>
        <div className="admin-field">
          <label htmlFor="outro-subtitle">Subtitle</label>
          <input
            id="outro-subtitle"
            value={draft.outro.subtitle}
            onChange={(e) => setOutro({ subtitle: e.target.value })}
          />
        </div>
        <div className="admin-row">
          <div className="admin-field">
            <label htmlFor="outro-replay">Replay button</label>
            <input
              id="outro-replay"
              value={draft.outro.replayLabel}
              onChange={(e) => setOutro({ replayLabel: e.target.value })}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="outro-reset">Re-place button</label>
            <input
              id="outro-reset"
              value={draft.outro.resetLabel}
              onChange={(e) => setOutro({ resetLabel: e.target.value })}
            />
          </div>
        </div>
      </section>
    </>
  );
};
