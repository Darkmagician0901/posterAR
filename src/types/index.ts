/**
 * Core type definitions for the XR Poster application.
 *
 * `Poster` / `CreatePosterOptions` describe placed posters (posterStore);
 * `XRSupport` is the device-capability snapshot produced by deviceDetection
 * and consumed by App's branch decision.
 */

/**
 * A 2D poster placed in AR space.
 *
 * `position`/`rotation`/`scale` mirror the values passed at creation; the
 * authoritative world transform of a placed poster is the three.js group
 * matrix owned by PosterPlacement (see posterStore header).
 */
export interface Poster {
  /** Unique ID assigned by posterStore. */
  id: string;
  /** Image source — a data URL for uploads, or a bundled asset path. */
  imageUrl: string;
  /** [x, y, z] in meters of AR space. */
  position: [number, number, number];
  /** [x, y, z] Euler angles in radians. */
  rotation: [number, number, number];
  /** [width, height, depth] in meters (not a unitless multiplier). */
  scale: [number, number, number];
  /** Placement timestamp (Date.now()). */
  createdAt: number;
  /** Timestamp of the last updatePoster call. */
  updatedAt: number;
}

/**
 * Options accepted by posterStore.addPoster; omitted fields fall back to the
 * defaults in utils/constants.ts.
 */
export interface CreatePosterOptions {
  /** Image source — a data URL for uploads, or a bundled asset path. */
  imageUrl: string;
  /** [x, y, z] in meters; defaults to the spawn position in posterStore. */
  position?: [number, number, number];
  /** [x, y, z] Euler angles in radians; defaults to no rotation. */
  rotation?: [number, number, number];
  /** [width, height, depth] in meters; defaults to the standard poster size. */
  scale?: [number, number, number];
}

/**
 * Device-capability snapshot from detectXRSupport().
 */
export interface XRSupport {
  /** True when the device can plausibly run 8th Wall: mobile + camera + secure context. */
  hasAR8: boolean;
  /** True when the getUserMedia camera API exists (no permission prompted). */
  hasCamera: boolean;
  /** True when orientation events exist (a proxy for gyroscope hardware). */
  hasGyroscope: boolean;
  /** True for iPhone/iPad/iPod user agents. */
  isIOS: boolean;
  /** True for Android user agents. */
  isAndroid: boolean;
  /** True for any mobile user agent (superset of iOS/Android). */
  isMobile: boolean;
  /** True when no mobile check matched. */
  isDesktop: boolean;
  /** Best-effort browser name, e.g. "Chrome"; "Unknown" if unrecognized. */
  browserName: string;
  /** Best-effort major version, e.g. "125"; "Unknown" if unrecognized. */
  browserVersion: string;
}
