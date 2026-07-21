/**
 * main.tsx — React entry point.
 *
 * Two branches. Anything at /studio mounts ARCADE STUDIO, the desktop
 * authoring surface; everything else mounts the visitor experience. The studio
 * is a lazy chunk so its components, CSS and prop builders add zero bytes to
 * the visitor bundle — that split is why the branch lives here rather than
 * inside App.
 *
 * The 8th Wall engine scripts are loaded separately via <script> tags in
 * index.html, not here.
 */

import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import '@fontsource/press-start-2p/400.css';

const StudioApp = lazy(() => import('./studio/StudioApp'));

/** True when the current path is the studio route (with or without a trailing slash). */
const isStudio = window.location.pathname.replace(/\/+$/, '') === '/studio';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isStudio ? (
      <Suspense fallback={<div className="app-container loading">Loading studio…</div>}>
        <StudioApp />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
