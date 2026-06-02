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

export interface DesktopMockOptions {
  /** Element the pointer listeners attach to (typically the Canvas). */
  target: HTMLElement;
  /** Quaternion the driver writes into each pointer move. */
  out: Quaternion;
  /** Degrees-per-pixel sensitivity for drag → rotation. */
  sensitivity?: number;
  /** Optional callback fired on every orientation update. */
  onChange?: () => void;
}

export interface DesktopMockHandle {
  /** Remove listeners and reset telemetry. */
  dispose(): void;
}

/**
 * Install the driver. Returns a handle whose `dispose()` removes listeners.
 * Sets `debugTelemetry.desktopMock = 'active'` while installed.
 */
export const installDesktopMockDriver = (
  opts: DesktopMockOptions
): DesktopMockHandle => {
  const { target, out, sensitivity = 0.3, onChange } = opts;

  let yaw = 0;
  let pitch = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const tmpEuler = new Euler();

  const apply = (): void => {
    // Three.js convention: -Z is forward, +Y is up. Map pitch → X, yaw → Y.
    tmpEuler.set(pitch, yaw, 0, 'YXZ');
    out.setFromEuler(tmpEuler);
    onChange?.();
  };

  const onPointerDown = (e: PointerEvent): void => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    target.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    // Drag right → yaw left (we want to feel like rotating the device).
    yaw -= dx * sensitivity * (Math.PI / 180);
    pitch -= dy * sensitivity * (Math.PI / 180);

    // Clamp pitch to ±85° so we don't flip the camera.
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
  // Initial apply so any consumer reads a sane identity-equivalent quat.
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
