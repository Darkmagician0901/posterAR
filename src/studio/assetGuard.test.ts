import { describe, expect, it } from 'vitest';
import { checkComposable } from './assetGuard';

describe('checkComposable', () => {
  it('accepts a webp', () => {
    expect(checkComposable('image/webp')).toEqual({ ok: true });
  });

  it('rejects a single-frame gif — frame art has nowhere for a GIF to land', () => {
    const result = checkComposable('image/gif');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.length).toBeGreaterThan(20);
    }
  });

  it('rejects an animated gif with a reason a person can act on', () => {
    const result = checkComposable('image/gif');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/gif/i);
      expect(result.reason.length).toBeGreaterThan(20);
    }
  });
});
