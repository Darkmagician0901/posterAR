/**
 * imageTargetController.ts — 8th Wall (XR8) image-target integration.
 *
 * Image targets are 8th Wall's marker tracking: you give the engine a
 * "fingerprint" of a printed picture (see @/xr8/imageTargetData) and it tells
 * you, every frame, where that picture is in the world. Unlike the app's
 * ground-plane hit-test, the pose is tied to a REAL, identifiable object — so
 * it survives being quit and reopened, which is the whole point of the
 * marker-anchored testbed.
 *
 * This module owns:
 *   - configuring the active target set (`configureImageTargets`)
 *   - a pipeline module that listens for found / updated / lost events
 *   - a per-marker pose registry the render loop reads each frame
 *   - per-marker stability metrics (jitter, update rate, detection latency)
 *
 * IMPORTANT — API version. Since 8th Wall went open source (Feb 2026) the
 * hosted project console is gone, and with it the old
 * `configure({ imageTargets: ['name'] })` form that referenced targets by a
 * name registered in the cloud. The open-source engine takes the target DATA
 * inline instead: `configure({ imageTargetData: [ ...json ] })`. Passing names
 * to this build silently detects nothing.
 *
 * The engine globals are untyped (`any` in globals.d.ts), so every engine call
 * here is guarded at runtime — a missing or older engine degrades to "no
 * markers" instead of throwing inside the render loop.
 */

import { debugTelemetry } from '@/xr/debugTelemetry';
import {
  createStabilityTracker,
  type StabilityMetrics,
  type StabilityTracker,
} from '@/xr/markerStability';
import type { MarkerPose } from '@/xr/markerRelativeTransform';

/**
 * A marker's latest reported pose, plus the metadata the engine ships with it.
 * Position and rotation are in the SAME world frame as SLAM, which is what
 * makes marker-relative anchoring valid.
 */
export interface ImageTargetPose extends MarkerPose {
  /** Target name, from the fingerprint JSON — the key of a "space". */
  name: string;
  /** Engine-reported scale factor for the target. */
  scale: number;
  /** Physical width in metres (FLAT/PLANAR targets only). */
  scaledWidth?: number;
  /** Physical height in metres (FLAT/PLANAR targets only). */
  scaledHeight?: number;
  /** `performance.now()` when this pose arrived. */
  updatedAt: number;
}

/** Everything tracked for one marker the engine has told us about. */
interface MarkerRecord {
  pose: ImageTargetPose;
  /** False once `reality.imagelost` fires; the last pose is retained. */
  visible: boolean;
  tracker: StabilityTracker;
  /** ms from `configureImageTargets` to this marker's first detection. */
  detectionLatencyMs: number | null;
}

// ── module-singleton state ──────────────────────────────────────────────────
// Written by engine event callbacks, read by the render loop and the HUD.
const _markers = new Map<string, MarkerRecord>();
let _configuredAt: number | null = null;
let _configuredNames: string[] = [];

/** Shape of one entry in a target's fingerprint JSON that we actually read. */
interface ImageTargetDatum {
  name?: string;
  [key: string]: unknown;
}

/**
 * Hands the active image-target set to the engine.
 *
 * Safe to call before the pipeline starts (the engine keeps the configuration)
 * and again afterwards to swap the active set — `configure` REPLACES the
 * previous set rather than adding to it.
 *
 * @param targets — Fingerprint JSON objects produced by
 *   `npx @8thwall/image-target-cli@latest`, as loaded by
 *   {@link import('@/xr8/imageTargetData').loadImageTargets}.
 * @returns True when the engine accepted the configuration; false when the
 *   engine is absent or too old to expose `XrController.configure`.
 */
export function configureImageTargets(targets: ImageTargetDatum[]): boolean {
  if (typeof XR8?.XrController?.configure !== 'function') {
    debugTelemetry.setSubsystem('imageTarget', 'unavailable');
    debugTelemetry.setNote('Engine has no XrController.configure — image targets unavailable.');
    return false;
  }

  _configuredNames = targets.map((t, i) => t.name ?? `target-${i}`);
  _configuredAt = performance.now();

  // Image targets need SLAM: the marker pose is reported in the world frame,
  // and assets stay put after the marker leaves view only because world
  // tracking is holding them.
  XR8.XrController.configure({ disableWorldTracking: false, imageTargetData: targets });

  debugTelemetry.setSubsystem('imageTarget', targets.length > 0 ? 'searching' : 'idle');
  debugTelemetry.logEvent(
    targets.length > 0
      ? `markers: watching ${_configuredNames.join(', ')}`
      : 'markers: none installed',
  );
  return true;
}

/**
 * Normalizes an image-target event payload into an {@link ImageTargetPose}.
 *
 * The engine is untyped, so every field is read defensively and missing
 * numbers fall back to a neutral value rather than producing NaN — a single
 * NaN in the pose would poison the anchoring matrix for the rest of the frame.
 *
 * @param detail — The `detail` field of a `reality.image*` event.
 * @returns The parsed pose, or null when the payload has no usable name.
 */
function parsePose(detail: unknown): ImageTargetPose | null {
  const d = detail as
    | {
        name?: string;
        position?: { x?: number; y?: number; z?: number };
        rotation?: { x?: number; y?: number; z?: number; w?: number };
        scale?: number;
        scaledWidth?: number;
        scaledHeight?: number;
      }
    | undefined;
  if (!d || typeof d.name !== 'string') return null;

  const n = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

  return {
    name: d.name,
    position: {
      x: n(d.position?.x, 0),
      y: n(d.position?.y, 0),
      z: n(d.position?.z, 0),
    },
    rotation: {
      x: n(d.rotation?.x, 0),
      y: n(d.rotation?.y, 0),
      z: n(d.rotation?.z, 0),
      w: n(d.rotation?.w, 1),
    },
    scale: n(d.scale, 1),
    scaledWidth: typeof d.scaledWidth === 'number' ? d.scaledWidth : undefined,
    scaledHeight: typeof d.scaledHeight === 'number' ? d.scaledHeight : undefined,
    updatedAt: performance.now(),
  };
}

/**
 * Records a pose against its marker, creating the record on first sight.
 *
 * @param pose — The freshly parsed pose.
 * @param found — True when this came from `reality.imagefound` (as opposed to
 *   an `imageupdated` tick), which is what stamps detection latency.
 */
function ingest(pose: ImageTargetPose, found: boolean): void {
  let record = _markers.get(pose.name);
  if (!record) {
    record = {
      pose,
      visible: true,
      tracker: createStabilityTracker(),
      detectionLatencyMs: null,
    };
    _markers.set(pose.name, record);
  }

  // Re-acquisition after a loss restarts the jitter window: samples from
  // before the marker left view describe a different physical moment and
  // would show up as a huge, meaningless spike in the average.
  if (found && !record.visible) record.tracker.reset();

  record.pose = pose;
  record.visible = true;
  record.tracker.add({ t: pose.updatedAt, position: pose.position, rotation: pose.rotation });

  if (found && record.detectionLatencyMs === null && _configuredAt !== null) {
    record.detectionLatencyMs = Math.round(pose.updatedAt - _configuredAt);
  }
}

/**
 * Builds the pipeline module that feeds the pose registry.
 *
 * A "camera pipeline module" is the engine's plugin unit; this one is
 * listener-only (it draws nothing and does no per-frame work), so it is cheap
 * to keep registered for the whole session.
 *
 * @param callbacks — Optional hooks fired after the registry is updated, so
 *   the AR component can react to a marker appearing or disappearing without
 *   polling for the transition.
 * @returns The module to pass to `runXr8({ customModules })`.
 */
export function createImageTargetModule(callbacks?: {
  /** A marker just became visible (first detection, or re-acquired). */
  onFound?: (pose: ImageTargetPose) => void;
  /** A tracked marker reported a new pose (fires every frame it is in view). */
  onUpdated?: (pose: ImageTargetPose) => void;
  /** A marker left view. The last known pose stays in the registry. */
  onLost?: (name: string) => void;
}): Xr8PipelineModule {
  return {
    name: 'xrposter-image-targets',
    listeners: [
      {
        event: 'reality.imagefound',
        process: ({ detail }: { detail: unknown }) => {
          const pose = parsePose(detail);
          if (!pose) return;
          ingest(pose, true);
          debugTelemetry.setSubsystem('imageTarget', 'tracking');
          debugTelemetry.logEvent(`marker found: ${pose.name}`);
          callbacks?.onFound?.(pose);
        },
      },
      {
        event: 'reality.imageupdated',
        process: ({ detail }: { detail: unknown }) => {
          const pose = parsePose(detail);
          if (!pose) return;
          ingest(pose, false);
          callbacks?.onUpdated?.(pose);
        },
      },
      {
        event: 'reality.imagelost',
        process: ({ detail }: { detail: unknown }) => {
          const name = (detail as { name?: string } | undefined)?.name;
          if (typeof name !== 'string') return;
          const record = _markers.get(name);
          if (record) {
            record.visible = false;
            record.tracker.reset();
          }
          // Only fall back to 'searching' once NO marker is left in view;
          // losing one of several shouldn't blank the indicator.
          if (![..._markers.values()].some((r) => r.visible)) {
            debugTelemetry.setSubsystem('imageTarget', 'searching');
          }
          debugTelemetry.logEvent(`marker lost: ${name}`);
          callbacks?.onLost?.(name);
        },
      },
    ],
  } as unknown as Xr8PipelineModule;
}

/**
 * Reads a marker's most recent pose.
 *
 * @param name — Target name from the fingerprint JSON.
 * @returns The last reported pose (even if the marker is no longer in view),
 *   or null when the engine has never detected this marker.
 */
export function readMarkerPose(name: string): ImageTargetPose | null {
  return _markers.get(name)?.pose ?? null;
}

/**
 * Whether a marker is in view right now.
 *
 * @param name — Target name from the fingerprint JSON.
 * @returns True between `imagefound` and the matching `imagelost`.
 */
export function isMarkerVisible(name: string): boolean {
  return _markers.get(name)?.visible ?? false;
}

/** Names of every marker currently in view. */
export function visibleMarkerNames(): string[] {
  return [..._markers.values()].filter((r) => r.visible).map((r) => r.pose.name);
}

/** Names of every marker handed to the engine by the last configure call. */
export function configuredMarkerNames(): string[] {
  return [..._configuredNames];
}

/** A marker's stability readout, for the HUD. */
export interface MarkerStatus {
  name: string;
  visible: boolean;
  /** ms from configure() to first detection, or null if never detected. */
  detectionLatencyMs: number | null;
  metrics: StabilityMetrics;
}

/**
 * Snapshots one marker's tracking health.
 *
 * @param name — Target name from the fingerprint JSON.
 * @returns The status, or null when the engine has never detected the marker.
 */
export function readMarkerStatus(name: string): MarkerStatus | null {
  const record = _markers.get(name);
  if (!record) return null;
  return {
    name,
    visible: record.visible,
    detectionLatencyMs: record.detectionLatencyMs,
    metrics: record.tracker.read(),
  };
}

/**
 * Clears all marker state. Call on session teardown so a later session does
 * not inherit stale poses, jitter windows, or detection latencies.
 */
export function resetImageTargets(): void {
  _markers.clear();
  _configuredAt = null;
  _configuredNames = [];
  debugTelemetry.setSubsystem('imageTarget', 'idle');
}
