/**
 * IOSARFallback
 *
 * iOS Safari does not support WebXR immersive-ar sessions. Mozilla's
 * webxr-polyfill cannot fix that — it only provides inline/cardboard sessions.
 * For iOS we run a separate, non-WebXR AR-lite experience:
 *
 *   - The rear camera feed fills the screen via getUserMedia + <video>.
 *   - A transparent three.js Canvas is overlaid on top.
 *   - DeviceOrientationEvent (with the iOS 13+ permission gate) drives the
 *     camera rotation, giving a 3DoF look-around effect.
 *   - Tapping the screen places a poster at a fixed distance directly in
 *     front of the camera (there is no surface tracking — no LIDAR access
 *     is exposed to Safari).
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import { PosterMesh } from './PosterMesh';
import { usePosterStore } from '@/store/posterStore';
import { useUIState } from '@/hooks/useUIState';
import { ControlPanel } from '@/components/ui/ControlPanel';
import { PosterControls } from '@/components/ui/PosterControls';
import { Header } from '@/components/layout/Header';
import { DEFAULT_PLACEMENT_DISTANCE } from '@/utils/constants';

/**
 * Convert a DeviceOrientationEvent (alpha / beta / gamma in degrees, plus
 * the screen orientation angle) into a three.js camera quaternion.
 *
 * This is the standard mapping used by Three.js's DeviceOrientationControls.
 */
const deviceOrientationToQuaternion = (
  alpha: number,
  beta: number,
  gamma: number,
  screenOrientation: number,
  out: Quaternion
): Quaternion => {
  const _zee = new Vector3(0, 0, 1);
  const _euler = new Euler();
  const _q1 = new Quaternion();
  // - PI/2 around X axis to align with the device's flat-on-table baseline.
  const _q0 = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

  const a = MathUtils.degToRad(alpha);
  const b = MathUtils.degToRad(beta);
  const g = MathUtils.degToRad(gamma);
  const o = MathUtils.degToRad(screenOrientation);

  _euler.set(b, a, -g, 'YXZ');
  out.setFromEuler(_euler);
  out.multiply(_q0);
  out.multiply(_q1.setFromAxisAngle(_zee, -o));
  return out;
};

/**
 * CameraRig: child of <Canvas> that updates the three.js camera each frame
 * from the latest orientation in a shared ref.
 */
const CameraRig: React.FC<{ orientationRef: React.MutableRefObject<Quaternion> }> = ({
  orientationRef,
}) => {
  const { camera } = useThree();

  useFrame(() => {
    camera.quaternion.slerp(orientationRef.current, 0.5);
  });

  return null;
};

interface IOSARFallbackProps {
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
}

export const IOSARFallback: React.FC<IOSARFallbackProps> = ({
  onSessionStart,
  onSessionEnd,
}) => {
  const { posters, selectedPosterId, addPoster, getCurrentPosterImage, maxPosters } =
    usePosterStore();
  const { addToast, setShowLoading } = useUIState();

  const videoRef = useRef<HTMLVideoElement>(null);
  const orientationRef = useRef(new Quaternion());

  const [isSessionActive, setIsSessionActive] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Track screen orientation so the mapping stays correct in landscape.
  const screenOrientationRef = useRef<number>(
    typeof window !== 'undefined'
      ? (window.orientation as number | undefined) ?? 0
      : 0
  );

  /** Begin or end the iOS AR-lite session. */
  const startSession = useCallback(async () => {
    setPermissionError(null);

    // 1. Camera permission + stream attach.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // iOS requires explicit play() after attaching srcObject.
        await videoRef.current.play().catch(() => undefined);
      }
    } catch (err) {
      console.error('Camera permission denied:', err);
      setPermissionError(
        'Camera permission was denied. Please allow camera access in Safari settings and try again.'
      );
      return;
    }

    // 2. DeviceOrientation permission (iOS 13+ requires user gesture).
    const DOE = window.DeviceOrientationEvent as
      | (typeof window.DeviceOrientationEvent & DeviceOrientationEventStatic)
      | undefined;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        const result = await DOE.requestPermission();
        if (result !== 'granted') {
          setPermissionError(
            'Motion permission was denied. The poster placement will not track your phone movement.'
          );
        }
      } catch (err) {
        console.warn('DeviceOrientation permission request failed:', err);
      }
    }

    setIsSessionActive(true);
    setNeedsPermission(false);
    onSessionStart?.();
    addToast({ type: 'success', message: 'AR session started' });
    setShowLoading(false);
  }, [addToast, onSessionStart, setShowLoading]);

  const stopSession = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsSessionActive(false);
    onSessionEnd?.();
    addToast({ type: 'info', message: 'AR session ended' });
  }, [addToast, onSessionEnd]);

  // Detect whether we need a permission prompt before showing the Start button.
  useEffect(() => {
    const DOE = window.DeviceOrientationEvent as
      | (typeof window.DeviceOrientationEvent & DeviceOrientationEventStatic)
      | undefined;
    if (DOE && typeof DOE.requestPermission === 'function') {
      setNeedsPermission(true);
    }
  }, []);

  // DeviceOrientation listener — runs whenever a session is active.
  useEffect(() => {
    if (!isSessionActive) return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const alpha = event.alpha ?? 0;
      const beta = event.beta ?? 0;
      const gamma = event.gamma ?? 0;
      deviceOrientationToQuaternion(
        alpha,
        beta,
        gamma,
        screenOrientationRef.current,
        orientationRef.current
      );
    };
    const handleScreenOrientation = () => {
      screenOrientationRef.current =
        (window.orientation as number | undefined) ?? 0;
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    window.addEventListener('orientationchange', handleScreenOrientation);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
      window.removeEventListener('orientationchange', handleScreenOrientation);
    };
  }, [isSessionActive]);

  // Clean up stream on unmount.
  useEffect(() => {
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  /**
   * Tap-to-place: drop a poster at a fixed distance in front of the current
   * camera direction. We compute the placement point from the latest
   * orientation quaternion rather than the three.js camera (which lags by
   * one slerp step) so the poster lands where the user is actually looking.
   */
  const handlePlace = useCallback(() => {
    if (!isSessionActive) return;
    if (posters.length >= maxPosters) {
      addToast({ type: 'info', message: 'Maximum posters reached' });
      return;
    }

    const forward = new Vector3(0, 0, -1).applyQuaternion(orientationRef.current);
    const placePos = forward.multiplyScalar(DEFAULT_PLACEMENT_DISTANCE);

    // Make the poster face the camera (negate forward, derive Y rotation).
    const yaw = Math.atan2(forward.x, forward.z) + Math.PI;

    addPoster({
      imageUrl: getCurrentPosterImage(),
      position: [placePos.x, placePos.y, placePos.z],
      rotation: [0, yaw, 0],
    });
  }, [
    isSessionActive,
    posters.length,
    maxPosters,
    addPoster,
    getCurrentPosterImage,
    addToast,
  ]);

  return (
    <>
      <Header isARActive={isSessionActive} onExitAR={stopSession} />

      {/* Camera feed — fills viewport, sits behind the three.js canvas */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 0,
          backgroundColor: '#000',
        }}
      />

      {/* Three.js overlay */}
      <Canvas
        onClick={handlePlace}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
          touchAction: 'none',
        }}
        camera={{ fov: 70, near: 0.01, far: 100, position: [0, 0, 0] }}
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 4, 2]} intensity={0.8} />
        <CameraRig orientationRef={orientationRef} />
        {isSessionActive &&
          posters.map((poster) => <PosterMesh key={poster.id} poster={poster} />)}
      </Canvas>

      {/* Start button — replaces the WebXR ARButton on iOS */}
      {!isSessionActive && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1500,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            color: '#f1f5f9',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ marginBottom: '12px' }}>iOS AR Mode</h2>
          <div
            style={{
              maxWidth: '420px',
              marginBottom: '16px',
              padding: '10px 14px',
              backgroundColor: 'rgba(251, 191, 36, 0.15)',
              border: '1px solid rgba(251, 191, 36, 0.5)',
              borderRadius: '8px',
              color: '#fde68a',
              fontSize: '13px',
              lineHeight: 1.4,
            }}
          >
            <strong style={{ display: 'block', marginBottom: '4px' }}>
              Surface detection is not available on iPhone.
            </strong>
            Apple does not expose any AR plane / hit-test APIs to web pages.
            This mode uses the camera and motion sensors to place posters at
            a fixed distance in the direction you are facing — no walls or
            floors are detected.
          </div>
          <p style={{ maxWidth: '420px', marginBottom: '20px', lineHeight: 1.4, fontSize: '13px', opacity: 0.85 }}>
            For real surface detection, open this app in Chrome on an
            ARCore-supported Android device, or on a desktop Chrome with the
            WebXR API Emulator extension.
          </p>
          {needsPermission && (
            <p style={{ fontSize: '13px', opacity: 0.8, marginBottom: '20px' }}>
              You&apos;ll be asked for camera and motion permissions.
            </p>
          )}
          {permissionError && (
            <p
              style={{
                color: '#fca5a5',
                marginBottom: '20px',
                fontSize: '14px',
                maxWidth: '420px',
              }}
            >
              {permissionError}
            </p>
          )}
          <button
            onClick={startSession}
            style={{
              padding: '14px 32px',
              fontSize: '18px',
              fontWeight: 'bold',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '25px',
              cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
            }}
          >
            Start AR
          </button>
        </div>
      )}

      {/* Persistent iOS limitations badge during session */}
      {isSessionActive && (
        <div
          style={{
            position: 'fixed',
            top: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 12px',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            color: '#fde68a',
            borderRadius: '14px',
            fontSize: '12px',
            zIndex: 1100,
            pointerEvents: 'none',
            border: '1px solid rgba(251, 191, 36, 0.4)',
          }}
        >
          iOS mode · no surface detection · fixed-distance drop
        </div>
      )}

      {/* Tap-to-place hint */}
      {isSessionActive && posters.length === 0 && (
        <div
          style={{
            position: 'fixed',
            top: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            borderRadius: '20px',
            fontSize: '14px',
            zIndex: 1100,
            pointerEvents: 'none',
          }}
        >
          Tap anywhere to place a poster
        </div>
      )}

      <ControlPanel isARActive={isSessionActive} />
      {selectedPosterId && <PosterControls />}
    </>
  );
};

// Made with Bob
