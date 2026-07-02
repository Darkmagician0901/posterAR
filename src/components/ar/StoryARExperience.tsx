/**
 * StoryARExperience — "THE GROUND REMEMBERS" on top of 8th Wall.
 *
 * A focused sibling of ARExperience. Instead of placing many user posters, it
 * plants ONE diorama tile on the detected ground (tap-to-place via the same
 * hit-test reticle) and swaps that tile's texture as the user walks the five
 * eras. The 2D chrome (title card, docent narration, timeline, controls) is
 * the StoryOverlay HUD; the diorama itself is the engine-drawn tile.
 *
 * Reuses the project's existing engine plumbing verbatim: onXr8Ready / runXr8
 * (pipeline.ts), readReticlePose (hitTestController), composeFlatPosterMatrix
 * (posterOrientation), createReticle. The only new 3D piece is StoryTile
 * (one swappable, transparent ground plane).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  Camera,
  DirectionalLight,
  Group,
  Scene,
  Vector3,
} from 'three';

import { onXr8Ready, runXr8, stopXr8 } from '@/xr8/pipeline';
import { readReticlePose } from '@/xr8/hitTestController';
import { StoryTile } from '@/xr8/storyTile';
import { composeFlatPosterMatrix } from '@/xr/posterOrientation';
import { createReticle, Reticle } from '@/xr/reticle';
import { debugTelemetry } from '@/xr/debugTelemetry';
import { useUIState } from '@/hooks/useUIState';
import { useArLoadProgress } from '@/hooks/useArLoadProgress';
import { useStoryStore } from '@/store/storyStore';
import { eraSvg } from '@/story/eraArt';
import { svgToTexture } from '@/story/svgTexture';
import { STORY_ERAS } from '@/story/storyData';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { DebugHUD } from '@/components/ui/DebugHUD';
import { Header } from '@/components/layout/Header';
import { StoryOverlay } from '@/components/story/StoryOverlay';

export const StoryARExperience: React.FC = () => {
  const { showLoading, setShowLoading, addToast } = useUIState();
  const { placed, eraIndex } = useStoryStore();
  const [isARActive, setIsARActive] = useState(false);
  const [surfaceReady, setSurfaceReady] = useState(false);
  const loadProgress = useArLoadProgress(showLoading);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pipeline-scoped refs (created in onStart, used in onUpdate + cleanup).
  const tileRef = useRef<StoryTile | null>(null);
  const reticleRef = useRef<Reticle | null>(null);
  const sceneRootRef = useRef<Group | null>(null);
  const lastReticleMatrixRef = useRef<Float32Array | null>(null);
  const tapListenersRef = useRef<{
    canvas: HTMLCanvasElement;
    onTouchStart: () => void;
    onMouseDown: () => void;
  } | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const reportedReadyRef = useRef(false);

  // ── Texture swapping ───────────────────────────────────────────────────
  // Whenever the era changes (or the tile is first planted), rasterize that
  // era's SVG and hand it to the tile. Runs on the React side so it composes
  // cleanly with store state; the tile lives in a ref so the engine loop and
  // this effect share it.
  useEffect(() => {
    if (!placed) return;
    let cancelled = false;
    const era = STORY_ERAS[eraIndex];
    void svgToTexture(eraSvg(era.key)).then(({ texture, aspect }) => {
      if (cancelled) {
        texture.dispose();
        return;
      }
      tileRef.current?.setTexture(texture, aspect);
      debugTelemetry.logEvent(`story: era → ${era.key}`);
    });
    return () => {
      cancelled = true;
    };
  }, [placed, eraIndex]);

  /**
   * Plants the diorama at the current reticle pose (first tap only). Later
   * taps are free "look around" — the user walks the eras with the HUD.
   */
  const placeStory = () => {
    if (useStoryStore.getState().placed) return;
    const matrix = lastReticleMatrixRef.current;
    const tile = tileRef.current;
    if (!matrix || !tile) {
      debugTelemetry.logEvent('story: tap ignored — no surface lock yet');
      return;
    }

    let cameraPos: Vector3 | null = null;
    try {
      const xrScene = XR8?.Threejs?.xrScene?.() as
        | { camera?: { position?: Vector3 } }
        | undefined;
      cameraPos = xrScene?.camera?.position ?? null;
    } catch {
      cameraPos = null;
    }

    tile.place(composeFlatPosterMatrix(matrix, cameraPos));
    useStoryStore.getState().place();
    addToast({ type: 'success', message: 'The ground remembers…' });
    debugTelemetry.logEvent('story: diorama planted');
  };

  /**
   * Builds the camera-pipeline module and starts the engine. onStart sets up
   * the scene + reticle + tile + tap listeners; onUpdate drives the reticle
   * from the per-frame hit-test until the story is planted.
   */
  const startSession = () => {
    if (!canvasRef.current) return;
    try {
      const canvas = canvasRef.current;

      const sceneModule: Xr8PipelineModule = {
        name: 'ground-remembers-scene',

        onStart({ canvas: pipelineCanvas }: { canvas: HTMLCanvasElement }) {
          const activeCanvas = pipelineCanvas ?? canvas;
          const { scene, camera } = XR8.Threejs.xrScene() as {
            scene: Scene;
            camera: Camera;
          };

          scene.add(new AmbientLight(0xffffff, 0.8));
          const dir = new DirectionalLight(0xffffff, 0.7);
          dir.position.set(1, 2, 1);
          scene.add(dir);

          const sceneRoot = new Group();
          scene.add(sceneRoot);
          sceneRootRef.current = sceneRoot;

          const reticle = createReticle();
          scene.add(reticle.mesh);
          camera.add(reticle.scanner);
          reticleRef.current = reticle;

          tileRef.current = new StoryTile(sceneRoot);

          if (typeof XR8?.XrController?.updateCameraProjectionMatrix === 'function') {
            XR8.XrController.updateCameraProjectionMatrix({
              origin: camera.position,
              facing: camera.quaternion,
            });
          }

          // Single tap handler (touch + the compatibility mousedown guard).
          let lastTouchTime = 0;
          const onTouchStart = () => {
            lastTouchTime = performance.now();
            placeStory();
          };
          const onMouseDown = () => {
            if (performance.now() - lastTouchTime < 700) return;
            placeStory();
          };
          activeCanvas.addEventListener('touchstart', onTouchStart, { passive: true });
          activeCanvas.addEventListener('mousedown', onMouseDown);
          tapListenersRef.current = { canvas: activeCanvas, onTouchStart, onMouseDown };

          debugTelemetry.setSubsystem('session', 'active');
          debugTelemetry.setSubsystem('engine', 'ready');
          debugTelemetry.setSubsystem('hitTest', 'searching');

          setShowLoading(false);
          setIsARActive(true);
        },

        onUpdate() {
          const now = performance.now();
          const last = lastFrameTimeRef.current;
          const deltaMs = last == null ? 0 : now - last;
          lastFrameTimeRef.current = now;

          const reticle = reticleRef.current;
          const storyPlaced = useStoryStore.getState().placed;
          const pose = readReticlePose();

          if (pose) {
            lastReticleMatrixRef.current = pose.matrix;
            // Once planted, hide the placement reticle — the user is now just
            // looking at the diorama, not aiming.
            if (storyPlaced) {
              reticle?.setMode('searching');
            } else {
              reticle?.setPose(pose.matrix);
              reticle?.setMode('tracking');
              if (!reportedReadyRef.current) {
                reportedReadyRef.current = true;
                setSurfaceReady(true);
                useStoryStore.getState().setPhase('ready');
              }
            }
            debugTelemetry.setSubsystem('hitTest', 'tracking');
          } else {
            lastReticleMatrixRef.current = null;
            if (!storyPlaced) reticle?.setMode('searching');
            debugTelemetry.setSubsystem('hitTest', 'searching');
          }

          tileRef.current?.tick(deltaMs);
          reticle?.tick(now);
          debugTelemetry.tick(now);
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

  /** Tears down the session and resets story + engine refs. */
  const handleExitAR = () => {
    stopXr8();
    tileRef.current?.clear();
    tileRef.current = null;

    const tap = tapListenersRef.current;
    if (tap) {
      tap.canvas.removeEventListener('touchstart', tap.onTouchStart);
      tap.canvas.removeEventListener('mousedown', tap.onMouseDown);
      tapListenersRef.current = null;
    }

    reticleRef.current = null;
    sceneRootRef.current = null;
    lastReticleMatrixRef.current = null;
    lastFrameTimeRef.current = null;
    reportedReadyRef.current = false;

    setSurfaceReady(false);
    useStoryStore.getState().reset();
    debugTelemetry.reset();
    setIsARActive(false);
    setShowLoading(false);
    addToast({ type: 'info', message: 'AR session ended' });
  };

  return (
    <>
      <Header isARActive={isARActive} onExitAR={handleExitAR} />
      <LoadingScreen
        isLoading={showLoading}
        message="Finding the ground…"
        progress={loadProgress.percent}
        stageLabel={loadProgress.label}
        error={loadProgress.error}
      />
      <DebugHUD />

      <div className="ar-canvas-holder">
        <canvas
          id="camerafeed"
          ref={canvasRef}
          style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 1 }}
        />
      </div>

      {/* 2D HUD over the camera + diorama. */}
      <StoryOverlay surfaceReady={surfaceReady} />

      {!isARActive && (
        <button
          onClick={startSession}
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '15px 30px',
            fontSize: '16px',
            fontWeight: 'bold',
            fontFamily: "'Press Start 2P', monospace",
            backgroundColor: '#f08a1e',
            color: '#1c1810',
            border: 'none',
            borderRadius: '14px',
            cursor: 'pointer',
            zIndex: 1000,
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
          }}
        >
          ENTER AR
        </button>
      )}
    </>
  );
};
