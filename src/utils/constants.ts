/**
 * constants.ts — application-wide configuration values.
 *
 * Single source of truth for poster sizing, the placement cap, user-visible
 * copy, and localStorage keys. Limits that belong to one subsystem only live
 * next to their code instead (upload sizes in imageUpload.ts, the GIF
 * animation budget in posterTextureCache.ts).
 */

/**
 * Default poster dimensions in meters of AR space (width × height × depth).
 * Height assumes the classic 5:7 poster ratio; live placements override the
 * height from the uploaded image's actual aspect ratio.
 */
export const DEFAULT_POSTER_WIDTH = 0.5;
export const DEFAULT_POSTER_HEIGHT = 0.7;
export const DEFAULT_POSTER_DEPTH = 0.01;

/** Poster scale-slider limits (multiplier applied to the default size). */
export const MIN_POSTER_SCALE = 0.1;
export const MAX_POSTER_SCALE = 3.0;

/**
 * Poster rotation-slider limits, in degrees. This is the in-plane spin about
 * the surface normal (rotation[2]); a full −180°…180° sweep covers every
 * orientation on the surface.
 */
export const MIN_POSTER_ROTATION_DEG = -180;
export const MAX_POSTER_ROTATION_DEG = 180;

/** Maximum number of posters allowed in the scene at once. */
export const MAX_POSTERS = parseInt(import.meta.env.VITE_MAX_POSTERS || '10', 10);

/** Bundled placeholder poster used until the user uploads their own. */
export const DEFAULT_POSTER_IMAGE = '/posters/default-poster.png';

/** User-visible copy. */
export const UI_TEXT = {
  APP_TITLE: 'XR Poster',
  APP_SUBTITLE: 'Place posters in AR',
  LOADING: 'Loading...',
};

/** localStorage keys (namespaced to avoid collisions on shared origins). */
export const STORAGE_KEYS = {
  TUTORIAL_COMPLETED: 'xr-poster-tutorial-completed',
  DEVICE_TOKEN: 'xr-poster-device-token',
};

/** Base URL of the asset persistence API; empty string disables persistence. */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
