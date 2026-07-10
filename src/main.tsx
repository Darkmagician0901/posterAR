/**
 * main.tsx — React entry point.
 *
 * Mounts <App /> into #root (defined in index.html). The 8th Wall engine
 * scripts are loaded separately via <script> tags in index.html, not here.
 *
 * /admin is served from the same SPA but as a SEPARATE lazy chunk: visitors
 * never download the admin panel code, and the panel never boots the AR
 * engine pipeline.
 *
 * Note: /admin still loads the visitor entry chunk and the 8th Wall <script>
 * tags over the network (single-entry SPA); splitting a dedicated admin HTML
 * entry is deferred to the backend phase.
 */

import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import '@fontsource/press-start-2p/400.css';

const AdminApp = React.lazy(() => import('./admin/AdminApp'));

const isAdminRoute =
  window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdminRoute ? (
      <Suspense fallback={<p style={{ color: '#fff', padding: '2rem' }}>Loading admin…</p>}>
        <AdminApp />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
