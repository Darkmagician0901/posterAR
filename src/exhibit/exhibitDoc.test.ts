import { describe, expect, it } from 'vitest';
import {
  MAX_EXHIBIT_STORIES,
  exhibitIssues,
  normalizeStoryIds,
  validateExhibitDoc,
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

describe('normalizeStoryIds', () => {
  it('normalises case and whitespace, which are not mistakes worth refusing', () => {
    expect(normalizeStoryIds([' Lobby ', 'HALL'])).toEqual(['lobby', 'hall']);
  });

  it('drops values that could never be a path segment', () => {
    expect(normalizeStoryIds(['ok', '../etc/passwd', 'a b', 7, null])).toEqual(['ok']);
  });

  it('keeps duplicates and the full count, so exhibitIssues can still see them', () => {
    const many = Array.from({ length: 14 }, () => 'same');
    expect(normalizeStoryIds(many)).toHaveLength(14);
  });

  it('treats a non-array as an empty list rather than throwing', () => {
    expect(normalizeStoryIds(undefined)).toEqual([]);
    expect(normalizeStoryIds('lobby')).toEqual([]);
  });
});

describe('exhibitIssues', () => {
  it('passes a good exhibit', () => {
    expect(exhibitIssues(good.storyIds)).toEqual([]);
  });

  it('refuses an empty exhibit', () => {
    expect(exhibitIssues([])).toContain('An exhibit needs at least one story.');
  });

  it('refuses more than the engine can track at once, and says why', () => {
    const many = Array.from({ length: 11 }, (_, i) => `story-${i}`);
    expect(exhibitIssues(many).join(' ')).toContain('10');
  });

  it('refuses a duplicate story, because one picture cannot mean two things', () => {
    expect(exhibitIssues(['a', 'a']).join(' ')).toContain('twice');
  });

  it('still refuses a list validateExhibitDoc would have quietly trimmed', () => {
    // The regression that motivated splitting normalizeStoryIds out: chaining
    // exhibitIssues after validateExhibitDoc made every rule above unfireable,
    // so a 14-story exhibit published as 10 with four dead pictures.
    const many = Array.from({ length: 14 }, (_, i) => `story-${i}`);
    const trimmed = validateExhibitDoc({ ...good, storyIds: many })?.storyIds ?? [];

    expect(exhibitIssues(trimmed)).toEqual([]);
    expect(exhibitIssues(normalizeStoryIds(many)).join(' ')).toContain('14');
  });
});

describe('validateExhibitDoc — feedbackUrl', () => {
  it('keeps an https feedback url', () => {
    const doc = validateExhibitDoc({ ...good, feedbackUrl: 'https://forms.example/abc' });
    expect(doc?.feedbackUrl).toBe('https://forms.example/abc');
  });

  it('omits the field entirely when absent', () => {
    expect('feedbackUrl' in (validateExhibitDoc(good) as object)).toBe(false);
  });

  // The value reaches the DOM as an href, and a published document is
  // untrusted. A javascript: URL here would be script execution on tap.
  it('drops a javascript: url', () => {
    const doc = validateExhibitDoc({ ...good, feedbackUrl: 'javascript:alert(1)' });
    expect(doc?.feedbackUrl).toBeUndefined();
  });

  it('drops a data: url', () => {
    const doc = validateExhibitDoc({ ...good, feedbackUrl: 'data:text/html,<script>x</script>' });
    expect(doc?.feedbackUrl).toBeUndefined();
  });

  // Plain http would downgrade a visitor from the https page they are on.
  it('drops an http: url', () => {
    const doc = validateExhibitDoc({ ...good, feedbackUrl: 'http://forms.example/abc' });
    expect(doc?.feedbackUrl).toBeUndefined();
  });

  it('drops a relative or malformed value', () => {
    expect(validateExhibitDoc({ ...good, feedbackUrl: '/feedback' })?.feedbackUrl).toBeUndefined();
    expect(validateExhibitDoc({ ...good, feedbackUrl: 'forms.example' })?.feedbackUrl).toBeUndefined();
  });

  it('drops a non-string', () => {
    expect(validateExhibitDoc({ ...good, feedbackUrl: 42 })?.feedbackUrl).toBeUndefined();
  });

  // Degrading, not refusing: a bad link must not cost the visitor the room.
  it('still returns the exhibit when the url is unusable', () => {
    const doc = validateExhibitDoc({ ...good, feedbackUrl: 'nonsense' });
    expect(doc?.storyIds).toEqual(['a-story', 'b-story']);
  });
});

describe('exhibitIssues — feedbackUrl', () => {
  it('says nothing when there is no url', () => {
    expect(exhibitIssues(['a-story'])).toEqual([]);
  });

  it('accepts an https url', () => {
    expect(exhibitIssues(['a-story'], 'https://forms.example/abc')).toEqual([]);
  });

  // The operator is standing right there and can fix it, so this is named
  // and refused rather than silently dropped.
  it('names a non-https url', () => {
    const issues = exhibitIssues(['a-story'], 'http://forms.example/abc');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/https/i);
  });

  it('names a malformed url', () => {
    expect(exhibitIssues(['a-story'], 'nonsense')).toHaveLength(1);
  });

  it('treats an empty string as no url', () => {
    expect(exhibitIssues(['a-story'], '')).toEqual([]);
  });
});
