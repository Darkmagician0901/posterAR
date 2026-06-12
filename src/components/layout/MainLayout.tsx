/**
 * MainLayout Component
 *
 * Top-level layout wrapper (full-viewport flex container, styles in
 * MainLayout.css). Exists so app-wide chrome/layout changes have a single
 * home rather than being spread across App.tsx branches.
 */

import React, { ReactNode } from 'react';
import './MainLayout.css';

interface MainLayoutProps {
  /** Branch content (AR experience, desktop mock, or unsupported panel). */
  children: ReactNode;
}

/**
 * Wraps every app branch in the shared full-viewport layout container.
 */
export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="main-layout">
      {children}
    </div>
  );
};
