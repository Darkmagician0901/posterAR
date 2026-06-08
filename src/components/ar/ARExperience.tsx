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
} from 'three';

import { acquirePosterTexture, releasePosterTexture } from '@/xr8/posterTextureCache';
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

/**
 * Flatten an unknown thrown value into a readable multi-line string for the
 * on-device DebugHUD note (name + message + top stack frames). Used to surface
 * placement failures on the phone when no desktop inspector is available.
 */
const describeError = (err: unknown): string => {
  if (err instanceof Error) {
    const lines = [`${err.name}: ${err.message}`];
    if (err.stack) lines.push(err.stack.split('\n').slice(0, 6).join('\n'));
    return lines.join('\n');
  }
  return String(err);
};

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
  const lastFrameTimeRef = useRef<number | null>(null);
  const firstFrameMarkedRef = useRef(false);

  // Default-on HUD in dev mode (once per mount).
  useEffect(() => {
    if (mode === 'dev') debugTelemetry.setHudVisible(true);
  }, [mode]);

  // ── placePoster ─────────────────────────────────────────────────────────────
  // TEMPORARY breadcrumb helpers — all logEvent calls in this function are
  // diagnostic-only instrumentation removed/refined once GIF fix lands.

  const placePoster = async () => {
    // TEMPORARY: first placement attempt forces the HUD visible so the user
    // sees the trace without needing to find the toggle button.
    debugTelemetry.setHudVisible(true);

    if (placingRef.current) {
      // TEMPORARY: log the "already placing" early-return so it's visible.
      debugTelemetry.logEvent('tap: already placing — ignored');
      return;
    }
    if (!lastReticleMatrixRef.current) {
      // TEMPORARY: log the "no reticle lock" early-return (most likely iOS
      // cause of silent failure — surface not yet detected by SLAM).
      debugTelemetry.logEvent('tap: no reticle lock — surface not yet detected');
      return;
    }

    placingRef.current = true;

    // TEMPORARY: log entry + reticle lock confirmation.
    debugTelemetry.logEvent('placePoster: entered (reticle locked)');

    // Captured once here so the catch block releases the exact same URL we
    // acquired, even if the user changes selection during the async decode.
    const { currentPosterImage } = usePosterStore.getState();

    try {
      // TEMPORARY: log image kind + rough size so we can tell "GIF vs static"
      // and "data-URL vs blob: vs http" without needing DevTools.
      const isGif =
        currentPosterImage.startsWith('data:image/gif') ||
        /\.gif($|\?)/i.test(currentPosterImage);
      const urlKind = currentPosterImage.startsWith('data:')
        ? `data(${currentPosterImage.length} chars)`
        : currentPosterImage.startsWith('blob:')
          ? 'blob:'
          : currentPosterImage.startsWith('http')
            ? 'http'
            : 'other';
      debugTelemetry.logEvent(
        `createPosterTexture: start — ${isGif ? 'GIF' : 'static'} ${urlKind}`
      );

      const { texture, animator, aspect, fallbackReason } = await acquirePosterTexture(currentPosterImage);

      // TEMPORARY: log successful texture creation.
      debugTelemetry.logEvent(
        `createPosterTexture: ok — aspect=${aspect.toFixed(3)} animated=${animator !== null}`
      );
      if (fallbackReason) {
        debugTelemetry.logEvent(`gif: fell back to static frame-0 — ${fallbackReason}`);
      }

      const posterId = usePosterStore.getState().addPoster({
        imageUrl: currentPosterImage,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [0.5, 0.5 * aspect, 0.01],
      });

      if (!posterId) {
        // TEMPORARY: log poster-limit hit.
        debugTelemetry.logEvent('addPoster: null — poster limit reached');
        addToast({ type: 'info', message: 'Poster limit reached' });
        releasePosterTexture(currentPosterImage);
        return;
      }

      // TEMPORARY: log poster ID assigned.
      debugTelemetry.logEvent(`addPoster: ok — id=${posterId}`);

      const placement = placementRef.current;
      const matrix = lastReticleMatrixRef.current;
      if (!placement || !matrix) {
        // TEMPORARY: log loss of placement ref / matrix between async await.
        debugTelemetry.logEvent(
          `placement.place: skipped — placement=${placement !== null} matrix=${matrix !== null}`
        );
        usePosterStore.getState().removePoster(posterId);
        releasePosterTexture(currentPosterImage);
        return;
      }

      // TEMPORARY: log that placement.place is about to be called.
      debugTelemetry.logEvent('placement.place: calling…');
      placement.place(matrix, texture, aspect, posterId, currentPosterImage, animator);

      // TEMPORARY: log success with updated poster count.
      const posterCount = placement.size();
      debugTelemetry.logEvent(`placement.place: ok — total posters=${posterCount}`);

    } catch (error) {
      console.error('Poster placement failed:', error);
      // Balance the acquirePosterTexture() refcount if we acquired but threw
      // before the poster was placed. Safe no-op when nothing was cached (e.g.
      // acquire itself threw) since release() ignores unknown URLs.
      releasePosterTexture(currentPosterImage);
      // On-device trace sensing: we have no desktop inspector, so surface the
      // real error to the persistent HUD note and force it visible. The stage
      // tag ([gif:fetch|decode|composite]) localizes the failure. TEMPORARY —
      // removed/refined once the GIF placement fix lands.
      const detail = describeError(error);
      // TEMPORARY: also log error into breadcrumbs so it appears in Tap trace.
      debugTelemetry.logEvent(`ERROR: ${detail.split('\n')[0]}`);
      debugTelemetry.setNote(`Poster place failed\n${detail}`);
      debugTelemetry.setHudVisible(true);
      addToast({
        type: 'error',
        message: `Failed to place: ${detail.split('\n')[0]}`,
        duration: 8000,
      });
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

          const { scene, camera } = XR8.Threejs.xrScene() as {
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
          camera.add(reticle.scanner);
          reticleRef.current = reticle;

          // Poster placement manager.
          placementRef.current = new PosterPlacement(sceneRoot);

          // Hint the XrController about the initial camera pose.
          if (typeof XR8?.XrController?.updateCameraProjectionMatrix === 'function') {
            XR8.XrController.updateCameraProjectionMatrix({
              origin: camera.position,
              facing: camera.quaternion,
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
            // TEMPORARY: log every tap so we know the event reached JS even
            // when placePoster silently early-returns.
            debugTelemetry.logEvent(
              `tap: received — reticle=${lastReticleMatrixRef.current !== null ? 'locked' : 'not-locked'}`
            );
            void placePoster();
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
          const now = performance.now();

          if (!firstFrameMarkedRef.current) {
            debugTelemetry.mark('firstFrame');
            firstFrameMarkedRef.current = true;
          }

          const last = lastFrameTimeRef.current;
          const deltaMs = last == null ? 0 : now - last;
          lastFrameTimeRef.current = now;

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

          placement?.tick(deltaMs);
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
    lastFrameTimeRef.current = null;
    firstFrameMarkedRef.current = false;

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
          XRExtras.FullWindowCanvas handles resizing.

          The canvas is wrapped in a stable holder <div> on purpose. 8th Wall's
          FullWindowCanvas module reparents this canvas to document.body on
          session start, which moves it OUT of .app-container. React fragments
          are flattened, so without this wrapper the canvas would be a direct
          sibling of the other overlays in .app-container — and React would use
          the (now-moved) canvas as the insertBefore anchor whenever a sibling
          mounts just before it (e.g. the DebugHUD panel toggled on the first
          placement tap). That throws "NotFoundError: The object can not be
          found here." on WebKit. The holder stays put in .app-container, so
          React always has a valid anchor; only the canvas inside it moves. */}
      <div className="ar-canvas-holder">
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
      </div>

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
