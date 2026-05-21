/**
 * Custom hook for managing WebXR hit testing
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { HitTestResult } from '@/types';
import {
  requestHitTestSource,
  requestTransientHitTestSource,
  getHitTestResults,
  processHitTestResults,
} from '@/xr/hitTest';

interface UseHitTestReturn {
  hitTestResult: HitTestResult | null;
  isHitTestActive: boolean;
  startHitTest: () => void;
  stopHitTest: () => void;
}

/**
 * Hook to manage hit testing for AR surface detection
 */
export const useHitTest = (
  session: XRSession | null,
  referenceSpace: XRReferenceSpace | null
): UseHitTestReturn => {
  const [hitTestResult, setHitTestResult] = useState<HitTestResult | null>(null);
  const [isHitTestActive, setIsHitTestActive] = useState<boolean>(false);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const transientHitTestSourceRef = useRef<XRTransientInputHitTestSource | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Start hit testing
  const startHitTest = useCallback(async () => {
    if (!session || !referenceSpace || isHitTestActive) {
      return;
    }

    try {
      // Request hit test sources
      const hitTestSource = await requestHitTestSource(session, referenceSpace);
      const transientHitTestSource = await requestTransientHitTestSource(session);

      hitTestSourceRef.current = hitTestSource;
      transientHitTestSourceRef.current = transientHitTestSource;
      setIsHitTestActive(true);
    } catch (error) {
      console.error('Failed to start hit test:', error);
    }
  }, [session, referenceSpace, isHitTestActive]);

  // Stop hit testing
  const stopHitTest = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    hitTestSourceRef.current = null;
    transientHitTestSourceRef.current = null;
    setIsHitTestActive(false);
    setHitTestResult(null);
  }, []);

  // Process hit test results in animation frame
  useEffect(() => {
    if (!session || !referenceSpace || !isHitTestActive) {
      return;
    }

    const onXRFrame = (_time: number, frame: XRFrame) => {
      if (!hitTestSourceRef.current) {
        return;
      }

      try {
        // Get hit test results
        const hitTestResults = getHitTestResults(frame, hitTestSourceRef.current);

        // Process results
        if (hitTestResults.length > 0) {
          const result = processHitTestResults(hitTestResults, referenceSpace);
          if (result) {
            setHitTestResult(result);
          }
        } else {
          setHitTestResult(null);
        }
      } catch (error) {
        console.error('Error processing hit test results:', error);
      }

      // Continue animation loop
      if (isHitTestActive) {
        animationFrameRef.current = session.requestAnimationFrame(onXRFrame);
      }
    };

    // Start animation loop
    animationFrameRef.current = session.requestAnimationFrame(onXRFrame);

    // Cleanup
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [session, referenceSpace, isHitTestActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopHitTest();
    };
  }, [stopHitTest]);

  return {
    hitTestResult,
    isHitTestActive,
    startHitTest,
    stopHitTest,
  };
};

// Made with Bob