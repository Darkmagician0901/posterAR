/**
 * WebXR Session Manager
 *
 * Builds immersive-ar sessions with the feature set this app actually needs:
 *   required: hit-test, anchors, dom-overlay
 *   optional: plane-detection, light-estimation, local-floor
 *
 * Required features will cause the session request to fail on devices that
 * lack them — that's intentional. The fallback path handles unsupported
 * devices explicitly (see App.tsx).
 */

export enum XRSessionState {
  IDLE = 'idle',
  STARTING = 'starting',
  ACTIVE = 'active',
  ERROR = 'error',
}

export interface XRSessionConfig {
  domOverlayRoot?: HTMLElement;
}

export const REQUIRED_FEATURES = ['hit-test', 'anchors', 'dom-overlay'] as const;
export const OPTIONAL_FEATURES = [
  'plane-detection',
  'light-estimation',
  'local-floor',
] as const;

export const isWebXRSupported = (): boolean =>
  typeof navigator !== 'undefined' &&
  'xr' in navigator &&
  navigator.xr !== undefined &&
  typeof navigator.xr.isSessionSupported === 'function';

export const isImmersiveARSupported = async (): Promise<boolean> => {
  if (!isWebXRSupported()) return false;
  try {
    return await navigator.xr!.isSessionSupported('immersive-ar');
  } catch (error) {
    console.error('isSessionSupported(immersive-ar) failed:', error);
    return false;
  }
};

/** Back-compat alias used by detectXRSupport. */
export const isARSupported = isImmersiveARSupported;

export const requestARSession = async (
  config: XRSessionConfig = {}
): Promise<XRSession> => {
  if (!isWebXRSupported()) {
    throw new Error('WebXR is not available in this browser');
  }

  const sessionInit: XRSessionInit = {
    requiredFeatures: [...REQUIRED_FEATURES],
    optionalFeatures: [...OPTIONAL_FEATURES],
  };

  if (config.domOverlayRoot) {
    sessionInit.domOverlay = { root: config.domOverlayRoot };
  }

  return navigator.xr!.requestSession('immersive-ar', sessionInit);
};

export const endARSession = async (session: XRSession | null): Promise<void> => {
  if (!session) return;
  try {
    await session.end();
  } catch (error) {
    console.error('Error ending AR session:', error);
  }
};
