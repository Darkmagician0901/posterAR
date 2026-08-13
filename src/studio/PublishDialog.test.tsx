/**
 * Regression coverage for the post-publish success view when the server
 * returns a relative story URL.
 *
 * `POST /api/publish` returns `url: "/stories/<id>.json"` — relative, no
 * origin — whenever the server's STORY_PUBLIC_BASE_URL is unset (see
 * api/publish.ts). This never happened before the S3 migration: Vercel
 * Blob's `put()` always returned an absolute URL.
 *
 * Round 1 of this fix called `new URL(result.url).origin` directly in JSX
 * with no base argument, which throws `TypeError: Invalid URL` on a relative
 * string — crashing the dialog right after a successful publish.
 *
 * Round 1's fix resolved the relative URL against `window.location.origin`
 * instead, which stopped the crash but replaced it with a worse bug: it
 * showed the operator the *studio's own domain* as the value to put in
 * `VITE_STORY_BASE_URL`. That's never the bucket host, so a copied value
 * would silently misconfigure the viewer — a mistake that only surfaces
 * later, once every published story 404s and renders as a transparent gap.
 *
 * The correct behaviour (asserted below): when the URL is relative, do not
 * synthesise an origin at all. Tell the operator the server itself isn't
 * configured, and name `STORY_PUBLIC_BASE_URL` as what to set.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PublishDialog } from './PublishDialog';
import { useStudioDraft } from './studioDraftStore';
import { publishStory } from '@/services/storyApi';

// Scoped to this file only: tells React's `act` it may batch and flush
// synchronously in this happy-dom environment, suppressing an otherwise
// harmless "not configured to support act()" console warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/services/storyApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/storyApi')>('@/services/storyApi');
  return {
    ...actual,
    isStoryHostConfigured: () => false,
    publishStory: vi.fn(async () => ({
      ok: true,
      id: 'my-story',
      // The exact shape api/publish.ts sends when STORY_PUBLIC_BASE_URL is unset.
      url: '/stories/my-story.json',
      viewUrl: `${window.location.origin}/?s=my-story`,
    })),
  };
});

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
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

describe('PublishDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useStudioDraft.getState().reset();
  });

  /**
   * The passphrase was previously saved to sessionStorage *before* the request
   * went out, so a mistyped one was persisted and pre-filled on every retry.
   * The operator then resubmitted the same wrong value and read the repeated
   * "Not authorised." as the pipeline being broken rather than the secret being
   * wrong — which is exactly how it played out on 2026-08-13.
   */
  it('does not remember the passphrase when the server rejects it', async () => {
    vi.mocked(publishStory).mockResolvedValueOnce({ ok: false, error: 'Not authorised.' });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(<PublishDialog onClose={() => {}} />);
    });

    const secretInput = container.querySelector<HTMLInputElement>('#st-pub-secret')!;
    act(() => setInputValue(secretInput, 'wrong-passphrase'));

    const publishBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('PUBLISH'),
    )!;

    await act(async () => {
      publishBtn.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.sessionStorage.getItem('arcade.studio.secret')).toBeNull();
  });

  it('remembers the passphrase once the server accepts it', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(<PublishDialog onClose={() => {}} />);
    });

    const secretInput = container.querySelector<HTMLInputElement>('#st-pub-secret')!;
    act(() => setInputValue(secretInput, 'correct-passphrase'));

    const publishBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('PUBLISH'),
    )!;

    await act(async () => {
      publishBtn.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.sessionStorage.getItem('arcade.studio.secret')).toBe('correct-passphrase');
  });

  it('names STORY_PUBLIC_BASE_URL — and never the studio origin — when the server returns a relative story URL', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(<PublishDialog onClose={() => {}} />);
    });

    const secretInput = container.querySelector<HTMLInputElement>('#st-pub-secret')!;
    act(() => setInputValue(secretInput, 'shh'));

    const publishBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('PUBLISH'),
    )!;
    expect(publishBtn.disabled).toBe(false);

    // Would throw synchronously inside round 1's pre-fix JSX (new URL with no
    // base) the moment the success view rendered.
    await act(async () => {
      publishBtn.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const link = container.querySelector<HTMLInputElement>('#st-pub-link');
    expect(link?.value).toBe(`${window.location.origin}/?s=my-story`);

    // The real requirement: no synthesised origin anywhere in the dialog —
    // the studio's own domain must never be presented as if it were the
    // bucket host — and the actionable env var is named instead.
    expect(container.textContent).not.toContain(window.location.origin);
    expect(container.textContent).toContain('STORY_PUBLIC_BASE_URL');

    // No origin input/copy row rendered at all: there is nothing true to show.
    expect(container.querySelector('.st-warn input')).toBeNull();
  });

  /**
   * VITE_ASSET_BASE_URL is unset in this test environment, exactly as it is in
   * a build nobody configured. Unset, it is the one viewer setting that
   * refuses nothing and warns nowhere a person will see: the story publishes,
   * the link works, and every uploaded image renders as a transparent gap with
   * a single console.warn behind it. This dialog is the last moment an
   * operator is looking, so it must say so here.
   */
  it('names VITE_ASSET_BASE_URL too when the asset origin is unset', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(<PublishDialog onClose={() => {}} />);
    });

    const secretInput = container.querySelector<HTMLInputElement>('#st-pub-secret')!;
    act(() => setInputValue(secretInput, 'shh'));

    await act(async () => {
      container!.querySelector<HTMLButtonElement>('.st-btn.orange')!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const warn = container.querySelector('.st-warn')!;
    // Both unset settings named in the one panel — neither hidden by the other.
    expect(warn.textContent).toContain('VITE_ASSET_BASE_URL');
    expect(warn.textContent).toContain('STORY_PUBLIC_BASE_URL');
    expect(warn.textContent).toContain('2 setup steps left');
  });
});
