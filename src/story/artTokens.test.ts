import { describe, expect, it } from 'vitest';
import { collectAssetRefs, hydrateArt, TRANSPARENT_PIXEL } from './artTokens';

const IMG = (href: string) => `<svg viewBox="0 0 10 10"><image href="${href}" x="0"/></svg>`;

describe('collectAssetRefs', () => {
  it('finds an alias in an href', () => {
    expect(collectAssetRefs(IMG('asset:logo'))).toEqual(['logo']);
  });

  it('finds an alias in an xlink:href', () => {
    const art = '<svg><image xlink:href="asset:old_style"/></svg>';
    expect(collectAssetRefs(art)).toEqual(['old_style']);
  });

  it('de-duplicates and preserves first-seen order', () => {
    const art = IMG('asset:b') + IMG('asset:a') + IMG('asset:b');
    expect(collectAssetRefs(art)).toEqual(['b', 'a']);
  });

  it('returns nothing for art with no tokens', () => {
    expect(collectAssetRefs('<svg><path d="M0 0"/></svg>')).toEqual([]);
  });

  // The literal text "asset:" inside prose must never be mistaken for a token.
  it('ignores asset: appearing in text content', () => {
    const art = '<svg><text>see asset:logo for details</text></svg>';
    expect(collectAssetRefs(art)).toEqual([]);
  });

  it('ignores an alias longer than 64 characters', () => {
    expect(collectAssetRefs(IMG(`asset:${'x'.repeat(65)}`))).toEqual([]);
  });
});

describe('hydrateArt', () => {
  it('replaces a token with the resolved data URL', () => {
    const out = hydrateArt(IMG('asset:logo'), new Map([['logo', 'data:image/webp;base64,AAA']]));
    expect(out).toContain('href="data:image/webp;base64,AAA"');
    expect(out).not.toContain('asset:logo');
  });

  it('preserves the attribute name it matched', () => {
    const out = hydrateArt('<image xlink:href="asset:a"/>', new Map([['a', 'data:image/webp;base64,Z']]));
    expect(out).toBe('<image xlink:href="data:image/webp;base64,Z"/>');
  });

  it('substitutes a transparent pixel for an unresolved alias', () => {
    const out = hydrateArt(IMG('asset:missing'), new Map());
    expect(out).toContain(TRANSPARENT_PIXEL);
    expect(out).not.toContain('asset:missing');
  });

  it('leaves non-token hrefs untouched', () => {
    const art = IMG('data:image/png;base64,QQ');
    expect(hydrateArt(art, new Map())).toBe(art);
  });

  // A resolved value is inserted into a double-quoted attribute, so a quote in
  // it would break out of the attribute and inject markup.
  it('escapes a resolved value that contains attribute-breaking characters', () => {
    const out = hydrateArt(IMG('asset:x'), new Map([['x', 'data:image/png,"><script>bad()</script>']]));
    expect(out).not.toContain('<script>');
    expect(out).toContain('&quot;');
  });

  it('replaces every occurrence of a repeated alias', () => {
    const art = IMG('asset:a') + IMG('asset:a');
    const out = hydrateArt(art, new Map([['a', 'data:image/webp;base64,Q']]));
    expect(out).not.toContain('asset:a');
    expect(out.match(/data:image\/webp;base64,Q/g)).toHaveLength(2);
  });
});
