/**
 * Header Component
 *
 * Fixed app header showing the app title and, while an AR session is
 * running, an "Exit AR" button. Rendered by ARExperience on the live path;
 * purely presentational — session teardown lives in the onExitAR callback.
 */

import React from 'react';
import './Header.css';

interface HeaderProps {
  /** True while an AR session is running — shows the Exit AR button. */
  isARActive: boolean;
  /** Invoked when the user taps Exit AR; omitted = button hidden. */
  onExitAR?: () => void;
}

/**
 * Application header bar with conditional AR-exit control.
 */
export const Header: React.FC<HeaderProps> = ({ isARActive, onExitAR }) => {
  return (
    <header className="app-header" role="banner">
      <div className="header-content">
        {/* App title */}
        <h1 className="app-title">
          <span className="title-icon">🎨</span>
          XR Poster
        </h1>

        {/* Exit AR button (only shown when AR is active) */}
        {isARActive && onExitAR && (
          <button
            className="exit-ar-button"
            onClick={onExitAR}
            aria-label="Exit AR mode"
          >
            <span className="exit-icon">✕</span>
            <span className="exit-label">Exit AR</span>
          </button>
        )}
      </div>
    </header>
  );
};
