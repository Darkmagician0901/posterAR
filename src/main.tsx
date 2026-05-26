import React from 'react';
import ReactDOM from 'react-dom/client';
import WebXRPolyfill from 'webxr-polyfill';
import App from './App';
import './index.css';

/**
 * Install the WebXR polyfill before React mounts when navigator.xr is missing
 * or does not advertise immersive-ar. The polyfill cannot synthesize
 * immersive-ar on iOS Safari (no LIDAR/AR APIs are exposed to the page) — it
 * only fills in inline sessions and the navigator.xr shape — so the
 * application-level check in App.tsx still has the final say about whether
 * the iOS fallback or the explicit "AR Not Supported" message is shown.
 */
const ensurePolyfill = async (): Promise<void> => {
  if (typeof navigator === 'undefined') return;

  if (!('xr' in navigator)) {
    new WebXRPolyfill({ cardboard: false, allowCardboardOnDesktop: false });
    return;
  }

  try {
    const supported = await navigator.xr!.isSessionSupported('immersive-ar');
    if (!supported) {
      // Native navigator.xr exists but rejects immersive-ar (e.g. iOS Safari
      // with WebXR Viewer fallback shims). The polyfill won't fix that, but
      // installing it doesn't break anything either.
      new WebXRPolyfill({ cardboard: false, allowCardboardOnDesktop: false });
    }
  } catch {
    new WebXRPolyfill({ cardboard: false, allowCardboardOnDesktop: false });
  }
};

ensurePolyfill().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
