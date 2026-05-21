/**
 * ARExperience Component
 * Main container for AR functionality - manages session, hit testing, and poster placement
 */

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ARButton, XR, createXRStore, useXR } from '@react-three/xr';
import { PosterMesh } from './PosterMesh';
import { usePosterStore } from '@/store/posterStore';
import { useHitTest } from '@/hooks/useHitTest';
import { usePosterPlacement } from '@/hooks/usePosterPlacement';
import { useUIState } from '@/hooks/useUIState';
import { ControlPanel } from '@/components/ui/ControlPanel';
import { PosterControls } from '@/components/ui/PosterControls';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Header } from '@/components/layout/Header';

// Create XR store outside component
const store = createXRStore();

interface ARExperienceProps {
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
}

/**
 * AR Content - rendered inside XR context
 */
const ARContent: React.FC = () => {
  const { posters } = usePosterStore();
  const xr = useXR();
  const session = xr.session || null;
  const { hitTestResult, startHitTest } = useHitTest(session, null);
  const { placePoster, canPlacePoster } = usePosterPlacement();
  const hasStartedHitTest = useRef(false);
  const referenceSpaceRef = useRef<XRReferenceSpace | null>(null);

  // Start hit testing when session becomes active
  useEffect(() => {
    if (session && !hasStartedHitTest.current) {
      const initHitTest = async () => {
        try {
          const refSpace = await session.requestReferenceSpace('local');
          referenceSpaceRef.current = refSpace;
          startHitTest();
          hasStartedHitTest.current = true;
        } catch (error) {
          console.error('Failed to get reference space:', error);
        }
      };
      initHitTest();
    }

    if (!session) {
      hasStartedHitTest.current = false;
      referenceSpaceRef.current = null;
    }
  }, [session, startHitTest]);

  // Handle select event (tap/click in AR)
  const handleSelect = useCallback(() => {
    if (hitTestResult && canPlacePoster(hitTestResult)) {
      placePoster(hitTestResult);
    }
  }, [hitTestResult, canPlacePoster, placePoster]);

  // Listen for select events
  useEffect(() => {
    if (!session) return;

    const onSelect = () => {
      handleSelect();
    };

    session.addEventListener('select', onSelect);

    return () => {
      session.removeEventListener('select', onSelect);
    };
  }, [session, handleSelect]);

  return (
    <>
      {/* Ambient light for overall scene illumination */}
      <ambientLight intensity={0.5} />
      
      {/* Directional light for shadows and depth */}
      <directionalLight
        position={[5, 5, 5]}
        intensity={1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      
      {/* Render all posters */}
      {posters.map((poster) => (
        <PosterMesh key={poster.id} poster={poster} />
      ))}

      {/* Hit test reticle - visual indicator of where poster will be placed */}
      {hitTestResult && canPlacePoster(hitTestResult) && (
        <mesh
          position={[
            hitTestResult.position.x,
            hitTestResult.position.y,
            hitTestResult.position.z,
          ]}
          rotation={[
            hitTestResult.rotation.x - Math.PI / 2,
            hitTestResult.rotation.y,
            hitTestResult.rotation.z,
          ]}
        >
          <ringGeometry args={[0.15, 0.2, 32]} />
          <meshBasicMaterial color="#00ff00" opacity={0.5} transparent />
        </mesh>
      )}
    </>
  );
};

/**
 * Main AR experience container
 */
export const ARExperience: React.FC<ARExperienceProps> = () => {
  const { selectedPosterId } = usePosterStore();
  const { showLoading, setShowLoading, addToast } = useUIState();
  const [isARActive, setIsARActive] = useState(false);

  // Monitor AR session state
  useEffect(() => {
    const checkARState = () => {
      const xrSession = store.getState().session;
      const wasActive = isARActive;
      const nowActive = xrSession !== null;
      
      if (nowActive !== wasActive) {
        setIsARActive(nowActive);
        
        if (nowActive) {
          setShowLoading(true);
          addToast({
            type: 'success',
            message: 'AR session started',
          });
          // Hide loading after a delay
          setTimeout(() => setShowLoading(false), 2000);
        } else {
          setShowLoading(false);
          addToast({
            type: 'info',
            message: 'AR session ended',
          });
        }
      }
    };

    const interval = setInterval(checkARState, 100);
    return () => clearInterval(interval);
  }, [isARActive, setShowLoading, addToast]);

  const handleExitAR = () => {
    store.getState().session?.end();
  };

  return (
    <>
      {/* Header */}
      <Header isARActive={isARActive} onExitAR={handleExitAR} />

      {/* Loading screen */}
      <LoadingScreen isLoading={showLoading} message="Initializing AR..." />

      {/* AR Button to start/stop session */}
      <ARButton
        store={store}
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '15px 30px',
          fontSize: '18px',
          fontWeight: 'bold',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '25px',
          cursor: 'pointer',
          zIndex: 1000,
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
        }}
      />

      {/* Control Panel */}
      <ControlPanel isARActive={isARActive} />

      {/* Poster Controls (shown when poster is selected) */}
      {selectedPosterId && <PosterControls />}

      {/* Three.js Canvas with XR support */}
      <Canvas
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
        camera={{
          fov: 75,
          near: 0.1,
          far: 1000,
          position: [0, 0, 0],
        }}
        gl={{
          alpha: true,
          antialias: true,
          preserveDrawingBuffer: true,
        }}
      >
        <XR store={store}>
          <ARContent />
        </XR>
      </Canvas>
    </>
  );
};

// Made with Bob