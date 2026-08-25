/**
 * markerTracking.ts — the engine side of "which printed picture am I looking at".
 *
 * A listener-only pipeline module. It keeps a map of the markers the tracker
 * currently sees, and once per frame asks `stepSelection` which one owns the
 * session. The per-frame call is deliberate: `reality.imageupdated` fires
 * continuously and at a rate nobody controls, so running the dwell off events
 * would measure event frequency rather than elapsed time.
 *
 * The three events are handled here rather than in a component because they
 * arrive on the engine's own bus, at engine cadence, and React has no business
 * re-rendering at that rate. What leaves this module is one callback, fired
 * only when the chosen marker actually changes.
 *
 * Pose maths lives in `markerPose.ts`; selection maths in `markerSelection.ts`.
 * Both are pure and unit-tested. This file is the wiring that cannot be.
 */

import { Camera, Vector3 } from 'three';
import {
  INITIAL_SELECTION,
  stepSelection,
  type SelectionState,
  type TrackedMarker,
} from '@/markers/markerSelection';
import { debugTelemetry } from '@/xr/debugTelemetry';

/**
 * What the engine reports for a tracked image.
 *
 * Only the fields this module reads are named. `scaledWidth`/`scaledHeight`
 * are FLAT-only and describe the marker's size in scene units — whatever those
 * units are, which is exactly why the tile is sized from them rather than from
 * anything this app believes about metres.
 */
export interface ImageTargetEvent {
  name: string;
  position: { x: number; y: number; z: number };
  rotation: { w: number; x: number; y: number; z: number };
  scale: number;
  scaledWidth?: number;
  scaledHeight?: number;
}

/** A marker the engine currently sees, with its latest pose. */
export interface LiveMarker extends TrackedMarker {
  event: ImageTargetEvent;
}

/** Everything the caller needs when the visitor turns to a new picture. */
export interface MarkerSelectionChange {
  /** markerId now owning the session, or null when nothing has been chosen. */
  current: string | null;
  /** The marker's latest pose, when it is still visible. */
  marker: LiveMarker | null;
}

export interface MarkerTrackingOptions {
  /**
   * Fired only when the owning marker changes — never per frame. Swapping a
   * story is expensive (documents, textures, narration chrome), so this must
   * not be treated as a per-frame signal.
   */
  onSelectionChange: (change: MarkerSelectionChange) => void;
  /**
   * Fired every frame with the currently-owning marker's pose, while it is
   * visible. This is where the tile follows the picture.
   */
  onPose?: (marker: LiveMarker) => void;
  /**
   * Fired when the owning marker starts or stops being VISIBLE — which is not
   * the same question as which marker owns the session, and cannot be answered
   * from `onSelectionChange`.
   *
   * `stepSelection` deliberately never hands the session back to nobody: a
   * visitor lowering their phone mid-sentence must not lose the story. That is
   * right for story ownership and useless for "is the picture in front of me
   * right now", which is what the lock frame and the TAP TO BEGIN prompt are
   * actually reporting. Without this, a visitor who looks away before tapping
   * keeps being invited to tap, and the tap lands on a stale pose.
   */
  onVisibilityChange?: (visible: boolean) => void;
  /** Injectable clock, so the dwell can be driven deterministically in tests. */
  now?: () => number;
}

/**
 * Projects a tracked marker's world position onto the screen.
 *
 * Normalised so centre is (0,0) and the edges are +/-1, which is the contract
 * `markerSelection` expects. Uses the engine's own camera each frame rather
 * than a cached one: the projection matrix changes as the device moves, and a
 * stale matrix would put the marker in the wrong place exactly when the
 * visitor is turning between two pictures — the moment selection matters most.
 *
 * @param event — The engine's image event.
 * @returns Screen-space position, or null when no camera is available yet.
 */
function projectToScreen(event: ImageTargetEvent): { screenX: number; screenY: number } | null {
  const scene = XR8?.Threejs?.xrScene?.();
  const camera = scene?.camera as Camera | undefined;
  if (!camera) return null;

  const v = new Vector3(event.position.x, event.position.y, event.position.z);
  // .project() returns NDC: -1..1 on both axes, y up.
  v.project(camera);
  return { screenX: v.x, screenY: v.y };
}

/**
 * Builds the marker-tracking pipeline module.
 *
 * @param options — See {@link MarkerTrackingOptions}.
 * @returns A module for `XR8.addCameraPipelineModules`, plus a `reset` for
 *   teardown between sessions.
 */
export function createMarkerTracking(options: MarkerTrackingOptions): {
  module: Xr8PipelineModule;
  reset: () => void;
} {
  const {
    onSelectionChange,
    onPose,
    onVisibilityChange,
    now = () => performance.now(),
  } = options;

  /** Markers the engine can currently see, keyed by markerId. */
  const live = new Map<string, LiveMarker>();
  let selection: SelectionState = INITIAL_SELECTION;
  /** Whether the owning marker was visible last frame, for the flip. */
  let wasVisible = false;

  const upsert = (event: ImageTargetEvent): void => {
    const screen = projectToScreen(event);
    live.set(event.name, {
      name: event.name,
      // Before the camera exists, park the marker at centre rather than
      // dropping it: a marker the engine can see is visible whether or not we
      // can yet say where, and dropping it would stall selection entirely.
      screenX: screen?.screenX ?? 0,
      screenY: screen?.screenY ?? 0,
      event,
    });
  };

  const module = {
    name: 'xrposter-marker-tracking',
    listeners: [
      {
        event: 'reality.imagefound',
        process: ({ detail }: { detail: ImageTargetEvent }) => {
          upsert(detail);
          debugTelemetry.logEvent(`marker: found ${detail.name.slice(0, 8)}`);
        },
      },
      {
        event: 'reality.imageupdated',
        process: ({ detail }: { detail: ImageTargetEvent }) => upsert(detail),
      },
      {
        event: 'reality.imagelost',
        process: ({ detail }: { detail: { name: string } }) => {
          live.delete(detail.name);
          debugTelemetry.logEvent(`marker: lost ${detail.name.slice(0, 8)}`);
        },
      },
    ],

    onUpdate: () => {
      const previous = selection.current;
      selection = stepSelection(selection, [...live.values()], now());

      if (selection.current !== previous) {
        onSelectionChange({
          current: selection.current,
          marker: selection.current === null ? null : (live.get(selection.current) ?? null),
        });
      }

      // Pose every frame, but only for the marker that owns the session and
      // only while it is actually visible. `stepSelection` deliberately keeps
      // `current` when nothing is tracked — lowering the phone must not wipe
      // the story — so an owning marker with no live entry is normal, not an
      // error, and simply means there is no new pose to apply.
      const marker = selection.current === null ? undefined : live.get(selection.current);
      if (onPose && marker) onPose(marker);

      // Visibility is reported separately from ownership, and deliberately
      // AFTER the pose: a listener switching on "locked" wants the frame's
      // pose already applied on the same frame it is told to show it.
      const visible = marker !== undefined;
      if (visible !== wasVisible) {
        wasVisible = visible;
        onVisibilityChange?.(visible);
      }
    },
  } as unknown as Xr8PipelineModule;

  return {
    module,
    reset: () => {
      live.clear();
      selection = INITIAL_SELECTION;
      wasVisible = false;
    },
  };
}
