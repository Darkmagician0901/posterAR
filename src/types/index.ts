/**
 * Core type definitions for XR Poster application
 */

import { Vector3, Euler } from 'three';

/**
 * Poster interface - represents a 2D poster in AR space
 */
export interface Poster {
  id: string;
  imageUrl: string;
  position: [number, number, number]; // [x, y, z] in meters
  rotation: [number, number, number]; // [x, y, z] in radians
  scale: [number, number, number]; // [width, height, depth]
  createdAt: number;
  updatedAt: number;
}

/**
 * AR Session state
 */
export interface ARSession {
  isActive: boolean;
  isSupported: boolean;
  mode: ARMode;
  error: string | null;
}

/**
 * AR Mode types
 */
export enum ARMode {
  WEBXR = 'webxr',
  WEBAR = 'webar',
  PREVIEW_2D = 'preview-2d',
  NONE = 'none'
}

/**
 * Device capability detection
 */
export enum DeviceCapability {
  WEBXR_SUPPORTED = 'webxr-supported',
  WEBAR_SUPPORTED = 'webar-supported',
  CAMERA_AVAILABLE = 'camera-available',
  GYROSCOPE_AVAILABLE = 'gyroscope-available',
  TOUCH_SUPPORTED = 'touch-supported',
  NONE = 'none'
}

/**
 * XR Support interface
 */
export interface XRSupport {
  hasWebXR: boolean;
  hasWebAR: boolean;
  hasCamera: boolean;
  hasGyroscope: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  browserName: string;
  browserVersion: string;
}

/**
 * Gesture event data
 */
export interface GestureEvent {
  type: 'drag' | 'pinch' | 'rotate' | 'tap';
  posterId: string;
  delta?: [number, number];
  scale?: number;
  rotation?: number;
  position?: [number, number];
}

/**
 * Hit test result from AR surface detection
 */
export interface HitTestResult {
  position: Vector3;
  rotation: Euler;
  distance: number;
  confidence: number;
}

/**
 * App configuration
 */
export interface AppConfig {
  maxPosters: number;
  defaultPosterSize: [number, number, number];
  minPosterScale: number;
  maxPosterScale: number;
  enableDebugMode: boolean;
}

/**
 * Poster creation options
 */
export interface CreatePosterOptions {
  imageUrl: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

/**
 * Error types
 */
export enum ErrorType {
  WEBXR_NOT_SUPPORTED = 'webxr-not-supported',
  CAMERA_PERMISSION_DENIED = 'camera-permission-denied',
  SESSION_INIT_FAILED = 'session-init-failed',
  POSTER_LOAD_FAILED = 'poster-load-failed',
  MAX_POSTERS_REACHED = 'max-posters-reached',
  UNKNOWN = 'unknown'
}

/**
 * Application error
 */
export interface AppError {
  type: ErrorType;
  message: string;
  details?: unknown;
  timestamp: number;
}

// Made with Bob
