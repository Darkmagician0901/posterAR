/**
 * desktopMockDriver
 *
 * Driver for the desktop "mock AR" sandbox (DesktopMockMode). Provides:
 *
 *   - Pointer-driven orientation: dragging the cursor mimics rotating a
 *     phone, writing a camera quaternion equivalent to what
 *     DeviceOrientation produces on a real device. This lets the same
 *     reticle + PosterPlacement code that runs under 8th Wall be exercised
 *     on a laptop, with the camera pose coming from the mouse instead of SLAM.
 *
 *   - Single-call install() returning a handle whose dispose() removes the
 *     pointer listeners.
 *
 * This is intentionally NOT a mock of the 8th Wall engine — it only feeds a
 * camera orientation. DesktopMockMode supplies a fake floor hit-test pose so
 * developers can place posters against the laptop webcam without a phone.
 */

import { Quaternion, Euler } from 'three';
import { debugTelemetry } from './debugTelemetry';

/** Options for {@link installDesktopMockDriver}. */
export interface DesktopMockOptions {
  /** Element the pointer listeners attach to (typically the Canvas). */
  target: HTMLElement;
  /**
   * Output quaternion (three.js's 4-number rotation representation, here the
   * camera orientation). The driver writes into this same object on every
   * pointer move, so the caller can hand it to a camera once and the camera
   * keeps following the mouse.
   */
  out: Quaternion;
  /** Degrees of rotation per pixel of drag. Defaults to 0.3. */
  sensitivity?: number;
  /** Optional callback fired on every orientation update. */
  onChange?: () => void;
}

export interface DesktopMockHandle {
  /** Remove listeners and reset telemetry. */
  dispose(): void;
}

/**
 * Installs the driver: attaches pointer listeners to `opts.target` and
 * starts writing the drag-derived camera orientation into `opts.out`.
 * Marks the `desktopMock` telemetry subsystem 'active' while installed.
 *
 * @param opts — Target element, output quaternion, drag sensitivity, and
 *   change callback. See {@link DesktopMockOptions}.
 * @returns A handle whose `dispose()` removes the listeners and resets the
 *   telemetry subsystem to 'idle'.
 */
export const installDesktopMockDriver = (
  opts: DesktopMockOptions
): DesktopMockHandle => {
  const { target, out, sensitivity = 0.3, onChange } = opts;

  // Orientation is tracked as two angles (in radians): yaw = turning left/
  // right around the vertical axis, pitch = looking up/down. Roll (tilting
  // the head sideways) is always 0 for a mouse-look camera.
  let yaw = 0;
  let pitch = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const tmpEuler = new Euler();

  /** Converts the current yaw/pitch into the output quaternion. */
  const apply = (): void => {
    // Three.js convention: -Z is forward, +Y is up. Map pitch → X, yaw → Y.
    // 'YXZ' applies yaw first, then pitch — the standard first-person-camera
    // order that avoids unwanted roll.
    tmpEuler.set(pitch, yaw, 0, 'YXZ');
    out.setFromEuler(tmpEuler);
    onChange?.();
  };

  const onPointerDown = (e: PointerEvent): void => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    // Capture so the drag keeps tracking even when the cursor leaves the
    // canvas mid-drag. Optional-chained: jsdom/happy-dom lack the API.
    target.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    // Drag right → yaw left, to mimic physically rotating a phone. The
    // (Math.PI / 180) factor converts the degrees-per-pixel sensitivity
    // into radians, which is what three.js angles use.
    yaw -= dx * sensitivity * (Math.PI / 180);
    pitch -= dy * sensitivity * (Math.PI / 180);

    // Clamp pitch to ±85° so the camera can't look past straight up/down
    // and flip over (the classic first-person-camera gimbal flip).
    const limit = (85 * Math.PI) / 180;
    if (pitch > limit) pitch = limit;
    if (pitch < -limit) pitch = -limit;

    apply();
  };

  const onPointerUp = (e: PointerEvent): void => {
    dragging = false;
    target.releasePointerCapture?.(e.pointerId);
  };

  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerUp);

  debugTelemetry.setSubsystem('desktopMock', 'active');
  // Apply once immediately so consumers that read `out` before the first
  // drag see a valid "no rotation yet" orientation (yaw 0, pitch 0 —
  // equivalent to the identity quaternion) instead of stale data.
  apply();

  return {
    dispose(): void {
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerUp);
      debugTelemetry.setSubsystem('desktopMock', 'idle');
    },
  };
};
