import { describe, it, expect } from 'vitest';
import { validateStoryDoc, StoryDoc } from './storyDoc';
import { DEFAULT_STORY } from './defaultStory';

const FB: StoryDoc = {
  schemaVersion: 3,
  id: 'fallback',
  title: 'FALLBACK TITLE',
  loc: 'fallback loc',
  intro: { title: 'FB INTRO', subtitle: 'fb intro sub' },
  outro: { title: 'FB OUTRO', subtitle: 'fb outro sub' },
  frames: [
    {
      key: 'a',
      year: '1900',
      label: 'A',
      title: 'FRAME A',
      line: 'line a',
      washColor: 'rgba(1,2,3,0.5)',
      art: '<svg viewBox="0 0 10 10"></svg>',
    },
  ],
};

describe('validateStoryDoc', () => {
  it('returns the fallback for non-object input', () => {
    expect(validateStoryDoc(null, FB)).toEqual(FB);
    expect(validateStoryDoc('nope', FB)).toEqual(FB);
    expect(validateStoryDoc(42, FB)).toEqual(FB);
  });

  it('falls back per field, not all-or-nothing', () => {
    const out = validateStoryDoc({ title: 'REAL TITLE' }, FB);
    expect(out.title).toBe('REAL TITLE');
    expect(out.loc).toBe('fallback loc');
    expect(out.intro.title).toBe('FB INTRO');
    expect(out.frames).toEqual(FB.frames);
  });

  it('treats blank and wrong-typed strings as missing', () => {
    const out = validateStoryDoc({ title: '   ', loc: 99 }, FB);
    expect(out.title).toBe('FALLBACK TITLE');
    expect(out.loc).toBe('fallback loc');
  });

  it('accepts a valid frame array and keeps its order', () => {
    const out = validateStoryDoc(
      {
        frames: [
          {
            key: 'x',
            year: '1',
            label: 'X',
            title: 'TX',
            line: 'lx',
            washColor: '#fff',
            art: '<svg viewBox="0 0 1 1"/>',
          },
          {
            key: 'y',
            year: '2',
            label: 'Y',
            title: 'TY',
            line: 'ly',
            washColor: '#000',
            art: '<svg viewBox="0 0 1 1"/>',
          },
        ],
      },
      FB,
    );
    expect(out.frames.map((f) => f.key)).toEqual(['x', 'y']);
  });

  it('drops frames whose art is missing or not SVG, and falls back when none survive', () => {
    const out = validateStoryDoc({ frames: [{ key: 'x', art: 'not markup' }, { key: 'y' }] }, FB);
    expect(out.frames).toEqual(FB.frames);
  });

  it('keeps surviving frames when only some are unusable', () => {
    const out = validateStoryDoc(
      { frames: [{ key: 'bad' }, { key: 'good', art: '<svg viewBox="0 0 1 1"/>' }] },
      FB,
    );
    expect(out.frames.map((f) => f.key)).toEqual(['good']);
  });

  it('preserves authored props rather than silently dropping them', () => {
    const out = validateStoryDoc(
      {
        frames: [
          {
            key: 'x',
            art: '<svg viewBox="0 0 1 1"/>',
            props: [{ t: 'lib', k: 'sunflower', x: 1.5, z: 2, h: 1.6, f: true, e: 0 }],
          },
        ],
      },
      FB,
    );
    expect(out.frames[0].props).toEqual([
      { t: 'lib', k: 'sunflower', x: 1.5, z: 2, h: 1.6, f: true, e: 0 },
    ]);
  });

  it('coerces malformed prop fields to safe numbers and drops keyless props', () => {
    const out = validateStoryDoc(
      {
        frames: [
          {
            key: 'x',
            art: '<svg viewBox="0 0 1 1"/>',
            props: [{ t: 'img', k: 'a', x: 'NaN', z: Infinity }, { t: 'lib' }],
          },
        ],
      },
      FB,
    );
    expect(out.frames[0].props).toEqual([{ t: 'img', k: 'a', x: 0, z: 0, h: 1, f: false, e: 0 }]);
  });

  it('always stamps the current schema version', () => {
    expect(validateStoryDoc({ schemaVersion: 99 }, FB).schemaVersion).toBe(3);
  });

  it('keeps uploaded assets that are inline image data', () => {
    const out = validateStoryDoc(
      { assets: { a1: { href: 'data:image/webp;base64,AA', aspect: 1.5, name: 'sky.webp' } } },
      FB,
    );
    expect(out.assets).toEqual({
      a1: { href: 'data:image/webp;base64,AA', aspect: 1.5, name: 'sky.webp' },
    });
  });

  it('drops assets pointing anywhere other than inline image data', () => {
    const out = validateStoryDoc(
      {
        assets: {
          remote: { href: 'https://evil.example/x.png', aspect: 1 },
          script: { href: 'javascript:alert(1)', aspect: 1 },
          nonImage: { href: 'data:text/html,<script>', aspect: 1 },
          ok: { href: 'data:image/png;base64,BB', aspect: 1 },
        },
      },
      FB,
    );
    expect(Object.keys(out.assets ?? {})).toEqual(['ok']);
  });

  it('drops assets with a nonsensical aspect', () => {
    const out = validateStoryDoc(
      {
        assets: {
          zero: { href: 'data:image/png;base64,AA', aspect: 0 },
          negative: { href: 'data:image/png;base64,AA', aspect: -2 },
        },
      },
      FB,
    );
    expect(out.assets).toBeUndefined();
  });

  it('omits the asset map entirely when there are none', () => {
    expect(validateStoryDoc({ assets: {} }, FB).assets).toBeUndefined();
    expect(validateStoryDoc({}, FB).assets).toBeUndefined();
  });

  it('keeps a data:audio URL and its filename on a frame', () => {
    const doc = validateStoryDoc(
      {
        frames: [
          {
            art: '<svg viewBox="0 0 1 1"></svg>',
            audio: 'data:audio/mpeg;base64,AAA',
            audioName: 'voice.mp3',
          },
        ],
      },
      DEFAULT_STORY,
    );
    expect(doc.frames[0].audio).toBe('data:audio/mpeg;base64,AAA');
    expect(doc.frames[0].audioName).toBe('voice.mp3');
  });

  it('drops a non-data:audio source and its name', () => {
    const doc = validateStoryDoc(
      {
        frames: [
          { art: '<svg viewBox="0 0 1 1"></svg>', audio: 'https://evil.example/a.mp3', audioName: 'x' },
        ],
      },
      DEFAULT_STORY,
    );
    expect(doc.frames[0].audio).toBeUndefined();
    expect(doc.frames[0].audioName).toBeUndefined();
  });

  it('leaves an audioless frame audioless', () => {
    const doc = validateStoryDoc(
      { frames: [{ art: '<svg viewBox="0 0 1 1"></svg>' }] },
      DEFAULT_STORY,
    );
    expect(doc.frames[0].audio).toBeUndefined();
  });

  it('keeps a valid text font and color on a frame', () => {
    const doc = validateStoryDoc(
      { frames: [{ art: '<svg viewBox="0 0 1 1"></svg>', font: 'terminal', color: '#f08a1e' }] },
      DEFAULT_STORY,
    );
    expect(doc.frames[0].font).toBe('terminal');
    expect(doc.frames[0].color).toBe('#f08a1e');
  });

  it('drops an unknown font id and an unoffered color', () => {
    const doc = validateStoryDoc(
      { frames: [{ art: '<svg viewBox="0 0 1 1"></svg>', font: 'comic-sans', color: '#010203' }] },
      DEFAULT_STORY,
    );
    expect(doc.frames[0].font).toBeUndefined();
    expect(doc.frames[0].color).toBeUndefined();
  });
});
