/**
 * ARExperience
 *
 * Direct three.js + WebXR implementation. Bypasses @react-three/* because we
 * need:
 *   - explicit immersive-ar feature set (hit-test, anchors, dom-overlay required;
 *     plane-detection, light-estimation optional)
 *   - renderer.xr.setAnimationLoop as the only frame driver
 *   - poster meshes whose matrices are driven from anchor.anchorSpace each
 *     frame, never from stored position arrays
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Texture,
  TextureLoader,
  WebGLRenderer,
  Group,
} from 'three';

import {
  REQUIRED_FEATURES,
  OPTIONAL_FEATURES,
  isWebXRSupported,
  requestARSession,
} from '@/xr/sessionManager';
import { readHitTestPose, requestViewerHitTestSource } from '@/xr/hitTest';
import { AnchorManager } from '@/xr/anchorManager';
import { createReticle } from '@/xr/reticle';
import { usePosterStore } from '@/store/posterStore';
import { useUIState } from '@/hooks/useUIState';
import { ControlPanel } from '@/components/ui/ControlPanel';
import { PosterControls } from '@/components/ui/PosterControls';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Header } from '@/components/layout/Header';

interface ARExperienceProps {
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
}

export const ARExperience: React.FC<ARExperienceProps> = ({
  onSessionStart,
  onSessionEnd,
}) => {
  const { selectedPosterId } = usePosterStore();
  const { showLoading, setShowLoading, addToast } = useUIState();
  const [isARActive, setIsARActive] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const anchorManagerRef = useRef<AnchorManager | null>(null);

  const startSession = async () => {
    setSupportError(null);

    if (!isWebXRSupported()) {
      setSupportError('WebXR is not available in this browser.');
      return;
    }

    if (!canvasRef.current || !overlayRef.current) return;

    let session: XRSession;
    try {
      session = await requestARSession({ domOverlayRoot: overlayRef.current });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setSupportError(`Failed to start AR session: ${msg}`);
      addToast({ type: 'error', message: `AR start failed: ${msg}` });
      return;
    }

    sessionRef.current = session;
    setShowLoading(true);

    const renderer = new WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.xr.enabled = true;
    rendererRef.current = renderer;

    const scene = new Scene();
    const camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
    scene.add(new AmbientLight(0xffffff, 0.7));
    const dir = new DirectionalLight(0xffffff, 0.8);
    dir.position.set(1, 2, 1);
    scene.add(dir);

    const sceneRoot = new Group();
    scene.add(sceneRoot);

    const reticle = createReticle();
    scene.add(reticle.mesh);

    const anchorManager = new AnchorManager();
    anchorManagerRef.current = anchorManager;

    let localSpace: XRReferenceSpace | null = null;
    try {
      localSpace = await session.requestReferenceSpace('local');
    } catch (error) {
      console.error('requestReferenceSpace(local) failed:', error);
      addToast({ type: 'error', message: 'Could not acquire local reference space' });
      await session.end();
      return;
    }

    const hitTestSource = await requestViewerHitTestSource(session);
    if (!hitTestSource) {
      addToast({ type: 'error', message: 'Hit-test feature unavailable on this session' });
    }

    let lastReticleMatrix: Float32Array | null = null;
    let placing = false;

    const onSelect = async () => {
      if (placing) return;
      if (!lastReticleMatrix) return;
      const frame = (renderer.xr as unknown as { getFrame: () => XRFrame | null }).getFrame?.();
      if (!frame || !localSpace) return;

      placing = true;
      try {
        const { currentPosterImage } = usePosterStore.getState();
        const texture = await loadTexture(currentPosterImage);
        const aspect = texture.image && texture.image.height
          ? texture.image.height / texture.image.width
          : 1;
        const posterId = usePosterStore.getState().addPoster({
          imageUrl: currentPosterImage,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [0.5, 0.5 * aspect, 0.01],
        });
        if (!posterId) {
          addToast({ type: 'info', message: 'Poster limit reached' });
          return;
        }
        const record = await anchorManager.createAnchor(
          frame,
          lastReticleMatrix,
          texture,
          sceneRoot,
          aspect,
          posterId
        );
        if (!record) {
          usePosterStore.getState().removePoster(posterId);
        }
      } catch (error) {
        console.error('Anchor placement failed:', error);
        addToast({ type: 'error', message: 'Failed to place poster' });
      } finally {
        placing = false;
      }
    };

    session.addEventListener('select', onSelect);

    // Mirror store deletions/scale changes into the anchor manager so the
    // mesh disappears (and the underlying XRAnchor is released) on delete,
    // and so PosterControls scale-slider edits reach the anchored mesh.
    const unsubscribeStore = usePosterStore.subscribe((state, prev) => {
      const prevById = new Map(prev.posters.map((p) => [p.id, p]));
      const nextById = new Map(state.posters.map((p) => [p.id, p]));
      for (const id of prevById.keys()) {
        if (!nextById.has(id)) anchorManager.remove(id);
      }
      for (const [id, poster] of nextById) {
        const before = prevById.get(id);
        if (!before) continue;
        if (
          before.scale[0] !== poster.scale[0] ||
          before.scale[1] !== poster.scale[1]
        ) {
          anchorManager.setScale(id, poster.scale[0], poster.scale[1]);
        }
      }
    });

    await renderer.xr.setSession(session);

    renderer.xr.setAnimationLoop((_time, frame) => {
      if (!frame || !localSpace) return;

      if (hitTestSource) {
        const pose = readHitTestPose(frame, hitTestSource, localSpace);
        if (pose) {
          reticle.setPose(pose.matrix);
          reticle.setVertical(pose.vertical);
          lastReticleMatrix = pose.matrix;
        } else {
          reticle.setVisible(false);
          lastReticleMatrix = null;
        }
      }

      anchorManager.update(frame, localSpace);

      renderer.render(scene, camera);
    });

    session.addEventListener('end', () => {
      session.removeEventListener('select', onSelect);
      unsubscribeStore();
      renderer.xr.setAnimationLoop(null);
      anchorManager.clear();
      anchorManagerRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
      sessionRef.current = null;
      setIsARActive(false);
      setShowLoading(false);
      addToast({ type: 'info', message: 'AR session ended' });
      onSessionEnd?.();
    });

    setIsARActive(true);
    setShowLoading(false);
    addToast({ type: 'success', message: 'AR session started' });
    onSessionStart?.();
  };

  const handleExitAR = async () => {
    const session = sessionRef.current;
    if (session) await session.end();
  };

  useEffect(() => {
    const onResize = () => {
      if (rendererRef.current) {
        rendererRef.current.setSize(window.innerWidth, window.innerHeight, false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <>
      <Header isARActive={isARActive} onExitAR={handleExitAR} />
      <LoadingScreen isLoading={showLoading} message="Initializing AR..." />

      {/* DOM overlay root — passed to the AR session, holds in-AR UI */}
      <div
        ref={overlayRef}
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        <div style={{ pointerEvents: 'auto' }}>
          <ControlPanel isARActive={isARActive} />
          {selectedPosterId && <PosterControls />}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      />

      {!isARActive && (
        <button
          onClick={startSession}
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
        >
          Start AR
        </button>
      )}

      {supportError && (
        <div
          style={{
            position: 'fixed',
            top: '90px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '10px 16px',
            backgroundColor: 'rgba(220, 38, 38, 0.9)',
            color: 'white',
            borderRadius: '8px',
            fontSize: '14px',
            maxWidth: '90vw',
            zIndex: 1500,
          }}
        >
          {supportError}
          <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.85 }}>
            required: {REQUIRED_FEATURES.join(', ')}; optional:{' '}
            {OPTIONAL_FEATURES.join(', ')}
          </div>
        </div>
      )}
    </>
  );
};

const textureCache = new Map<string, Texture>();

const loadTexture = (url: string): Promise<Texture> =>
  new Promise((resolve, reject) => {
    const cached = textureCache.get(url);
    if (cached) {
      resolve(cached);
      return;
    }
    new TextureLoader().load(
      url,
      (tex) => {
        tex.anisotropy = 4;
        textureCache.set(url, tex);
        resolve(tex);
      },
      undefined,
      (err) => reject(err instanceof Error ? err : new Error('Texture load failed'))
    );
  });
