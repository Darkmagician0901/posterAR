import { describe, it, expect } from 'vitest';
import { resolveInitialContent } from '@/store/contentStore';
import { DEFAULT_CONTENT } from '@/content/contentDoc';
import { STORAGE_KEYS } from '@/utils/constants';

function storageWith(value: string | null): Pick<Storage, 'getItem'> {
  return { getItem: (key: string) => (key === STORAGE_KEYS.CONTENT_DRAFT ? value : null) };
}

describe('resolveInitialContent', () => {
  it('returns defaults, not preview, without the preview param', () => {
    const draft = JSON.stringify({ intro: { title: 'DRAFT TITLE' } });
    const out = resolveInitialContent('', storageWith(draft));
    expect(out.isPreview).toBe(false);
    expect(out.doc).toEqual(DEFAULT_CONTENT);
  });

  it('returns the sanitized draft with ?preview=local', () => {
    const draft = JSON.stringify({ intro: { title: 'DRAFT TITLE' } });
    const out = resolveInitialContent('?preview=local', storageWith(draft));
    expect(out.isPreview).toBe(true);
    expect(out.doc.intro.title).toBe('DRAFT TITLE');
    expect(out.doc.outro).toEqual(DEFAULT_CONTENT.outro);
  });

  it('falls back to defaults when no draft is stored', () => {
    const out = resolveInitialContent('?preview=local', storageWith(null));
    expect(out.isPreview).toBe(false);
    expect(out.doc).toEqual(DEFAULT_CONTENT);
  });

  it('falls back to defaults on malformed JSON', () => {
    const out = resolveInitialContent('?preview=local', storageWith('{not json'));
    expect(out.isPreview).toBe(false);
    expect(out.doc).toEqual(DEFAULT_CONTENT);
  });

  it('ignores other preview values', () => {
    const out = resolveInitialContent('?preview=remote', storageWith('{}'));
    expect(out.isPreview).toBe(false);
  });
});
