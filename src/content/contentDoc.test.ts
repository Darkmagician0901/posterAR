import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONTENT,
  sanitizeContentDoc,
  TILE_WIDTH_MIN_M,
  TILE_WIDTH_MAX_M,
} from '@/content/contentDoc';
import { STORY_ERAS, STORY_INTRO } from '@/story/storyData';

describe('DEFAULT_CONTENT', () => {
  it('mirrors the bundled story data', () => {
    expect(DEFAULT_CONTENT.intro.title).toBe(STORY_INTRO.title);
    expect(DEFAULT_CONTENT.eras).toHaveLength(STORY_ERAS.length);
    expect(DEFAULT_CONTENT.eras.map((e) => e.key)).toEqual(STORY_ERAS.map((e) => e.key));
    expect(DEFAULT_CONTENT.eras[0].line).toBe(STORY_ERAS[0].line);
    expect(DEFAULT_CONTENT.settings.tileWidthM).toBe(0.9);
  });
});

describe('sanitizeContentDoc', () => {
  it('returns defaults for non-object input', () => {
    expect(sanitizeContentDoc(null)).toEqual(DEFAULT_CONTENT);
    expect(sanitizeContentDoc('nope')).toEqual(DEFAULT_CONTENT);
    expect(sanitizeContentDoc(42)).toEqual(DEFAULT_CONTENT);
  });

  it('passes a fully valid doc through unchanged', () => {
    const doc = JSON.parse(JSON.stringify(DEFAULT_CONTENT));
    doc.intro.title = 'HELLO';
    expect(sanitizeContentDoc(doc).intro.title).toBe('HELLO');
  });

  it('falls back per-field, not all-or-nothing', () => {
    const out = sanitizeContentDoc({ intro: { title: 'CUSTOM', subtitle: 7 } });
    expect(out.intro.title).toBe('CUSTOM');
    expect(out.intro.subtitle).toBe(DEFAULT_CONTENT.intro.subtitle);
    expect(out.outro).toEqual(DEFAULT_CONTENT.outro);
  });

  it('treats empty/whitespace strings as missing', () => {
    const out = sanitizeContentDoc({ intro: { title: '   ' } });
    expect(out.intro.title).toBe(DEFAULT_CONTENT.intro.title);
  });

  it('matches eras by key and ignores unknown keys', () => {
    const out = sanitizeContentDoc({
      eras: [
        { key: 'oil', line: 'custom oil line' },
        { key: 'bogus', line: 'should be ignored' },
      ],
    });
    expect(out.eras).toHaveLength(5);
    expect(out.eras.map((e) => e.key)).toEqual(['wreck', 'oil', 'toxic', 'heal', 'alive']);
    expect(out.eras[1].line).toBe('custom oil line');
    expect(out.eras[1].year).toBe(DEFAULT_CONTENT.eras[1].year);
    expect(out.eras[0]).toEqual(DEFAULT_CONTENT.eras[0]);
  });

  it('rejects invalid particle values', () => {
    const out = sanitizeContentDoc({ eras: [{ key: 'wreck', particle: 'confetti' }] });
    expect(out.eras[0].particle).toBe(DEFAULT_CONTENT.eras[0].particle);
  });

  it('clamps tileWidthM into range and rejects non-numbers', () => {
    expect(sanitizeContentDoc({ settings: { tileWidthM: 99 } }).settings.tileWidthM).toBe(TILE_WIDTH_MAX_M);
    expect(sanitizeContentDoc({ settings: { tileWidthM: 0.01 } }).settings.tileWidthM).toBe(TILE_WIDTH_MIN_M);
    expect(sanitizeContentDoc({ settings: { tileWidthM: 'wide' } }).settings.tileWidthM).toBe(0.9);
    expect(sanitizeContentDoc({ settings: { tileWidthM: NaN } }).settings.tileWidthM).toBe(0.9);
  });
});
