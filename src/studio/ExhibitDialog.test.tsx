/**
 * Coverage for the exhibit passphrase's clear-on-reject rule.
 *
 * ExhibitDialog and PublishDialog share ONE sessionStorage key, because it is
 * one secret checked by one server. That sharing is what makes this worth
 * testing separately rather than trusting PublishDialog's own coverage: a
 * passphrase this dialog wrongly kept would come back pre-filled in the *other*
 * dialog, looking exactly like a correct one — the 2026-08-13 misdiagnosis
 * again, reached by a different door.
 *
 * The pair of cases below is the whole point. 401 means the key is wrong and
 * must go; 422 means the key was fine and the *exhibit* is wrong (a story not
 * bound to a picture), so discarding it would punish the operator for an
 * unrelated mistake and send them hunting for a passphrase problem that never
 * existed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ExhibitDialog } from './ExhibitDialog';
import { publishExhibit } from '@/services/storyApi';

// Scoped to this file: lets React's `act` batch and flush synchronously under
// happy-dom, suppressing the otherwise harmless "not configured for act()" warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/services/storyApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/storyApi')>('@/services/storyApi');
  return {
    ...actual,
    // False keeps the id-probe effect from firing, so these tests exercise the
    // passphrase path alone rather than a stubbed network.
    isStoryHostConfigured: () => false,
    publishExhibit: vi.fn(),
  };
});

const SECRET_KEY = 'arcade.studio.secret';

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setTextareaValue(el: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!
    .set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

/** Renders the dialog and fills in a publishable exhibit plus `secret`. */
async function publishWith(secret: string): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(<ExhibitDialog onClose={() => {}} />);
  });

  act(() => setInputValue(container!.querySelector<HTMLInputElement>('#st-ex-title')!, 'The Lobby'));
  act(() =>
    setTextareaValue(container!.querySelector<HTMLTextAreaElement>('#st-ex-ids')!, 'a-story'),
  );
  act(() => setInputValue(container!.querySelector<HTMLInputElement>('#st-ex-secret')!, secret));

  const btn = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('PUBLISH ROOM'),
  )!;
  await act(async () => {
    btn.click();
  });

  return container;
}

describe('ExhibitDialog passphrase handling', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.mocked(publishExhibit).mockReset();
  });

  it('discards a passphrase the server rejected, and empties the field', async () => {
    window.sessionStorage.setItem(SECRET_KEY, 'stale-wrong-key');
    vi.mocked(publishExhibit).mockResolvedValueOnce({
      ok: false,
      error: 'Not authorised.',
      unauthorised: true,
    });

    const el = await publishWith('stale-wrong-key');

    expect(window.sessionStorage.getItem(SECRET_KEY)).toBeNull();
    expect(el.querySelector<HTMLInputElement>('#st-ex-secret')!.value).toBe('');
  });

  it('keeps a good passphrase when the exhibit itself is refused', async () => {
    vi.mocked(publishExhibit).mockResolvedValueOnce({
      ok: false,
      error: '"a-story" is not attached to a picture, so nothing would ever trigger it.',
      unauthorised: false,
    });

    const el = await publishWith('correct-key');

    // Never stored — it is only remembered on success — but critically also not
    // wiped from the field, so the operator fixes the story and presses again.
    expect(el.querySelector<HTMLInputElement>('#st-ex-secret')!.value).toBe('correct-key');
  });

  it('remembers the passphrase only once the server has accepted it', async () => {
    vi.mocked(publishExhibit).mockResolvedValueOnce({
      ok: true,
      id: 'the-lobby',
      url: 'https://blob.example/exhibits/the-lobby.json',
      viewUrl: `${window.location.origin}/?e=the-lobby`,
    });

    await publishWith('correct-key');

    expect(window.sessionStorage.getItem(SECRET_KEY)).toBe('correct-key');
  });
});
