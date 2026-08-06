import { describe, it, expect, beforeEach } from 'vitest';
import {
  IS_DEMO,
  INTRO_DISMISSED_KEY,
  NARROW_VIEWPORT_PX,
  isNarrowViewport,
  readIntroDismissed,
  dismissIntro,
  resetDemo,
} from './demoMode';
import { LOCAL_DRAFT_KEY } from '@/services/storyApi';

describe('IS_DEMO', () => {
  it('is false everywhere except the standalone demo build', () => {
    expect(IS_DEMO).toBe(false);
  });
});

describe('isNarrowViewport', () => {
  it('flags a phone-width viewport', () => {
    expect(isNarrowViewport(430)).toBe(true);
  });

  it('passes a laptop-width viewport', () => {
    expect(isNarrowViewport(1440)).toBe(false);
  });

  it('treats the threshold itself as wide enough', () => {
    expect(isNarrowViewport(NARROW_VIEWPORT_PX)).toBe(false);
  });
});

describe('intro dismissal', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts undismissed on a first visit', () => {
    expect(readIntroDismissed(window.localStorage)).toBe(false);
  });

  it('remembers a dismissal', () => {
    dismissIntro(window.localStorage);
    expect(readIntroDismissed(window.localStorage)).toBe(true);
  });

  it('reads any other stored value as undismissed', () => {
    window.localStorage.setItem(INTRO_DISMISSED_KEY, 'maybe');
    expect(readIntroDismissed(window.localStorage)).toBe(false);
  });

  it('treats unreadable storage as undismissed rather than throwing', () => {
    const blocked = {
      getItem() {
        throw new Error('storage blocked');
      },
    } as unknown as Storage;
    expect(readIntroDismissed(blocked)).toBe(false);
  });

  it('survives storage that refuses writes', () => {
    const blocked = {
      setItem() {
        throw new Error('quota exceeded');
      },
    } as unknown as Storage;
    expect(() => dismissIntro(blocked)).not.toThrow();
  });
});

describe('resetDemo', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('clears the studio draft so the default story comes back', () => {
    window.localStorage.setItem(LOCAL_DRAFT_KEY, '{"title":"poked at"}');
    resetDemo(window.localStorage);
    expect(window.localStorage.getItem(LOCAL_DRAFT_KEY)).toBeNull();
  });

  it('leaves the intro dismissal alone', () => {
    dismissIntro(window.localStorage);
    resetDemo(window.localStorage);
    expect(readIntroDismissed(window.localStorage)).toBe(true);
  });

  it('is a no-op when there is no draft', () => {
    expect(() => resetDemo(window.localStorage)).not.toThrow();
  });
});
