import { describe, it, expect } from 'vitest';
import { phoneScene } from './phoneScene';
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
    const near = phoneScene(frame([mk(0)]), 0, {});
    const far = phoneScene(frame([mk(4)]), 0, {});
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
