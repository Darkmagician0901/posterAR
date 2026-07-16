/**
 * DevBanner
 *
 * PARKED — nothing imports this today. That is intentional, not an oversight: it
 * was rendered only by the dev-mode branch of the old ARExperience component,
 * which has since been removed; the app now ships a story-only user panel
 * (StoryARExperience). What becomes of this component is UNDECIDED —
 * docs/admin-panel-plan.md specifies new /admin/* routes and does not name it, so
 * whether the admin panel imports it, ports from it, or replaces it is an open
 * question. Do NOT delete it as dead code — zero importers here means "not wired
 * up yet", not "unused".
 *
 * Dismissible banner for flagging a development build to whoever is holding the
 * phone.
 *
 * Note: the desktop development experience lives in DesktopMockMode
 * (webcam-based), which the App routes to automatically on desktop — no
 * browser extension is required. The `hasEmulator` prop is retained for
 * backward compatibility with the dev-mode flow.
 */

import React, { useState } from 'react';
import './DevBanner.css';

interface DevBannerProps {
  /** Reserved: indicates a mocked-session helper is present in dev mode. */
  hasEmulator: boolean;
}

/** Dismissible dev-mode banner; dismissal lasts until the component remounts. */
export const DevBanner: React.FC<DevBannerProps> = ({ hasEmulator }) => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="dev-banner" role="status">
      <div className="dev-banner-content">
        <strong>Dev mode</strong>{' '}
        {hasEmulator ? (
          <>Mock AR helper detected — Start AR will open a mocked session.</>
        ) : (
          <>
            Running the AR path on a development build. On desktop, open the app normally to use the
            built-in webcam mock mode instead.
          </>
        )}
      </div>
      <button
        className="dev-banner-close"
        aria-label="Dismiss dev banner"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </div>
  );
};
