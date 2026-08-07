import { describe, it, expect } from 'vitest';
import { composeFrame, backdropImage, COMPOSE_DEFAULTS } from './compose';
import { PROP_LIBRARY } from './library';
import { StoryProp } from '../storyDoc';
import { SCENE } from '../projection';
import { svgFrame } from '../svgTexture';

// Depth is measured out from the wall, so SCENE.zMax is the near plane by the
// visitor — where depthScale is 1 and a prop composes at its nominal size.
function prop(over: Partial<StoryProp> = {}): StoryProp {
  return { t: 'lib', k: 'sunflower', x: 0, z: SCENE.zMax, h: 1.6, f: false, e: 0, ...over };
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
      prop({ k: 'car', z: SCENE.zMax, h: 1.35 }),
      prop({ k: 'tree', z: 0.5, h: 4.5 }),
    ]);
    // The tree is further away, so its group must appear earlier in the markup.
    const treeAt = svg.indexOf(PROP_LIBRARY.tree.make().slice(0, 40));
    const carAt = svg.indexOf(PROP_LIBRARY.car.make().slice(0, 40));
    expect(treeAt).toBeGreaterThan(-1);
    expect(carAt).toBeGreaterThan(-1);
    expect(treeAt).toBeLessThan(carAt);
  });

  it('shrinks props with depth', () => {
    const near = composeFrame([prop({ z: SCENE.zMax })]);
    const far = composeFrame([prop({ z: 0 })]);
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

  it('skips unknown library keys rather than emitting broken refs', () => {
    const svg = composeFrame([prop({ k: 'no-such-prop' })]);
    expect(svg).not.toContain('<ellipse');
  });

  it('skips uploaded props whose asset was not supplied', () => {
    const svg = composeFrame([prop({ t: 'img', k: 'asset-1' })]);
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('asset-1');
  });

  it('draws uploaded props from the supplied asset map', () => {
    const svg = composeFrame([prop({ t: 'img', k: 'asset-1', h: 2 })], {
      images: { 'asset-1': { href: 'data:image/webp;base64,AAAA', aspect: 1.5 } },
    });
    expect(svg).toContain('<image href="data:image/webp;base64,AAAA"');
    // 2 m at the default 30 ppm, aspect 1.5 -> 90 x 60 box
    expect(svg).toContain('width="90"');
    expect(svg).toContain('height="60"');
  });

  it('anchors uploaded props at bottom centre and mirrors when flipped', () => {
    const images = { a: { href: 'data:image/png;base64,AA', aspect: 1 } };
    const plain = composeFrame([prop({ t: 'img', k: 'a', h: 1 })], { images });
    const flipped = composeFrame([prop({ t: 'img', k: 'a', h: 1, f: true })], { images });
    // 1 m at 30 ppm, aspect 1 -> 30x30, anchored so the box sits above the point
    expect(plain).toContain('x="-15" y="-30"');
    expect(plain).toContain('scale(1,1)');
    expect(flipped).toContain('scale(-1,1)');
  });

  it('escapes asset hrefs so they cannot break out of the attribute', () => {
    const svg = composeFrame([prop({ t: 'img', k: 'a' })], {
      images: { a: { href: 'data:image/png;base64,AA"><script>x()</script>', aspect: 1 } },
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&quot;');
  });

  it('mixes library and uploaded props in one depth-sorted scene', () => {
    const svg = composeFrame(
      [prop({ k: 'tree', z: 0.5, h: 4.5 }), prop({ t: 'img', k: 'a', z: SCENE.zMax, h: 1 })],
      { images: { a: { href: 'data:image/png;base64,AA', aspect: 1 } } },
    );
    // The uploaded prop is nearer, so it is painted last.
    expect(svg.indexOf('data:image/png')).toBeGreaterThan(svg.indexOf('#3C6B1F'));
  });

  it('builds a full-bleed backdrop from an uploaded image', () => {
    const svg = composeFrame([], { backdrop: backdropImage('data:image/webp;base64,BB') });
    expect(svg).toContain('<image href="data:image/webp;base64,BB"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(svg).toContain(`width="${COMPOSE_DEFAULTS.width}"`);
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
