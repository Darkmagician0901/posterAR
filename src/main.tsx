/**
 * main.tsx — React entry point.
 *
 * Mounts <App /> into #root (defined in index.html). The 8th Wall engine
 * scripts are loaded separately via <script> tags in index.html, not here.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
