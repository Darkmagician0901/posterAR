/**
 * MainLayout Component
 * Main layout wrapper for the application
 */

import React, { ReactNode } from 'react';
import './MainLayout.css';

interface MainLayoutProps {
  children: ReactNode;
}

/**
 * Main layout component that wraps the entire app
 */
export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="main-layout">
      {children}
    </div>
  );
};

// Made with Bob