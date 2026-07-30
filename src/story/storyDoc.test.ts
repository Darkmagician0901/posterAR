import { describe, it, expect } from 'vitest';
import { isAssetRef, validateStoryDoc, StoryDoc } from './storyDoc';

const FB: StoryDoc = {
  schemaVersion: 4,
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
    expect(validateStoryDoc({ schemaVersion: 99 }, FB).schemaVersion).toBe(4);
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
});

const FALLBACK: StoryDoc = {
  schemaVersion: 4,
  id: 'fallback',
  title: 'Fallback',
  loc: '',
  intro: { title: '', subtitle: '' },
  outro: { title: '', subtitle: '' },
  frames: [{ key: 'f', year: '', label: '', title: '', line: '', washColor: '', art: '<svg/>' }],
};

const SHA = 'a'.repeat(64);
const docWith = (assets: unknown) => ({ ...FALLBACK, assets });

describe('validateStoryDoc — v4 assets', () => {
  it('keeps a well-formed assetId reference', () => {
    const out = validateStoryDoc(docWith({ logo: { assetId: SHA, aspect: 1.5 } }), FALLBACK);
    expect(out.assets?.logo).toEqual({ assetId: SHA, aspect: 1.5 });
  });

  it('still keeps a v3 data: href, so published v3 documents keep rendering', () => {
    const href = 'data:image/webp;base64,AAA';
    const out = validateStoryDoc(docWith({ old: { href, aspect: 1 } }), FALLBACK);
    expect(out.assets?.old).toEqual({ href, aspect: 1 });
  });

  it('drops an assetId that is not 64 lowercase hex', () => {
    expect(validateStoryDoc(docWith({ a: { assetId: 'nope', aspect: 1 } }), FALLBACK).assets)
      .toBeUndefined();
  });

  // The whole security property: a document must not be able to name a host.
  it('drops an assetId carrying a URL or a path traversal', () => {
    expect(validateStoryDoc(docWith({ a: { assetId: 'https://evil.example/x', aspect: 1 } }), FALLBACK).assets)
      .toBeUndefined();
    expect(validateStoryDoc(docWith({ a: { assetId: '../../secret', aspect: 1 } }), FALLBACK).assets)
      .toBeUndefined();
  });

  it('still rejects a non-data: href, as v3 did', () => {
    expect(validateStoryDoc(docWith({ a: { href: 'https://evil.example/x.png', aspect: 1 } }), FALLBACK).assets)
      .toBeUndefined();
  });

  it('drops an entry whose alias is not token-safe', () => {
    const out = validateStoryDoc(docWith({ 'bad alias"': { assetId: SHA, aspect: 1 } }), FALLBACK);
    expect(out.assets).toBeUndefined();
  });

  it('drops a non-positive aspect', () => {
    expect(validateStoryDoc(docWith({ a: { assetId: SHA, aspect: 0 } }), FALLBACK).assets)
      .toBeUndefined();
  });

  it('keeps the good entries and drops only the bad ones', () => {
    const out = validateStoryDoc(
      docWith({ good: { assetId: SHA, aspect: 1 }, bad: { assetId: 'x', aspect: 1 } }),
      FALLBACK,
    );
    expect(Object.keys(out.assets ?? {})).toEqual(['good']);
  });

  it('reports schemaVersion 4 regardless of the input version', () => {
    expect(validateStoryDoc({ ...FALLBACK, schemaVersion: 3 }, FALLBACK).schemaVersion).toBe(4);
  });
});

describe('isAssetRef', () => {
  it('discriminates a v4 reference from a v3 inline asset', () => {
    expect(isAssetRef({ assetId: SHA, aspect: 1 })).toBe(true);
    expect(isAssetRef({ href: 'data:image/png;base64,AA', aspect: 1 })).toBe(false);
  });
});
