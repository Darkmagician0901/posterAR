import React from 'react';
import ReactDOM from 'react-dom/client';
import WebXRPolyfill from 'webxr-polyfill';
import App from './App';
import './index.css';

// Install the WebXR polyfill before React mounts so navigator.xr exists
// everywhere — iOS Safari included. Note: the polyfill provides inline /
// Cardboard sessions only; it does NOT enable immersive-ar on iOS. The
// iOS-specific AR fallback (camera + DeviceOrientation) is a separate path.
if (!('xr' in navigator)) {
  new WebXRPolyfill({
    // Disable Cardboard — we don't want a VR splitter UI for an AR poster app
    cardboard: false,
    allowCardboardOnDesktop: false,
  });
}

/**
 * Application entry point
 * Renders the root React component with StrictMode for development checks
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Made with Bob
