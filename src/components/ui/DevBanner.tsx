/**
 * DevBanner
 *
 * Optional dev-mode banner, rendered by <ARExperience mode="dev"> only. The
 * normal app always uses mode="live", so this is off by default; it exists for
 * manually exercising the AR path on a development build.
 *
 * Note: the desktop development experience now lives in DesktopMockMode
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
