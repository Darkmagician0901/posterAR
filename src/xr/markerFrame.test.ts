import { describe, expect, it } from 'vitest';
import { cornerBracketPoints, createMarkerFrame } from './markerFrame';

describe('cornerBracketPoints', () => {
  it('emits eight line segments — two arms at each of four corners', () => {
    // 8 segments x 2 endpoints x 3 floats.
    expect(cornerBracketPoints(0.3, 0.4)).toHaveLength(48);
  });

  it('puts a corner at each half-extent of the marker', () => {
    const pts = cornerBracketPoints(0.3, 0.4, 0.25);
    const corners = new Set<string>();
    for (let i = 0; i < pts.length; i += 6) {
      corners.add(`${pts[i].toFixed(4)},${pts[i + 1].toFixed(4)}`);
    }
    expect(corners).toEqual(
      new Set(['-0.1500,-0.2000', '-0.1500,0.2000', '0.1500,-0.2000', '0.1500,0.2000']),
    );
  });

  it('draws arms of the requested length, inward from each corner', () => {
    // arm = min(width, height) * fraction = 0.3 * 0.25 = 0.075, so the first
    // corner's x-arm ends 0.075 closer to centre than the corner itself.
    const pts = cornerBracketPoints(0.3, 0.4, 0.25);
    expect(Math.abs(pts[0] - pts[3])).toBeCloseTo(0.075, 6);
    // The x-arm does not move in y.
    expect(pts[4]).toBeCloseTo(pts[1], 6);
  });

  it('keeps arms square on a very oblong marker, driving them off the short side', () => {
    // Scaling each arm by its own axis would make a wide marker's horizontal
    // arms long and its vertical arms stubby, which reads as a drawing bug.
    const pts = cornerBracketPoints(1, 0.1, 0.25);
    const xArm = Math.abs(pts[0] - pts[3]);
    const yArm = Math.abs(pts[7] - pts[10]);
    expect(xArm).toBeCloseTo(0.025, 6);
    expect(yArm).toBeCloseTo(0.025, 6);
  });

  it('lies flat in the marker plane', () => {
    const pts = cornerBracketPoints(0.3, 0.4);
    for (let i = 2; i < pts.length; i += 3) expect(pts[i]).toBe(0);
  });
});

describe('createMarkerFrame', () => {
  it('starts hidden, so nothing flashes before a picture is found', () => {
    const frame = createMarkerFrame();
    expect(frame.object.visible).toBe(false);
    frame.dispose();
  });

  it('shows and hides on demand', () => {
    const frame = createMarkerFrame();
    frame.setVisible(true);
    expect(frame.object.visible).toBe(true);
    frame.setVisible(false);
    expect(frame.object.visible).toBe(false);
    frame.dispose();
  });

  it('rebuilds its geometry when the size actually changes, and not otherwise', () => {
    // setSize runs every frame while a picture is tracked; rebuilding the
    // buffer each frame would churn GPU memory for nothing.
    const frame = createMarkerFrame();
    frame.setSize(0.3, 0.4);
    const first = frame.object.geometry;
    frame.setSize(0.3, 0.4);
    expect(frame.object.geometry).toBe(first);
    frame.setSize(0.6, 0.8);
    expect(frame.object.geometry).not.toBe(first);
    frame.dispose();
  });

  it('ignores a degenerate size rather than drawing nothing at all', () => {
    const frame = createMarkerFrame();
    frame.setSize(0.3, 0.4);
    const good = frame.object.geometry;
    frame.setSize(0, 0.4);
    frame.setSize(NaN, 0.4);
    expect(frame.object.geometry).toBe(good);
    frame.dispose();
  });
});
