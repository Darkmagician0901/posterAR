import { describe, it, expect } from 'vitest';
import { composeFrame, COMPOSE_DEFAULTS } from './compose';
import { PROP_LIBRARY } from './library';
import { StoryProp } from '../storyDoc';
import { svgFrame } from '../svgTexture';

function prop(over: Partial<StoryProp> = {}): StoryProp {
  return { t: 'lib', k: 'sunflower', x: 0, z: 0, h: 1.6, f: false, e: 0, ...over };
}

describe('composeFrame', () => {
  it('produces a complete SVG document the viewer can parse', () => {
    const svg = composeFrame([prop()]);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('emits a viewBox svgTexture can read for sizing', () => {
    const svg = composeFrame([prop()]);
    const frame = svgFrame(svg);
    expect(frame.w).toBe(COMPOSE_DEFAULTS.width);
    expect(frame.h).toBe(COMPOSE_DEFAULTS.height);
    expect(frame.aspect).toBeCloseTo(COMPOSE_DEFAULTS.height / COMPOSE_DEFAULTS.width, 5);
  });

  it('renders an empty stage as a valid empty document', () => {
    const svg = composeFrame([]);
    expect(svgFrame(svg).w).toBe(COMPOSE_DEFAULTS.width);
    expect(svg).not.toContain('<ellipse');
  });

  it('paints far props before near ones so near overlaps far', () => {
    const svg = composeFrame([
      prop({ k: 'car', z: 0, h: 1.35 }),
      prop({ k: 'tree', z: 5, h: 4.5 }),
    ]);
    // The tree is further away, so its group must appear earlier in the markup.
    const treeAt = svg.indexOf(PROP_LIBRARY.tree.make().slice(0, 40));
    const carAt = svg.indexOf(PROP_LIBRARY.car.make().slice(0, 40));
    expect(treeAt).toBeGreaterThan(-1);
    expect(carAt).toBeGreaterThan(-1);
    expect(treeAt).toBeLessThan(carAt);
  });

  it('shrinks props with depth', () => {
    const near = composeFrame([prop({ z: 0 })]);
    const far = composeFrame([prop({ z: 6 })]);
    const scaleOf = (svg: string): number => Number(/scale\(([-\d.]+),/.exec(svg)![1]);
    expect(Math.abs(scaleOf(far))).toBeLessThan(Math.abs(scaleOf(near)));
  });

  it('mirrors flipped props with a negative x-scale', () => {
    const svg = composeFrame([prop({ f: true })]);
    expect(/scale\(-[\d.]+,/.test(svg)).toBe(true);
  });

  it('offsets props horizontally from the frame centre', () => {
    const left = composeFrame([prop({ x: -2 })]);
    const right = composeFrame([prop({ x: 2 })]);
    const txOf = (svg: string): number => Number(/translate\(([-\d.]+),/.exec(svg)![1]);
    expect(txOf(left)).toBeLessThan(COMPOSE_DEFAULTS.width / 2);
    expect(txOf(right)).toBeGreaterThan(COMPOSE_DEFAULTS.width / 2);
  });

  it('gives every prop a contact shadow', () => {
    const svg = composeFrame([prop(), prop({ x: 1 }), prop({ x: -1 })]);
    expect(svg.match(/<ellipse[^>]*fill="#101408"/g)).toHaveLength(3);
  });

  it('fades the shadow as a prop is lifted off the ground', () => {
    const grounded = composeFrame([prop({ e: 0 })]);
    const lifted = composeFrame([prop({ e: 1.5 })]);
    const op = (svg: string): number =>
      Number(/fill="#101408" opacity="([\d.]+)"/.exec(svg)![1]);
    expect(op(lifted)).toBeLessThan(op(grounded));
  });

  it('includes the mesh pattern only when a prop needs it', () => {
    expect(composeFrame([prop({ k: 'fence', h: 1.8 })])).toContain('id="mesh"');
    expect(composeFrame([prop()])).not.toContain('id="mesh"');
  });

  it('skips unknown prop keys and uploaded images rather than emitting broken refs', () => {
    const svg = composeFrame([
      prop({ k: 'no-such-prop' }),
      prop({ t: 'img', k: 'asset-1' }),
    ]);
    expect(svg).not.toContain('<ellipse');
    expect(svg).not.toContain('asset-1');
  });

  it('places a backdrop behind every prop', () => {
    const svg = composeFrame([prop()], { backdrop: '<rect id="sky" width="330" height="175"/>' });
    expect(svg.indexOf('id="sky"')).toBeLessThan(svg.indexOf('#101408'));
  });

  it('honours custom frame geometry', () => {
    const svg = composeFrame([prop()], { width: 660, height: 350, ppm: 60, groundY: 280 });
    const frame = svgFrame(svg);
    expect(frame.w).toBe(660);
    expect(frame.h).toBe(350);
  });

  it('every library prop composes without throwing', () => {
    for (const key of Object.keys(PROP_LIBRARY)) {
      const svg = composeFrame([prop({ k: key, h: PROP_LIBRARY[key].heightM })]);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.length).toBeGreaterThan(120);
    }
  });
});
