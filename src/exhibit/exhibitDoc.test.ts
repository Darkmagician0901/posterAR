import { describe, expect, it } from 'vitest';
import {
  MAX_EXHIBIT_STORIES,
  exhibitIssues,
  validateExhibitDoc,
  type ExhibitDoc,
} from './exhibitDoc';

const good = { schemaVersion: 1, id: 'lobby', title: 'The Lobby', storyIds: ['a-story', 'b-story'] };

describe('validateExhibitDoc', () => {
  it('accepts a well-formed exhibit', () => {
    expect(validateExhibitDoc(good)?.storyIds).toEqual(['a-story', 'b-story']);
  });

  it('rejects a non-object', () => {
    expect(validateExhibitDoc('nope')).toBeNull();
    expect(validateExhibitDoc(null)).toBeNull();
  });

  it('rejects an exhibit with no usable stories', () => {
    expect(validateExhibitDoc({ ...good, storyIds: [] })).toBeNull();
  });

  it('drops a story id that could traverse, keeping the rest', () => {
    const doc = validateExhibitDoc({ ...good, storyIds: ['a-story', '../../secret'] });
    expect(doc?.storyIds).toEqual(['a-story']);
  });

  it('drops a story id that could name a host', () => {
    const doc = validateExhibitDoc({ ...good, storyIds: ['a-story', 'https://evil.example/x'] });
    expect(doc?.storyIds).toEqual(['a-story']);
  });

  it('de-duplicates repeated story ids', () => {
    const doc = validateExhibitDoc({ ...good, storyIds: ['a-story', 'a-story'] });
    expect(doc?.storyIds).toEqual(['a-story']);
  });

  it('falls back to a usable title rather than rejecting', () => {
    expect(validateExhibitDoc({ ...good, title: '' })?.title).toBe('Untitled exhibit');
  });

  it('truncates past the engine cap rather than failing the whole exhibit at runtime', () => {
    const many = Array.from({ length: 14 }, (_, i) => `story-${i}`);
    expect(validateExhibitDoc({ ...good, storyIds: many })?.storyIds).toHaveLength(MAX_EXHIBIT_STORIES);
  });
});

describe('exhibitIssues', () => {
  it('passes a good exhibit', () => {
    expect(exhibitIssues(good as ExhibitDoc)).toEqual([]);
  });

  it('refuses an empty exhibit', () => {
    expect(exhibitIssues({ ...good, storyIds: [] } as ExhibitDoc)).toContain(
      'An exhibit needs at least one story.',
    );
  });

  it('refuses more than the engine can track at once, and says why', () => {
    const many = Array.from({ length: 11 }, (_, i) => `story-${i}`);
    const issues = exhibitIssues({ ...good, storyIds: many } as ExhibitDoc);
    expect(issues.join(' ')).toContain('10');
  });

  it('refuses a duplicate story, because one picture cannot mean two things', () => {
    expect(exhibitIssues({ ...good, storyIds: ['a', 'a'] } as ExhibitDoc).join(' ')).toContain('twice');
  });
});
