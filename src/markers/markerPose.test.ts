import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { composeSceneMatrix, DEFAULT_WIDTH_IN_MARKERS, hasDimensions, tileSize } from './markerPose';

describe('tileSize', () => {
  const dims = { scaledWidth: 0.3, scaledHeight: 0.4 };

  it('covers the marker exactly at the v1 multiplier', () => {
    expect(tileSize(dims, DEFAULT_WIDTH_IN_MARKERS)).toEqual({ width: 0.3, height: 0.4 });
  });

  it('defaults to covering the marker when no multiplier is given', () => {
    expect(tileSize(dims)).toEqual(tileSize(dims, 1));
  });

  it('scales both axes together, so artwork never stretches', () => {
    const big = tileSize(dims, 4);
    expect(big).toEqual({ width: 1.2, height: 1.6 });
    // The ratio is what must survive — that is what "never stretches" means.
    expect(big.width / big.height).toBeCloseTo(dims.scaledWidth / dims.scaledHeight, 10);
  });

  it('is unit-agnostic: the multiplier is a ratio, so any unit scales alike', () => {
    // Same marker described in a 100x larger unit. The multiplier must behave
    // identically, because the design never learns what the units are (§5.1).
    const other = { scaledWidth: 30, scaledHeight: 40 };
    const a = tileSize(dims, 3);
    const b = tileSize(other, 3);
    expect(b.width / a.width).toBeCloseTo(100, 10);
    expect(a.width / a.height).toBeCloseTo(b.width / b.height, 10);
  });

  it('refuses a multiplier that would collapse the plane to nothing', () => {
    // Zero or negative would render an invisible plane, which reads on a phone
    // as "tracking is broken" and sends someone debugging the wrong thing.
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(tileSize(dims, bad)).toEqual({ width: 0.3, height: 0.4 });
    }
  });
});

describe('composeSceneMatrix', () => {
  const identity = { w: 1, x: 0, y: 0, z: 0 };
  const noOffset = [0, 0] as const;
  /** A print yawed 90 degrees: its local +x now points along world -z. */
  const yaw90 = { w: Math.SQRT1_2, x: 0, y: Math.SQRT1_2, z: 0 };

  const positionOf = (m: Float32Array): Vector3 =>
    new Vector3().setFromMatrixPosition(new Matrix4().fromArray(Array.from(m)));

  it('puts the scene on the marker when there is no offset', () => {
    const pos = positionOf(composeSceneMatrix({ x: 1, y: 2, z: -3 }, identity, 0.1, noOffset));
    expect(pos.x).toBeCloseTo(1, 10);
    expect(pos.y).toBeCloseTo(2, 10);
    expect(pos.z).toBeCloseTo(-3, 10);
  });

  it('offsets in marker-widths, so the same numbers work at any print size', () => {
    // Half a marker-width right and one up, on a marker reported 0.2 wide.
    // Precision 6, not 10: the matrix comes back as a Float32Array, which
    // cannot hold 0.1 any more exactly than that.
    const pos = positionOf(composeSceneMatrix({ x: 0, y: 0, z: 0 }, identity, 0.2, [0.5, 1]));
    expect(pos.x).toBeCloseTo(0.1, 6);
    expect(pos.y).toBeCloseTo(0.2, 6);
    expect(pos.z).toBeCloseTo(0, 6);
  });

  it('rotates the offset into world space — the mistake this maths invites', () => {
    // One marker-width to the PRINT's right, on a print yawed 90 degrees, must
    // move the scene along world -z, not along world +x. Dropping the rotation
    // looks perfectly correct on a print hanging square in front of whoever is
    // testing, and is wrong on every angled wall.
    const pos = positionOf(composeSceneMatrix({ x: 0, y: 0, z: 0 }, yaw90, 0.1, [1, 0]));
    expect(pos.x).toBeCloseTo(0, 6);
    expect(pos.y).toBeCloseTo(0, 6);
    expect(pos.z).toBeCloseTo(-0.1, 6);
  });

  it("keeps the marker's own orientation", () => {
    const m = new Matrix4().fromArray(
      Array.from(composeSceneMatrix({ x: 0, y: 0, z: 0 }, yaw90, 0.1, noOffset)),
    );
    const forward = new Vector3(0, 0, 1).applyMatrix4(m);
    expect(forward.x).toBeCloseTo(1, 6);
    expect(forward.z).toBeCloseTo(0, 6);
  });

  it('is rigid — unit scale, whatever the engine reports separately', () => {
    // The engine's own `scale` estimate wobbles by a percent or two. Folding
    // it in would rescale the artwork every frame, which reads as breathing.
    const m = new Matrix4().fromArray(
      Array.from(
        composeSceneMatrix(
          { x: 0, y: 0, z: 0 },
          { w: 0.7071, x: 0.7071, y: 0, z: 0 },
          0.1,
          noOffset,
        ),
      ),
    );
    const scale = new Vector3().setFromMatrixScale(m);
    expect(scale.x).toBeCloseTo(1, 6);
    expect(scale.y).toBeCloseTo(1, 6);
    expect(scale.z).toBeCloseTo(1, 6);
  });

  it('stays rigid even when the quaternion has drifted off unit length', () => {
    // An un-normalised quaternion would smuggle a scale into a matrix this
    // function promises is rigid — a slow drift rather than an obvious bug.
    const m = new Matrix4().fromArray(
      Array.from(composeSceneMatrix({ x: 0, y: 0, z: 0 }, { w: 2, x: 0, y: 0, z: 0 }, 0.1, noOffset)),
    );
    const scale = new Vector3().setFromMatrixScale(m);
    expect(scale.x).toBeCloseTo(1, 6);
    expect(scale.y).toBeCloseTo(1, 6);
    expect(scale.z).toBeCloseTo(1, 6);
  });

  it('returns the 16 column-major floats StoryTile.place expects', () => {
    const out = composeSceneMatrix({ x: 0, y: 0, z: 0 }, identity, 0.1, noOffset);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out).toHaveLength(16);
  });

  it('treats a non-finite marker width as no offset at all', () => {
    // scaledWidth is FLAT-only. hasDimensions guards the call site, but a NaN
    // reaching here would place the scene at NaN, where it silently never
    // appears — the most confusing failure available.
    const pos = positionOf(composeSceneMatrix({ x: 1, y: 1, z: 1 }, identity, NaN, [5, 5]));
    expect(pos.x).toBeCloseTo(1, 10);
    expect(pos.y).toBeCloseTo(1, 10);
  });
});

describe('hasDimensions', () => {
  it('accepts a FLAT target’s reported size', () => {
    expect(hasDimensions({ scaledWidth: 0.3, scaledHeight: 0.4 })).toBe(true);
  });

  it('rejects a target with no dimensions, rather than sizing from undefined', () => {
    // Cylindrical/conical targets carry no scaledWidth. Sizing from undefined
    // yields a NaN-sized plane that never appears — the worst failure mode.
    expect(hasDimensions({})).toBe(false);
    expect(hasDimensions({ scaledWidth: 0.3 })).toBe(false);
  });

  it('rejects degenerate numbers', () => {
    expect(hasDimensions({ scaledWidth: 0, scaledHeight: 0.4 })).toBe(false);
    expect(hasDimensions({ scaledWidth: NaN, scaledHeight: 0.4 })).toBe(false);
    expect(hasDimensions({ scaledWidth: Infinity, scaledHeight: 0.4 })).toBe(false);
    expect(hasDimensions({ scaledWidth: -0.3, scaledHeight: 0.4 })).toBe(false);
  });
});
