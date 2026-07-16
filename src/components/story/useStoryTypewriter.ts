/**
 * useStoryTypewriter — types a narration string out character-by-character.
 *
 * Ports the prototype's `typeLine` effect into a React hook. Resets and
 * restarts whenever `text` changes (i.e. on each era), and exposes whether it
 * has finished so the overlay can reveal the NEXT button only once the line is
 * fully typed.
 */

import { useEffect, useRef, useState } from 'react';

/** Milliseconds between characters. ~22ms reads like a calm docent. */
const CHAR_INTERVAL_MS = 22;

/**
 * @param text — The full narration line to type out.
 * @param enabled — When false, the effect is idle (e.g. before placement).
 * @returns `{ shown, done, skip }` — the substring typed so far, whether the
 *   full line is shown, and a `skip()` to reveal it all immediately.
 */
export function useStoryTypewriter(
  text: string,
  enabled: boolean,
): { shown: string; done: boolean; skip: () => void } {
  const [shown, setShown] = useState('');
  const [done, setDone] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!enabled || !text) {
      setShown('');
      setDone(false);
      return;
    }

    setShown('');
    setDone(false);
    let i = 0;
    timerRef.current = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        setDone(true);
      }
    }, CHAR_INTERVAL_MS);

    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [text, enabled]);

  const skip = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setShown(text);
    setDone(true);
  };

  return { shown, done, skip };
}
