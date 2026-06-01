/**
 * ARExperience — 8th Wall (XR8) camera-pipeline implementation.
 *
 * Replaces the old WebXR-based component. The 8th Wall engine owns the canvas,
 * camera feed, three.js renderer, and render call — we register a custom
 * pipeline module and the engine calls onStart/onUpdate each frame.
 *
 * XR8.Threejs.pipelineModule() calls renderer.render(scene, camera) for us —
 * we must NOT call render ourselves.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  Camera,
  DirectionalLight,
  Group,
  Scene,
  Texture,
  TextureLoader,
} from 'three';

import { onXr8Ready, runXr8, stopXr8 } from '@/xr8/pipeline';
import { readReticlePose } from '@/xr8/hitTestController';
import { PosterPlacement } from '@/xr8/posterPlacement';
import { createReticle, Reticle } from '@/xr/reticle';
import { debugTelemetry } from '@/xr/debugTelemetry';
import { usePosterStore } from '@/store/posterStore';
import { useUIState } from '@/hooks/useUIState';
import { useArLoadProgress } from '@/hooks/useArLoadProgress';
import { ControlPanel } from '@/components/ui/ControlPanel';
import { PosterControls } from '@/components/ui/PosterControls';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { DebugHUD } from '@/components/ui/DebugHUD';
import { DevBanner } from '@/components/ui/DevBanner';
import { Header } from '@/components/layout/Header';

interface ARExperienceProps {
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
  /** 'dev' adds the dev banner + HUD-on-by-default; 'live' is the normal flow. */
  mode?: 'dev' | 'live';
}

export const ARExperience: React.FC<ARExperienceProps> = ({
  onSessionStart,
  onSessionEnd,
  mode = 'live',
}) => {
  const { selectedPosterId } = usePosterStore();
  const { showLoading, setShowLoading, addToast } = useUIState();
  const [isARActive, setIsARActive] = useState(false);

  // Drives the determinate loading bar during 8th Wall engine + SLAM startup.
  const loadProgress = useArLoadProgress(showLoading);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pipeline-module-scoped refs — created inside onStart, used in onUpdate
  // and in handleExitAR/cleanup.
  const placementRef = useRef<PosterPlacement | null>(null);
  const reticleRef = useRef<Reticle | null>(null);
  const sceneRootRef = useRef<Group | null>(null);
  const lastReticleMatrixRef = useRef<Float32Array | null>(null);
  const unsubscribeStoreRef = useRef<(() => void) | null>(null);
  const pointerListenerRef = useRef<(() => void) | null>(null);
  const placingRef = useRef(false);

  // Default-on HUD in dev mode (once per mount).
  useEffect(() => {
    if (mode === 'dev') debugTelemetry.setHudVisible(true);
  }, [mode]);

  // ── placePoster ─────────────────────────────────────────────────────────────

  const placePoster = async () => {
    if (placingRef.current) return;
    if (!lastReticleMatrixRef.current) return;

    placingRef.current = true;
    try {
      const { currentPosterImage } = usePosterStore.getState();
      const texture = await loadTexture(currentPosterImage);
      const aspect =
        texture.image && texture.image.height
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

      const placement = placementRef.current;
      if (!placement) {
        usePosterStore.getState().removePoster(posterId);
        return;
      }

      const matrix = lastReticleMatrixRef.current;
      if (!matrix) {
        usePosterStore.getState().removePoster(posterId);
        return;
      }

      const placedId = placement.place(matrix, texture, aspect, posterId);
      if (!placedId) {
        usePosterStore.getState().removePoster(posterId);
      }
    } catch (error) {
      console.error('Poster placement failed:', error);
      addToast({ type: 'error', message: 'Failed to place poster' });
    } finally {
      placingRef.current = false;
    }
  };

  // ── startSession ─────────────────────────────────────────────────────────────

  const startSession = () => {
    if (!canvasRef.current) return;

    try {
      const canvas = canvasRef.current;

      // Build the custom camera-pipeline module.
      const sceneModule: Xr8PipelineModule = {
        name: 'xrposter-scene',

        onStart({ canvas: pipelineCanvas }: { canvas: HTMLCanvasElement }) {
          // The 8th Wall engine passes its own canvas reference here, but we
          // also have our own ref — use whichever is available.
          const activeCanvas = pipelineCanvas ?? canvas;

          const { scene, camera } = (XR8 as any).Threejs.xrScene() as {
            scene: Scene;
            camera: Camera;
          };

          // Lighting
          scene.add(new AmbientLight(0xffffff, 0.7));
          const dir = new DirectionalLight(0xffffff, 0.8);
          dir.position.set(1, 2, 1);
          scene.add(dir);

          // Scene root that holds all placed posters.
          const sceneRoot = new Group();
          scene.add(sceneRoot);
          sceneRootRef.current = sceneRoot;

          // Reticle
          const reticle = createReticle();
          scene.add(reticle.mesh);
          // Scanner is head-locked — attach to the camera so it follows the
          // user's view without any world-tracking math.
          (camera as any).add(reticle.scanner);
          reticleRef.current = reticle;

          // Poster placement manager.
          placementRef.current = new PosterPlacement(sceneRoot);

          // Hint the XrController about the initial camera pose.
          if (typeof (XR8 as any)?.XrController?.updateCameraProjectionMatrix === 'function') {
            (XR8 as any).XrController.updateCameraProjectionMatrix({
              origin: (camera as any).position,
              facing: (camera as any).quaternion,
            });
          }

          // Mirror store deletions and scale-changes into the placement manager.
          const unsubscribe = usePosterStore.subscribe((state, prev) => {
            const placement = placementRef.current;
            if (!placement) return;

            const prevById = new Map(prev.posters.map((p) => [p.id, p]));
            const nextById = new Map(state.posters.map((p) => [p.id, p]));

            for (const id of prevById.keys()) {
              if (!nextById.has(id)) placement.remove(id);
            }
            for (const [id, poster] of nextById) {
              const before = prevById.get(id);
              if (!before) continue;
              if (
                before.scale[0] !== poster.scale[0] ||
                before.scale[1] !== poster.scale[1]
              ) {
                placement.setScale(id, poster.scale[0], poster.scale[1]);
              }
            }
          });
          unsubscribeStoreRef.current = unsubscribe;

          // Touch/mouse listener for poster placement.
          const onPointerDown = () => {
            placePoster();
          };
          activeCanvas.addEventListener('touchstart', onPointerDown, { passive: true });
          activeCanvas.addEventListener('mousedown', onPointerDown);
          pointerListenerRef.current = onPointerDown;

          // Telemetry
          debugTelemetry.setSubsystem('session', 'active');
          debugTelemetry.setSubsystem('engine', 'ready');
          debugTelemetry.setSubsystem('camera', 'ok');
          debugTelemetry.setSubsystem('hitTest', 'searching');
          debugTelemetry.setSubsystem('surface', 'searching');

          setShowLoading(false);
          setIsARActive(true);
          onSessionStart?.();
        },

        onUpdate() {
          debugTelemetry.mark('firstFrame');

          const reticle = reticleRef.current;
          const placement = placementRef.current;

          const pose = readReticlePose();

          if (pose) {
            reticle?.setPose(pose.matrix);
            reticle?.setVertical(pose.vertical);
            reticle?.setMode('tracking');
            lastReticleMatrixRef.current = pose.matrix;
            debugTelemetry.setSubsystem('hitTest', 'tracking');
            debugTelemetry.setSubsystem('surface', 'tracking');
          } else {
            reticle?.setMode('searching');
            lastReticleMatrixRef.current = null;
            debugTelemetry.setSubsystem('hitTest', 'searching');
            debugTelemetry.setSubsystem('surface', 'searching');
          }

          const now = performance.now();
          reticle?.tick(now);
          debugTelemetry.tick(now);
          debugTelemetry.write({
            hitTest: pose ? (pose.vertical ? 'vertical' : 'horizontal') : null,
            posters: placement?.size() ?? 0,
          });
        },
      };

      setShowLoading(true);

      onXr8Ready(() => {
        runXr8({ canvas, customModules: [sceneModule] });
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      addToast({ type: 'error', message: `AR start failed: ${msg}` });
      setShowLoading(false);
    }
  };

  // ── handleExitAR ─────────────────────────────────────────────────────────────

  const handleExitAR = () => {
    stopXr8();

    // Unsubscribe store listener.
    unsubscribeStoreRef.current?.();
    unsubscribeStoreRef.current = null;

    // Clear all placed posters.
    placementRef.current?.clear();
    placementRef.current = null;

    // Remove pointer listener from canvas.
    if (canvasRef.current && pointerListenerRef.current) {
      canvasRef.current.removeEventListener('touchstart', pointerListenerRef.current);
      canvasRef.current.removeEventListener('mousedown', pointerListenerRef.current);
      pointerListenerRef.current = null;
    }

    // Reset refs.
    reticleRef.current = null;
    sceneRootRef.current = null;
    lastReticleMatrixRef.current = null;
    placingRef.current = false;

    debugTelemetry.reset();
    setIsARActive(false);
    setShowLoading(false);
    addToast({ type: 'info', message: 'AR session ended' });
    onSessionEnd?.();
  };

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {mode === 'dev' && <DevBanner hasEmulator={false} />}
      <Header isARActive={isARActive} onExitAR={handleExitAR} />
      <LoadingScreen
        isLoading={showLoading}
        message="Initializing AR..."
        progress={loadProgress.percent}
        stageLabel={loadProgress.label}
        error={loadProgress.error}
      />
      <DebugHUD />

      {/* The 8th Wall engine draws the camera feed + 3D scene here.
          XRExtras.FullWindowCanvas handles resizing. */}
      <canvas
        id="camerafeed"
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      />

      {/* UI overlay — ordinary DOM on top of the canvas (no WebXR dom-overlay). */}
      <div
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
    </>
  );
};

// ── texture helpers ───────────────────────────────────────────────────────────

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
      (err) =>
        reject(err instanceof Error ? err : new Error('Texture load failed'))
    );
  });
