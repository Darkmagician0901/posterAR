/**
 * StoryARExperience — "THE GROUND REMEMBERS" on top of 8th Wall.
 *
 * Instead of placing many user posters, it plants ONE diorama tile on the
 * detected ground (tap-to-place via the hit-test reticle) and swaps that tile's
 * texture as the user walks the five eras. The 2D chrome (title card, docent
 * narration, timeline, controls) is the StoryOverlay HUD; the diorama itself is
 * the engine-drawn tile.
 *
 * Reuses the project's existing engine plumbing verbatim: onXr8Ready / runXr8
 * (pipeline.ts), readReticlePose (hitTestController), composeFlatPosterMatrix
 * (posterOrientation), createReticle. The only new 3D piece is StoryTile
 * (one swappable, transparent ground plane).
 */

import React, { useEffect, useRef, useState } from 'react';
import { AmbientLight, Camera, DirectionalLight, Group, Scene, Vector3 } from 'three';

import { onXr8Ready, runXr8, stopXr8 } from '@/xr8/pipeline';
import { createMarkerTracking, type LiveMarker } from '@/xr8/markerTracking';
import { composeSceneMatrix, hasDimensions, tileSize } from '@/markers/markerPose';
import {
  INITIAL_LOCK,
  markerLost,
  markerSeen,
  tapped,
  type LockState,
} from '@/markers/markerLock';
import { createMarkerFrame, type MarkerFrame } from '@/xr/markerFrame';
import { markerTargetData } from '@/markers/markerTarget';
import type { StoryAnchor } from '@/story/storyDoc';
import { loadExhibitForLocation, type LoadedExhibit } from '@/services/exhibitApi';
import { readReticlePose } from '@/xr8/hitTestController';
import { StoryTile } from '@/xr8/storyTile';
import { composePosterMatrix } from '@/xr/posterOrientation';
import { createReticle, Reticle } from '@/xr/reticle';
import { debugTelemetry } from '@/xr/debugTelemetry';
import { useUIState } from '@/hooks/useUIState';
import { useArLoadProgress } from '@/hooks/useArLoadProgress';
import { useStoryStore } from '@/store/storyStore';
import { svgToTexture } from '@/story/svgTexture';
import { useContentStore } from '@/store/contentStore';
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
  const lastReticleMatrixRef = useRef<Float32Array | null>(null);
  const tapListenersRef = useRef<{
    canvas: HTMLCanvasElement;
    onTouchStart: () => void;
    onMouseDown: () => void;
  } | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const reportedReadyRef = useRef(false);

  // ── Marker mode ────────────────────────────────────────────────────────
  // Present only when the URL named an exhibit (?e=<id>) AND at least one of
  // its stories is reachable. Null is the ordinary case and keeps every
  // existing behaviour — the reticle, the tap to plant, all of it — untouched.
  // A ref and not state: nothing in the JSX reads the exhibit — it is consumed
  // by the engine callbacks, which are outside React's render cycle entirely.
  // Holding it as state would force a re-render that changes nothing on screen.
  const exhibitRef = useRef<LoadedExhibit | null>(null);
  /** Clears tracked markers on teardown, so a re-entered session starts clean. */
  const markerResetRef = useRef<(() => void) | null>(null);

  /**
   * Whether this session is marker-driven. A ref AND a state: the engine
   * callbacks run outside React and read the ref; the overlay is React and
   * reads the state.
   */
  const markerModeRef = useRef(false);
  const [markerMode, setMarkerMode] = useState(false);
  /**
   * The room's feedback link, mirrored into state because `exhibitRef` is a
   * ref and would not re-render the overlay that shows it.
   */
  const [feedbackUrl, setFeedbackUrl] = useState<string | null>(null);
  /** Lock status, mirrored the same way and for the same reason. */
  const lockRef = useRef<LockState>(INITIAL_LOCK);
  const [lock, setLock] = useState<LockState>(INITIAL_LOCK);
  /** The owning marker's latest pose and its story's anchor, for the tap. */
  const liveMarkerRef = useRef<{ marker: LiveMarker; anchor: StoryAnchor } | null>(null);
  const markerFrameRef = useRef<MarkerFrame | null>(null);
  /**
   * Which marker the TILE is currently latched to.
   *
   * Deliberately not read off `lock.markerId`: when the visitor turns to a
   * second picture, the lock points at the new marker before its first pose
   * arrives, so comparing against it would say "already latched" and the scene
   * would never move to the new print.
   */
  const latchedMarkerRef = useRef<string | null>(null);

  /** Writes both halves of the lock state, so they cannot drift apart. */
  const applyLock = (next: LockState): void => {
    if (next === lockRef.current) return;
    lockRef.current = next;
    setLock(next);
  };

  useEffect(() => {
    let cancelled = false;
    void loadExhibitForLocation(window.location.search)
      .then((loaded) => {
        if (cancelled || loaded === null) return;
        // Written here rather than during render, which React forbids. The
        // load starts on mount and the visitor still has to tap to begin, so
        // it is reliably in place before the engine asks for it.
        exhibitRef.current = loaded;
        markerModeRef.current = true;
        setMarkerMode(true);
        setFeedbackUrl(loaded.feedbackUrl ?? null);
        debugTelemetry.logEvent(`exhibit: ${loaded.markerStories.size} picture(s) loaded`);
        // Named rather than swallowed: a picture on the wall that leads
        // nowhere is the failure a visitor cannot diagnose and an operator
        // cannot see, so it goes in the telemetry the HUD reads.
        if (loaded.unreachable.length > 0) {
          debugTelemetry.setNote(
            `${loaded.unreachable.length} story/stories in this room could not be loaded: ${loaded.unreachable.join(', ')}`,
          );
        }
      })
      .catch((err) => console.warn('Exhibit load failed:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Texture swapping ───────────────────────────────────────────────────
  // Whenever the era changes (or the tile is first planted), rasterize that
  // era's SVG and hand it to the tile. Runs on the React side so it composes
  // cleanly with store state; the tile lives in a ref so the engine loop and
  // this effect share it.
  // Subscribed rather than read once: an authored story can arrive after mount
  // (the ?s= fetch in App resolves asynchronously), and the tile must
  // re-rasterize when it does.
  const frames = useContentStore((s) => s.doc.frames);

  useEffect(() => {
    if (!placed) return;
    const frame = frames[eraIndex] ?? frames[0];
    if (!frame) return;
    let cancelled = false;
    void svgToTexture(frame.art).then(({ texture, aspect }) => {
      if (cancelled) {
        texture.dispose();
        return;
      }
      tileRef.current?.setTexture(texture, aspect);
      debugTelemetry.logEvent(`story: era → ${frame.key}`);
    });
    return () => {
      cancelled = true;
    };
  }, [placed, eraIndex, frames]);

  /**
   * Plants the diorama at the current reticle pose (first tap only). Later
   * taps are free "look around" — the user walks the eras with the HUD.
   */
  /**
   * Puts the scene where the marker says it goes.
   *
   * Every marker pose reaches the tile through here and nowhere else, so if a
   * large scene turns out to swing on device, smoothing goes in one place
   * (`marker-locator-design.md` §4.1).
   */
  const placeFromMarker = (live: { marker: LiveMarker; anchor: StoryAnchor }): void => {
    const tile = tileRef.current;
    if (!tile) return;
    const e = live.marker.event;
    // Guarded, not asserted: FLAT targets carry scaledWidth and Studio only
    // ever makes PLANAR ones, but sizing from undefined yields a NaN-sized
    // plane that never appears — the most confusing failure available.
    if (!hasDimensions(e)) return;

    tile.setWidth(tileSize(e, live.anchor.widthInMarkers).width);
    tile.place(
      composeSceneMatrix(e.position, e.rotation, e.scaledWidth, [
        live.anchor.local.position[0],
        live.anchor.local.position[1],
      ]),
    );
    latchedMarkerRef.current = live.marker.name;
  };

  /**
   * The marker-mode tap: latch the scene and start the story.
   *
   * The tap is anywhere on screen rather than on the picture, because aiming a
   * tap while holding a phone steady is awkward (`marker-locator-design.md`
   * §5.1 step 4).
   */
  const latchStory = (): void => {
    if (lockRef.current.status !== 'locked') {
      debugTelemetry.logEvent('story: tap ignored — no picture in view');
      return;
    }
    const live = liveMarkerRef.current;
    if (!live) return;

    placeFromMarker(live);
    applyLock(tapped(lockRef.current));
    // The frame has done its job: it said "this picture is recognised", and
    // the visitor is about to walk away from the print to see the scene.
    markerFrameRef.current?.setVisible(false);
    useStoryStore.getState().place();
    addToast({ type: 'success', message: 'The picture remembers…' });
    debugTelemetry.logEvent('story: latched to picture');
  };

  const placeStory = () => {
    // Marker mode never plants on the floor. Leaving the ground path reachable
    // here is the shipped defect this flow removes: a visitor on a ?e= link
    // could tap the floor and plant the story before ever seeing a picture.
    if (markerModeRef.current) {
      latchStory();
      return;
    }
    if (useStoryStore.getState().placed) return;
    const matrix = lastReticleMatrixRef.current;
    const tile = tileRef.current;
    if (!matrix || !tile) {
      debugTelemetry.logEvent('story: tap ignored — no surface lock yet');
      return;
    }

    let cameraPos: Vector3 | null;
    try {
      const xrScene = XR8?.Threejs?.xrScene?.() as { camera?: { position?: Vector3 } } | undefined;
      cameraPos = xrScene?.camera?.position ?? null;
    } catch {
      cameraPos = null;
    }

    tile.place(composePosterMatrix(matrix, cameraPos));
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

          // No reticle at all in marker mode — the printed picture decides
          // where the art goes, so a ground cursor would only invite the wrong
          // gesture. The lock frame takes its place.
          if (markerModeRef.current) {
            const markerFrame = createMarkerFrame();
            sceneRoot.add(markerFrame.object);
            markerFrameRef.current = markerFrame;
          } else {
            const reticle = createReticle();
            scene.add(reticle.mesh);
            camera.add(reticle.scanner);
            reticleRef.current = reticle;
          }

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
          // Honest in both modes: marker mode runs no hit-test at all, and a
          // HUD reading "searching" forever would send someone debugging a
          // raycast that is never issued.
          debugTelemetry.setSubsystem('hitTest', markerModeRef.current ? 'idle' : 'searching');

          setShowLoading(false);
          setIsARActive(true);
        },

        onUpdate() {
          const now = performance.now();
          const last = lastFrameTimeRef.current;
          const deltaMs = last == null ? 0 : now - last;
          lastFrameTimeRef.current = now;

          if (markerModeRef.current) {
            // No hit-test in marker mode. readReticlePose() runs a raycast
            // every frame and nothing here would use the result.
            tileRef.current?.tick(deltaMs);
            debugTelemetry.tick(now);
            return;
          }

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
        const room = exhibitRef.current;
        if (room === null) {
          runXr8({ canvas, customModules: [sceneModule] });
          return;
        }

        // Marker mode. The whole target set is configured once, from the whole
        // room: `imageTargetData` REPLACES the engine's active set, so adding
        // targets as they are discovered would drop the ones already there.
        // Narrowed rather than asserted: loadExhibitForLocation already drops
        // anchor-less stories, but a `!` here would quietly become a runtime
        // crash the day that filter changes.
        const anchors = [...room.markerStories.values()]
          .map((s) => s.anchor)
          .filter((a): a is NonNullable<typeof a> => a !== undefined);
        const tracking = createMarkerTracking({
          onSelectionChange: ({ current }) => {
            // `current` never returns to null once a picture has been seen —
            // stepSelection holds the live story deliberately. "Is the picture
            // in view right now" is a different question, answered by
            // onVisibilityChange below.
            if (current === null) return;
            const story = exhibitRef.current?.markerStories.get(current);
            if (!story?.anchor) return;

            // Swap the document; the texture effect above is subscribed to
            // contentStore and re-rasterizes the new story's art on its own.
            // Note it does NOT start the story: the visitor still has to tap.
            useContentStore.getState().load(story);
            applyLock(markerSeen(lockRef.current, current));
            debugTelemetry.logEvent(`story: switched to ${story.id}`);
          },
          onVisibilityChange: (visible) => {
            if (visible) {
              // markerSeen needs a marker; the pose callback has already run
              // this frame, so liveMarkerRef is the picture now on screen.
              const live = liveMarkerRef.current;
              if (live) applyLock(markerSeen(lockRef.current, live.marker.name));
              return;
            }
            // Looked away. A started session is unaffected — that is the whole
            // point of latching — but a lock that has not been tapped must
            // stop inviting a tap, or the tap lands on a stale pose.
            applyLock(markerLost(lockRef.current));
            liveMarkerRef.current = null;
            markerFrameRef.current?.setVisible(false);
          },
          onPose: (marker) => {
            const story = exhibitRef.current?.markerStories.get(marker.name);
            if (!story?.anchor) return;
            const live = { marker, anchor: story.anchor };
            liveMarkerRef.current = live;

            if (lockRef.current.status === 'started') {
              // Latched. SLAM owns the scene now; the only thing a pose still
              // does is re-place ONCE after a switch to a different picture.
              if (latchedMarkerRef.current === marker.name) return;
              placeFromMarker(live);
              return;
            }

            // Locked but not started: the frame tracks the print so the
            // visitor can see it is recognised.
            const frame = markerFrameRef.current;
            if (frame && hasDimensions(marker.event)) {
              frame.setSize(marker.event.scaledWidth, marker.event.scaledHeight);
              frame.setPose(
                composeSceneMatrix(marker.event.position, marker.event.rotation, 0, [0, 0]),
              );
              frame.setVisible(true);
            }
          },
        });
        markerResetRef.current = tracking.reset;

        runXr8({
          canvas,
          customModules: [sceneModule, tracking.module],
          imageTargetData: anchors.map(markerTargetData),
        });
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
    lastReticleMatrixRef.current = null;
    lastFrameTimeRef.current = null;
    reportedReadyRef.current = false;

    markerFrameRef.current?.dispose();
    markerFrameRef.current = null;
    liveMarkerRef.current = null;
    latchedMarkerRef.current = null;
    lockRef.current = INITIAL_LOCK;
    setLock(INITIAL_LOCK);
    // markerMode is deliberately NOT reset. It describes the LINK the visitor
    // followed, not the session: `exhibitRef` still holds the loaded room, so
    // re-entering AR configures image targets again. Clearing it here would
    // leave the second session tracking markers while also building a ground
    // reticle and a floor tap — the exact defect this flow removes, returning
    // by the back door.

    // Forget which pictures were visible. Without this a re-entered session
    // starts believing it can still see markers from the last one, and the
    // first frame would place artwork on a stale pose.
    markerResetRef.current?.();
    markerResetRef.current = null;

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
        message={markerMode ? 'Looking for the picture…' : 'Finding the ground…'}
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
      <StoryOverlay
        surfaceReady={surfaceReady}
        markerLock={markerMode ? lock.status : null}
        feedbackUrl={feedbackUrl}
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
