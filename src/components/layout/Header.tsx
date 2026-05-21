/**
 * Header Component
 * App header with title and controls
 */

import React from 'react';
import './Header.css';

interface HeaderProps {
  isARActive: boolean;
  onExitAR?: () => void;
}

/**
 * Application header
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

// Made with Bob