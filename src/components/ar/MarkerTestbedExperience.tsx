/**
 * MarkerTestbedExperience — image-marker tracking testbed.
 *
 * A deliberately small AR mode, reachable at `?mode=marker`, that exists to
 * answer three questions before any larger marker feature is built:
 *
 *   1. How stable is 8th Wall image-target tracking on real hardware — what
 *      frame rate, what jitter, how long to detect, how far does an asset jump
 *      when the marker is re-acquired?
 *   2. Can an asset's distance from the marker be adjusted and stored?
 *   3. Does a marker-relative "space" survive quitting and reopening the app?
 *
 * It shares the shipping app's engine plumbing verbatim (onXr8Ready / runXr8,
 * PosterPlacement, the texture cache, debugTelemetry) and adds only the marker
 * pieces: imageTargetController for detection, MarkerAnchoredAssets for
 * anchoring, spaceStore for the data, spaceApi for persistence.
 *
 * The story mode this replaces is untouched — App.tsx picks between them.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AmbientLight, Camera, DirectionalLight, Group, Matrix4, Scene } from 'three';

import { onXr8Ready, runXr8, stopXr8 } from '@/xr8/pipeline';
import {
  configureImageTargets,
  createImageTargetModule,
  isMarkerVisible,
  readMarkerPose,
  readMarkerStatus,
  resetImageTargets,
  type MarkerStatus,
} from '@/xr8/imageTargetController';
import { loadImageTargets, type ImageTargetData } from '@/xr8/imageTargetData';
import { MarkerAnchoredAssets } from '@/xr8/markerAnchoredAssets';
import { PosterPlacement } from '@/xr8/posterPlacement';
import { markerPoseToMatrix } from '@/xr/markerRelativeTransform';
import { debugTelemetry } from '@/xr/debugTelemetry';
import { useUIState } from '@/hooks/useUIState';
import { useArLoadProgress } from '@/hooks/useArLoadProgress';
import { usePosterStore } from '@/store/posterStore';
import { useSpaceStore } from '@/store/spaceStore';
import {
  deleteBinding,
  isSpacePersistenceEnabled,
  listSpaces,
  saveBinding,
} from '@/services/spaceApi';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { DebugHUD } from '@/components/ui/DebugHUD';
import { Header } from '@/components/layout/Header';
import { MarkerHUD, type TestbedStatus, type SaveState } from '@/components/ui/MarkerHUD';

/** How long after the last slider move we push the change to the server. */
const SAVE_DEBOUNCE_MS = 500;

export const MarkerTestbedExperience: React.FC = () => {
  const { showLoading, setShowLoading, addToast } = useUIState();
  const [isARActive, setIsARActive] = useState(false);
  const [targetsReady, setTargetsReady] = useState(false);
  const [targetsProblem, setTargetsProblem] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>(
    isSpacePersistenceEnabled() ? 'idle' : 'disabled',
  );
  const loadProgress = useArLoadProgress(showLoading);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pipeline-scoped refs (built in onStart, read in onUpdate, freed on exit).
  const placementRef = useRef<PosterPlacement | null>(null);
  const anchorsRef = useRef<MarkerAnchoredAssets | null>(null);
  const targetsRef = useRef<ImageTargetData[]>([]);
  const lastFrameTimeRef = useRef<number | null>(null);
  const markerMatrixRef = useRef(new Matrix4());
  // The render loop is a plain closure created once, so React state would be
  // stale inside it; the mode is mirrored into a ref that the loop reads.
  const followRef = useRef(follow);
  const hydratedRef = useRef(false);
  const saveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  // ── Load marker fingerprints ────────────────────────────────────────────
  // Done before the session starts, not inside onStart, so the engine is
  // configured with a fully-loaded target set in one call and the ENTER AR
  // button can report a missing fingerprint before the camera ever opens.
  useEffect(() => {
    let cancelled = false;
    void loadImageTargets().then(({ targets, problem }) => {
      if (cancelled) return;
      targetsRef.current = targets;
      setTargetsProblem(problem);
      setTargetsReady(targets.length > 0);
      if (targets.length === 0) debugTelemetry.setSubsystem('imageTarget', 'unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Restore saved spaces ────────────────────────────────────────────────
  // This is the cross-session recovery path: the transforms come back from the
  // server now, and get anchored to real-world positions the moment their
  // marker is detected.
  useEffect(() => {
    if (!isSpacePersistenceEnabled()) {
      hydratedRef.current = true;
      return;
    }
    let cancelled = false;
    listSpaces()
      .then((spaces) => {
        if (cancelled) return;
        useSpaceStore.getState().hydrate(spaces);
        const n = spaces.reduce((sum, s) => sum + s.assets.length, 0);
        if (n > 0) debugTelemetry.logEvent(`spaces: restored ${n} binding(s)`);
      })
      .catch((err) => {
        if (!cancelled) console.warn('Space hydration failed:', err);
      })
      .finally(() => {
        if (!cancelled) hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cancel any debounced saves still pending when the component goes away.
  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  /**
   * Persists one binding after a quiet period, so dragging the slider produces
   * a single write instead of one per pixel of travel.
   *
   * @param bindingId — Which binding to save; also the debounce key, so edits
   *   to different assets don't cancel each other.
   */
  const scheduleSave = useCallback((bindingId: string) => {
    if (!isSpacePersistenceEnabled()) return;
    const timers = saveTimersRef.current;
    clearTimeout(timers.get(bindingId));
    timers.set(
      bindingId,
      setTimeout(() => {
        timers.delete(bindingId);
        const found = useSpaceStore.getState().findAsset(bindingId);
        if (!found) return;
        setSaveState('saving');
        saveBinding(found.markerName, found.asset)
          .then(() => setSaveState('saved'))
          .catch((err) => {
            setSaveState('error');
            console.warn('Save binding failed:', err);
          });
      }, SAVE_DEBOUNCE_MS),
    );
  }, []);

  /**
   * Binds the gallery's current image to the active marker, at the marker
   * origin. This is the testbed's only "create" action — assets appear ON the
   * marker and the slider is what moves them off it.
   */
  const addAsset = useCallback(() => {
    const store = useSpaceStore.getState();
    const markerName = store.activeMarker;
    if (!markerName) {
      addToast({ type: 'info', message: 'Point the camera at the marker first' });
      return;
    }
    const { currentPosterImage } = usePosterStore.getState();
    const id = store.bindAsset(markerName, {
      assetUrl: currentPosterImage,
      assetName: 'Asset',
    });
    scheduleSave(id);
    debugTelemetry.logEvent(`space ${markerName}: bound asset`);
  }, [addToast, scheduleSave]);

  /** Unbinds the selected asset locally and on the server. */
  const removeSelected = useCallback(() => {
    const store = useSpaceStore.getState();
    const id = store.selectedAssetId;
    if (!id) return;
    const found = store.findAsset(id);
    if (!found) return;
    clearTimeout(saveTimersRef.current.get(id));
    saveTimersRef.current.delete(id);
    store.removeAsset(found.markerName, id);
    if (isSpacePersistenceEnabled()) {
      deleteBinding(found.markerName, id).catch((err) =>
        console.warn('Delete binding failed:', err),
      );
    }
  }, []);

  /**
   * Moves the selected asset along the marker's normal and queues a save.
   *
   * @param distance — New distance from the marker, in metres.
   */
  const setDistance = useCallback(
    (distance: number) => {
      const store = useSpaceStore.getState();
      const id = store.selectedAssetId;
      if (!id) return;
      const found = store.findAsset(id);
      if (!found) return;
      store.setDistance(found.markerName, id, distance);
      scheduleSave(id);
    },
    [scheduleSave],
  );

  /**
   * Snapshot for the HUD. Polled (rather than pushed via React state) so the
   * 60 fps render loop never triggers a re-render.
   *
   * @returns Current frame rate, marker health, drift, and asset count.
   */
  const getStatus = useCallback((): TestbedStatus => {
    const activeMarker = useSpaceStore.getState().activeMarker;
    const marker: MarkerStatus | null = activeMarker ? readMarkerStatus(activeMarker) : null;
    return {
      fps: debugTelemetry.read().fps,
      marker,
      reacquireDriftMm: anchorsRef.current?.reacquireDriftMm ?? null,
      placedCount: anchorsRef.current?.placedCount ?? 0,
      configuredCount: targetsRef.current.length,
    };
  }, []);

  /** Builds the pipeline modules and starts the engine. */
  const startSession = () => {
    if (!canvasRef.current) return;
    try {
      const canvas = canvasRef.current;

      const imageTargetModule = createImageTargetModule({
        onFound: (pose) => {
          useSpaceStore.getState().setActiveMarker(pose.name);
          // A marker coming back into view is the moment worth measuring: the
          // asset has been held by SLAM alone, and the marker now says where
          // it really belongs.
          anchorsRef.current?.noteReacquired();

          // Re-read after setActiveMarker — it is what creates the space.
          const store = useSpaceStore.getState();
          const space = store.spaces[pose.name];
          if (!space) return;

          if (space.assets.length > 0) {
            if (!store.selectedAssetId) store.selectAsset(space.assets[0].id);
            return;
          }
          // Auto-bind a first asset so a fresh marker isn't an empty scene.
          // Gated on hydration having finished — otherwise a slow restore
          // would land afterwards and duplicate the space's contents.
          if (!hydratedRef.current) return;
          const id = store.bindAsset(pose.name, {
            assetUrl: usePosterStore.getState().currentPosterImage,
            assetName: 'Asset',
          });
          scheduleSave(id);
        },
      });

      const sceneModule: Xr8PipelineModule = {
        name: 'marker-testbed-scene',

        onStart() {
          const { scene, camera } = XR8.Threejs.xrScene() as { scene: Scene; camera: Camera };

          scene.add(new AmbientLight(0xffffff, 0.9));
          const dir = new DirectionalLight(0xffffff, 0.6);
          dir.position.set(1, 2, 1);
          scene.add(dir);

          const sceneRoot = new Group();
          scene.add(sceneRoot);

          const placement = new PosterPlacement(sceneRoot);
          placementRef.current = placement;
          anchorsRef.current = new MarkerAnchoredAssets(placement);

          if (typeof XR8?.XrController?.updateCameraProjectionMatrix === 'function') {
            XR8.XrController.updateCameraProjectionMatrix({
              origin: camera.position,
              facing: camera.quaternion,
            });
          }

          // Configure targets AFTER the pipeline is running: runXr8 issues its
          // own XrController.configure call for world tracking just before
          // XR8.run, and configuring earlier would be overwritten by it.
          configureImageTargets(targetsRef.current);

          debugTelemetry.setSubsystem('session', 'active');
          debugTelemetry.setSubsystem('engine', 'ready');
          setShowLoading(false);
          setIsARActive(true);
        },

        onUpdate() {
          const now = performance.now();
          const last = lastFrameTimeRef.current;
          const deltaMs = last == null ? 0 : now - last;
          lastFrameTimeRef.current = now;

          const { activeMarker, spaces } = useSpaceStore.getState();
          const anchors = anchorsRef.current;

          if (anchors) {
            const space = activeMarker ? (spaces[activeMarker] ?? null) : null;
            const pose = activeMarker ? readMarkerPose(activeMarker) : null;
            const visible = activeMarker ? isMarkerVisible(activeMarker) : false;

            // Pass a pose only while the marker is actually in view — when it
            // is not, the anchors are left alone and SLAM holds them.
            let markerWorld: Matrix4 | null = null;
            if (pose && visible) {
              markerWorld = markerPoseToMatrix(pose, markerMatrixRef.current);
            }

            anchors.update(space, markerWorld, {
              follow: followRef.current,
              markerWidth: pose?.scaledWidth,
            });
          }

          placementRef.current?.tick(deltaMs);
          debugTelemetry.tick(now);
          debugTelemetry.mark('firstFrame');
        },
      };

      setShowLoading(true);
      onXr8Ready(() => {
        runXr8({ canvas, customModules: [imageTargetModule, sceneModule] });
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      addToast({ type: 'error', message: `AR start failed: ${msg}` });
      setShowLoading(false);
    }
  };

  /** Tears the session down, leaving the persisted spaces intact. */
  const handleExitAR = () => {
    stopXr8();
    anchorsRef.current?.clear();
    anchorsRef.current = null;
    placementRef.current?.clear();
    placementRef.current = null;
    lastFrameTimeRef.current = null;
    resetImageTargets();
    // The store is NOT reset: the spaces are the saved work, and clearing them
    // would make "exit AR" look like data loss.
    useSpaceStore.getState().selectAsset(null);
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
        message="Looking for the marker…"
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

      {isARActive && (
        <MarkerHUD
          getStatus={getStatus}
          follow={follow}
          onToggleFollow={() => setFollow((v) => !v)}
          onAddAsset={addAsset}
          onRemoveSelected={removeSelected}
          onDistanceChange={setDistance}
          saveState={saveState}
        />
      )}

      {!isARActive && (
        <div className="marker-testbed-start">
          {targetsProblem && <p className="marker-testbed-problem">{targetsProblem}</p>}
          <button onClick={startSession} disabled={!targetsReady} className="marker-testbed-enter">
            {targetsReady ? 'ENTER MARKER TEST' : 'NO MARKER INSTALLED'}
          </button>
        </div>
      )}
    </>
  );
};
