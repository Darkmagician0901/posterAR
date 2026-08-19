/**
 * exhibitApi.ts — resolving and fetching a published exhibit.
 *
 * Mirrors `storyApi.ts`'s shape on purpose: the same `STORY_BASE_URL`
 * handling, the same "every failure returns null and never throws"
 * discipline, the same `credentials: 'omit'`. It is a sibling module rather
 * than a branch folded into `storyApi.ts` because `?e=` and `?s=` are
 * different kinds of load — see `resolveExhibitId`'s own comment for why
 * unifying them would make every existing `StorySource` consumer handle a
 * case it has no meaning for.
 *
 * Unlike a story, there is no bundled default exhibit to fall back to. An
 * exhibit link that fails to resolve or fetch simply is not an exhibit load;
 * the caller falls through to whatever `resolveStorySource` finds instead
 * (typically the bundled default story), the same way an unconfigured or
 * unreachable story host already degrades today.
 *
 * `buildMarkerStoryMap` is the one piece of real logic in this file, and it
 * is pure. See its own doc comment and `docs/marker-layer-design.md` §3.2 for
 * why the exhibit document itself never names a marker — the map has to be
 * derived here, at load time, or it would be a second copy of a fact the
 * story already owns.
 */

import type { StoryDoc } from '@/story/storyDoc';

/**
 * Base URL exhibits are published under — the same host stories use
 * (`docs/marker-layer-design.md` §3.1: `exhibits/<id>.json` sits beside
 * `stories/<id>.json`). Declared again here rather than imported from
 * `storyApi.ts` because that file's constant is a module-level value read
 * once from `import.meta.env`, not an exported binding — and even if it were
 * exported, sharing it would only tie this module's tests to storyApi.ts's
 * module-reset dance for no benefit. `exhibitApi.test.ts` overrides this the
 * same way `storyApi.test.ts` overrides its own copy: `vi.stubEnv` +
 * `vi.resetModules()` + a dynamic re-import.
 */
const STORY_BASE_URL: string = import.meta.env.VITE_STORY_BASE_URL || '';

/**
 * Accepted exhibit id shape: an operator-chosen slug, minted by exhibit
 * publish — the same shape `storyApi.ts`'s own `ID_PATTERN` accepts for a
 * story id, and the same shape `exhibitDoc.ts`'s (unexported) `ID_PATTERN`
 * enforces at publish time. This is deliberately NOT `ASSET_ID_RE`: that
 * pattern is for content-hash ids, and an exhibit id is a slug someone typed
 * a title into, exactly like a story id.
 *
 * A third copy of the same regex, rather than an import, for the same reason
 * `storyApi.ts` and `exhibitDoc.ts` already disagree about sharing theirs:
 * these are three call sites with three different jobs — a publish-time
 * refusal and two runtime resolution paths — and coupling them to one binding
 * would forbid any of them from ever needing to diverge.
 */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Decides whether the current URL asks for an exhibit.
 *
 * `?s=` always wins, whether or not its own value turns out to be valid: a
 * single-story link must keep opening that story even when an `?e=` also
 * happens to be present — a stale bookmark, a hand-edited query string, a
 * visitor who followed both kinds of link at once. Checking only for `?s=`'s
 * *presence*, not resolving it, keeps this function from having to know
 * `resolveStorySource`'s own validation rules — it only needs to know that a
 * `?s=` on the URL means this load's intent is "story", not "exhibit".
 *
 * @param search — `location.search`, with or without the leading '?'.
 * @returns The exhibit id, or null when there is nothing to load as an
 *   exhibit — no `?e=`, a malformed value, or `?s=` present. A malformed id is
 *   refused here, before it is ever handed to `fetchPublishedExhibit`, because
 *   it is about to become a path segment (`exhibits/<id>.json`); returning it
 *   unchecked would let an unvalidated string reach a fetch URL.
 */
export function resolveExhibitId(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  if (params.get('s') !== null) return null;

  const id = params.get('e');
  if (id === null) return null;

  const trimmed = id.trim().toLowerCase();
  // A malformed id is a typo or a probe, not a reason to fetch it.
  return ID_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Builds the public URL for a published exhibit document.
 *
 * @param id — Exhibit id, already validated by `resolveExhibitId`. This
 *   function does not re-validate: `resolveExhibitId` is the only place a raw
 *   query-string value is allowed to become an id, exactly as
 *   `publishedStoryUrl` trusts an id already passed through
 *   `resolveStorySource`.
 * @returns The absolute document URL.
 */
export function publishedExhibitUrl(id: string): string {
  return `${STORY_BASE_URL.replace(/\/$/, '')}/exhibits/${encodeURIComponent(id)}.json`;
}

/**
 * Fetches a published exhibit document.
 *
 * @param id — Exhibit id.
 * @returns The parsed document, or null on any failure (unconfigured host,
 *   network error, non-2xx, unparseable body). Never throws. The result is
 *   unvalidated JSON — the caller must run it through `validateExhibitDoc`
 *   before trusting any field in it; this function's only job is the fetch.
 */
export async function fetchPublishedExhibit(id: string): Promise<unknown | null> {
  if (STORY_BASE_URL === '') return null;
  try {
    const res = await fetch(publishedExhibitUrl(id), { credentials: 'omit' });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * Derives the marker→story map from the stories themselves.
 *
 * The exhibit deliberately does not store this (`docs/marker-layer-design.md`
 * §3.2): the story owns its marker, so the map is derived at load time and
 * cannot go stale.
 *
 * @param stories — The fetched member stories, in exhibit order.
 * @returns A map keyed by markerId — which is also the synthesized target's
 *   `name`, so an `imagefound` event resolves through this directly. A story
 *   with no anchor is skipped, not a reason to drop the exhibit: it is simply
 *   not reachable by scanning, and every other story in the room still works.
 */
export function buildMarkerStoryMap(stories: StoryDoc[]): Map<string, StoryDoc> {
  const map = new Map<string, StoryDoc>();
  for (const story of stories) {
    const id = story.anchor?.markerId;
    // First writer wins: publish refuses duplicates, but a story republished
    // after the exhibit can still collide, and blanking the room over it would
    // punish the visitor for the operator's mistake.
    if (id !== undefined && !map.has(id)) map.set(id, story);
  }
  return map;
}
