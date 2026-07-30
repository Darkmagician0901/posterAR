/// <reference types="vite/client" />

/**
 * Type definitions for Vite environment variables
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Poster-asset API origin. Empty disables persistence (see constants.ts). */
  readonly VITE_API_BASE_URL?: string;
  /** Origin published story documents are served from. Empty disables remote loading. */
  readonly VITE_STORY_BASE_URL?: string;
  /** Origin story assets are served from. Empty resolves same-origin (see assetResolver.ts). */
  readonly VITE_ASSET_BASE_URL?: string;
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
