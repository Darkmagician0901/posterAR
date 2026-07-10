/**
 * AdminGate — a PLACEHOLDER access gate for the admin panel.
 *
 * SECURITY NOTE: this is a client-side convenience gate ONLY. The passphrase
 * ships inside the JS bundle (any VITE_ var does), so it stops casual
 * visitors, not attackers. That is acceptable in Phase 1 because the panel
 * can only write to the operator's own browser (localStorage draft). Real
 * authentication arrives with the backend in Phase 2 and this component will
 * be replaced by the login flow.
 */

import React, { useState } from 'react';
import { STORAGE_KEYS } from '@/utils/constants';

const PASSPHRASE: string | undefined = import.meta.env.VITE_ADMIN_PASSPHRASE;

export const AdminGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unlocked, setUnlocked] = useState(
    () => !PASSPHRASE || window.sessionStorage.getItem(STORAGE_KEYS.ADMIN_SESSION) === '1',
  );
  const [attempt, setAttempt] = useState('');
  const [failed, setFailed] = useState(false);

  if (unlocked) {
    return (
      <>
        {!PASSPHRASE && (
          <div className="admin-banner">
            No VITE_ADMIN_PASSPHRASE configured — the panel is open. Set it in the Vercel
            project env to add the placeholder gate.
          </div>
        )}
        {children}
      </>
    );
  }

  return (
    <div className="admin-root admin-login">
      <h1>Postarr Admin</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (attempt === PASSPHRASE) {
            window.sessionStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, '1');
            setUnlocked(true);
          } else {
            setFailed(true);
          }
        }}
      >
        <label htmlFor="admin-pass">Passphrase</label>
        <input
          id="admin-pass"
          type="password"
          value={attempt}
          onChange={(e) => {
            setAttempt(e.target.value);
            setFailed(false);
          }}
          autoFocus
        />
        <button type="submit" className="admin-btn admin-btn-primary">
          Enter
        </button>
        {failed && <p className="admin-error">Wrong passphrase.</p>}
      </form>
    </div>
  );
};
