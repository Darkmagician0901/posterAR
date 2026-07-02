/**
 * Header Component
 *
 * While an AR session is running, renders a floating "Exit AR" button pinned
 * to the top-right corner; otherwise renders nothing. The former full-width
 * title bar was removed so the camera view stays clean. Purely
 * presentational — session teardown lives in the onExitAR callback.
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
 * Floating AR-exit control (no title bar).
 */
export const Header: React.FC<HeaderProps> = ({ isARActive, onExitAR }) => {
  if (!isARActive || !onExitAR) return null;
  return (
    <button
      className="exit-ar-button"
      onClick={onExitAR}
      aria-label="Exit AR mode"
    >
      <span className="exit-icon">✕</span>
      <span className="exit-label">Exit AR</span>
    </button>
  );
};
