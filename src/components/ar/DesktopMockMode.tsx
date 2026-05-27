/**
 * DesktopMockMode
 *
 * Desktop development sandbox for the iOS segmentation pipeline. Lets the
 * user run the full pipeline (DeepLab segmenter → SurfaceLifter →
 * IMUStabilizer → SurfaceMesh) against their laptop webcam, with mouse
 * drag standing in for DeviceOrientation. No WebXR Emulator extension
 * required.
 *
 * Mounted from App.tsx in the desktop branch. Sits alongside the existing
 * ARExperience desktop dev wall — user can toggle into this mode when they
 * want to iterate on iOS-pipeline visuals.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Quaternion, Vector3 } from 'three';

import { IOSSurfaceMesh, SurfaceMeshState } from './IOSSurfaceMesh';
import { IOSSegmentationDriver } from './IOSSegmentationDriver';
import { Header } from '@/components/layout/Header';
import { debugTelemetry } from '@/xr/debugTelemetry';
import {
  installDesktopMockDriver,
  DesktopMockHandle,
} from '@/xr/desktopMockDriver';

const CameraRig: React.FC<{ orientationRef: React.MutableRefObject<Quaternion> }> = ({
  orientationRef,
}) => {
  const { camera } = useThree();
  useFrame(() => {
    camera.quaternion.slerp(orientationRef.current, 0.5);
  });
  return null;
};

export const DesktopMockMode: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const driverHandleRef = useRef<DesktopMockHandle | null>(null);
  const orientationRef = useRef(new Quaternion());

  const surfaceStateRef = useRef<SurfaceMeshState>({
    position: new Vector3(),
    quaternion: new Quaternion(),
    size: { width: 1, height: 1 },
    classId: null,
    visible: false,
  });

  const [isActive, setIsActive] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [segmenterStatus, setSegmenterStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  );

  const startSession = useCallback(async () => {
    setPermissionError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      debugTelemetry.setSubsystem('camera', 'ok');
    } catch (err) {
      console.error('Webcam permission denied:', err);
      setPermissionError(
        'Webcam permission was denied. Allow camera access in your browser, then reload.'
      );
      debugTelemetry.setSubsystem('camera', 'denied');
      return;
    }
    debugTelemetry.setSubsystem('session', 'active');
    debugTelemetry.setSubsystem('motion', 'unavailable'); // no real IMU on desktop
    setIsActive(true);
  }, []);

  const stopSession = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
    setSegmenterStatus('idle');
    surfaceStateRef.current.visible = false;
    debugTelemetry.setSubsystem('session', 'idle');
    debugTelemetry.setSubsystem('segmenter', 'idle');
    debugTelemetry.setSubsystem('stabilizer', 'idle');
  }, []);

  // Pointer-driven orientation. Installed once on mount; survives session
  // start/stop so the user can rotate the view before starting the camera.
  useEffect(() => {
    const target = canvasContainerRef.current;
    if (!target) return;
    driverHandleRef.current = installDesktopMockDriver({
      target,
      out: orientationRef.current,
      sensitivity: 0.4,
    });
    return () => {
      driverHandleRef.current?.dispose();
      driverHandleRef.current = null;
    };
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <>
      <Header isARActive={isActive} onExitAR={stopSession} />

      {/* Webcam feed */}
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
      <div
        ref={canvasContainerRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1,
          cursor: 'grab',
        }}
      >
        <Canvas
          style={{ width: '100%', height: '100%' }}
          camera={{ fov: 70, near: 0.01, far: 100, position: [0, 0, 0] }}
          gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[2, 4, 2]} intensity={0.8} />
          <CameraRig orientationRef={orientationRef} />
          {isActive && (
            <>
              <IOSSegmentationDriver
                videoRef={videoRef}
                surfaceStateRef={surfaceStateRef}
                active={isActive}
                onSegmenterStatus={setSegmenterStatus}
              />
              <IOSSurfaceMesh stateRef={surfaceStateRef} />
            </>
          )}
        </Canvas>
      </div>

      {!isActive && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1500,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            color: '#f1f5f9',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ marginBottom: '12px' }}>Desktop Mock AR Mode</h2>
          <div
            style={{
              maxWidth: '480px',
              marginBottom: '20px',
              padding: '12px 16px',
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid rgba(34, 197, 94, 0.5)',
              borderRadius: '8px',
              fontSize: '13px',
              lineHeight: 1.5,
            }}
          >
            <strong>Same segmentation pipeline iOS will use, running on
            your laptop webcam.</strong>
            <br />
            Mouse drag rotates the virtual camera (stand-in for the iPhone
            gyroscope). No WebXR Emulator extension required.
          </div>
          {permissionError && (
            <p style={{ color: '#fca5a5', marginBottom: '16px', maxWidth: '420px' }}>
              {permissionError}
            </p>
          )}
          <button
            onClick={startSession}
            style={{
              padding: '14px 32px',
              fontSize: '18px',
              fontWeight: 'bold',
              backgroundColor: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '25px',
              cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
            }}
          >
            Start Desktop Mock
          </button>
        </div>
      )}

      {isActive && (
        <div
          style={{
            position: 'fixed',
            top: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 12px',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            color:
              segmenterStatus === 'ready' ? '#bbf7d0'
              : segmenterStatus === 'error' ? '#fca5a5'
              : '#fde68a',
            borderRadius: '14px',
            fontSize: '12px',
            zIndex: 1100,
            pointerEvents: 'none',
            border:
              segmenterStatus === 'ready' ? '1px solid rgba(34, 197, 94, 0.4)'
              : segmenterStatus === 'error' ? '1px solid rgba(248, 113, 113, 0.4)'
              : '1px solid rgba(251, 191, 36, 0.4)',
          }}
        >
          {segmenterStatus === 'loading' && 'Desktop mock · loading model…'}
          {segmenterStatus === 'ready' && 'Desktop mock · scanning (drag to rotate)'}
          {segmenterStatus === 'error' && 'Desktop mock · segmentation failed'}
          {segmenterStatus === 'idle' && 'Desktop mock · waiting'}
        </div>
      )}
    </>
  );
};
