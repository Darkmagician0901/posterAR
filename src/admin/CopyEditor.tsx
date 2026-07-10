/**
 * CopyEditor — HUD strings outside the narrative (scan prompts, nav labels).
 */

import React from 'react';
import { useAdminDraftStore } from './adminDraftStore';
import type { ContentDoc } from '@/content/contentDoc';

const FIELDS: Array<{ key: keyof ContentDoc['ui']; label: string; hint: string }> = [
  { key: 'scanPrompt', label: 'Scanning prompt', hint: 'Shown while looking for the ground' },
  { key: 'tapPrompt', label: 'Tap prompt', hint: 'Shown once a surface is locked' },
  { key: 'backLabel', label: 'Back button', hint: 'Era navigation' },
  { key: 'nextLabel', label: 'Next button', hint: 'Era navigation' },
  { key: 'finishLabel', label: 'Finish button', hint: 'Replaces Next on the last era' },
];

export const CopyEditor: React.FC = () => {
  const { draft, setUi } = useAdminDraftStore();

  return (
    <section className="admin-card">
      <h2>HUD copy</h2>
      {FIELDS.map((f) => (
        <div className="admin-field" key={f.key}>
          <label htmlFor={`ui-${f.key}`}>{f.label}</label>
          <input
            id={`ui-${f.key}`}
            value={draft.ui[f.key]}
            onChange={(e) => setUi({ [f.key]: e.target.value })}
          />
          <span className="admin-field-hint">{f.hint}</span>
        </div>
      ))}
    </section>
  );
};
