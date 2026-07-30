import { describe, expect, it } from 'vitest';
import { toComposeImages, assertPersistable } from './composeImages';
import { composeFrame } from '@/story/props/compose';
import { phoneScene } from './phoneScene';
import type { StoryFrame, StoryProp } from '@/story/storyDoc';

const SHA = 'a'.repeat(64);

describe('toComposeImages', () => {
  it('maps a v4 reference to an asset token', () => {
    expect(toComposeImages({ logo: { assetId: SHA, aspect: 1.5 } })).toEqual({
      logo: { href: 'asset:logo', aspect: 1.5 },
    });
  });

  it('passes a v3 inline href through unchanged', () => {
    const href = 'data:image/webp;base64,AAA';
    expect(toComposeImages({ old: { href, aspect: 2 } })).toEqual({
      old: { href, aspect: 2 },
    });
  });

  // The studio's live preview needs real bytes, not a token, because it
  // renders the fragment as DOM rather than composing a persisted document.
  it('uses a resolved data URL when one is supplied', () => {
    const out = toComposeImages(
      { logo: { assetId: SHA, aspect: 1 } },
      new Map([['logo', 'data:image/webp;base64,ZZZ']]),
    );
    expect(out.logo.href).toBe('data:image/webp;base64,ZZZ');
  });

  it('falls back to the token when the alias is not in the resolved map', () => {
    const out = toComposeImages({ logo: { assetId: SHA, aspect: 1 } }, new Map());
    expect(out.logo.href).toBe('asset:logo');
  });

  it('handles an empty map', () => {
    expect(toComposeImages({})).toEqual({});
  });
});

/**
 * Regression coverage for the blank-image defect: a v4 (assetId) upload used
 * to compose as `<image href=""/>` because compose.ts and phoneScene.ts each
 * carried a temporary `isAssetRef(asset) ? '' : asset.href` fallback, installed
 * before uploads wrote assetId-shaped references and never removed once they
 * did. Nothing composed a frame with a v4 asset, so nothing caught it.
 *
 * These compose an actual frame end-to-end (toComposeImages -> composeFrame /
 * phoneScene) rather than asserting on toComposeImages alone, so a regression
 * in either consumer's own href handling would also be caught here.
 */
describe('composing a v4 asset (regression: blank <image href>)', () => {
  const prop = (over: Partial<StoryProp> = {}): StoryProp => ({
    t: 'img',
    k: 'logo',
    x: 0,
    z: 0,
    h: 1,
    f: false,
    e: 0,
    ...over,
  });

  it('composeFrame emits a non-empty href for a persisted (token) v4 asset', () => {
    const images = toComposeImages({ logo: { assetId: SHA, aspect: 1.5 } });
    const svg = composeFrame([prop()], { images });
    expect(svg).not.toContain('href=""');
    expect(svg).toContain('href="asset:logo"');
  });

  it('composeFrame emits a non-empty href for a preview (resolved) v4 asset', () => {
    const images = toComposeImages(
      { logo: { assetId: SHA, aspect: 1.5 } },
      new Map([['logo', 'data:image/webp;base64,ZZZ']]),
    );
    const svg = composeFrame([prop()], { images });
    expect(svg).not.toContain('href=""');
    expect(svg).toContain('href="data:image/webp;base64,ZZZ"');
  });

  it('phoneScene emits a non-empty href for a persisted (token) v4 asset', () => {
    const frame: StoryFrame = {
      key: 'k',
      year: '1951',
      label: 'F1',
      title: 'T',
      line: '',
      washColor: '#000',
      art: '<svg viewBox="0 0 330 175" xmlns="http://www.w3.org/2000/svg"></svg>',
      props: [prop()],
    };
    const images = toComposeImages({ logo: { assetId: SHA, aspect: 1.5 } });
    const svg = phoneScene(frame, 0, images);
    expect(svg).not.toContain('href=""');
    expect(svg).toContain('href="asset:logo"');
  });
});

/**
 * Regression coverage for a v3 legacy asset re-inlining its bytes into
 * persisted art: `toComposeImages` passes a v3 entry's `href` through
 * unchanged, whether or not it is being called on the persist path (no
 * `resolved` map). A v3 href is a `data:` URL, so without a guard it would
 * bake full base64 back into `frame.art` — exactly what the v4 content-address
 * migration removed. `assertPersistable` is that guard: it must throw before
 * any such map reaches `composeFrame`, so persisted art can never contain
 * `data:image`.
 */
describe('assertPersistable', () => {
  it('throws on a v3 legacy asset — a data: href about to be persisted', () => {
    const images = toComposeImages({
      old: { href: 'data:image/webp;base64,AAAA', aspect: 2 },
    });
    expect(() => assertPersistable(images)).toThrow(/old/);
  });

  it('does not throw on a v4 reference resolved to its persisted token', () => {
    const images = toComposeImages({ logo: { assetId: SHA, aspect: 1.5 } });
    expect(() => assertPersistable(images)).not.toThrow();
  });

  it('does not throw on an empty map', () => {
    expect(() => assertPersistable({})).not.toThrow();
  });

  // End-to-end: prove the composed art itself can never carry a data: image
  // once assertPersistable has passed — not just that the guard function
  // throws in isolation.
  it('art composed after a passing guard never contains a data: image', () => {
    const images = toComposeImages({ logo: { assetId: SHA, aspect: 1.5 } });
    assertPersistable(images); // would throw first if this were unsafe
    const svg = composeFrame(
      [{ t: 'img', k: 'logo', x: 0, z: 0, h: 1, f: false, e: 0 }],
      { images },
    );
    expect(svg).not.toMatch(/data:image/);
  });

  // And the inverse: a document that WOULD carry a data: image into art is
  // exactly the one assertPersistable refuses, so composeFrame is never
  // reached with it on the persist path.
  it('a map that would compose a data: image is refused before composeFrame runs', () => {
    const images = toComposeImages({
      old: { href: 'data:image/webp;base64,AAAA', aspect: 2 },
    });
    expect(() => {
      assertPersistable(images);
      composeFrame([{ t: 'img', k: 'old', x: 0, z: 0, h: 1, f: false, e: 0 }], { images });
    }).toThrow();
  });
});
