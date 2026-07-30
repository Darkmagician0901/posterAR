import { describe, expect, it } from 'vitest';
import { toComposeImages } from './composeImages';
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
