/**
 * AdminApp — the /admin panel shell (Phase 1: local-draft editing only).
 *
 * Loaded via React.lazy from main.tsx so it ships as its own chunk. Tabs:
 * Story (narrative), Copy (HUD strings), Settings (scene knobs). The header
 * offers draft preview (opens the experience with ?preview=local), reset, and
 * a disabled Publish button that Phase 2 will enable against the backend.
 */

import React, { useState } from 'react';
import { AdminGate } from './AdminGate';
import { StoryEditor } from './StoryEditor';
import { CopyEditor } from './CopyEditor';
import { SettingsEditor } from './SettingsEditor';
import { useAdminDraftStore } from './adminDraftStore';
import './admin.css';

type Tab = 'story' | 'copy' | 'settings';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'story', label: 'Story' },
  { id: 'copy', label: 'UI Copy' },
  { id: 'settings', label: 'Settings' },
];

const AdminApp: React.FC = () => {
  const [tab, setTab] = useState<Tab>('story');
  const { source, savedAt, resetToDefaults } = useAdminDraftStore();

  return (
    <AdminGate>
      <div className="admin-root">
        <header className="admin-header">
          <h1>Postarr Admin</h1>
          <div className="admin-actions">
            <span className="admin-saved">
              {source === 'defaults'
                ? 'Showing bundled defaults'
                : savedAt
                  ? 'Draft saved locally'
                  : 'Local draft loaded'}
            </span>
            <a className="admin-btn" href="/?preview=local" target="_blank" rel="noreferrer">
              Preview draft
            </a>
            <button
              type="button"
              className="admin-btn"
              onClick={() => {
                if (window.confirm('Discard the local draft and restore the bundled defaults?')) {
                  resetToDefaults();
                }
              }}
            >
              Reset to defaults
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              disabled
              title="Publishing requires the backend (Phase 2)"
            >
              Publish
            </button>
          </div>
        </header>

        <nav className="admin-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`admin-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <main className="admin-main">
          {tab === 'story' && <StoryEditor />}
          {tab === 'copy' && <CopyEditor />}
          {tab === 'settings' && <SettingsEditor />}
        </main>

        <footer className="admin-note">
          Changes save to this browser only. Publishing to visitors arrives with the backend
          (Phase 2). Preview opens the experience with your draft applied.
        </footer>
      </div>
    </AdminGate>
  );
};

export default AdminApp;
