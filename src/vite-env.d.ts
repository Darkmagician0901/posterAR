/// <reference types="vite/client" />

/**
 * Type definitions for Vite environment variables
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_GA_TRACKING_ID?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_ENABLE_DEBUG_MODE?: string;
  readonly VITE_MAX_POSTERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * 8th Wall (XR8) engine globals are declared in src/xr8/globals.d.ts.
 * The old WebXR (navigator.xr) augmentation and the webxr-polyfill shim were
 * removed when the app migrated off WebXR.
 */

/**
 * iOS 13+ requestPermission on DeviceOrientationEvent
 */
interface DeviceOrientationEventStatic {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}
interface DeviceMotionEventStatic {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}
