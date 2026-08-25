import { describe, it, expect } from 'vitest';
import { isAssetRef, validateStoryDoc, StoryDoc } from './storyDoc';
import { DEFAULT_STORY } from '@/story/defaultStory';

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

// The display derivative is an ordinary asset with its own content address, so
// r1024Id is a second id in the document and gets exactly the same scrutiny as
// assetId — it is interpolated into a path too. The difference is what a
// failure costs: a bad assetId means no image, a bad r1024Id means the same
// image resolved from the canonical bytes.
describe('validateStoryDoc — r1024Id', () => {
  const R1024 = 'b'.repeat(64);

  it('keeps a well-formed r1024Id alongside the assetId', () => {
    const out = validateStoryDoc(
      docWith({ logo: { assetId: SHA, r1024Id: R1024, aspect: 1.5 } }),
      FALLBACK,
    );
    expect(out.assets?.logo).toEqual({ assetId: SHA, r1024Id: R1024, aspect: 1.5 });
  });

  it('drops an invalid r1024Id while keeping the rest of the entry', () => {
    for (const bad of ['nope', 'B'.repeat(64), '../../secret', 'https://evil.example/x', 42, null]) {
      const out = validateStoryDoc(
        docWith({ logo: { assetId: SHA, r1024Id: bad, aspect: 1.5, name: 'sky.webp' } }),
        FALLBACK,
      );
      // The image still resolves — from assetId — and its metadata survives.
      expect(out.assets?.logo).toEqual({ assetId: SHA, aspect: 1.5, name: 'sky.webp' });
    }
  });

  it('omits r1024Id entirely when absent, rather than emitting undefined', () => {
    const out = validateStoryDoc(docWith({ logo: { assetId: SHA, aspect: 1 } }), FALLBACK);
    expect(Object.keys(out.assets?.logo ?? {})).toEqual(['assetId', 'aspect']);
  });
});

describe('isAssetRef', () => {
  it('discriminates a v4 reference from a v3 inline asset', () => {
    expect(isAssetRef({ assetId: SHA, aspect: 1 })).toBe(true);
    expect(isAssetRef({ href: 'data:image/png;base64,AA', aspect: 1 })).toBe(false);
  });
});

describe('anchor', () => {
  const crop = {
    top: 0, left: 100, width: 1200, height: 1600,
    isRotated: false, originalWidth: 1400, originalHeight: 1600,
  };
  const anchor = {
    type: 'marker', markerId: 'a'.repeat(64), thumbId: 'b'.repeat(64),
    crop, local: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    widthInMarkers: 1, mode: 'follow',
  };

  it('keeps a well-formed anchor', () => {
    const doc = validateStoryDoc({ ...DEFAULT_STORY, anchor }, DEFAULT_STORY);
    expect(doc.anchor?.markerId).toBe('a'.repeat(64));
  });

  it('leaves a story with no anchor alone, so today is unchanged', () => {
    expect(validateStoryDoc({ ...DEFAULT_STORY }, DEFAULT_STORY).anchor).toBeUndefined();
  });

  it('drops an anchor whose markerId could name a host', () => {
    const bad = { ...anchor, markerId: 'https://evil.example/x.png' };
    expect(validateStoryDoc({ ...DEFAULT_STORY, anchor: bad }, DEFAULT_STORY).anchor).toBeUndefined();
  });

  it('drops an anchor whose markerId could traverse', () => {
    const bad = { ...anchor, markerId: '../../../etc/passwd' };
    expect(validateStoryDoc({ ...DEFAULT_STORY, anchor: bad }, DEFAULT_STORY).anchor).toBeUndefined();
  });

  it('drops an anchor with a bad thumbId, because it is a path segment too', () => {
    const bad = { ...anchor, thumbId: 'nope' };
    expect(validateStoryDoc({ ...DEFAULT_STORY, anchor: bad }, DEFAULT_STORY).anchor).toBeUndefined();
  });

  it('drops an anchor with no crop, because the target could not be synthesized', () => {
    const { crop: _drop, ...bad } = anchor;
    expect(validateStoryDoc({ ...DEFAULT_STORY, anchor: bad }, DEFAULT_STORY).anchor).toBeUndefined();
  });

  it('keeps an authored scene width', () => {
    const doc = validateStoryDoc(
      { ...DEFAULT_STORY, anchor: { ...anchor, widthInMarkers: 7.25 } },
      DEFAULT_STORY,
    );
    expect(doc.anchor?.widthInMarkers).toBeCloseTo(7.25, 10);
  });

  it('falls back to 1 for a scene width outside (0, 100]', () => {
    // 1 is the pre-existing behaviour — art covering the marker — so the
    // fallback degrades to something that has always worked rather than to
    // an invisible or absurd scene.
    for (const bad of [0, -3, 101, NaN, Infinity, 'big', null, undefined]) {
      const doc = validateStoryDoc(
        { ...DEFAULT_STORY, anchor: { ...anchor, widthInMarkers: bad } },
        DEFAULT_STORY,
      );
      expect(doc.anchor?.widthInMarkers).toBe(1);
    }
  });

  it('keeps an in-plane offset, which is how a print hangs off-centre', () => {
    const doc = validateStoryDoc(
      {
        ...DEFAULT_STORY,
        anchor: { ...anchor, local: { position: [-0.9, 0.6, 0], rotation: [0, 0, 0, 1] } },
      },
      DEFAULT_STORY,
    );
    expect(doc.anchor?.local.position[0]).toBeCloseTo(-0.9, 10);
    expect(doc.anchor?.local.position[1]).toBeCloseTo(0.6, 10);
  });

  it('clamps a wild offset rather than dropping the whole anchor', () => {
    const doc = validateStoryDoc(
      {
        ...DEFAULT_STORY,
        anchor: { ...anchor, local: { position: [1e9, -1e9, 0], rotation: [0, 0, 0, 1] } },
      },
      DEFAULT_STORY,
    );
    expect(doc.anchor?.local.position[0]).toBe(100);
    expect(doc.anchor?.local.position[1]).toBe(-100);
  });

  it('forces z to 0, because this design is coplanar by construction', () => {
    const doc = validateStoryDoc(
      {
        ...DEFAULT_STORY,
        anchor: { ...anchor, local: { position: [1, 2, 3], rotation: [0, 0, 0, 1] } },
      },
      DEFAULT_STORY,
    );
    expect(doc.anchor?.local.position[2]).toBe(0);
  });

  it('forces rotation to identity — in-plane rotation is not built', () => {
    const doc = validateStoryDoc(
      {
        ...DEFAULT_STORY,
        anchor: { ...anchor, local: { position: [0, 0, 0], rotation: [0.7, 0, 0, 0.7] } },
      },
      DEFAULT_STORY,
    );
    expect(doc.anchor?.local.rotation).toEqual([0, 0, 0, 1]);
  });

  it('forces mode to latch, including on documents published as follow', () => {
    // Every story published before this change carries mode: 'follow', and no
    // code path renders follow any more. Honouring it would render nothing.
    for (const m of ['follow', 'latch', 'wobble', undefined]) {
      const doc = validateStoryDoc(
        { ...DEFAULT_STORY, anchor: { ...anchor, mode: m } },
        DEFAULT_STORY,
      );
      expect(doc.anchor?.mode).toBe('latch');
    }
  });

  it('reads a legacy 1:1 anchor as exactly what it means today', () => {
    // Backward compatibility (marker-locator-design §2.2): every published
    // story carries widthInMarkers 1 and a zero offset, which under the new
    // maths still means artwork covering the marker.
    const doc = validateStoryDoc({ ...DEFAULT_STORY, anchor }, DEFAULT_STORY);
    expect(doc.anchor?.widthInMarkers).toBe(1);
    expect(doc.anchor?.local.position).toEqual([0, 0, 0]);
  });

  it('drops a non-marker anchor type', () => {
    const bad = { ...anchor, type: 'plane' };
    expect(validateStoryDoc({ ...DEFAULT_STORY, anchor: bad }, DEFAULT_STORY).anchor).toBeUndefined();
  });
});
