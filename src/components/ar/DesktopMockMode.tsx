/**
 * DesktopMockMode
 *
 * Desktop development sandbox that lets a developer exercise the reticle +
 * poster-placement code on a laptop webcam, without a phone or WebXR
 * extension.
 *
 * Architecture:
 *  - <video> fullscreen — live webcam feed (getUserMedia).
 *  - <canvas> overlay — raw three.js scene (alpha:true, no react-three-fiber).
 *  - installDesktopMockDriver on the canvas — mouse-drag → camera quaternion.
 *  - createReticle — fake hit-test pose 1.5 m forward + 0.3 m down each frame.
 *  - PosterPlacement — place() on "Place poster" button click.
 *
 * Does NOT use @react-three/fiber, @react-three/drei, IOSSegmentationDriver,
 * IOSSurfaceMesh, or 8th Wall / XR8.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  DirectionalLight,
  Group,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';

import { Header } from '@/components/layout/Header';
import { debugTelemetry } from '@/xr/debugTelemetry';
import {
  installDesktopMockDriver,
  DesktopMockHandle,
} from '@/xr/desktopMockDriver';
import { createReticle } from '@/xr/reticle';
import { PosterPlacement } from '@/xr8/posterPlacement';
import { usePosterStore } from '@/store/posterStore';

// ---------------------------------------------------------------------------
// Texture loader helper (mirrors ARExperience loadTexture)
// ---------------------------------------------------------------------------

const textureCache = new Map<string, Texture>();

const loadTexture = (url: string): Promise<Texture> =>
  new Promise((resolve, reject) => {
    const cached = textureCache.get(url);
    if (cached) { resolve(cached); return; }
    new TextureLoader().load(
      url,
      (tex) => {
        tex.anisotropy = 4;
        textureCache.set(url, tex);
        resolve(tex);
      },
      undefined,
      (err) => reject(err instanceof Error ? err : new Error('Texture load failed')),
    );
  });

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DesktopMockMode: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Refs that survive across renders and don't need to trigger re-render
  const driverHandleRef = useRef<DesktopMockHandle | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const placementRef = useRef<PosterPlacement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastReticleMatrixRef = useRef<Float32Array | null>(null);
  const placingRef = useRef(false);

  // The orientation quaternion the driver writes into. Allocated once.
  const orientationRef = useRef(new Quaternion());

  const [isActive, setIsActive] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Three.js setup / teardown
  // -------------------------------------------------------------------------

  const startThreeJS = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    // Renderer
    const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    rendererRef.current = renderer;

    // Camera at origin, looking down -Z
    const camera = new PerspectiveCamera(70, w / h, 0.01, 100);
    camera.position.set(0, 0, 0);

    // Scene
    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 0.6));
    const dirLight = new DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 4, 2);
    scene.add(dirLight);

    // sceneRoot holds placed posters
    const sceneRoot = new Group();
    scene.add(sceneRoot);

    // Reticle
    const reticle = createReticle();
    scene.add(reticle.mesh);
    camera.add(reticle.scanner); // head-locked searching ring
    scene.add(camera);           // camera must be in scene for its children to render

    // PosterPlacement
    const placement = new PosterPlacement(sceneRoot);
    placementRef.current = placement;

    // Install mouse-drag driver on the canvas element
    driverHandleRef.current = installDesktopMockDriver({
      target: canvas,
      out: orientationRef.current,
      sensitivity: 0.4,
    });

    // Helpers for the fake hit-test pose
    const tmpMatrix = new Matrix4();
    const tmpForward = new Vector3();
    const tmpPos = new Vector3();

    // Handle resize
    const onResize = () => {
      const nw = window.innerWidth;
      const nh = window.innerHeight;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    // rAF loop
    const loop = () => {
      rafIdRef.current = requestAnimationFrame(loop);

      // Smoothly slerp camera toward driver output
      camera.quaternion.slerp(orientationRef.current, 0.4);

      // Fake hit-test: place reticle 1.5 m in front of camera, 0.3 m below
      tmpForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      tmpPos
        .copy(camera.position)
        .addScaledVector(tmpForward, 1.5)
        .y -= 0.3;

      // Build a flat (floor-lying) matrix: position + rotateX(-PI/2)
      tmpMatrix.identity();
      tmpMatrix.makeRotationX(-Math.PI / 2);
      tmpMatrix.setPosition(tmpPos);

      const flatArray = new Float32Array(16);
      tmpMatrix.toArray(flatArray);
      lastReticleMatrixRef.current = flatArray;

      reticle.setPose(flatArray);
      reticle.setMode('tracking');
      reticle.tick(performance.now());

      renderer.render(scene, camera);

      debugTelemetry.tick(performance.now());
    };

    rafIdRef.current = requestAnimationFrame(loop);

    // Subsystem telemetry
    debugTelemetry.setSubsystem('desktopMock', 'active');
    debugTelemetry.setSubsystem('hitTest', 'tracking');
    debugTelemetry.setSubsystem('surface', 'estimated');

    // Store resize handler ref for cleanup
    (rendererRef as any).__onResize = onResize;
  }, []);

  const stopThreeJS = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    driverHandleRef.current?.dispose();
    driverHandleRef.current = null;

    placementRef.current?.clear();
    placementRef.current = null;

    if (rendererRef.current) {
      const onResize = (rendererRef as any).__onResize as (() => void) | undefined;
      if (onResize) window.removeEventListener('resize', onResize);
      rendererRef.current.dispose();
      rendererRef.current = null;
    }

    lastReticleMatrixRef.current = null;
    placingRef.current = false;

    debugTelemetry.setSubsystem('desktopMock', 'idle');
    debugTelemetry.setSubsystem('session', 'idle');
    debugTelemetry.setSubsystem('hitTest', 'idle');
    debugTelemetry.setSubsystem('surface', 'idle');
  }, []);

  // -------------------------------------------------------------------------
  // Webcam session
  // -------------------------------------------------------------------------

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
    setIsActive(true);
    // Start three.js after state update settles (canvas is now rendered)
    requestAnimationFrame(() => startThreeJS());
  }, [startThreeJS]);

  const stopSession = useCallback(() => {
    stopThreeJS();

    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }

    setIsActive(false);
  }, [stopThreeJS]);

  // -------------------------------------------------------------------------
  // Cleanup on unmount
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      stopThreeJS();
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    };
    // stopThreeJS is stable (useCallback with no deps that change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // "Place poster" handler
  // -------------------------------------------------------------------------

  const handlePlacePoster = useCallback(async () => {
    if (placingRef.current) return;
    if (!lastReticleMatrixRef.current) return;
    if (!placementRef.current) return;

    placingRef.current = true;
    try {
      const { currentPosterImage, addPoster } = usePosterStore.getState();
      const texture = await loadTexture(currentPosterImage);
      const aspect =
        texture.image && (texture.image as HTMLImageElement).height
          ? (texture.image as HTMLImageElement).height /
            (texture.image as HTMLImageElement).width
          : 1;

      const posterId = addPoster({
        imageUrl: currentPosterImage,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [0.5, 0.5 * aspect, 0.01],
      });
      if (!posterId) {
        console.warn('DesktopMockMode: poster limit reached');
        return;
      }

      placementRef.current.place(
        lastReticleMatrixRef.current,
        texture,
        aspect, // PosterPlacement: height = width * aspectRatio (aspect = h/w)
        posterId,
      );
    } catch (err) {
      console.error('DesktopMockMode: poster placement failed', err);
    } finally {
      placingRef.current = false;
    }
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <Header isARActive={isActive} onExitAR={stopSession} />

      {/* Webcam feed — always present so the ref is populated */}
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

      {/* Three.js canvas overlay — always present so the ref is available when
          startThreeJS() runs; transparent when !isActive */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
          cursor: isActive ? 'grab' : 'default',
          pointerEvents: isActive ? 'auto' : 'none',
        }}
      />

      {/* Pre-start overlay */}
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
            <strong>Desktop mock — exercises the reticle + placement code on your webcam.</strong>
            <br />
            Mouse-drag rotates the view. No phone or WebXR extension required.
          </div>

          {permissionError && (
            <p
              style={{ color: '#fca5a5', marginBottom: '16px', maxWidth: '420px' }}
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

      {/* Active session UI */}
      {isActive && (
        <>
          {/* Status pill */}
          <div
            style={{
              position: 'fixed',
              top: '60px',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '6px 12px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              color: '#bbf7d0',
              borderRadius: '14px',
              fontSize: '12px',
              zIndex: 1100,
              pointerEvents: 'none',
              border: '1px solid rgba(34, 197, 94, 0.4)',
            }}
          >
            Desktop mock · tracking (drag to rotate)
          </div>

          {/* Place poster button */}
          <div
            style={{
              position: 'fixed',
              bottom: '48px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1100,
              pointerEvents: 'auto',
            }}
          >
            <button
              onClick={handlePlacePoster}
              style={{
                padding: '14px 32px',
                fontSize: '16px',
                fontWeight: 'bold',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '25px',
                cursor: 'pointer',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.4)',
              }}
            >
              Place poster
            </button>
          </div>
        </>
      )}
    </>
  );
};
