/**
 * WebXR Session Manager
 * Handles XR session initialization, lifecycle, and state management
 */

export enum XRSessionState {
  IDLE = 'idle',
  STARTING = 'starting',
  ACTIVE = 'active',
  ERROR = 'error',
}

export interface XRSessionConfig {
  requiredFeatures?: string[];
  optionalFeatures?: string[];
  domOverlay?: HTMLElement;
}

export interface XRSessionManager {
  session: XRSession | null;
  state: XRSessionState;
  error: string | null;
  referenceSpace: XRReferenceSpace | null;
}

/**
 * Check if WebXR is supported in the current browser
 */
export const isWebXRSupported = (): boolean => {
  return 'xr' in navigator && navigator.xr !== undefined && 'isSessionSupported' in navigator.xr;
};

/**
 * Check if immersive-ar mode is supported
 */
export const isARSupported = async (): Promise<boolean> => {
  if (!isWebXRSupported()) {
    return false;
  }

  try {
    return await navigator.xr!.isSessionSupported('immersive-ar');
  } catch (error) {
    console.error('Error checking AR support:', error);
    return false;
  }
};

/**
 * Request an immersive AR session
 */
export const requestARSession = async (
  config: XRSessionConfig = {}
): Promise<XRSession> => {
  if (!isWebXRSupported()) {
    throw new Error('WebXR is not supported on this device');
  }

  const sessionInit: XRSessionInit = {
    requiredFeatures: config.requiredFeatures || ['hit-test'],
    optionalFeatures: config.optionalFeatures || ['dom-overlay', 'local-floor'],
  };

  // Add DOM overlay if provided
  if (config.domOverlay) {
    sessionInit.domOverlay = { root: config.domOverlay };
  }

  try {
    const session = await navigator.xr!.requestSession('immersive-ar', sessionInit);
    return session;
  } catch (error) {
    console.error('Failed to request AR session:', error);
    throw new Error(`Failed to start AR session: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Get reference space for the session
 */
export const getReferenceSpace = async (
  session: XRSession,
  type: XRReferenceSpaceType = 'local'
): Promise<XRReferenceSpace> => {
  try {
    return await session.requestReferenceSpace(type);
  } catch (error) {
    console.warn(`Failed to get ${type} reference space, falling back to viewer`, error);
    // Fallback to viewer space if requested type fails
    return await session.requestReferenceSpace('viewer');
  }
};

/**
 * End an XR session
 */
export const endARSession = async (session: XRSession | null): Promise<void> => {
  if (!session) {
    return;
  }

  try {
    await session.end();
  } catch (error) {
    console.error('Error ending AR session:', error);
  }
};

/**
 * Create a session manager instance
 */
export const createSessionManager = (): XRSessionManager => {
  return {
    session: null,
    state: XRSessionState.IDLE,
    error: null,
    referenceSpace: null,
  };
};

// Made with Bob