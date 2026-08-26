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

import { validateStoryDoc, type StoryDoc } from '@/story/storyDoc';
import { validateExhibitDoc } from '@/exhibit/exhibitDoc';
import { fetchPublishedStory } from './storyApi';

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

/**
 * Known-good fallback for member stories.
 *
 * Deliberately empty rather than the bundled demo: a story whose published
 * JSON failed to parse must not silently become the five-era demo attached to
 * somebody's printed picture. An empty frame list is then detectable, and the
 * story is dropped as unreachable instead.
 */
const EMPTY_STORY: StoryDoc = {
  schemaVersion: 4,
  id: 'unreadable',
  title: '',
  loc: '',
  intro: { title: '', subtitle: '' },
  outro: { title: '', subtitle: '' },
  frames: [],
};

/** A loaded room: the stories in it, keyed by the picture that triggers each. */
export interface LoadedExhibit {
  id: string;
  title: string;
  /**
   * markerId → story. The markerId is also the engine's target `name`, so an
   * `imagefound` event resolves through this with no second lookup.
   */
  markerStories: Map<string, StoryDoc>;
  /** Ids the exhibit named that could not be fetched, or carry no picture. */
  unreachable: string[];
  /**
   * Where to send a visitor who wants to leave feedback, if the operator set
   * one. Already validated to be `https:` by `validateExhibitDoc`, so it is
   * safe to render as an href without re-checking here.
   */
  feedbackUrl?: string;
}

/**
 * Loads the exhibit this URL asks for, if any.
 *
 * Degrades at every step rather than refusing (§8): a story that 404s or has
 * no picture attached is dropped and named in `unreachable`, and the rest of
 * the room still scans. Only "nothing usable at all" returns null, because
 * there is then nothing to point a phone at.
 *
 * Member stories are fetched in parallel — a room holds at most ten and each
 * is kilobytes, so round trips dominate. Their *assets* are deliberately not
 * fetched: those are megabytes, and a visitor may never walk to half the
 * pictures. Asset resolution stays lazy, on first detection.
 *
 * @param search — `location.search`.
 * @returns The loaded room, or null when this is not an exhibit link or
 *   nothing in it is reachable. Never throws.
 */
export async function loadExhibitForLocation(search: string): Promise<LoadedExhibit | null> {
  const id = resolveExhibitId(search);
  if (id === null) return null;

  const raw = await fetchPublishedExhibit(id);
  if (raw === null) return null;

  const doc = validateExhibitDoc(raw);
  if (doc === null) return null;

  const fetched = await Promise.all(
    doc.storyIds.map(async (storyId) => ({
      storyId,
      raw: await fetchPublishedStory(storyId),
    })),
  );

  const stories: StoryDoc[] = [];
  const unreachable: string[] = [];

  for (const { storyId, raw: storyRaw } of fetched) {
    if (storyRaw === null) {
      unreachable.push(storyId);
      continue;
    }
    const story = validateStoryDoc(storyRaw, EMPTY_STORY);
    if (story.anchor === undefined || story.frames.length === 0) {
      unreachable.push(storyId);
      continue;
    }
    stories.push(story);
  }

  const markerStories = buildMarkerStoryMap(stories);
  if (markerStories.size === 0) return null;

  const loaded: LoadedExhibit = { id: doc.id, title: doc.title, markerStories, unreachable };
  if (doc.feedbackUrl !== undefined) loaded.feedbackUrl = doc.feedbackUrl;
  return loaded;
}
