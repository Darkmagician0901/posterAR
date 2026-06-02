/**
 * LoadingScreen Component
 * Displays loading state during AR session initialization
 */

import React, { useEffect, useState } from 'react';
import './LoadingScreen.css';

interface LoadingScreenProps {
  isLoading: boolean;
  message?: string;
  /**
   * When provided (0–100), renders a determinate progress bar instead of the
   * indeterminate bouncing dots. Used on the mobile AR path to show 8th Wall
   * engine + SLAM load progress.
   */
  progress?: number;
  /** Optional stage label shown above the bar (e.g. "Downloading AR engine…"). */
  stageLabel?: string;
  /** When true, render the bar/label in an error state (engine failed/stalled). */
  error?: boolean;
}

/**
 * Loading screen with animated spinner and optional determinate progress bar.
 */
export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  isLoading,
  message = 'Initializing AR...',
  progress,
  stageLabel,
  error = false,
}) => {
  const [isVisible, setIsVisible] = useState(isLoading);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setIsVisible(true);
      setIsFadingOut(false);
    } else if (isVisible) {
      // Start fade out animation
      setIsFadingOut(true);
      // Remove from DOM after animation completes
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, isVisible]);

  if (!isVisible) return null;

  const isDeterminate = typeof progress === 'number';
  // Snap to 100% as we fade out so the bar always finishes cleanly.
  const shownPercent = isDeterminate
    ? isFadingOut
      ? 100
      : Math.min(100, Math.max(0, progress as number))
    : 0;
  const heading = isDeterminate ? stageLabel ?? message : message;

  return (
    <div
      className={`loading-screen ${isFadingOut ? 'loading-screen-fade-out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={heading}
    >
      <div className="loading-content">
        {/* Animated spinner */}
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>

        {/* Loading message */}
        <div className={`loading-message ${error ? 'loading-message-error' : ''}`}>
          {heading}
        </div>

        {isDeterminate ? (
          <div
            className="loading-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={shownPercent}
          >
            <div className="loading-progress-track">
              <div
                className={`loading-progress-fill ${error ? 'loading-progress-fill-error' : ''}`}
                style={{ width: `${error ? Math.max(shownPercent, 8) : shownPercent}%` }}
              />
            </div>
            <div className="loading-progress-pct">{error ? 'stalled' : `${shownPercent}%`}</div>
          </div>
        ) : (
          /* Indeterminate animated dots */
          <div className="loading-dots">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        )}

        {/* Additional hint */}
        <div className="loading-hint">
          Move your phone to scan surfaces
        </div>
      </div>
    </div>
  );
};
