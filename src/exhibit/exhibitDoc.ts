/**
 * exhibitDoc.ts — a room of printed pictures.
 *
 * An exhibit is a list of stories and nothing else. It deliberately does NOT
 * name markers: `StoryDoc.anchor.markerId` already records which picture a
 * story belongs to, and storing the pair here too would be two copies of one
 * fact — which drift, leaving a rebound story whose exhibit still names the old
 * marker, a picture that silently does nothing. The marker→story map is derived
 * at load time instead and cannot go stale. See
 * `docs/marker-layer-design.md` §3.2.
 *
 * This module deliberately exports two functions that disagree about the same
 * rules — see the doc comments on `validateExhibitDoc` and `exhibitIssues`
 * below for why that disagreement is the point, not a bug to reconcile.
 */

/** Current schema version. */
export const EXHIBIT_SCHEMA_VERSION = 1;

/**
 * How many stories one exhibit may hold.
 *
 * The 8th Wall engine tracks roughly ten image targets simultaneously. Larger
 * rooms split into several exhibits; loading marker sets by proximity is not
 * built (`docs/marker-layer-design.md` §11).
 */
export const MAX_EXHIBIT_STORIES = 10;

/** A published exhibit. */
export interface ExhibitDoc {
  schemaVersion: 1;
  /** The `?e=` value. */
  id: string;
  title: string;
  /** Member stories, in the operator's order. */
  storyIds: string[];
  /**
   * Where to send a visitor who wants to leave feedback about this room.
   *
   * Optional, and absent rather than empty when unset — which is what keeps
   * `EXHIBIT_SCHEMA_VERSION` at 1: every exhibit published before this field
   * existed is still a valid document, so nothing has to be migrated.
   *
   * Always `https:` — see `safeFeedbackUrl`.
   */
  feedbackUrl?: string;
}

/**
 * Reads a submitted feedback link, or nothing.
 *
 * **`https:` only, and that is a security boundary rather than a preference.**
 * This value is read back out of an untrusted published document and becomes an
 * `href`, so a `javascript:` URL here would be script execution on tap, and a
 * `data:` URL a page of the attacker's choosing. Allowing exactly one scheme is
 * what makes the value safe to render at all. Plain `http:` is refused too, on
 * narrower grounds: it would walk a visitor off an https page onto a
 * downgraded one.
 *
 * Parsing with `URL` rather than a regex is deliberate — the parser is the
 * thing that actually knows what a scheme is, and a regex that tried to would
 * be a second, worse implementation of it.
 *
 * @param raw — The submitted value, of unknown shape.
 * @returns The URL when it is usable, or undefined. Never throws.
 */
export function safeFeedbackUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  try {
    // Relative values throw here, which is the intent: there is no base to
    // resolve against, and a feedback form is somewhere else by definition.
    return new URL(trimmed).protocol === 'https:' ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Accepted id shape, mirroring `ID_PATTERN` in `api/publish.ts`.
 *
 * Both the exhibit's own id and every story id it lists become path segments
 * (`exhibits/<id>.json`, `stories/<storyId>.json`) and are read back out of
 * untrusted published JSON, so the accepted shape has to be narrow enough that
 * no value passing it can express a scheme, a host, or a traversal. This is
 * NOT `ASSET_ID_RE` — that regex is for content-hash ids (64 hex characters);
 * these are operator-chosen slugs, the same shape the story publish endpoint
 * already accepts, so the pattern mirrors that endpoint's rather than
 * inventing a second unrelated one.
 */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Cleans a submitted story list without judging it.
 *
 * Splitting this out is what keeps `exhibitIssues` honest. Case and whitespace
 * are not mistakes an operator should be lectured about, so they are normalised
 * here — but the count is left alone and duplicates are left in, because those
 * are exactly the conditions `exhibitIssues` exists to refuse. Normalising them
 * away first would erase the evidence before the refusal ever ran.
 *
 * @param raw — The submitted `storyIds` value, of unknown shape.
 * @returns Every well-formed id, in submission order, still duplicated and
 *   still uncapped.
 */
export function normalizeStoryIds(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().toLowerCase())
    .filter((v) => ID_PATTERN.test(v));
}

/**
 * Reads an untrusted exhibit document.
 *
 * Degrades rather than refuses, per `docs/marker-layer-design.md` §8: a bad
 * story id is dropped on its own and an over-long list is truncated, so a
 * visitor gets the pictures that do work — ten working pictures rather than a
 * blank room — instead of nothing at all. Only an exhibit with no usable story
 * at all returns null, because there is then nothing to show.
 *
 * This is the runtime half of the pair. It intentionally disagrees with
 * `exhibitIssues` about what an over-long list deserves: here, past the visit,
 * there is no one to tell, so silent truncation is the kinder failure.
 *
 * **Because it truncates and de-duplicates, its output can never fail
 * `exhibitIssues`.** Anything wanting the operator-facing refusals must run
 * them on the submitted list first — see `api/publish-exhibit.ts`.
 *
 * @param raw — Parsed JSON of unknown shape.
 * @returns A well-formed exhibit, or null. Never throws.
 */
export function validateExhibitDoc(raw: unknown): ExhibitDoc | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === 'string' ? r.id.trim().toLowerCase() : '';
  if (!ID_PATTERN.test(id)) return null;

  const storyIds = [...new Set(normalizeStoryIds(r.storyIds))].slice(0, MAX_EXHIBIT_STORIES);

  if (storyIds.length === 0) return null;

  const title = typeof r.title === 'string' && r.title.trim() !== '' ? r.title : 'Untitled exhibit';

  const doc: ExhibitDoc = { schemaVersion: EXHIBIT_SCHEMA_VERSION, id, title, storyIds };

  // Degrade, don't refuse (§8): an unusable feedback link costs the visitor a
  // link, not the room. The operator-facing refusal lives in `exhibitIssues`.
  const feedbackUrl = safeFeedbackUrl(r.feedbackUrl);
  if (feedbackUrl !== undefined) doc.feedbackUrl = feedbackUrl;

  return doc;
}

/**
 * Lists why an exhibit cannot be published.
 *
 * The mirror image of `validateExhibitDoc`, and deliberately NOT unified with
 * it, per `docs/marker-layer-design.md` §8's asymmetry: at publish time the
 * operator is standing right there and can fix a problem, so every rule that
 * `validateExhibitDoc` would quietly degrade around is instead named here and
 * refused outright. The clearest case is the story-count cap — the same "more
 * than 10" condition that `validateExhibitDoc` truncates silently is exactly
 * the condition this function refuses and explains. Same rule, opposite
 * consequence, because the two functions run at different moments for
 * different audiences: `validateExhibitDoc` runs for a visitor who cannot act
 * on an error message; `exhibitIssues` runs for an operator who can.
 *
 * Story-level refusals — a story with no anchor, two stories on one marker, a
 * marker whose bytes were never uploaded — need the story documents, which
 * this function does not have access to, and are checked server-side in
 * `api/publish-exhibit.ts` instead.
 *
 * @param storyIds — The **submitted** list, as returned by
 *   `normalizeStoryIds`. Deliberately a bare list rather than an `ExhibitDoc`,
 *   because the only `ExhibitDoc` in reach is one `validateExhibitDoc`
 *   produced — and that function has already truncated and de-duplicated, so
 *   every rule below would be structurally unable to fire. Taking the list
 *   makes passing the wrong thing a type error instead of a silent no-op.
 * @param feedbackUrl — The **submitted** feedback link, if the operator entered
 *   one. Unlike `validateExhibitDoc`, which silently drops an unusable link,
 *   this names it: the operator is standing right there and would otherwise
 *   publish a room whose feedback button had quietly vanished.
 * @returns Human-readable issues; empty when publishable.
 */
export function exhibitIssues(storyIds: string[], feedbackUrl?: unknown): string[] {
  const issues: string[] = [];

  // An absent or blank link is simply no link, not a mistake to report.
  const submitted = typeof feedbackUrl === 'string' ? feedbackUrl.trim() : '';
  if (submitted !== '' && safeFeedbackUrl(submitted) === undefined) {
    issues.push(
      `The feedback link must be a full https:// address. "${submitted}" is not one.`,
    );
  }

  if (storyIds.length === 0) {
    issues.push('An exhibit needs at least one story.');
  }
  if (storyIds.length > MAX_EXHIBIT_STORIES) {
    issues.push(
      `An exhibit can hold ${MAX_EXHIBIT_STORIES} stories at most, because that is how many pictures the tracker can watch at once. This one has ${storyIds.length}.`,
    );
  }

  const seen = new Set<string>();
  for (const id of storyIds) {
    if (seen.has(id)) issues.push(`"${id}" is in this exhibit twice.`);
    seen.add(id);
  }

  return issues;
}
