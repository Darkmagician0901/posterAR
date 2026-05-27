/**
 * IOSSegmentationDriver
 *
 * Owns the 5 Hz segmentation loop on the iOS path. Lives inside the R3F
 * <Canvas> so it has direct access to `useThree().camera` for FOV and
 * orientation snapshots. Each tick:
 *
 *   1. Grab the current camera quaternion and position.
 *   2. Run the segmenter on the latest video frame.
 *   3. If a surface region is returned, lift it to a world-space transform.
 *   4. Push it into the IMU stabilizer with the captured camera quat.
 *
 * Each render frame (60 Hz), `update()` is called on the stabilizer using
 * the live camera quaternion. The result is written into the supplied
 * `surfaceStateRef` so `<IOSSurfaceMesh>` can read it and render.
 *
 * If the segmenter fails to load (low-end device, locked-down Safari) we
 * report `segmenter: 'error'` and the caller falls back to the legacy
 * FloorGrid + GroundReticle.
 */

import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Quaternion, Vector3 } from 'three';

import { loadSegmenter, Segmenter } from '@/xr/segmenter';
import { liftSurface } from '@/xr/surfaceLifter';
import { IMUStabilizer } from '@/xr/imuStabilizer';
import { debugTelemetry } from '@/xr/debugTelemetry';
import type { SurfaceMeshState } from './IOSSurfaceMesh';

/** Inference cadence (ms between segment() calls). */
const SEGMENT_INTERVAL_MS = 200;

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>;
  surfaceStateRef: React.MutableRefObject<SurfaceMeshState>;
  /** Notified once when the segmenter is ready (or has failed). */
  onSegmenterStatus?: (status: 'loading' | 'ready' | 'error') => void;
  /** Active flag — when false we don't schedule new segmentations. */
  active: boolean;
}

export const IOSSegmentationDriver: React.FC<Props> = ({
  videoRef,
  surfaceStateRef,
  onSegmenterStatus,
  active,
}) => {
  const { camera } = useThree();
  const stabilizerRef = useRef<IMUStabilizer>(new IMUStabilizer());
  const segmenterRef = useRef<Segmenter | null>(null);
  const inflightRef = useRef(false);
  const cancelRef = useRef(false);
  const lastTickRef = useRef(0);

  // Reusable temporaries to avoid GC pressure in the frame loop.
  const tmpCameraQuat = useRef(new Quaternion());
  const tmpCameraPos = useRef(new Vector3());

  // Load the segmenter once, when the driver mounts.
  useEffect(() => {
    cancelRef.current = false;
    onSegmenterStatus?.('loading');

    (async () => {
      const seg = await loadSegmenter();
      if (cancelRef.current) {
        seg?.dispose();
        return;
      }
      if (!seg) {
        onSegmenterStatus?.('error');
        return;
      }
      segmenterRef.current = seg;
      onSegmenterStatus?.('ready');
    })();

    return () => {
      cancelRef.current = true;
      segmenterRef.current?.dispose();
      segmenterRef.current = null;
      stabilizerRef.current.reset();
    };
  }, [onSegmenterStatus]);

  useFrame((_, _delta) => {
    if (!active) return;

    const now = performance.now();
    const video = videoRef.current;
    const seg = segmenterRef.current;

    // 1) Schedule a new inference if it's time and we're not busy.
    if (
      seg &&
      video &&
      video.readyState >= 2 &&
      !inflightRef.current &&
      now - lastTickRef.current >= SEGMENT_INTERVAL_MS
    ) {
      lastTickRef.current = now;
      inflightRef.current = true;

      // Snapshot camera state at the moment of capture.
      camera.getWorldQuaternion(tmpCameraQuat.current);
      camera.getWorldPosition(tmpCameraPos.current);
      const capturedQuat = tmpCameraQuat.current.clone();
      const capturedPos = tmpCameraPos.current.clone();
      const fovDeg = (camera as { fov?: number }).fov ?? 70;
      const aspect = (camera as { aspect?: number }).aspect ?? 1;

      seg
        .segment(video)
        .then((result) => {
          inflightRef.current = false;
          if (cancelRef.current || !result || !result.surface) return;

          const lifted = liftSurface({
            centroidPx: result.surface.centroid,
            bboxPx: { width: result.surface.bbox.width, height: result.surface.bbox.height },
            imageWidth: result.width,
            imageHeight: result.height,
            cameraFovDeg: fovDeg,
            cameraAspect: aspect,
            cameraPosition: capturedPos,
            cameraQuaternion: capturedQuat,
          });

          stabilizerRef.current.setDetection(
            {
              position: lifted.position,
              quaternion: lifted.quaternion,
              size: lifted.size,
              capturedAtCameraQuat: capturedQuat,
            },
            performance.now()
          );

          surfaceStateRef.current.classId = result.surface.classId;
          surfaceStateRef.current.visible = true;
          debugTelemetry.setSubsystem('surface', 'tracking');
        })
        .catch(() => {
          inflightRef.current = false;
        });
    }

    // 2) Each frame: pull the latest stabilized transform.
    camera.getWorldQuaternion(tmpCameraQuat.current);
    const transform = stabilizerRef.current.update(tmpCameraQuat.current, now);
    if (transform.hasAnchor) {
      surfaceStateRef.current.position.copy(transform.position);
      surfaceStateRef.current.quaternion.copy(transform.quaternion);
      surfaceStateRef.current.size = transform.size;
    }
  });

  return null;
};
