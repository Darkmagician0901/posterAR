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
  Vector3,
} from 'three';

import { acquirePosterTexture, releasePosterTexture } from '@/xr8/posterTextureCache';
import { onXr8Ready, runXr8, stopXr8 } from '@/xr8/pipeline';
import { readReticlePose } from '@/xr8/hitTestController';
import { PosterPlacement } from '@/xr8/posterPlacement';
import { getAmbientColor } from '@/xr8/ambientProbe';
import { composeFlatPosterMatrix } from '@/xr/posterOrientation';
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
  /** Called once the 8th Wall session is running (camera feed visible). */
  onSessionStart?: () => void;
  /** Called after the user exits AR and the session has been torn down. */
  onSessionEnd?: () => void;
  /** 'dev' adds the dev banner + HUD-on-by-default; 'live' is the normal flow. */
  mode?: 'dev' | 'live';
}

/**
 * Flattens an unknown thrown value into a readable multi-line string for the
 * on-device DebugHUD note. Used to surface placement failures on the phone,
 * where no desktop browser inspector is available.
 *
 * @param err — The caught value; may be an Error or anything else thrown.
 * @returns For Error values, "Name: message" plus the top six stack frames on
 *   following lines; for non-Error values, their String() form.
 */
const describeError = (err: unknown): string => {
  if (err instanceof Error) {
    const lines = [`${err.name}: ${err.message}`];
    if (err.stack) lines.push(err.stack.split('\n').slice(0, 6).join('\n'));
    return lines.join('\n');
  }
  return String(err);
};

/**
 * Live AR experience: registers a custom 8th Wall camera-pipeline module that
 * builds the three.js scene, drives the placement reticle from a per-frame
 * hit-test, and places posters on tap. Also renders all session UI (header,
 * loading screen, control panels, debug HUD) around the engine-owned canvas.
 */
export const ARExperience: React.FC<ARExperienceProps> = ({
  onSessionStart,
  onSessionEnd,
  mode = 'live',
}) => {
  const { selectedPosterId } = usePosterStore();
  const { showLoading, setShowLoading, addToast } = useUIState();
  const [isARActive, setIsARActive] = useState(false);

  // Drives the determinate loading bar shown while the 8th Wall engine and
  // its SLAM module download and start up. (SLAM = "Simultaneous Localization
  // and Mapping" — the engine's surface-tracking system; it is a multi-MB
  // download on first visit, which is why a progress bar is worth having.)
  const loadProgress = useArLoadProgress(showLoading);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pipeline-module-scoped refs — created inside onStart, used in onUpdate
  // and in handleExitAR/cleanup.
  const placementRef = useRef<PosterPlacement | null>(null);
  const reticleRef = useRef<Reticle | null>(null);
  const sceneRootRef = useRef<Group | null>(null);
  const lastReticleMatrixRef = useRef<Float32Array | null>(null);
  const unsubscribeStoreRef = useRef<(() => void) | null>(null);
  // The canvas the tap listeners were attached to (the engine may hand its own
  // canvas to onStart) plus both handlers, so cleanup removes the exact pair.
  const tapListenersRef = useRef<{
    canvas: HTMLCanvasElement;
    onTouchStart: () => void;
    onMouseDown: () => void;
  } | null>(null);
  const placingRef = useRef(false);
  const lastFrameTimeRef = useRef<number | null>(null);
  const firstFrameMarkedRef = useRef(false);

  // Default-on HUD in dev mode (once per mount).
  useEffect(() => {
    if (mode === 'dev') debugTelemetry.setHudVisible(true);
  }, [mode]);

  // ── placePoster ─────────────────────────────────────────────────────────────
  // TEMPORARY breadcrumb helpers — all logEvent calls in this function are
  // diagnostic-only instrumentation, to be removed/refined once the GIF
  // placement fix lands.

  /**
   * Places the currently selected poster at the reticle position.
   *
   * Early-returns when a placement is already in flight or the reticle has no
   * surface lock. Otherwise acquires a (possibly animated) texture from the
   * shared cache, registers the poster in the store, and hands it to the
   * PosterPlacement manager. All failures are caught internally and surfaced
   * via toast + debug HUD; the returned promise never rejects.
   */
  const placePoster = async () => {
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

      // Lay the poster flat on the detected surface (face = surface normal),
      // oriented so the image's top points back toward the viewer. Falls back
      // to a flat pose using the hit-pose yaw if the camera isn't available.
      let cameraPos: Vector3 | null = null;
      try {
        const xrScene = XR8?.Threejs?.xrScene?.() as
          | { camera?: { position?: Vector3 } }
          | undefined;
        cameraPos = xrScene?.camera?.position ?? null;
      } catch {
        cameraPos = null;
      }
      const placeMatrix = composeFlatPosterMatrix(matrix, cameraPos);

      // TEMPORARY: log that placement.place is about to be called.
      debugTelemetry.logEvent('placement.place: calling…');
      placement.place(placeMatrix, texture, aspect, posterId, currentPosterImage, animator);

      // TEMPORARY: log success with updated poster count.
      const posterCount = placement.size();
      debugTelemetry.logEvent(`placement.place: ok — total posters=${posterCount}`);

    } catch (error) {
      console.error('Poster placement failed:', error);
      // The texture cache (src/xr8/posterTextureCache.ts) counts how many
      // posters use each texture: acquirePosterTexture() increments the
      // count, releasePosterTexture() decrements it. If we acquired a texture
      // but threw before the poster was placed, release it here so the count
      // stays balanced and the texture can be freed. This is a safe no-op
      // when nothing was cached (e.g. acquire itself threw), because
      // release() ignores URLs it doesn't know about.
      releasePosterTexture(currentPosterImage);
      // TEMPORARY — removed/refined once the GIF placement fix lands.
      // Because there is no desktop browser inspector when testing on a
      // phone, write the real error into the persistent HUD note and force
      // the HUD visible. Errors from the GIF pipeline carry a stage tag
      // ([gif:fetch|decode|composite]) that says which step failed.
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

  /**
   * Builds the custom camera-pipeline module and starts the 8th Wall engine.
   *
   * The module's onStart sets up the scene (lights, reticle, poster root,
   * tap listeners, store subscription); onUpdate runs every frame to read the
   * hit-test pose, drive the reticle, and advance animations. Engine startup
   * errors are caught and reported via toast.
   */
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
          // The "scanner" ring (shown while searching for a surface) should
          // stay fixed in the user's view rather than at a point in the
          // world. Adding it as a child of the camera achieves that for
          // free: it moves with the camera, so no per-frame positioning math
          // is needed.
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

          // Mirror store deletions, scale-changes, and rotation-changes into
          // the placement manager.
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
              if (before.rotation[2] !== poster.rotation[2]) {
                placement.setRotation(id, poster.rotation[2]);
              }
            }
          });
          unsubscribeStoreRef.current = unsubscribe;

          // Touch/mouse listener for poster placement. Mobile browsers
          // synthesize a mousedown after touchstart for compatibility — the
          // timestamp guard keeps a single tap from invoking placePoster
          // twice (which could place two posters once the texture is cached
          // and the second call no longer overlaps the placingRef window).
          let lastTouchTime = 0;
          const handleTap = () => {
            // TEMPORARY: log every tap so we know the event reached JS even
            // when placePoster silently early-returns.
            debugTelemetry.logEvent(
              `tap: received — reticle=${lastReticleMatrixRef.current !== null ? 'locked' : 'not-locked'}`
            );
            void placePoster();
          };
          const onTouchStart = () => {
            lastTouchTime = performance.now();
            handleTap();
          };
          const onMouseDown = () => {
            // Ignore the compatibility mousedown that follows a touch.
            if (performance.now() - lastTouchTime < 700) return;
            handleTap();
          };
          activeCanvas.addEventListener('touchstart', onTouchStart, { passive: true });
          activeCanvas.addEventListener('mousedown', onMouseDown);
          tapListenersRef.current = { canvas: activeCanvas, onTouchStart, onMouseDown };

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
          placement?.applyAmbient(getAmbientColor());
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

  /**
   * Tears down the AR session: stops the 8th Wall engine, unsubscribes the
   * store listener, clears placed posters, removes tap listeners, resets all
   * session refs and telemetry, and notifies the parent via onSessionEnd.
   */
  const handleExitAR = () => {
    stopXr8();

    // Unsubscribe store listener.
    unsubscribeStoreRef.current?.();
    unsubscribeStoreRef.current = null;

    // Clear all placed posters.
    placementRef.current?.clear();
    placementRef.current = null;

    // Remove tap listeners from the canvas they were actually attached to
    // (onStart may have used the engine-provided canvas, not our ref).
    const tap = tapListenersRef.current;
    if (tap) {
      tap.canvas.removeEventListener('touchstart', tap.onTouchStart);
      tap.canvas.removeEventListener('mousedown', tap.onMouseDown);
      tapListenersRef.current = null;
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
