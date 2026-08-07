import { describe, it, expect } from 'vitest';
import { phoneScene } from './phoneScene';
import { DEFAULT_MARKER } from '@/story/marker';
import type { StoryFrame, StoryProp } from '@/story/storyDoc';

const frame = (props?: StoryProp[]): StoryFrame => ({
  key: 'k',
  year: '1951',
  label: 'F1',
  title: 'T',
  line: '',
  washColor: '#000',
  art: '<svg viewBox="0 0 330 175" xmlns="http://www.w3.org/2000/svg"><rect id="bd" width="330" height="175"/></svg>',
  props,
});

describe('phoneScene', () => {
  it('always draws the converging ground grid and sky', () => {
    const svg = phoneScene(frame(), 0, {});
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('url(#camsky)');
    expect(svg).toContain('<line'); // grid
  });

  it('draws the frame art as a backdrop layer when no props were staged', () => {
    expect(phoneScene(frame(), 0, {})).toContain('id="bd"');
  });

  it('emits a library prop and its contact shadow', () => {
    const p: StoryProp = { t: 'lib', k: 'car', x: 0, z: 1, h: 1.4, f: false, e: 0 };
    const svg = phoneScene(frame([p]), 0, {});
    expect(svg).toContain('<ellipse'); // shadow
  });

  it('skips a prop whose asset or library key is unknown', () => {
    const p: StoryProp = { t: 'img', k: 'missing', x: 0, z: 1, h: 1, f: false, e: 0 };
    const svg = phoneScene(frame([p]), 0, {});
    expect(svg).not.toContain('missing');
  });

  it('renders a farther prop smaller than a nearer identical prop', () => {
    const mk = (z: number): StoryProp => ({ t: 'lib', k: 'car', x: 0, z, h: 1.4, f: false, e: 0 });
    // Depth is measured out from the wall, so the nearer prop has the larger z.
    const near = phoneScene(frame([mk(4.6)]), 0, {});
    const far = phoneScene(frame([mk(0.5)]), 0, {});
    const w = (s: string) => Number(/rx="([\d.]+)"/.exec(s)![1]); // shadow rx tracks prop width
    expect(w(far)).toBeLessThan(w(near));
  });

  it('does not mutate the input frame', () => {
    const f = frame([{ t: 'lib', k: 'car', x: 0, z: 1, h: 1, f: false, e: 0 }]);
    const snap = JSON.stringify(f);
    phoneScene(f, 0, {});
    expect(JSON.stringify(f)).toBe(snap);
  });
});

describe('phoneScene — the poster', () => {
  const poster = (over = {}) => ({ ...DEFAULT_MARKER, ...over });
  // The leading \s matters: without it these also match stroke-width="1".
  const w = (s: string): number => Number(/class="poster"[^>]*\swidth="([\d.]+)"/.exec(s)![1]);
  const y = (s: string): number => Number(/class="poster"[^>]*\sy="([-\d.]+)"/.exec(s)![1]);

  it('draws the marker image on the wall when there is one', () => {
    const svg = phoneScene(frame(), 0, {}, poster({ image: 'data:image/webp;base64,AAA' }));
    expect(svg).toContain('data:image/webp;base64,AAA');
  });

  it('draws a placeholder rather than nothing when there is no image', () => {
    expect(phoneScene(frame(), 0, {}, poster())).toContain('class="poster"');
  });

  it('draws a wider poster wider', () => {
    expect(w(phoneScene(frame(), 0, {}, poster({ widthM: 1.2 })))).toBeGreaterThan(
      w(phoneScene(frame(), 0, {}, poster())),
    );
  });

  it('hangs a higher-mounted poster higher up the view', () => {
    const low = phoneScene(frame(), 0, {}, poster({ mountHeight: 1 }));
    const high = phoneScene(frame(), 0, {}, poster({ mountHeight: 2.4 }));
    expect(y(high)).toBeLessThan(y(low));
  });

  it('defaults to the A3 poster when no marker is passed', () => {
    expect(phoneScene(frame(), 0, {})).toContain('class="poster"');
  });

  it('escapes the image href so it cannot break out of the attribute', () => {
    const svg = phoneScene(
      frame(),
      0,
      {},
      poster({ image: 'data:image/png;base64,AA"><script>x()</script>' }),
    );
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&quot;');
  });
});
