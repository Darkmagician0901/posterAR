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
  id: string;
  imageUrl: string;
  position: [number, number, number]; // [x, y, z] in meters
  rotation: [number, number, number]; // [x, y, z] in radians
  scale: [number, number, number]; // [width, height, depth]
  createdAt: number;
  updatedAt: number;
}

/**
 * Options accepted by posterStore.addPoster; omitted fields fall back to the
 * defaults in utils/constants.ts.
 */
export interface CreatePosterOptions {
  imageUrl: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

/**
 * Device-capability snapshot from detectXRSupport().
 */
export interface XRSupport {
  /** True when the device can plausibly run 8th Wall: mobile + camera + secure context. */
  hasAR8: boolean;
  hasCamera: boolean;
  hasGyroscope: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  isDesktop: boolean;
  browserName: string;
  browserVersion: string;
}
