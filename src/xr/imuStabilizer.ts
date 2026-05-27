/**
 * imuStabilizer
 *
 * Keeps the SurfaceMesh "stuck" to its detected position between segmentation
 * updates. The segmenter runs at ~5 Hz; the IMU runs at 60 Hz; we use the
 * IMU rotation delta to re-orient the stored detection each render frame so
 * the mesh appears anchored in world space even though only the rotation
 * actually changes.
 *
 * Math:
 *   When we detect a surface, we snapshot the camera quaternion at that
 *   moment as `anchorQuat`. The surface position is already in world coords
 *   (from surfaceLifter). To re-render this frame:
 *     world_position is unchanged (we have no translation info from IMU)
 *     world_orientation = orientation_at_detection (kept verbatim)
 *
 *   Position drift comes ONLY from real translation of the user — and we
 *   can't measure that from DeviceOrientation. So we accept that walking
 *   around will desync the mesh; rotating in place will not.
 *
 *   The lerp on position is for blending between two consecutive
 *   detections, not for tracking — when a new detection arrives we lerp
 *   from the old anchored position to the new one over ~120 ms so the mesh
 *   doesn't pop.
 */

import { Quaternion, Vector3 } from 'three';
import { debugTelemetry } from './debugTelemetry';

/** Time constant for inter-detection position blending, in milliseconds. */
const POSITION_BLEND_MS = 120;

export interface StabilizedTransform {
  position: Vector3;
  quaternion: Quaternion;
  size: { width: number; height: number };
  /** True when at least one detection has been recorded. */
  hasAnchor: boolean;
}

export interface DetectionInput {
  position: Vector3;
  quaternion: Quaternion;
  size: { width: number; height: number };
  /** Camera quaternion at the moment the frame was captured. */
  capturedAtCameraQuat: Quaternion;
}

export class IMUStabilizer {
  private hasAnchor = false;
  private targetPosition = new Vector3();
  private currentPosition = new Vector3();
  private targetSize = { width: 1, height: 1 };
  private currentSize = { width: 1, height: 1 };

  private detectionQuat = new Quaternion();
  private capturedAtCameraQuatInv = new Quaternion();
  private outQuat = new Quaternion();

  /** Wall-clock time (ms) of the last accepted detection. */
  private lastDetectionAt: number | null = null;

  /**
   * Record a new detection. Position is in world coords; capturedAtCameraQuat
   * is the camera quaternion the moment the frame was captured. The mesh
   * will lerp toward this new position over the next ~120 ms.
   */
  setDetection(d: DetectionInput, nowMs: number): void {
    this.targetPosition.copy(d.position);
    this.targetSize = { ...d.size };
    if (!this.hasAnchor) {
      // First detection: snap, don't lerp.
      this.currentPosition.copy(d.position);
      this.currentSize = { ...d.size };
    }
    this.detectionQuat.copy(d.quaternion);
    this.capturedAtCameraQuatInv.copy(d.capturedAtCameraQuat).invert();
    this.hasAnchor = true;
    this.lastDetectionAt = nowMs;
    debugTelemetry.setSubsystem('stabilizer', 'anchored');
  }

  /**
   * Compute the current world-space transform for this frame.
   *
   * @param currentCameraQuat live camera quaternion (from IMU)
   * @param nowMs             monotonic clock in ms
   */
  update(currentCameraQuat: Quaternion, nowMs: number): StabilizedTransform {
    if (!this.hasAnchor || !this.lastDetectionAt) {
      return {
        position: this.currentPosition,
        quaternion: this.outQuat,
        size: this.currentSize,
        hasAnchor: false,
      };
    }

    // Position: lerp current → target over POSITION_BLEND_MS.
    const elapsed = nowMs - this.lastDetectionAt;
    const t = Math.min(1, elapsed / POSITION_BLEND_MS);
    this.currentPosition.lerp(this.targetPosition, t === 1 ? 1 : 0.25);
    // Size: same blend, simpler.
    this.currentSize = {
      width: this.currentSize.width + (this.targetSize.width - this.currentSize.width) * 0.25,
      height: this.currentSize.height + (this.targetSize.height - this.currentSize.height) * 0.25,
    };

    // Orientation: the detection-time camera quat * inverse * current camera
    // quat would re-derive a "where would the mesh look if the camera moved
    // like this?" matrix. We want the OPPOSITE — we want the mesh to stay
    // in the world frame while the camera rotates. The mesh's stored
    // detectionQuat IS in world frame already; we keep it verbatim and let
    // three.js apply the camera's view transform.
    this.outQuat.copy(this.detectionQuat);

    // Detect drift: large camera rotation since detection without a new
    // segmenter update → we mark stabilizer as 'drifting' so the panel
    // hints to re-scan.
    const deltaQuat = currentCameraQuat
      .clone()
      .multiply(this.capturedAtCameraQuatInv);
    const angleDeg = 2 * Math.acos(Math.min(1, Math.abs(deltaQuat.w))) * (180 / Math.PI);
    if (angleDeg > 35 && nowMs - this.lastDetectionAt > 1500) {
      debugTelemetry.setSubsystem('stabilizer', 'drifting');
    } else {
      debugTelemetry.setSubsystem('stabilizer', 'anchored');
    }

    return {
      position: this.currentPosition,
      quaternion: this.outQuat,
      size: this.currentSize,
      hasAnchor: true,
    };
  }

  reset(): void {
    this.hasAnchor = false;
    this.lastDetectionAt = null;
    debugTelemetry.setSubsystem('stabilizer', 'idle');
  }
}
