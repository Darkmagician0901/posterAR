/**
 * LoadingScreen Component
 * Displays loading state during AR session initialization
 */

import React, { useEffect, useState } from 'react';
import './LoadingScreen.css';

interface LoadingScreenProps {
  isLoading: boolean;
  message?: string;
}

/**
 * Loading screen with animated spinner
 */
export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  isLoading,
  message = 'Initializing AR...',
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

  return (
    <div
      className={`loading-screen ${isFadingOut ? 'loading-screen-fade-out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="loading-content">
        {/* Animated spinner */}
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>

        {/* Loading message */}
        <div className="loading-message">{message}</div>

        {/* Animated dots */}
        <div className="loading-dots">
          <span className="dot"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </div>

        {/* Additional hint */}
        <div className="loading-hint">
          Move your phone to scan surfaces
        </div>
      </div>
    </div>
  );
};

// Made with Bob