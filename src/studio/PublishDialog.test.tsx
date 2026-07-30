/**
 * Regression test for a crash in the post-publish success view.
 *
 * `POST /api/publish` returns `url: "/stories/<id>.json"` — relative, no
 * origin — whenever the server's STORY_PUBLIC_BASE_URL is unset (see
 * api/publish.ts). The "one setup step left" hint used to call
 * `new URL(result.url).origin` directly in JSX with no base argument, which
 * throws `TypeError: Invalid URL` on a relative string. That crashed the
 * dialog in exactly the fresh-deploy case it exists to help with, even
 * though the publish itself had already succeeded.
 *
 * This never happened before the S3 migration: Vercel Blob's `put()` always
 * returned an absolute URL.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PublishDialog } from './PublishDialog';
import { useStudioDraft } from './studioDraftStore';

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
    useStudioDraft.getState().reset();
  });

  it('renders the success view without throwing when the server returns a relative story URL', async () => {
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

    // Would throw synchronously inside the pre-fix JSX (new URL with no base)
    // the moment the success view rendered.
    await act(async () => {
      publishBtn.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const link = container.querySelector<HTMLInputElement>('#st-pub-link');
    expect(link?.value).toBe(`${window.location.origin}/?s=my-story`);

    // Resolved against the current origin rather than left blank or crashing.
    const hint = container.querySelector<HTMLInputElement>('.st-warn input');
    expect(hint?.value).toBe(window.location.origin);
  });
});
