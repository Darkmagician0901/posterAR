/**
 * markerFrame.ts — the "this picture is recognised" bracket.
 *
 * Four corner brackets, drawn in the plane of the tracked print and following
 * it every frame, so the visitor can see the app has locked onto the picture
 * before they tap to begin (`docs/marker-locator-design.md` §5.1). Corners
 * rather than a full outline: a closed rectangle sitting exactly on a printed
 * rectangle reads as a rendering artefact, while brackets read as a viewfinder.
 *
 * Engine-agnostic, like `reticle.ts` — it takes a matrix and a size and knows
 * nothing about where they came from. The corner arithmetic is exported on its
 * own so it can be tested without constructing a scene.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
} from 'three';

/** Arm length as a fraction of the marker's SHORT side. */
export const CORNER_ARM_FRACTION = 0.22;

/**
 * The eight line segments that make up the four corner brackets.
 *
 * Both arms of every corner are the same length, driven off the marker's short
 * side. Scaling each arm by its own axis instead would give a wide print long
 * horizontal arms and stubby vertical ones, which reads as a drawing bug
 * rather than a viewfinder.
 *
 * @param width — Marker width, in the caller's units.
 * @param height — Marker height, same units.
 * @param armFraction — Arm length as a fraction of the short side.
 * @returns 48 floats: 8 segments x 2 endpoints x (x, y, z), centred on the
 *   origin and flat in the z = 0 plane — the marker's own plane.
 */
export function cornerBracketPoints(
  width: number,
  height: number,
  armFraction: number = CORNER_ARM_FRACTION,
): Float32Array {
  const hw = width / 2;
  const hh = height / 2;
  const arm = Math.min(width, height) * armFraction;
  const out: number[] = [];

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = sx * hw;
      const cy = sy * hh;
      // One arm inward along x, one inward along y.
      out.push(cx, cy, 0, cx - sx * arm, cy, 0);
      out.push(cx, cy, 0, cx, cy - sy * arm, 0);
    }
  }

  return new Float32Array(out);
}

/** Control handle returned by {@link createMarkerFrame}. */
export interface MarkerFrame {
  /** The line object. Add it to the scene root. */
  object: LineSegments;
  /**
   * Writes the marker's pose straight into the object's matrix.
   *
   * @param matrix — 16 column-major floats, as produced by `composeSceneMatrix`
   *   with a zero offset — the frame belongs on the print, not on the scene.
   */
  setPose(matrix: Float32Array): void;
  /**
   * Resizes the brackets to the marker's reported size.
   *
   * Called every frame while a picture is tracked, so it returns early unless
   * the size actually changed. A degenerate size is ignored rather than drawn,
   * because a zero-sized frame is indistinguishable on a phone from "the app
   * did not recognise the picture".
   *
   * @param width — Marker width in the engine's units.
   * @param height — Marker height, same units.
   */
  setSize(width: number, height: number): void;
  /**
   * Shows or hides the frame.
   *
   * @param visible — True while a picture is locked and not yet started.
   */
  setVisible(visible: boolean): void;
  /** Frees the GPU resources. */
  dispose(): void;
}

/**
 * Builds the lock frame. It starts hidden and zero-sized; the caller supplies
 * a size and a pose once a marker is actually tracked.
 *
 * @returns The control handle — see {@link MarkerFrame}.
 */
export function createMarkerFrame(): MarkerFrame {
  const material = new LineBasicMaterial({
    color: new Color('#00ff88'),
    transparent: true,
    opacity: 0.95,
    // Always drawn over the camera feed and the artwork: the frame is chrome,
    // and a bracket half-occluded by the scene it is announcing reads as a bug.
    depthTest: false,
    depthWrite: false,
  });

  const object = new LineSegments(new BufferGeometry(), material);
  object.renderOrder = 1000;
  object.matrixAutoUpdate = false;
  object.visible = false;

  let width = 0;
  let height = 0;
  const tmp = new Matrix4();

  return {
    object,
    setPose(matrix) {
      tmp.fromArray(matrix as unknown as number[]);
      object.matrix.copy(tmp);
    },
    setSize(w, h) {
      if (!(Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0)) return;
      if (w === width && h === height) return;
      width = w;
      height = h;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(cornerBracketPoints(w, h), 3));
      object.geometry.dispose();
      object.geometry = geometry;
    },
    setVisible(visible) {
      object.visible = visible;
    },
    dispose() {
      object.geometry.dispose();
      material.dispose();
    },
  };
}
