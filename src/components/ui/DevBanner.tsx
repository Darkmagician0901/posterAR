/**
 * DevBanner
 *
 * Shown only when the desktop dev-mode branch in App.tsx is active. Explains
 * how to mock an AR session via the WebXR API Emulator extension.
 */

import React, { useState } from 'react';
import './DevBanner.css';

const EMULATOR_URL =
  'https://chromewebstore.google.com/detail/webxr-api-emulator/mjddjgeghkdijejnciaefnkjmkafnnje';

interface DevBannerProps {
  hasEmulator: boolean;
}

export const DevBanner: React.FC<DevBannerProps> = ({ hasEmulator }) => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="dev-banner" role="status">
      <div className="dev-banner-content">
        <strong>Desktop dev mode</strong>{' '}
        {hasEmulator ? (
          <>WebXR Emulator detected — Start AR will open a mocked session.</>
        ) : (
          <>
            Install the{' '}
            <a href={EMULATOR_URL} target="_blank" rel="noreferrer">
              WebXR API Emulator
            </a>{' '}
            extension to mock AR sessions, or open this page on an ARCore
            Android device.
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
