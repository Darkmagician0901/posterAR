# MOD-M2 — a marker that means different things in different rooms

**Status: DESIGNED, NOT BUILT. Deliberately parked on 2026-08-26.**

This document exists so the thinking is not re-derived. Nothing here is
implemented, and the decision at the bottom is to *not* implement it yet.

Supersedes open item **MOD-M2** in `marker-layer-design.md` §12, and closes out
the analysis in §10a.2.

---

## 1. What is actually built today

- An exhibit (`?e=<id>`) lists story ids and **nothing else**. It deliberately
  does not name markers.
- The anchor lives on the **story** (`doc.anchor`), so a story owns its marker
  **globally**.
- `buildMarkerStoryMap` derives `markerId → story` at load time from the member
  stories, which is why the map cannot go stale (`marker-layer-design.md` §3.2).
- Uniqueness is enforced twice: `api/publish-exhibit.ts` refuses two stories on
  one marker with a **422**, and `buildMarkerStoryMap` keeps the first writer.

## 2. Requirements gathered (2026-08-26)

From the person who owns the installation, in their words and my reading of them:

| # | Requirement | Consequence |
|---|---|---|
| R1 | "different exhibits (rooms) are the roots of the dependency tree" | The exhibit is the owning entity, not the story |
| R2 | "a room can have multiple markers" | The existing multi-marker room and `markerSelection` dwell logic all stay |
| R3 | "only one marker in each tree, between trees we don't care" | Uniqueness narrows from **global** to **per-exhibit** |
| R4 | "make sure we don't do repeated storage in S3" | A story must NOT be duplicated per room — this rules out the naive implementation |

**Out of scope, explicitly.** Session state ("the third picture behaves
differently once you have seen the first two") and finer granularity (a marker
triggering something smaller than a whole five-frame story) were both considered
and dropped. Only the binding gains a scene dimension.

## 3. Three approaches considered

### A — Move the binding onto the exhibit *(recommended)*

The story becomes pure content with no `anchor`. The exhibit carries:

```jsonc
{
  "schemaVersion": 1,
  "id": "lobby",
  "title": "Lobby",
  "bindings": [
    { "storyId": "weekly-meeting", "markerId": "<sha256>", "thumbId": "<sha256>",
      "crop": { }, "local": { }, "widthInMarkers": 4 }
  ]
}
```

- Satisfies R1 literally: rooms are roots, stories are shared leaves.
- Satisfies R4 exactly: **one** story object in S3, referenced by many exhibits,
  each supplying its own size and offset. The same story can hang at 1× in one
  room and 7× in another with zero duplication.
- Satisfies R3 cheaply: uniqueness becomes a local check on one array, simpler
  than today's global rule.
- **Resolves §3.2 rather than violating it.** That comment forbids a *second
  copy* of the marker fact. Moving the anchor rather than copying it leaves
  exactly one copy, so the staleness argument dissolves.

**The cost, and it is the real one:** Studio restructures. Today you bind the
marker and drag the stage rectangle inside the **story** editor
(`MarkersPanel.tsx`, `StageEditor.tsx`, `studioDraftStore.ts`). Under A that
authoring moves into **exhibit** editing, because size and offset become
per-room facts. This is the largest single piece of work in MOD-M2 — larger than
the schema change itself.

### B — Keep `story.anchor`, add an override map on the exhibit

Cheap and backward compatible; Studio barely changes. **Rejected:** it creates
the two sources of truth §3.2 warns against, and it does not actually satisfy
R4's intent — geometry stays on the story, so one story still cannot be two
different sizes in two rooms.

### C — Split the anchor

`markerId`/`crop` stay with the marker image; `local`/`widthInMarkers` move to
the exhibit. Cleanest separation of concerns, but needs a third document type in
S3 and more moving parts than the problem justifies. **Rejected as A + ceremony.**

## 4. Consequences a revision must not miss

- **`markerStorage.ts` finds marker ids via `doc.anchor`** for S3 reachability.
  Move the anchor and that lookup must move too, or published markers become
  unreferenced and collectable. This is R4 in the opposite direction — not
  duplicate storage, but *premature deletion*.
- **The 422 narrows, it does not disappear.** "One marker means one thing" stays
  worth enforcing; it just becomes "…within this exhibit". A narrower rule than
  the one built.
- **`?s=` single-story links never use markers** — marker mode is entered only
  when an exhibit loads — so moving the anchor off the story does not break
  story links. Verified 2026-08-26.
- **Published documents.** Every live story carries an `anchor`. Under A it is
  ignored at read time. Per the standing instruction ("everything now existing
  has highest priority, any conflicts we kick them away and keep the current"),
  a revision drops conflicting published state rather than building migration
  machinery for it.

## 5. The visibility question — considered, then reverted

A change was briefly requested and then withdrawn on the same day: content
visible **only** while its marker is tracked, hidden the moment the print leaves
frame. It is recorded here because the analysis is worth keeping.

**Why it is not free.** MOD-M1 latches on tap and SLAM holds the placed matrix,
so pose noise never reaches the screen — `storyTile.ts`'s own comment is that a
placed matrix simply stays put, which is why latch is *less* code than follow.
Hiding on loss means tracking continuously, which puts jitter on screen the whole
time, and **jitter scales with `widthInMarkers`** (`marker-layer-design.md`
§10a.1): at 1:1 an angular error moves the art millimetres; at 7× it moves it
seven times as far, and the content furthest from the marker swings most.

It also means a visitor cannot walk up to or inside a large scene — the moment
the print leaves frame, the scene is gone.

**If it is ever revived:** smoothing goes into `composeSceneMatrix` and nowhere
else, because every marker pose passes through that one function by design. The
instrument for deciding how much smoothing is `src/xr/markerStability.ts`, which
measures wobble against a rolling window mean rather than frame-to-frame — it is
already merged and already tested, but is not yet wired into the shipping path.

## 6. Decision

**Not now.** The three capabilities MOD-M2 buys cannot manifest at the current
installation size (exhibit `eml`, one story, one marker), and the shipped marker
flow has still never been checked on a device.

**The trigger that changes this** is concrete and will announce itself: `markerId`
is a content hash of the PNG, so the moment the same printed image is wanted in
two exhibits, both produce the same id and `api/publish-exhibit.ts` returns a
**422** refusing the publish. That is a hard error at publish time, not a silent
degradation — when someone hits it, MOD-M2 is what unblocks them, and Approach A
is the design to build.

## 7. Next steps, in order, if it is revived

1. Move the binding: `ExhibitDoc.bindings`, `StoryDoc.anchor` removed.
2. Move the reachability lookup in `markerStorage.ts` off `doc.anchor`.
3. Narrow the publish refusal from global to per-exhibit.
4. Rebuild the marker/stage authoring inside exhibit editing (the big one).
5. `buildMarkerStoryMap` becomes a direct read instead of a derivation.

Related: `marker-layer-design.md` §3.2, §10a.2, §12 · `marker-locator-design.md`
· `docs/cleanup-backlog.md`
