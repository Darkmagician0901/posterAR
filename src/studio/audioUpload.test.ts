import { describe, it, expect } from 'vitest';
import { validateAudioUpload, MAX_AUDIO_BYTES } from './audioUpload';

describe('validateAudioUpload', () => {
  it('accepts an audio file under the cap', () => {
    expect(validateAudioUpload({ size: 500_000, type: 'audio/mpeg' })).toEqual({ ok: true });
  });

  it('rejects a file over 2 MB, naming the actual size', () => {
    const r = validateAudioUpload({ size: 3_000_000, type: 'audio/mpeg' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('under 2 MB');
      expect(r.reason).toContain('2.9');
    }
  });

  it('rejects a non-audio file', () => {
    const r = validateAudioUpload({ size: 100, type: 'image/png' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('not audio');
  });

  it('treats exactly 2 MiB as allowed and one byte more as too big', () => {
    expect(MAX_AUDIO_BYTES).toBe(2 * 1024 * 1024);
    expect(validateAudioUpload({ size: MAX_AUDIO_BYTES, type: 'audio/wav' })).toEqual({ ok: true });
    expect(validateAudioUpload({ size: MAX_AUDIO_BYTES + 1, type: 'audio/wav' }).ok).toBe(false);
  });
});
