/**
 * Custom hook for managing WebXR session state
 */

import { useState, useEffect, useCallback } from 'react';
import {
  isARSupported,
  requestARSession,
  getReferenceSpace,
  endARSession,
  XRSessionState,
} from '@/xr/sessionManager';

interface UseXRSessionReturn {
  session: XRSession | null;
  referenceSpace: XRReferenceSpace | null;
  state: XRSessionState;
  error: string | null;
  isSupported: boolean;
  startSession: () => Promise<void>;
  endSession: () => Promise<void>;
}

/**
 * Hook to manage XR session lifecycle
 */
export const useXRSession = (): UseXRSessionReturn => {
  const [session, setSession] = useState<XRSession | null>(null);
  const [referenceSpace, setReferenceSpace] = useState<XRReferenceSpace | null>(null);
  const [state, setState] = useState<XRSessionState>(XRSessionState.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState<boolean>(false);

  // Check AR support on mount
  useEffect(() => {
    const checkSupport = async () => {
      const supported = await isARSupported();
      setIsSupported(supported);
      if (!supported) {
        setError('AR is not supported on this device');
      }
    };
    checkSupport();
  }, []);

  // Start XR session
  const startSession = useCallback(async () => {
    if (state === XRSessionState.STARTING || state === XRSessionState.ACTIVE) {
      console.warn('Session already starting or active');
      return;
    }

    setState(XRSessionState.STARTING);
    setError(null);

    try {
      // Request AR session
      const newSession = await requestARSession({
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'local-floor'],
      });

      // Get reference space
      const refSpace = await getReferenceSpace(newSession, 'local');

      // Set up session end handler
      newSession.addEventListener('end', () => {
        setSession(null);
        setReferenceSpace(null);
        setState(XRSessionState.IDLE);
      });

      setSession(newSession);
      setReferenceSpace(refSpace);
      setState(XRSessionState.ACTIVE);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start AR session';
      setError(errorMessage);
      setState(XRSessionState.ERROR);
      console.error('Error starting XR session:', err);
    }
  }, [state]);

  // End XR session
  const endSession = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      await endARSession(session);
      setSession(null);
      setReferenceSpace(null);
      setState(XRSessionState.IDLE);
      setError(null);
    } catch (err) {
      console.error('Error ending XR session:', err);
      // Still clean up state even if end fails
      setSession(null);
      setReferenceSpace(null);
      setState(XRSessionState.IDLE);
    }
  }, [session]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (session) {
        endARSession(session).catch(console.error);
      }
    };
  }, [session]);

  return {
    session,
    referenceSpace,
    state,
    error,
    isSupported,
    startSession,
    endSession,
  };
};

// Made with Bob