/**
 * Application constants and configuration
 */

import { AppConfig } from '@/types';

/**
 * Default poster dimensions (in meters for AR space)
 */
export const DEFAULT_POSTER_WIDTH = 0.5;
export const DEFAULT_POSTER_HEIGHT = 0.7;
export const DEFAULT_POSTER_DEPTH = 0.01;

/**
 * Poster scale limits
 */
export const MIN_POSTER_SCALE = 0.1;
export const MAX_POSTER_SCALE = 3.0;

/**
 * Default poster placement distance from camera (in meters)
 */
export const DEFAULT_PLACEMENT_DISTANCE = 2.0;

/**
 * Maximum number of posters allowed in scene
 */
export const MAX_POSTERS = parseInt(import.meta.env.VITE_MAX_POSTERS || '10', 10);

/**
 * Performance targets (used by diagnostics / documentation, not enforced).
 */
export const PERFORMANCE = {
  targetFPS: 60,
  minFPS: 30,
  maxMemoryMB: 150,
};

/**
 * Animation durations (in milliseconds)
 */
export const ANIMATION_DURATION = {
  short: 150,
  medium: 300,
  long: 500,
};

/**
 * Default poster image (placeholder)
 */
export const DEFAULT_POSTER_IMAGE = '/posters/default-poster.png';

/**
 * Supported image formats
 */
export const SUPPORTED_IMAGE_FORMATS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

/**
 * Maximum image file size accepted by the uploader before compression.
 */
export const MAX_IMAGE_SIZE = 50 * 1024 * 1024;

/**
 * Application configuration
 */
export const APP_CONFIG: AppConfig = {
  maxPosters: MAX_POSTERS,
  defaultPosterSize: [DEFAULT_POSTER_WIDTH, DEFAULT_POSTER_HEIGHT, DEFAULT_POSTER_DEPTH],
  minPosterScale: MIN_POSTER_SCALE,
  maxPosterScale: MAX_POSTER_SCALE,
  enableDebugMode: import.meta.env.VITE_ENABLE_DEBUG_MODE === 'true',
};

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  AR_NOT_SUPPORTED: 'AR is not supported on this device. Use a mobile device (iOS Safari or Android Chrome) with camera access over HTTPS.',
  CAMERA_PERMISSION_DENIED: 'Camera permission is required for AR experience.',
  SESSION_INIT_FAILED: 'Failed to initialize AR session. Please try again.',
  POSTER_LOAD_FAILED: 'Failed to load poster image.',
  MAX_POSTERS_REACHED: `Maximum number of posters (${MAX_POSTERS}) reached.`,
  UNKNOWN: 'An unknown error occurred.',
};

/**
 * Success messages
 */
export const SUCCESS_MESSAGES = {
  POSTER_ADDED: 'Poster added successfully!',
  POSTER_REMOVED: 'Poster removed.',
  SESSION_STARTED: 'AR session started.',
};

/**
 * UI text constants
 */
export const UI_TEXT = {
  APP_TITLE: 'XR Poster',
  APP_SUBTITLE: 'Place posters in AR',
  START_AR: 'Start AR Experience',
  STOP_AR: 'Exit AR',
  ADD_POSTER: 'Add Poster',
  REMOVE_POSTER: 'Remove Poster',
  CLEAR_ALL: 'Clear All',
  LOADING: 'Loading...',
  TAP_TO_PLACE: 'Tap to place poster',
  DRAG_TO_MOVE: 'Drag to move',
  PINCH_TO_SCALE: 'Pinch to scale',
  ROTATE_TO_TURN: 'Rotate to turn',
};

/**
 * Local storage keys
 */
export const STORAGE_KEYS = {
  POSTERS: 'xr-poster-posters',
  SETTINGS: 'xr-poster-settings',
  TUTORIAL_COMPLETED: 'xr-poster-tutorial-completed',
};
