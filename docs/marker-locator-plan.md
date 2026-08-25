# Marker-as-Locator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a small printed picture *locate* a much larger AR scene, and replace
the ground reticle in marker mode with a lock-on-the-print → tap-to-begin flow.

**Architecture:** Two fields that already exist on `StoryAnchor` — `widthInMarkers`
and `local.position` — stop being forced to constants and start being authored, by
dragging and resizing a marker rectangle on the existing landscape stage. At
runtime the scene is sized `markerWidth × widthInMarkers` and centred at
`markerPos + markerRot · (offset × markerWidth)`, latched once on tap and then held
by SLAM. Every new piece of arithmetic lands in a pure, unit-tested module; only
the wiring is untestable.

**Tech Stack:** TypeScript (strict), React 18, Zustand 4, plain three.js, 8th Wall
(XR8) self-hosted engine, vitest ^4.1.8 + happy-dom ^20.9.0.

**Spec:** `docs/marker-locator-design.md`

## Global Constraints

- **Commit messages:** one plain, readable sentence — imperative, capitalized, **no
  trailing period**, **no `feat:`/`fix:` prefix or scope**, one line, no body. Write
  it so a non-engineer skimming GitHub history understands what changed and why it
  matters.
- **No `Co-Authored-By: Claude` trailer** on any commit.
- **Plain three.js only.** Do NOT add `@react-three/*` or `@use-gesture/*`.
- **TypeScript strict mode; no `any`** without a comment justifying it.
- `schemaVersion` **stays 4**. No migration, no version bump (spec §2, §2.2).
- **`local.rotation` stays identity** and **`local.position[2]` stays 0** — this
  design is coplanar by construction (spec §2.1, §8).
- **Axis convention** (spec §2.1): `[ox, oy]` is the vector **from the marker to the
  scene's centre**, in the marker's own frame, `+x` right and `+y` up as seen by
  someone facing the print.
- **Ground mode (no `?e=`) must stay behaviourally unchanged.** Every branch added
  in this plan is gated on marker mode being active.
- Verify with `npm run type-check`, `npm run lint`, and `npm run test`. All three
  must pass before any commit.
- Work happens on branch `feat/marker-lock-ux`.

---

## File Structure

**New files**

| File | Responsibility |
|---|---|
| `src/markers/markerLock.ts` | Pure lock state machine: searching / locked / started, and what a seen, lost, or tapped marker does to each. |
| `src/markers/markerLock.test.ts` | Its tests. |
| `src/xr/markerFrame.ts` | Engine-agnostic three.js corner-bracket outline drawn on the tracked print, plus the pure corner geometry it is built from. |
| `src/xr/markerFrame.test.ts` | Tests for the corner geometry. |
| `src/studio/markerOverlayEdit.ts` | Pure maths for the draggable marker rectangle, and the conversion between a stage rectangle and `{widthInMarkers, local.position}`. |
| `src/studio/markerOverlayEdit.test.ts` | Its tests, including the round trip. |
| `src/components/story/StoryOverlay.test.tsx` | Pins the prompt copy in both modes. |

**Modified files**

| File | Change |
|---|---|
| `src/story/storyDoc.ts` | `StoryAnchor` widens; anchor bounds constants; `sanitizeAnchor` bounds instead of forces. |
| `src/markers/markerPose.ts` | `composeMarkerMatrix` becomes `composeSceneMatrix`, adding the rotated offset. |
| `src/studio/studioDraftStore.ts` | `bindMarker` writes the new authoring defaults; new `setMarkerLayout` action. |
| `src/studio/stageGeometry.ts` | `MARKER_FRONT` removed. |
| `src/studio/StageEditor.tsx` | One stage always; the ghost backdrop becomes a draggable, resizable overlay; print-width aid. |
| `src/studio/studio.css` | Styles for the overlay box, grip, and aid. |
| `src/components/story/StoryOverlay.tsx` | Marker-mode prompt copy. |
| `src/components/ar/StoryARExperience.tsx` | No reticle or hit-test in marker mode; lock frame; latch on tap. |
| `docs/marker-layer-design.md` | MOD-M1 closed; §7.2 and §11 superseded. |
| `docs/marker-layer-plan.md` | Task 9 marked superseded. |
| `CLAUDE.md` | Test counts refreshed. |

**Why these boundaries:** each new module is arithmetic with no DOM and no engine,
which is the line `docs/arcade-architecture.md` §12 already draws — pure logic is
unit-tested, engine and camera behaviour is verified on device. The three wiring
files (`StageEditor.tsx`, `StoryARExperience.tsx`, `StoryOverlay.tsx`) get no new
maths of their own, so nothing load-bearing lands where a test cannot reach it.

---

## Task 1: Widen the anchor schema and bound it

The two fields have always existed and have always been overwritten with constants.
This task stops the overwriting and replaces it with bounds. It goes first because
every later task's types depend on it.

**Files:**
- Modify: `src/story/storyDoc.ts` (`LocalTransform` doc, `StoryAnchor`, `sanitizeAnchor`)
- Test: `src/story/storyDoc.test.ts` (the existing `describe('anchor')` block)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export const DEFAULT_WIDTH_IN_MARKERS = 1`
  - `export const MAX_WIDTH_IN_MARKERS = 100`
  - `export const MAX_OFFSET_IN_MARKERS = 100`
  - `interface StoryAnchor` with `widthInMarkers: number`, `local: LocalTransform`,
    `mode: 'latch' | 'follow'`

- [ ] **Step 1: Write the failing tests**

In `src/story/storyDoc.test.ts`, **replace** the test named
`'forces identity local and widthInMarkers 1, which is all v1 renders'` and the one
named `'normalises an unknown mode to follow rather than dropping the anchor'` with
the block below. Leave every other test in `describe('anchor')` untouched — the
`crop` and `anchor` fixtures at the top of that block are reused as-is.

```ts
  it('keeps an authored scene width', () => {
    const doc = validateStoryDoc(
      { ...DEFAULT_STORY, anchor: { ...anchor, widthInMarkers: 7.25 } },
      DEFAULT_STORY,
    );
    expect(doc.anchor?.widthInMarkers).toBeCloseTo(7.25, 10);
  });

  it('falls back to 1 for a scene width outside (0, 100]', () => {
    // 1 is the pre-existing behaviour — art covering the marker — so the
    // fallback degrades to something that has always worked rather than to
    // an invisible or absurd scene.
    for (const bad of [0, -3, 101, NaN, Infinity, 'big', null, undefined]) {
      const doc = validateStoryDoc(
        { ...DEFAULT_STORY, anchor: { ...anchor, widthInMarkers: bad } },
        DEFAULT_STORY,
      );
      expect(doc.anchor?.widthInMarkers).toBe(1);
    }
  });

  it('keeps an in-plane offset, which is how a print hangs off-centre', () => {
    const doc = validateStoryDoc(
      {
        ...DEFAULT_STORY,
        anchor: { ...anchor, local: { position: [-0.9, 0.6, 0], rotation: [0, 0, 0, 1] } },
      },
      DEFAULT_STORY,
    );
    expect(doc.anchor?.local.position[0]).toBeCloseTo(-0.9, 10);
    expect(doc.anchor?.local.position[1]).toBeCloseTo(0.6, 10);
  });

  it('clamps a wild offset rather than dropping the whole anchor', () => {
    const doc = validateStoryDoc(
      {
        ...DEFAULT_STORY,
        anchor: { ...anchor, local: { position: [1e9, -1e9, 0], rotation: [0, 0, 0, 1] } },
      },
      DEFAULT_STORY,
    );
    expect(doc.anchor?.local.position[0]).toBe(100);
    expect(doc.anchor?.local.position[1]).toBe(-100);
  });

  it('forces z to 0, because this design is coplanar by construction', () => {
    const doc = validateStoryDoc(
      {
        ...DEFAULT_STORY,
        anchor: { ...anchor, local: { position: [1, 2, 3], rotation: [0, 0, 0, 1] } },
      },
      DEFAULT_STORY,
    );
    expect(doc.anchor?.local.position[2]).toBe(0);
  });

  it('forces rotation to identity — in-plane rotation is not built', () => {
    const doc = validateStoryDoc(
      {
        ...DEFAULT_STORY,
        anchor: { ...anchor, local: { position: [0, 0, 0], rotation: [0.7, 0, 0, 0.7] } },
      },
      DEFAULT_STORY,
    );
    expect(doc.anchor?.local.rotation).toEqual([0, 0, 0, 1]);
  });

  it('forces mode to latch, including on documents published as follow', () => {
    // Every story published before this change carries mode: 'follow', and no
    // code path renders follow any more. Honouring it would render nothing.
    for (const m of ['follow', 'latch', 'wobble', undefined]) {
      const doc = validateStoryDoc({ ...DEFAULT_STORY, anchor: { ...anchor, mode: m } }, DEFAULT_STORY);
      expect(doc.anchor?.mode).toBe('latch');
    }
  });

  it('reads a legacy 1:1 anchor as exactly what it means today', () => {
    // Backward compatibility (spec §2.2): every published story carries
    // widthInMarkers 1 and a zero offset, which under the new maths still
    // means artwork covering the marker.
    const doc = validateStoryDoc({ ...DEFAULT_STORY, anchor }, DEFAULT_STORY);
    expect(doc.anchor?.widthInMarkers).toBe(1);
    expect(doc.anchor?.local.position).toEqual([0, 0, 0]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/story/storyDoc.test.ts`
Expected: FAIL — `'keeps an authored scene width'` reports `1` where `7.25` was
expected, and `'forces mode to latch…'` reports `'follow'`.

- [ ] **Step 3: Widen the types**

In `src/story/storyDoc.ts`, replace the `LocalTransform` interface with:

```ts
/** A rigid transform in the marker's own space. */
export interface LocalTransform {
  /**
   * Where the scene's centre sits relative to the marker, in MARKER-WIDTHS —
   * not metres. `[ox, oy, 0]` points from the marker to the scene's centre in
   * the marker's own frame, `+x` right and `+y` up as seen by someone facing
   * the print. `z` is always 0: the scene is coplanar with the print.
   */
  position: [number, number, number];
  /** Rotation as a quaternion, `[x, y, z, w]`. Identity — see `sanitizeAnchor`. */
  rotation: [number, number, number, number];
}
```

Replace the whole `StoryAnchor` interface and the comment block above it with:

```ts
/**
 * What real-world thing a story is attached to.
 *
 * Absent means today's behaviour: a centre-screen ground hit-test and
 * tap-to-place. The five-era landscape story has no anchor and is untouched.
 *
 * The marker LOCATES the scene; it does not size it. A small print can carry
 * artwork many times its own width — see `docs/marker-locator-design.md`.
 */
export interface StoryAnchor {
  type: 'marker';
  /** SHA-256 of the luminance PNG — the image the tracker matches. */
  markerId: string;
  /** SHA-256 of the thumbnail PNG, addressed on its own bytes. */
  thumbId: string;
  /** The crop the marker was cut with; feeds the synthesized target. */
  crop: MarkerCrop;
  /** Marker → scene-centre offset, in marker-widths. */
  local: LocalTransform;
  /** How many marker-widths wide the whole scene is. Bounded to (0, 100]. */
  widthInMarkers: number;
  /**
   * Always `'latch'` in practice: the pose is taken once, on the tap that
   * starts the story, and SLAM holds the scene afterwards. `'follow'` stays in
   * the type because the type is the documented vocabulary, but nothing
   * produces it and nothing renders it.
   */
  mode: 'latch' | 'follow';
}
```

Immediately after the `STORY_SCHEMA_VERSION` declaration, add the bounds:

```ts
/**
 * Anchor bounds, kept in the file that ENFORCES them so a Studio control and
 * the validator cannot drift apart. Studio imports these to size its own
 * limits, so anything the UI can author is something `sanitizeAnchor` accepts
 * back.
 */

/** Scene exactly covers the marker. The safe fallback, and the legacy value. */
export const DEFAULT_WIDTH_IN_MARKERS = 1;
/** A 100 mm print locating a 10 m scene. Beyond this is a mistake, not intent. */
export const MAX_WIDTH_IN_MARKERS = 100;
/** Same reasoning, applied to how far off-centre the print may hang. */
export const MAX_OFFSET_IN_MARKERS = 100;
```

- [ ] **Step 4: Replace the forcing in `sanitizeAnchor`**

In `src/story/storyDoc.ts`, replace the final `return { ... }` of `sanitizeAnchor`
(the block that currently sets `local: IDENTITY_LOCAL`, `widthInMarkers: 1`,
`mode: 'follow'`) with:

```ts
  // Bounded, not forced. These now arrive both from Studio and from published
  // JSON, which is untrusted input — but a bad value here should degrade to
  // the legacy 1:1 behaviour rather than drop a binding that is otherwise
  // sound, because a dropped anchor means a picture that does nothing at all.
  const k = num(r.widthInMarkers, DEFAULT_WIDTH_IN_MARKERS);
  const widthInMarkers = k > 0 && k <= MAX_WIDTH_IN_MARKERS ? k : DEFAULT_WIDTH_IN_MARKERS;

  const localBag = bag(r.local);
  const rawPosition: unknown[] = Array.isArray(localBag.position)
    ? (localBag.position as unknown[])
    : [];
  const offset = (v: unknown): number => {
    const n = num(v, 0);
    return Math.max(-MAX_OFFSET_IN_MARKERS, Math.min(MAX_OFFSET_IN_MARKERS, n));
  };

  return {
    type: 'marker',
    markerId,
    thumbId,
    crop,
    local: {
      // z forced to 0 and rotation to identity: this design is coplanar by
      // construction, so a non-zero z or a real rotation from anywhere means
      // something upstream is wrong, and rendering it would put art where no
      // Studio control can put it back.
      position: [offset(rawPosition[0]), offset(rawPosition[1]), 0],
      rotation: [0, 0, 0, 1],
    },
    widthInMarkers,
    // Forced. Every story published before this change carries 'follow', and
    // there is no longer a follow code path (marker-locator-design §5.2), so
    // honouring a stored 'follow' would mean rendering nothing.
    mode: 'latch',
  };
```

`num` already returns its fallback for non-numbers and non-finite numbers, so
`NaN`, `Infinity`, `'big'`, `null` and `undefined` all land on
`DEFAULT_WIDTH_IN_MARKERS` through the `k > 0 && k <= MAX_WIDTH_IN_MARKERS` test.

`IDENTITY_LOCAL` stays exported and unchanged — `studioDraftStore.ts` and
`src/services/exhibitApi.test.ts` still reference it, and it is still exactly the
zero offset with identity rotation.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/story/storyDoc.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite, the linter and the type-checker**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all pass. `src/markers/markerTarget.test.ts` and
`src/services/exhibitApi.test.ts` build anchors with `mode: 'follow'` as *input* and
never assert on the sanitized `mode`, so they are unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/story/storyDoc.ts src/story/storyDoc.test.ts
git commit -m "Let a story say how much larger than its printed marker the artwork is"
```

---

## Task 2: Place the scene from the marker, offset and all

**Files:**
- Modify: `src/markers/markerPose.ts`
- Modify: `src/components/ar/StoryARExperience.tsx` (line 21 import, line 289 call site — so the build stays green)
- Test: `src/markers/markerPose.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_WIDTH_IN_MARKERS` from Task 1.
- Produces:
  ```ts
  export function composeSceneMatrix(
    position: { x: number; y: number; z: number },
    rotation: { w: number; x: number; y: number; z: number },
    markerWidth: number,
    offset: readonly [number, number],
  ): Float32Array
  ```
  `composeMarkerMatrix` no longer exists. `tileSize` and `hasDimensions` are unchanged.

- [ ] **Step 1: Write the failing tests**

In `src/markers/markerPose.test.ts`, change the import block to:

```ts
import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { composeSceneMatrix, DEFAULT_WIDTH_IN_MARKERS, hasDimensions, tileSize } from './markerPose';
```

Then replace the whole `describe('composeMarkerMatrix', ...)` block with:

```ts
describe('composeSceneMatrix', () => {
  const identity = { w: 1, x: 0, y: 0, z: 0 };
  const noOffset = [0, 0] as const;
  /** A print yawed 90 degrees: its local +x now points along world -z. */
  const yaw90 = { w: Math.SQRT1_2, x: 0, y: Math.SQRT1_2, z: 0 };

  const positionOf = (m: Float32Array): Vector3 =>
    new Vector3().setFromMatrixPosition(new Matrix4().fromArray(Array.from(m)));

  it('puts the scene on the marker when there is no offset', () => {
    const pos = positionOf(composeSceneMatrix({ x: 1, y: 2, z: -3 }, identity, 0.1, noOffset));
    expect(pos.x).toBeCloseTo(1, 10);
    expect(pos.y).toBeCloseTo(2, 10);
    expect(pos.z).toBeCloseTo(-3, 10);
  });

  it('offsets in marker-widths, so the same numbers work at any print size', () => {
    // Half a marker-width right and one up, on a marker reported 0.2 wide.
    const pos = positionOf(composeSceneMatrix({ x: 0, y: 0, z: 0 }, identity, 0.2, [0.5, 1]));
    expect(pos.x).toBeCloseTo(0.1, 10);
    expect(pos.y).toBeCloseTo(0.2, 10);
    expect(pos.z).toBeCloseTo(0, 10);
  });

  it('rotates the offset into world space — the mistake this maths invites', () => {
    // One marker-width to the PRINT's right, on a print yawed 90 degrees, must
    // move the scene along world -z, not along world +x. Dropping the rotation
    // looks perfectly correct on a print hanging square in front of whoever is
    // testing, and is wrong on every angled wall.
    const pos = positionOf(composeSceneMatrix({ x: 0, y: 0, z: 0 }, yaw90, 0.1, [1, 0]));
    expect(pos.x).toBeCloseTo(0, 6);
    expect(pos.y).toBeCloseTo(0, 6);
    expect(pos.z).toBeCloseTo(-0.1, 6);
  });

  it("keeps the marker's own orientation", () => {
    const m = new Matrix4().fromArray(
      Array.from(composeSceneMatrix({ x: 0, y: 0, z: 0 }, yaw90, 0.1, noOffset)),
    );
    const forward = new Vector3(0, 0, 1).applyMatrix4(m);
    expect(forward.x).toBeCloseTo(1, 6);
    expect(forward.z).toBeCloseTo(0, 6);
  });

  it('is rigid — unit scale, whatever the engine reports separately', () => {
    // The engine's own `scale` estimate wobbles by a percent or two. Folding
    // it in would rescale the artwork every frame, which reads as breathing.
    const m = new Matrix4().fromArray(
      Array.from(
        composeSceneMatrix({ x: 0, y: 0, z: 0 }, { w: 0.7071, x: 0.7071, y: 0, z: 0 }, 0.1, noOffset),
      ),
    );
    const scale = new Vector3().setFromMatrixScale(m);
    expect(scale.x).toBeCloseTo(1, 6);
    expect(scale.y).toBeCloseTo(1, 6);
    expect(scale.z).toBeCloseTo(1, 6);
  });

  it('stays rigid even when the quaternion has drifted off unit length', () => {
    // An un-normalised quaternion would smuggle a scale into a matrix this
    // function promises is rigid — a slow drift rather than an obvious bug.
    const m = new Matrix4().fromArray(
      Array.from(composeSceneMatrix({ x: 0, y: 0, z: 0 }, { w: 2, x: 0, y: 0, z: 0 }, 0.1, noOffset)),
    );
    const scale = new Vector3().setFromMatrixScale(m);
    expect(scale.x).toBeCloseTo(1, 6);
    expect(scale.y).toBeCloseTo(1, 6);
    expect(scale.z).toBeCloseTo(1, 6);
  });

  it('returns the 16 column-major floats StoryTile.place expects', () => {
    const out = composeSceneMatrix({ x: 0, y: 0, z: 0 }, identity, 0.1, noOffset);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out).toHaveLength(16);
  });

  it('treats a non-finite marker width as no offset at all', () => {
    // scaledWidth is FLAT-only. hasDimensions guards the call site, but a NaN
    // reaching here would place the scene at NaN, where it silently never
    // appears — the most confusing failure available.
    const pos = positionOf(composeSceneMatrix({ x: 1, y: 1, z: 1 }, identity, NaN, [5, 5]));
    expect(pos.x).toBeCloseTo(1, 10);
    expect(pos.y).toBeCloseTo(1, 10);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/markers/markerPose.test.ts`
Expected: FAIL — `composeSceneMatrix is not a function`.

- [ ] **Step 3: Replace `composeMarkerMatrix` with `composeSceneMatrix`**

In `src/markers/markerPose.ts`, change the import line and the
`DEFAULT_WIDTH_IN_MARKERS` declaration. Replace

```ts
import { Matrix4, Quaternion, Vector3 } from 'three';
```

with

```ts
import { Matrix4, Quaternion, Vector3 } from 'three';
import { DEFAULT_WIDTH_IN_MARKERS } from '@/story/storyDoc';

export { DEFAULT_WIDTH_IN_MARKERS };
```

and delete the existing `export const DEFAULT_WIDTH_IN_MARKERS = 1;` together with
its doc comment (the one beginning "v1 multiplier: artwork exactly covers the
printed picture" — it says "This is the value MOD-M1 exists to change", which this
plan is doing). Put this comment above the re-export instead:

```ts
/**
 * The multiplier a story falls back to: artwork exactly covering the marker.
 *
 * Re-exported from `storyDoc.ts`, which is where the bound is enforced, so the
 * geometry and the validator cannot disagree. It is the LEGACY meaning, not
 * the intended one — a real installation uses a small print locating a much
 * larger scene, which is a multiplier well above 1.
 */
```

`storyDoc.ts` has no runtime dependency on `markers/` (its only import from there
is `import type { MarkerCrop }`), so this adds no import cycle.

Then replace the whole `composeMarkerMatrix` function, doc comment included, with:

```ts
/**
 * Builds the scene's world transform from a marker's reported pose.
 *
 * The marker LOCATES the scene; it does not size it. Size comes from
 * `tileSize`; this decides where the centre goes.
 *
 * **Rotating the offset is load-bearing.** The offset is expressed in the
 * marker's own frame, so it must be rotated into world space before it is
 * added. Omit that and the scene slides in a fixed world direction whatever
 * way the print faces — which looks perfectly correct on a print hanging
 * square in front of whoever is testing, and is wrong on every angled wall.
 * `markerPose.test.ts` pins it with a deliberately yawed marker.
 *
 * **Scale is deliberately excluded** — the matrix is rigid, position and
 * rotation only. The engine also reports a `scale` estimate, and folding it in
 * would mean a wobble of a percent or two rescaling the artwork every frame,
 * which reads as breathing. `marker-testbed-design.md` §5 agrees.
 *
 * This is also the single point every marker pose passes through on its way to
 * the tile, so if a large scene turns out to swing on device, a smoothing step
 * goes here and nowhere else (`marker-locator-design.md` §4.1).
 *
 * @param position — The engine's world position for the marker.
 * @param rotation — The engine's world orientation quaternion.
 * @param markerWidth — The marker's reported width, in the engine's own units.
 *   Non-finite values are treated as 0, which reduces the offset to nothing
 *   rather than placing the scene at NaN, where it would never appear.
 * @param offset — `[ox, oy]` from the anchor's `local.position`, in
 *   marker-widths: the vector from the marker to the scene's centre, `+x`
 *   right and `+y` up as seen by someone facing the print.
 * @returns 16 column-major floats, the form `StoryTile.place` expects.
 */
export function composeSceneMatrix(
  position: { x: number; y: number; z: number },
  rotation: { w: number; x: number; y: number; z: number },
  markerWidth: number,
  offset: readonly [number, number],
): Float32Array {
  // Normalised because a quaternion that has drifted off unit length would
  // otherwise smuggle a scale into a matrix this function promises is rigid.
  const q = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
  const w = Number.isFinite(markerWidth) ? markerWidth : 0;
  const shift = new Vector3(offset[0] * w, offset[1] * w, 0).applyQuaternion(q);

  const m = new Matrix4().compose(
    new Vector3(position.x + shift.x, position.y + shift.y, position.z + shift.z),
    q,
    new Vector3(1, 1, 1),
  );
  return new Float32Array(m.elements);
}
```

- [ ] **Step 4: Update the one call site so the build stays green**

In `src/components/ar/StoryARExperience.tsx`, change the line-21 import to:

```ts
import { composeSceneMatrix, hasDimensions, tileSize } from '@/markers/markerPose';
```

and replace the `tile.place(composeMarkerMatrix(...))` line inside `onPose` with:

```ts
            tile.place(
              composeSceneMatrix(
                marker.event.position,
                marker.event.rotation,
                marker.event.scaledWidth ?? 0,
                [0, 0],
              ),
            );
```

Deliberately still a zero offset — Task 8 replaces this whole callback with the
anchor-driven version. Keeping this task's diff to the maths lets a reviewer reject
the maths without also judging the flow.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/markers/markerPose.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite, the linter and the type-checker**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/markers/markerPose.ts src/markers/markerPose.test.ts src/components/ar/StoryARExperience.tsx
git commit -m "Place artwork beside its printed marker, not only on top of it"
```

---

## Task 3: The lock state machine

Three states and three events, pure, so the entry flow can be tested without a
phone. This is the piece that decides what the visitor is told and whether a tap
does anything.

**Files:**
- Create: `src/markers/markerLock.ts`
- Test: `src/markers/markerLock.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type LockStatus = 'searching' | 'locked' | 'started';
  export interface LockState { status: LockStatus; markerId: string | null }
  export const INITIAL_LOCK: LockState;
  export function markerSeen(state: LockState, markerId: string): LockState;
  export function markerLost(state: LockState): LockState;
  export function tapped(state: LockState): LockState;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/markers/markerLock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { INITIAL_LOCK, markerLost, markerSeen, tapped } from './markerLock';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

describe('markerLock', () => {
  it('starts searching, with nothing locked', () => {
    expect(INITIAL_LOCK).toEqual({ status: 'searching', markerId: null });
  });

  it('locks onto the first picture it sees', () => {
    expect(markerSeen(INITIAL_LOCK, A)).toEqual({ status: 'locked', markerId: A });
  });

  it('goes back to searching when the picture is lost before the tap', () => {
    // Spec §5.1 step 5: the prompt reverts to POINT AT THE PICTURE.
    expect(markerLost(markerSeen(INITIAL_LOCK, A))).toEqual(INITIAL_LOCK);
  });

  it('starts the story on a tap, but only once locked', () => {
    const locked = markerSeen(INITIAL_LOCK, A);
    expect(tapped(locked)).toEqual({ status: 'started', markerId: A });
  });

  it('ignores a tap while nothing is locked', () => {
    // Otherwise a tap on an empty wall would latch the scene to no pose at all.
    expect(tapped(INITIAL_LOCK)).toEqual(INITIAL_LOCK);
  });

  it('survives losing the picture once started, because SLAM holds the scene', () => {
    // This is the whole point of latching: the visitor must step back out of
    // the marker's reliable range to see a scene many times its width.
    const started = tapped(markerSeen(INITIAL_LOCK, A));
    expect(markerLost(started)).toBe(started);
  });

  it('stays started when the same picture comes back into view', () => {
    // Spec §5.3: re-detecting the SAME marker must not move the scene — the
    // visitor has walked around it and SLAM is the authority now.
    const started = tapped(markerSeen(INITIAL_LOCK, A));
    expect(markerSeen(started, A)).toBe(started);
  });

  it('follows a different picture without asking for another tap', () => {
    // Spec §5.3: a different marker still switches stories and re-latches.
    const started = tapped(markerSeen(INITIAL_LOCK, A));
    expect(markerSeen(started, B)).toEqual({ status: 'started', markerId: B });
  });

  it('does not mutate the state it is given', () => {
    const locked = markerSeen(INITIAL_LOCK, A);
    tapped(locked);
    markerLost(locked);
    expect(locked).toEqual({ status: 'locked', markerId: A });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/markers/markerLock.test.ts`
Expected: FAIL — cannot resolve `./markerLock`.

- [ ] **Step 3: Write the implementation**

Create `src/markers/markerLock.ts`:

```ts
/**
 * markerLock.ts — has the visitor found a picture, and have they started it.
 *
 * Marker mode replaces the ground reticle with a lock frame on the printed
 * picture and a tap to begin (`docs/marker-locator-design.md` §5). That is a
 * three-state machine, and it is pure, so it belongs here rather than tangled
 * into the engine callbacks in StoryARExperience.
 *
 * The transitions carry the whole of §5.3: once started, the SAME marker
 * coming back into view must not move anything, because the visitor has walked
 * around a scene many times the print's width and SLAM — not the tracker — is
 * the authority. A DIFFERENT marker still switches stories and re-latches,
 * without asking for a second tap.
 */

/** Where the visitor is in the marker-mode entry flow. */
export type LockStatus =
  /** No picture in view. The prompt reads POINT AT THE PICTURE. */
  | 'searching'
  /** A picture is tracked and framed. The prompt reads TAP TO BEGIN. */
  | 'locked'
  /** The tap has happened: the scene is latched and the story is running. */
  | 'started';

/** The lock state, plus which picture it belongs to. */
export interface LockState {
  status: LockStatus;
  /** markerId, or null while nothing has ever been locked. */
  markerId: string | null;
}

export const INITIAL_LOCK: LockState = { status: 'searching', markerId: null };

/**
 * The owning marker is visible.
 *
 * @param state — Current state.
 * @param markerId — The marker now owning the session.
 * @returns The next state. Returns `state` itself — same reference — when
 *   nothing changed, so a caller can cheaply skip re-rendering.
 */
export function markerSeen(state: LockState, markerId: string): LockState {
  if (state.status === 'started') {
    // Same picture: the scene is already latched, leave it alone. Different
    // picture: point at the new one, still started, no second tap needed.
    return state.markerId === markerId ? state : { status: 'started', markerId };
  }
  if (state.status === 'locked' && state.markerId === markerId) return state;
  return { status: 'locked', markerId };
}

/**
 * No marker is being tracked any more.
 *
 * @param state — Current state.
 * @returns The next state. A started session is unaffected: the whole reason
 *   the pose latches is that the visitor has to step back out of the marker's
 *   reliable range to look at the scene.
 */
export function markerLost(state: LockState): LockState {
  if (state.status === 'started') return state;
  return INITIAL_LOCK;
}

/**
 * The visitor tapped the screen.
 *
 * @param state — Current state.
 * @returns The next state. A tap with nothing locked does nothing, rather than
 *   latching the scene to a pose that was never read.
 */
export function tapped(state: LockState): LockState {
  return state.status === 'locked' ? { status: 'started', markerId: state.markerId } : state;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/markers/markerLock.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the full suite, the linter and the type-checker**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/markers/markerLock.ts src/markers/markerLock.test.ts
git commit -m "Track whether the visitor has found a picture and started its story"
```

---

## Task 4: The lock frame drawn on the print

The visitor has to *see* that the picture is recognised — spec §5.1 step 2. Four
corner brackets registered to the physical print, following it, in the same
engine-agnostic style as `reticle.ts`.

**Files:**
- Create: `src/xr/markerFrame.ts`
- Test: `src/xr/markerFrame.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export const CORNER_ARM_FRACTION = 0.22;
  export function cornerBracketPoints(width: number, height: number, armFraction?: number): Float32Array;
  export interface MarkerFrame {
    object: LineSegments;
    setPose(matrix: Float32Array): void;
    setSize(width: number, height: number): void;
    setVisible(visible: boolean): void;
    dispose(): void;
  }
  export function createMarkerFrame(): MarkerFrame;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/xr/markerFrame.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cornerBracketPoints, createMarkerFrame } from './markerFrame';

describe('cornerBracketPoints', () => {
  it('emits eight line segments — two arms at each of four corners', () => {
    // 8 segments x 2 endpoints x 3 floats.
    expect(cornerBracketPoints(0.3, 0.4)).toHaveLength(48);
  });

  it('puts a corner at each half-extent of the marker', () => {
    const pts = cornerBracketPoints(0.3, 0.4, 0.25);
    const corners = new Set<string>();
    for (let i = 0; i < pts.length; i += 6) {
      corners.add(`${pts[i].toFixed(4)},${pts[i + 1].toFixed(4)}`);
    }
    expect(corners).toEqual(
      new Set(['-0.1500,-0.2000', '-0.1500,0.2000', '0.1500,-0.2000', '0.1500,0.2000']),
    );
  });

  it('draws arms of the requested length, inward from each corner', () => {
    // arm = min(width, height) * fraction = 0.3 * 0.25 = 0.075, so the first
    // corner's x-arm ends 0.075 closer to centre than the corner itself.
    const pts = cornerBracketPoints(0.3, 0.4, 0.25);
    const startX = pts[0];
    const endX = pts[3];
    expect(Math.abs(startX - endX)).toBeCloseTo(0.075, 6);
    // The x-arm does not move in y.
    expect(pts[4]).toBeCloseTo(pts[1], 6);
  });

  it('keeps arms square on a very oblong marker, driving them off the short side', () => {
    // Scaling each arm by its own axis would make a wide marker's horizontal
    // arms long and its vertical arms stubby, which reads as a drawing bug.
    const pts = cornerBracketPoints(1, 0.1, 0.25);
    const xArm = Math.abs(pts[0] - pts[3]);
    const yArm = Math.abs(pts[7] - pts[10]);
    expect(xArm).toBeCloseTo(0.025, 6);
    expect(yArm).toBeCloseTo(0.025, 6);
  });

  it('lies flat in the marker plane', () => {
    const pts = cornerBracketPoints(0.3, 0.4);
    for (let i = 2; i < pts.length; i += 3) expect(pts[i]).toBe(0);
  });
});

describe('createMarkerFrame', () => {
  it('starts hidden, so nothing flashes before a picture is found', () => {
    const frame = createMarkerFrame();
    expect(frame.object.visible).toBe(false);
    frame.dispose();
  });

  it('shows and hides on demand', () => {
    const frame = createMarkerFrame();
    frame.setVisible(true);
    expect(frame.object.visible).toBe(true);
    frame.setVisible(false);
    expect(frame.object.visible).toBe(false);
    frame.dispose();
  });

  it('rebuilds its geometry when the size actually changes, and not otherwise', () => {
    // setSize runs every frame while a picture is tracked; rebuilding the
    // buffer each frame would churn GPU memory for nothing.
    const frame = createMarkerFrame();
    frame.setSize(0.3, 0.4);
    const first = frame.object.geometry;
    frame.setSize(0.3, 0.4);
    expect(frame.object.geometry).toBe(first);
    frame.setSize(0.6, 0.8);
    expect(frame.object.geometry).not.toBe(first);
    frame.dispose();
  });

  it('ignores a degenerate size rather than drawing nothing at all', () => {
    const frame = createMarkerFrame();
    frame.setSize(0.3, 0.4);
    const good = frame.object.geometry;
    frame.setSize(0, 0.4);
    frame.setSize(NaN, 0.4);
    expect(frame.object.geometry).toBe(good);
    frame.dispose();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/xr/markerFrame.test.ts`
Expected: FAIL — cannot resolve `./markerFrame`.

- [ ] **Step 3: Write the implementation**

Create `src/xr/markerFrame.ts`:

```ts
/**
 * markerFrame.ts — the "this picture is recognised" bracket.
 *
 * Four corner brackets, drawn in the plane of the tracked print and following
 * it every frame, so the visitor can see the app has locked onto the picture
 * before they tap to begin (`docs/marker-locator-design.md` §5.1). Corners
 * rather than a full outline: a closed rectangle sitting exactly on a printed
 * rectangle reads as a rendering artefact, while brackets read as a viewfinder.
 *
 * Engine-agnostic, like `reticle.ts` — it takes a matrix and a size and knows
 * nothing about where they came from. The corner arithmetic is exported on its
 * own so it can be tested without constructing a scene.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
} from 'three';

/** Arm length as a fraction of the marker's SHORT side. */
export const CORNER_ARM_FRACTION = 0.22;

/**
 * The eight line segments that make up the four corner brackets.
 *
 * Both arms of every corner are the same length, driven off the marker's short
 * side. Scaling each arm by its own axis instead would give a wide print long
 * horizontal arms and stubby vertical ones, which reads as a drawing bug
 * rather than a viewfinder.
 *
 * @param width — Marker width, in the caller's units.
 * @param height — Marker height, same units.
 * @param armFraction — Arm length as a fraction of the short side.
 * @returns 48 floats: 8 segments x 2 endpoints x (x, y, z), centred on the
 *   origin and flat in the z = 0 plane — the marker's own plane.
 */
export function cornerBracketPoints(
  width: number,
  height: number,
  armFraction: number = CORNER_ARM_FRACTION,
): Float32Array {
  const hw = width / 2;
  const hh = height / 2;
  const arm = Math.min(width, height) * armFraction;
  const out: number[] = [];

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = sx * hw;
      const cy = sy * hh;
      // One arm inward along x, one inward along y.
      out.push(cx, cy, 0, cx - sx * arm, cy, 0);
      out.push(cx, cy, 0, cx, cy - sy * arm, 0);
    }
  }

  return new Float32Array(out);
}

/** Control handle returned by {@link createMarkerFrame}. */
export interface MarkerFrame {
  /** The line object. Add it to the scene root. */
  object: LineSegments;
  /**
   * Writes the marker's pose straight into the object's matrix.
   *
   * @param matrix — 16 column-major floats, as produced by `composeSceneMatrix`
   *   with a zero offset — the frame belongs on the print, not on the scene.
   */
  setPose(matrix: Float32Array): void;
  /**
   * Resizes the brackets to the marker's reported size.
   *
   * Called every frame while a picture is tracked, so it returns early unless
   * the size actually changed. A degenerate size is ignored rather than drawn,
   * because a zero-sized frame is indistinguishable on a phone from "the app
   * did not recognise the picture".
   *
   * @param width — Marker width in the engine's units.
   * @param height — Marker height, same units.
   */
  setSize(width: number, height: number): void;
  /**
   * Shows or hides the frame.
   *
   * @param visible — True while a picture is locked and not yet started.
   */
  setVisible(visible: boolean): void;
  /** Frees the GPU resources. */
  dispose(): void;
}

/**
 * Builds the lock frame. It starts hidden and zero-sized; the caller supplies
 * a size and a pose once a marker is actually tracked.
 *
 * @returns The control handle — see {@link MarkerFrame}.
 */
export function createMarkerFrame(): MarkerFrame {
  const material = new LineBasicMaterial({
    color: new Color('#00ff88'),
    transparent: true,
    opacity: 0.95,
    // Always drawn over the camera feed and the artwork: the frame is chrome,
    // and a bracket half-occluded by the scene it is announcing reads as a bug.
    depthTest: false,
    depthWrite: false,
  });

  const object = new LineSegments(new BufferGeometry(), material);
  object.renderOrder = 1000;
  object.matrixAutoUpdate = false;
  object.visible = false;

  let width = 0;
  let height = 0;
  const tmp = new Matrix4();

  return {
    object,
    setPose(matrix) {
      tmp.fromArray(matrix as unknown as number[]);
      object.matrix.copy(tmp);
    },
    setSize(w, h) {
      if (!(Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0)) return;
      if (w === width && h === height) return;
      width = w;
      height = h;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(cornerBracketPoints(w, h), 3));
      object.geometry.dispose();
      object.geometry = geometry;
    },
    setVisible(visible) {
      object.visible = visible;
    },
    dispose() {
      object.geometry.dispose();
      material.dispose();
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/xr/markerFrame.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the full suite, the linter and the type-checker**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/xr/markerFrame.ts src/xr/markerFrame.test.ts
git commit -m "Draw a viewfinder on a printed picture so visitors can see it was recognised"
```

---

## Task 5: Let the draft store hold a marker layout

**Files:**
- Modify: `src/studio/studioDraftStore.ts` (the `StudioDraft` interface, `bindMarker`, and a new `setMarkerLayout`)
- Test: `src/studio/studioDraftStore.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_WIDTH_IN_MARKERS` and `StoryAnchor` from Task 1.
- Produces:
  ```ts
  /** Studio's starting layout for a new binding: marker at a quarter of scene width. */
  export const INITIAL_WIDTH_IN_MARKERS = 4;

  // on StudioDraft:
  setMarkerLayout: (layout: { widthInMarkers: number; position: [number, number, number] }) => void;
  ```

- [ ] **Step 1: Write the failing test**

In `src/studio/studioDraftStore.test.ts`, find the existing test that asserts
`expect(anchor?.widthInMarkers).toBe(1)` and `expect(anchor?.local).toEqual(IDENTITY_LOCAL)`
(around line 189) and replace that single test with:

```ts
  it('starts a new binding with the marker a quarter of the scene wide', () => {
    // Not 1. Under the locator design a fresh binding is a small print inside
    // a larger scene, and 1 would put a rectangle bigger than the stage.
    const { bindMarker } = useStudioDraft.getState();
    bindMarker(entry);
    const anchor = useStudioDraft.getState().doc.anchor;
    expect(anchor?.widthInMarkers).toBe(4);
    expect(anchor?.local).toEqual(IDENTITY_LOCAL);
    expect(anchor?.mode).toBe('latch');
  });

  it('stores an authored layout on the bound anchor', () => {
    const { bindMarker, setMarkerLayout } = useStudioDraft.getState();
    bindMarker(entry);
    setMarkerLayout({ widthInMarkers: 7.5, position: [-0.9, 0.6, 0] });
    const anchor = useStudioDraft.getState().doc.anchor;
    expect(anchor?.widthInMarkers).toBeCloseTo(7.5, 10);
    expect(anchor?.local.position).toEqual([-0.9, 0.6, 0]);
    // The binding itself must survive a layout edit untouched.
    expect(anchor?.markerId).toBe(entry.markerId);
    expect(anchor?.thumbId).toBe(entry.thumbId);
  });

  it('ignores a layout edit when nothing is bound', () => {
    // Otherwise a stray call would mint an anchor with no marker behind it,
    // which publishes as a picture that can never be recognised.
    const { setMarkerLayout } = useStudioDraft.getState();
    setMarkerLayout({ widthInMarkers: 7.5, position: [0, 0, 0] });
    expect(useStudioDraft.getState().doc.anchor).toBeUndefined();
  });

  it('makes a layout edit undoable like any other draft change', () => {
    const { bindMarker, setMarkerLayout, undo } = useStudioDraft.getState();
    bindMarker(entry);
    setMarkerLayout({ widthInMarkers: 9, position: [1, 1, 0] });
    undo();
    expect(useStudioDraft.getState().doc.anchor?.widthInMarkers).toBe(4);
  });
```

`entry` is the `MarkerLibraryEntry` fixture the surrounding `describe` block
already builds for the existing bind/unbind tests — reuse it rather than making a
second one. If the store's undo action is not named `undo`, drop the fourth test
and note it in the commit; `commit()` is what makes changes undoable and it is
already used by every other action.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/studio/studioDraftStore.test.ts`
Expected: FAIL — `widthInMarkers` is `1`, and `setMarkerLayout is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/studio/studioDraftStore.ts`, add the constant near the top, after the
imports:

```ts
/**
 * The scene width a NEW binding starts at: the marker a quarter of the way
 * across the scene.
 *
 * Deliberately NOT `DEFAULT_WIDTH_IN_MARKERS`. That constant is 1 because 1 is
 * what every already-published story means and what the validator must fall
 * back to; this one is an authoring default, and under the locator design a
 * fresh binding is a small print inside a larger scene. 1 would also be
 * undrawable: at 1 the marker rectangle is as wide as the whole stage, and its
 * 3:4 height would run off the bottom. Keep the two apart.
 */
export const INITIAL_WIDTH_IN_MARKERS = 4;
```

Add the action to the `StudioDraft` interface, next to `bindMarker` / `unbindMarker`:

```ts
  /**
   * Rewrites the bound marker's size and position within the scene. No-op when
   * nothing is bound.
   */
  setMarkerLayout: (layout: { widthInMarkers: number; position: [number, number, number] }) => void;
```

Change `bindMarker`'s anchor literal so `widthInMarkers` and `mode` read:

```ts
          local: IDENTITY_LOCAL,
          widthInMarkers: INITIAL_WIDTH_IN_MARKERS,
          mode: 'latch',
```

And add the implementation immediately after `unbindMarker`:

```ts
    setMarkerLayout: ({ widthInMarkers, position }) => {
      const { doc } = get();
      // Guarded rather than asserted: the stage editor only shows the overlay
      // when an anchor exists, but a stray call must not mint an anchor with no
      // marker behind it — that publishes as a picture nothing can recognise.
      if (!doc.anchor) return;
      commit({
        ...doc,
        anchor: {
          ...doc.anchor,
          widthInMarkers,
          // Rotation stays identity: in-plane rotation is not built, and the
          // validator forces it back anyway.
          local: { position, rotation: [0, 0, 0, 1] },
        },
      });
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/studio/studioDraftStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, the linter and the type-checker**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/studio/studioDraftStore.ts src/studio/studioDraftStore.test.ts
git commit -m "Remember where a printed picture sits inside the scene it belongs to"
```

---

## Task 6: The marker-rectangle maths

Everything the stage overlay needs, as arithmetic. Mirrors `markerCropEdit.ts`,
which does the same job for the crop box: pure rules here, pointer handling in the
component.

**Files:**
- Create: `src/studio/markerOverlayEdit.ts`
- Test: `src/studio/markerOverlayEdit.test.ts`

**Interfaces:**
- Consumes: `MAX_OFFSET_IN_MARKERS`, `MAX_WIDTH_IN_MARKERS` from Task 1;
  `StageFrame` and `FRONT` from `./stageGeometry`.
- Produces:
  ```ts
  export interface MarkerRect { x: number; y: number; w: number; h: number }
  export const MARKER_ASPECT: number;              // 3 / 4
  export const SMALL_MARKER_WARN_FRACTION: number; // 0.08
  export function minRectWidth(frame: StageFrame): number;
  export function maxRectWidth(frame: StageFrame): number;
  export function rectFromAnchor(frame: StageFrame, widthInMarkers: number, offset: readonly [number, number]): MarkerRect;
  export function anchorFromRect(frame: StageFrame, rect: MarkerRect): { widthInMarkers: number; position: [number, number, number] };
  export function moveRect(rect: MarkerRect, dx: number, dy: number, frame: StageFrame): MarkerRect;
  export function resizeRect(rect: MarkerRect, width: number, frame: StageFrame): MarkerRect;
  export function isMarkerTooSmall(frame: StageFrame, rect: MarkerRect): boolean;
  export function sceneWidthMetres(printWidthMm: number, widthInMarkers: number): number;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/studio/markerOverlayEdit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_WIDTH_IN_MARKERS } from '@/story/storyDoc';
import { FRONT } from './stageGeometry';
import {
  anchorFromRect,
  isMarkerTooSmall,
  MARKER_ASPECT,
  maxRectWidth,
  minRectWidth,
  moveRect,
  rectFromAnchor,
  resizeRect,
  sceneWidthMetres,
} from './markerOverlayEdit';

describe('rectFromAnchor / anchorFromRect', () => {
  it('round-trips a layout that fits on the stage', () => {
    // The author drags, we store numbers, we draw them again next time. Any
    // drift here is a marker that creeps across the stage between sessions.
    const rect = rectFromAnchor(FRONT, 4, [0.3, -0.2]);
    const back = anchorFromRect(FRONT, rect);
    expect(back.widthInMarkers).toBeCloseTo(4, 10);
    expect(back.position[0]).toBeCloseTo(0.3, 10);
    expect(back.position[1]).toBeCloseTo(-0.2, 10);
    expect(back.position[2]).toBe(0);
  });

  it('centres the marker when the offset is zero', () => {
    const rect = rectFromAnchor(FRONT, 4, [0, 0]);
    expect(rect.x + rect.w / 2).toBeCloseTo(FRONT.w / 2, 10);
    expect(rect.y + rect.h / 2).toBeCloseTo(FRONT.h / 2, 10);
  });

  it('sizes the rectangle as the scene width divided by the multiplier', () => {
    expect(rectFromAnchor(FRONT, 4, [0, 0]).w).toBeCloseTo(FRONT.w / 4, 10);
  });

  it('keeps the printed 3:4 shape at every size', () => {
    for (const k of [3, 5, 12]) {
      const rect = rectFromAnchor(FRONT, k, [0, 0]);
      expect(rect.w / rect.h).toBeCloseTo(MARKER_ASPECT, 10);
    }
  });

  it('reads a positive x offset as the scene sitting to the marker''s right', () => {
    // Spec §2.1: [ox, oy] points FROM the marker TO the scene centre, so a
    // positive ox must put the marker LEFT of centre on the stage. Getting
    // this sign backwards is silent and mirrors every installation.
    const rect = rectFromAnchor(FRONT, 4, [0.5, 0]);
    expect(rect.x + rect.w / 2).toBeLessThan(FRONT.w / 2);
  });

  it('reads a positive y offset as the scene sitting above the marker', () => {
    // View y grows DOWN, spec y grows UP.
    const rect = rectFromAnchor(FRONT, 4, [0, 0.5]);
    expect(rect.y + rect.h / 2).toBeGreaterThan(FRONT.h / 2);
  });

  it('clamps a legacy 1:1 binding into a rectangle the stage can draw', () => {
    // Published stories all carry widthInMarkers 1, whose rectangle is wider
    // than the stage and taller than it. Drawing is clamped; the stored value
    // is untouched until the author actually drags something.
    const rect = rectFromAnchor(FRONT, 1, [0, 0]);
    expect(rect.w).toBeLessThanOrEqual(maxRectWidth(FRONT));
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.w).toBeLessThanOrEqual(FRONT.w + 1e-9);
    expect(rect.y + rect.h).toBeLessThanOrEqual(FRONT.h + 1e-9);
  });

  it('never authors a multiplier the validator would reject', () => {
    const tiny = { x: 0, y: 0, w: minRectWidth(FRONT) / 100, h: 1 };
    expect(anchorFromRect(FRONT, tiny).widthInMarkers).toBeLessThanOrEqual(MAX_WIDTH_IN_MARKERS);
  });
});

describe('moveRect', () => {
  const rect = rectFromAnchor(FRONT, 4, [0, 0]);

  it('slides the rectangle by the drag delta', () => {
    const moved = moveRect(rect, 20, -10, FRONT);
    expect(moved.x).toBeCloseTo(rect.x + 20, 10);
    expect(moved.y).toBeCloseTo(rect.y - 10, 10);
    expect(moved.w).toBe(rect.w);
  });

  it('stops at the stage edges', () => {
    // Spec §3.3: a print hanging outside its own artwork is almost always a
    // mistake, and there is no way to preview it.
    const far = moveRect(rect, 9999, 9999, FRONT);
    expect(far.x).toBeCloseTo(FRONT.w - rect.w, 10);
    expect(far.y).toBeCloseTo(FRONT.h - rect.h, 10);
    const near = moveRect(rect, -9999, -9999, FRONT);
    expect(near.x).toBe(0);
    expect(near.y).toBe(0);
  });
});

describe('resizeRect', () => {
  const rect = rectFromAnchor(FRONT, 4, [0, 0]);

  it('resizes about its own centre, keeping 3:4', () => {
    const bigger = resizeRect(rect, rect.w * 1.5, FRONT);
    expect(bigger.w / bigger.h).toBeCloseTo(MARKER_ASPECT, 10);
    expect(bigger.x + bigger.w / 2).toBeCloseTo(rect.x + rect.w / 2, 10);
    expect(bigger.y + bigger.h / 2).toBeCloseTo(rect.y + rect.h / 2, 10);
  });

  it('never grows past what the stage can show', () => {
    const huge = resizeRect(rect, 99999, FRONT);
    expect(huge.w).toBeCloseTo(maxRectWidth(FRONT), 10);
    expect(huge.h).toBeLessThanOrEqual(FRONT.h + 1e-9);
  });

  it('never shrinks past the validator''s own ceiling on the multiplier', () => {
    const tiny = resizeRect(rect, 0, FRONT);
    expect(tiny.w).toBeCloseTo(minRectWidth(FRONT), 10);
    expect(anchorFromRect(FRONT, tiny).widthInMarkers).toBeCloseTo(MAX_WIDTH_IN_MARKERS, 6);
  });

  it('keeps the resized rectangle on the stage', () => {
    const corner = moveRect(rect, 9999, 9999, FRONT);
    const grown = resizeRect(corner, maxRectWidth(FRONT), FRONT);
    expect(grown.x).toBeGreaterThanOrEqual(0);
    expect(grown.y).toBeGreaterThanOrEqual(0);
    expect(grown.x + grown.w).toBeLessThanOrEqual(FRONT.w + 1e-9);
    expect(grown.y + grown.h).toBeLessThanOrEqual(FRONT.h + 1e-9);
  });
});

describe('isMarkerTooSmall', () => {
  it('warns below 8% of the scene width', () => {
    // Spec §3.3: a marker that small forces the visitor close enough to fill
    // the frame with it. A warning, not a block.
    expect(isMarkerTooSmall(FRONT, { x: 0, y: 0, w: FRONT.w * 0.07, h: 1 })).toBe(true);
    expect(isMarkerTooSmall(FRONT, { x: 0, y: 0, w: FRONT.w * 0.09, h: 1 })).toBe(false);
  });

  it('does not warn at the default a new binding starts on', () => {
    expect(isMarkerTooSmall(FRONT, rectFromAnchor(FRONT, 4, [0, 0]))).toBe(false);
  });
});

describe('sceneWidthMetres', () => {
  it('turns a print width into the real size of the finished scene', () => {
    // The one place relative units become a measurement — and getting it
    // wrong is expensive in paper and ink.
    expect(sceneWidthMetres(100, 8)).toBeCloseTo(0.8, 10);
    expect(sceneWidthMetres(210, 20)).toBeCloseTo(4.2, 10);
  });

  it('is zero for a nonsense print width rather than NaN on screen', () => {
    expect(sceneWidthMetres(NaN, 8)).toBe(0);
    expect(sceneWidthMetres(-5, 8)).toBe(0);
  });
});
```

Two test names contain an apostrophe written as `''` inside a single-quoted string
— write those two with double quotes instead.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/studio/markerOverlayEdit.test.ts`
Expected: FAIL — cannot resolve `./markerOverlayEdit`.

- [ ] **Step 3: Write the implementation**

Create `src/studio/markerOverlayEdit.ts`:

```ts
/**
 * markerOverlayEdit.ts — dragging and resizing the printed picture on the stage.
 *
 * The author does not type a scale or an offset. They drag a rectangle around
 * the scene they are composing, and both numbers fall out of where it lands
 * (`docs/marker-locator-design.md` §3.2). This file is that conversion, plus
 * the guard rails from §3.3.
 *
 * Pure arithmetic, no DOM — pointer handling lives in StageEditor, the rules
 * live here so they are testable without synthesising drags. Same split as
 * `markerCropEdit.ts`, which does the same job for the crop box.
 *
 * The size limits are derived from the SCHEMA's bounds rather than picked
 * separately, so the editor cannot author a layout `sanitizeAnchor` would
 * refuse and silently reset.
 */

import { MAX_OFFSET_IN_MARKERS, MAX_WIDTH_IN_MARKERS } from '@/story/storyDoc';
import type { StageFrame } from './stageGeometry';

/** The marker rectangle on the stage, in SVG view units. */
export interface MarkerRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Printed markers are cut 3:4 (`markerCropEdit.ts`), so the overlay is too. */
export const MARKER_ASPECT = 3 / 4;

/** Below this fraction of the scene's width, warn the author (§3.3). */
export const SMALL_MARKER_WARN_FRACTION = 0.08;

/** Clamps `v` into `[lo, hi]`. `hi` below `lo` yields `lo`. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(Math.max(lo, hi), v));
}

/**
 * The smallest rectangle the author may draw.
 *
 * Derived from `MAX_WIDTH_IN_MARKERS`, not chosen: a rectangle any smaller
 * would mean a multiplier the validator rejects, so the UI simply cannot
 * express one.
 *
 * @param frame — The stage being drawn on.
 */
export function minRectWidth(frame: StageFrame): number {
  return frame.w / MAX_WIDTH_IN_MARKERS;
}

/**
 * The largest rectangle that fits on the stage at 3:4.
 *
 * @param frame — The stage being drawn on.
 */
export function maxRectWidth(frame: StageFrame): number {
  return Math.min(frame.w, frame.h * MARKER_ASPECT);
}

/**
 * Draws a stored layout as a rectangle on the stage.
 *
 * Clamped for DISPLAY only — nothing is written back until the author actually
 * drags. That matters for legacy bindings: every story published before this
 * design carries `widthInMarkers: 1`, whose rectangle is larger than the stage.
 *
 * @param frame — The stage being drawn on.
 * @param widthInMarkers — The anchor's stored multiplier.
 * @param offset — The anchor's stored `[ox, oy]`, in marker-widths.
 * @returns The rectangle, in view units, always inside the stage.
 */
export function rectFromAnchor(
  frame: StageFrame,
  widthInMarkers: number,
  offset: readonly [number, number],
): MarkerRect {
  const k = Number.isFinite(widthInMarkers) && widthInMarkers > 0 ? widthInMarkers : 1;
  const w = clamp(frame.w / k, minRectWidth(frame), maxRectWidth(frame));
  const h = w / MARKER_ASPECT;

  // The offset points marker -> scene centre, so it inverts to find the
  // marker. View y grows down while the stored y grows up, hence the + on cy.
  const cx = frame.w / 2 - offset[0] * w;
  const cy = frame.h / 2 + offset[1] * w;

  return {
    x: clamp(cx - w / 2, 0, frame.w - w),
    y: clamp(cy - h / 2, 0, frame.h - h),
    w,
    h,
  };
}

/**
 * Reads a rectangle back as the numbers the anchor stores.
 *
 * @param frame — The stage the rectangle was drawn on.
 * @param rect — Where the author left the marker.
 * @returns `widthInMarkers` and the `local.position` triple, `z` always 0.
 */
export function anchorFromRect(
  frame: StageFrame,
  rect: MarkerRect,
): { widthInMarkers: number; position: [number, number, number] } {
  const raw = frame.w / rect.w;
  const widthInMarkers =
    Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_WIDTH_IN_MARKERS) : 1;

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const bound = (v: number): number =>
    clamp(Number.isFinite(v) ? v : 0, -MAX_OFFSET_IN_MARKERS, MAX_OFFSET_IN_MARKERS);

  return {
    widthInMarkers,
    position: [bound((frame.w / 2 - cx) / rect.w), bound((cy - frame.h / 2) / rect.w), 0],
  };
}

/**
 * Slides the rectangle, stopping at the stage edges.
 *
 * @param rect — Rectangle at the start of the drag.
 * @param dx — View units right(+) / left(-).
 * @param dy — View units down(+) / up(-).
 * @param frame — The stage being drawn on.
 * @returns The moved rectangle, always in bounds.
 */
export function moveRect(rect: MarkerRect, dx: number, dy: number, frame: StageFrame): MarkerRect {
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, frame.w - rect.w),
    y: clamp(rect.y + dy, 0, frame.h - rect.h),
  };
}

/**
 * Resizes the rectangle about its own centre, keeping 3:4.
 *
 * Centre-anchored, like `scaleCrop`: the marker stays where the author put it
 * while they change how big the scene around it is, which is the question they
 * are actually answering. It does mean the grip drifts from the pointer on a
 * large drag — the alternative moves the marker while resizing it, which
 * conflates the two decisions.
 *
 * @param rect — Rectangle at the start of the drag.
 * @param width — Desired width in view units, before bounds.
 * @param frame — The stage being drawn on.
 * @returns The resized rectangle: never past `maxRectWidth`, never below
 *   `minRectWidth`, never off the stage.
 */
export function resizeRect(rect: MarkerRect, width: number, frame: StageFrame): MarkerRect {
  const w = clamp(Number.isFinite(width) ? width : rect.w, minRectWidth(frame), maxRectWidth(frame));
  const h = w / MARKER_ASPECT;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  return {
    w,
    h,
    x: clamp(cx - w / 2, 0, frame.w - w),
    y: clamp(cy - h / 2, 0, frame.h - h),
  };
}

/**
 * Whether the marker is small enough in its scene to be worth warning about.
 *
 * A warning, never a block (§3.3): a large room with a large print may be
 * exactly right, and only the author knows the room.
 *
 * @param frame — The stage being drawn on.
 * @param rect — The marker rectangle.
 */
export function isMarkerTooSmall(frame: StageFrame, rect: MarkerRect): boolean {
  return rect.w < frame.w * SMALL_MARKER_WARN_FRACTION;
}

/**
 * How wide the finished scene will be in the real world.
 *
 * Not stored and not published — it is an authoring aid, and the one place
 * relative units become a measurement. It exists because getting the print
 * size wrong is expensive in paper and ink (§3.4).
 *
 * @param printWidthMm — The intended physical width of the printed picture.
 * @param widthInMarkers — The scene's width in marker-widths.
 * @returns Metres. Zero for a nonsense print width, rather than NaN on screen.
 */
export function sceneWidthMetres(printWidthMm: number, widthInMarkers: number): number {
  if (!(Number.isFinite(printWidthMm) && printWidthMm > 0)) return 0;
  if (!(Number.isFinite(widthInMarkers) && widthInMarkers > 0)) return 0;
  return (printWidthMm / 1000) * widthInMarkers;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/studio/markerOverlayEdit.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, the linter and the type-checker**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/studio/markerOverlayEdit.ts src/studio/markerOverlayEdit.test.ts
git commit -m "Work out a picture's size and place in a scene from where the author drags it"
```

---

## Task 7: One stage, with the picture as a draggable overlay

Removes the 3:4 stage — its premise ("artwork covers the marker") is gone — and
turns the faded ghost backdrop into the object the author positions.

**Files:**
- Modify: `src/studio/stageGeometry.ts` (delete `MARKER_FRONT`)
- Modify: `src/studio/stageGeometry.test.ts` (delete the `MARKER_FRONT` tests)
- Modify: `src/studio/StageEditor.tsx`
- Modify: `src/studio/studio.css`
- Test: `src/studio/StageEditor.test.tsx`

**Interfaces:**
- Consumes: `setMarkerLayout` (Task 5); everything from `markerOverlayEdit` (Task 6).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

In `src/studio/StageEditor.test.tsx`, add inside the existing `describe('StageEditor')`:

```ts
  it('shows no marker overlay until a picture is bound', () => {
    const html = renderToString(<StageEditor frameIndex={0} onClose={() => {}} />);
    expect(html).not.toContain('st-markerbox');
  });

  it('draws the bound picture as a positionable overlay, and the print-width aid', () => {
    // Note the harness limit documented at the top of this file: zustand 4's
    // server snapshot is the INITIAL state, so the binding has to be made
    // before the store is ever read. reset() then bindMarker() does that.
    useStudioDraft.getState().bindMarker({
      markerId: 'a'.repeat(64),
      thumbId: 'b'.repeat(64),
      name: 'test print',
      crop: {
        top: 0, left: 0, width: 480, height: 640,
        isRotated: false, originalWidth: 480, originalHeight: 640,
      },
      addedAt: 0,
    });
    const html = renderToString(<StageEditor frameIndex={0} onClose={() => {}} />);
    expect(html).toContain('st-markerbox');
    expect(html).toContain('PRINT WIDTH');
  });
```

Add `import { useStudioDraft } from './studioDraftStore';` if the file does not
already import it — it does, for the `beforeEach`.

In `src/studio/stageGeometry.test.ts`, delete `MARKER_FRONT` from the import list
and delete every test that references it (the 3:4 ratio test, the shared-`ppm`
test, the ground-line-proportion test, the centre-projection test, and the
unproject round-trip that passes `MARKER_FRONT`). The equivalent `FRONT` tests in
the same file already cover the parameterisation.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/studio/StageEditor.test.tsx src/studio/stageGeometry.test.ts`
Expected: FAIL — `StageEditor.test.tsx` cannot find `st-markerbox`;
`stageGeometry.test.ts` passes already (the deletions leave it green, which is
expected — it is the removal half of this task).

- [ ] **Step 3: Delete `MARKER_FRONT`**

In `src/studio/stageGeometry.ts`, delete the whole `MARKER_FRONT` declaration and
its doc comment. `StageFrame` and the `frame` parameters on `frontProject` /
`frontUnprojectX` stay: they are harmless, already tested, and cost nothing.

- [ ] **Step 4: Rewrite the stage editor's marker handling**

In `src/studio/StageEditor.tsx`:

**a.** Change the `stageGeometry` import to drop `MARKER_FRONT`, and add the new
imports:

```ts
import {
  anchorFromRect,
  isMarkerTooSmall,
  moveRect,
  rectFromAnchor,
  resizeRect,
  sceneWidthMetres,
  type MarkerRect,
} from './markerOverlayEdit';
```

**b.** Replace the stage-selection block:

```ts
  // One stage, always. The 3:4 stage existed because artwork was exactly the
  // size of the printed picture; under the locator design the scene is the
  // scene and the picture is an object inside it, so binding a marker no
  // longer changes the stage's shape at all.
  const frame = FRONT;
```

**c.** Add the overlay state, below the existing `useState` declarations:

```ts
  // The marker rectangle, in view units. Local state during a drag; committed
  // to the draft on pointer-up so undo gets one entry per gesture rather than
  // one per pointer-move.
  const [markerRect, setMarkerRect] = useState<MarkerRect | null>(null);
  /** Intended physical print width, for the size aid. Never stored (§3.4). */
  const [printMm, setPrintMm] = useState(100);
  const markerDrag = useRef<{
    mode: 'move' | 'resize';
    grabX: number;
    grabY: number;
    start: MarkerRect;
  } | null>(null);

  useEffect(() => {
    setMarkerRect(
      anchor
        ? rectFromAnchor(frame, anchor.widthInMarkers, [
            anchor.local.position[0],
            anchor.local.position[1],
          ])
        : null,
    );
  }, [anchor, frame]);
```

Add `useEffect` to the `react` import if it is not already there.

**d.** In `onPointerMove`, add this block **before** the existing prop-drag logic:

```ts
    const md = markerDrag.current;
    if (md && frontRef.current) {
      const box = frontRef.current.getBoundingClientRect();
      const pt = toViewBox(e.clientX, e.clientY, box, frame.w, frame.h);
      setMarkerRect(
        md.mode === 'move'
          ? moveRect(md.start, pt.x - md.grabX, pt.y - md.grabY, frame)
          : resizeRect(md.start, md.start.w + (pt.x - md.grabX) * 2, frame),
      );
      return;
    }
```

The `* 2` on resize is because the rectangle grows about its own centre: dragging
the grip one unit right must add one unit on each side for the corner to stay
under the pointer.

**e.** In `endDrag`, add before the existing body:

```ts
    if (markerDrag.current) {
      markerDrag.current = null;
      // Committed once per gesture. Committing per pointer-move would fill the
      // undo history with a hundred indistinguishable steps.
      if (markerRect) useStudioDraft.getState().setMarkerLayout(anchorFromRect(frame, markerRect));
    }
```

**f.** Replace the `{anchor && (<image … opacity={0.28} …/>)}` ghost backdrop —
which is drawn *behind* the composed art and can be entirely hidden by a
full-bleed background — with an overlay drawn **after** the composed-art
`<image>`, so it is always on top. Delete the ghost block, and insert this
immediately after the `<image href={svgToDataUrl(previewSvg)} … />` line:

```tsx
                {anchor && markerRect && (
                  // The printed picture, at full opacity and in its real place
                  // inside the scene. It represents a physical object on the
                  // wall, not an alignment guide. Authoring-only: none of this
                  // is part of frame.art, so it cannot reach a published
                  // document or the viewer.
                  <g>
                    <image
                      href={`${ASSET_BASE_URL}/markers/${anchor.thumbId}.png`}
                      x={markerRect.x}
                      y={markerRect.y}
                      width={markerRect.w}
                      height={markerRect.h}
                      preserveAspectRatio="xMidYMid slice"
                    />
                    <rect
                      className="st-markerbox"
                      x={markerRect.x}
                      y={markerRect.y}
                      width={markerRect.w}
                      height={markerRect.h}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        const box = frontRef.current?.getBoundingClientRect();
                        if (!box) return;
                        const pt = toViewBox(e.clientX, e.clientY, box, frame.w, frame.h);
                        markerDrag.current = {
                          mode: 'move',
                          grabX: pt.x,
                          grabY: pt.y,
                          start: markerRect,
                        };
                      }}
                    />
                    <rect
                      className="st-markergrip"
                      x={markerRect.x + markerRect.w - 7}
                      y={markerRect.y + markerRect.h - 7}
                      width={14}
                      height={14}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        const box = frontRef.current?.getBoundingClientRect();
                        if (!box) return;
                        const pt = toViewBox(e.clientX, e.clientY, box, frame.w, frame.h);
                        markerDrag.current = {
                          mode: 'resize',
                          grabX: pt.x,
                          grabY: pt.y,
                          start: markerRect,
                        };
                      }}
                    />
                  </g>
                )}
```

**g.** Add the print-width aid. Put it immediately below the `<div className="st-viewttl">CAMERA VIEW — what visitors see</div>` line's enclosing `st-frontwrap` block, still inside the same `st-viewcol`:

```tsx
              {anchor && markerRect && (
                <div className="st-markeraid">
                  <label>
                    PRINT WIDTH
                    <input
                      type="number"
                      min={10}
                      max={2000}
                      step={5}
                      value={printMm}
                      onChange={(e) => setPrintMm(Number(e.target.value))}
                    />
                    mm
                  </label>
                  <span>
                    scene ≈{' '}
                    {sceneWidthMetres(
                      printMm,
                      anchorFromRect(frame, markerRect).widthInMarkers,
                    ).toFixed(2)}{' '}
                    m across
                  </span>
                  {isMarkerTooSmall(frame, markerRect) && (
                    <span className="st-markerwarn">
                      This picture is small in its scene — visitors will have to stand close
                      to start.
                    </span>
                  )}
                </div>
              )}
```

**h.** Update the header sub-line so the new interaction is discoverable. Replace
`drag in either view · the camera view is exactly what gets saved` with:

```tsx
            drag in either view · drag the printed picture to say where it hangs
```

- [ ] **Step 5: Add the styles**

In `src/studio/studio.css`, immediately after the `.st-handle.sel` rule, add:

```css
.st-markerbox {
  fill: transparent;
  stroke: var(--green-light);
  stroke-width: 2;
  stroke-dasharray: 6 4;
  cursor: grab;
}
.st-markerbox:hover {
  stroke-width: 3;
}
.st-markergrip {
  fill: var(--green-light);
  stroke: #120e0e;
  stroke-width: 2;
  cursor: nwse-resize;
}
.st-markeraid {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  font-size: 11px;
  opacity: 0.85;
}
.st-markeraid input {
  width: 68px;
  margin: 0 4px;
}
.st-markerwarn {
  color: var(--orange);
  flex-basis: 100%;
}
```

If `--green-light` or `--orange` are not defined in this stylesheet's `:root`,
check what `.st-dot` and `.st-handle.sel` use and match them — both already
reference these two variables, so they exist.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/studio/StageEditor.test.tsx src/studio/stageGeometry.test.ts src/studio/markerOverlayEdit.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full suite, the linter and the type-checker**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/studio/stageGeometry.ts src/studio/stageGeometry.test.ts src/studio/StageEditor.tsx src/studio/StageEditor.test.tsx src/studio/studio.css
git commit -m "Let authors drag the printed picture to where it will actually hang in the scene"
```

---

## Task 8: Lock onto the picture, then tap to begin

The visitor-facing half. Marker mode stops hit-testing the floor entirely, draws a
frame on the recognised print, and latches the scene on the tap.

**Files:**
- Modify: `src/components/story/StoryOverlay.tsx`
- Create: `src/components/story/StoryOverlay.test.tsx`
- Modify: `src/components/ar/StoryARExperience.tsx`

**Interfaces:**
- Consumes: `composeSceneMatrix`, `tileSize`, `hasDimensions` (Task 2);
  `INITIAL_LOCK`, `markerSeen`, `markerLost`, `tapped`, `type LockStatus` (Task 3);
  `createMarkerFrame` (Task 4); `StoryAnchor` (Task 1).
- Produces:
  ```ts
  // StoryOverlay's props gain:
  markerLock?: LockStatus | null;   // null / omitted = ground mode
  ```

- [ ] **Step 1: Write the failing test**

Create `src/components/story/StoryOverlay.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { StoryOverlay } from './StoryOverlay';
import { useStoryStore } from '@/store/storyStore';

describe('StoryOverlay prompt copy', () => {
  beforeEach(() => {
    useStoryStore.getState().reset();
  });

  it('asks for the ground when there is no marker, exactly as it always has', () => {
    // Ground mode is the shipped experience and must not shift a character.
    expect(renderToString(<StoryOverlay surfaceReady={false} />)).toContain(
      'MOVE PHONE TO FIND THE GROUND',
    );
    expect(renderToString(<StoryOverlay surfaceReady={true} />)).toContain(
      'TAP THE GROUND TO PLACE',
    );
  });

  it('asks for the picture in marker mode, never for the ground', () => {
    const html = renderToString(<StoryOverlay surfaceReady={false} markerLock="searching" />);
    expect(html).toContain('POINT AT THE PICTURE');
    expect(html).not.toContain('GROUND');
  });

  it('invites the tap once the picture is locked', () => {
    const html = renderToString(<StoryOverlay surfaceReady={false} markerLock="locked" />);
    expect(html).toContain('TAP TO BEGIN');
  });

  it('ignores surfaceReady in marker mode, because the floor is irrelevant', () => {
    // A stale surface lock must never turn the marker prompt into a tap
    // invitation — that is the shipped defect this flow removes.
    const html = renderToString(<StoryOverlay surfaceReady={true} markerLock="searching" />);
    expect(html).toContain('POINT AT THE PICTURE');
    expect(html).not.toContain('TAP TO BEGIN');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/story/StoryOverlay.test.tsx`
Expected: FAIL — `markerLock` is not a recognised prop and the marker copy is absent.

- [ ] **Step 3: Add the marker copy to the overlay**

In `src/components/story/StoryOverlay.tsx`, add the import:

```ts
import type { LockStatus } from '@/markers/markerLock';
```

Extend the props interface:

```ts
interface StoryOverlayProps {
  /** True once the reticle has locked a surface (tap will place). */
  surfaceReady: boolean;
  /**
   * Marker-mode lock status, or null/omitted in ground mode. When present the
   * ground is irrelevant and `surfaceReady` is ignored: the visitor is looking
   * for a printed picture, not a floor.
   */
  markerLock?: LockStatus | null;
}
```

Change the signature to `({ surfaceReady, markerLock = null })`, and add above the
`return`:

```ts
  // One boolean and one string, so the two modes cannot drift into two
  // different-looking cards. `ready` drives the same pulse-to-solid styling in
  // both; only the words differ.
  const ready = markerLock === null ? surfaceReady : markerLock !== 'searching';
  const scanPrompt =
    markerLock === null
      ? ready
        ? 'TAP THE GROUND TO PLACE'
        : 'MOVE PHONE TO FIND THE GROUND'
      : ready
        ? 'TAP TO BEGIN'
        : 'POINT AT THE PICTURE';
```

Replace the scan div with:

```tsx
          <div className={`story-scan ${ready ? 'ready' : ''}`}>
            <span className="story-scan-ring" />
            {scanPrompt}
          </div>
```

`src/studio/PhonePreview.tsx` carries the same two ground strings and is
deliberately left alone: it previews the ground flow for authors and has no
marker tracking behind it.

- [ ] **Step 4: Run the overlay test to verify it passes**

Run: `npx vitest run src/components/story/StoryOverlay.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire the AR layer**

In `src/components/ar/StoryARExperience.tsx`:

**a.** Add the imports:

```ts
import { INITIAL_LOCK, markerLost, markerSeen, tapped, type LockState } from '@/markers/markerLock';
import { createMarkerFrame, type MarkerFrame } from '@/xr/markerFrame';
import type { LiveMarker } from '@/xr8/markerTracking';
import type { StoryAnchor } from '@/story/storyDoc';
```

**b.** Add the refs and state, next to the existing marker-mode refs:

```ts
  /**
   * Whether this session is marker-driven. A ref AND a state: the engine
   * callbacks run outside React and read the ref; the overlay is React and
   * reads the state.
   */
  const markerModeRef = useRef(false);
  const [markerMode, setMarkerMode] = useState(false);
  /** Lock status, mirrored the same way and for the same reason. */
  const lockRef = useRef<LockState>(INITIAL_LOCK);
  const [lock, setLock] = useState<LockState>(INITIAL_LOCK);
  /** The owning marker's latest pose and its story's anchor, for the tap. */
  const liveMarkerRef = useRef<{ marker: LiveMarker; anchor: StoryAnchor } | null>(null);
  const markerFrameRef = useRef<MarkerFrame | null>(null);

  /** Writes both halves of the lock state, so they cannot drift apart. */
  const applyLock = (next: LockState): void => {
    if (next === lockRef.current) return;
    lockRef.current = next;
    setLock(next);
  };
```

**c.** In the exhibit-loading effect, after `exhibitRef.current = loaded;` add:

```ts
        markerModeRef.current = true;
        setMarkerMode(true);
```

**d.** Add the placement helper next to `placeStory`:

```ts
  /**
   * Puts the scene where the marker says it goes.
   *
   * Every marker pose reaches the tile through here and nowhere else, so if a
   * large scene turns out to swing on device, smoothing goes in one place
   * (`marker-locator-design.md` §4.1).
   */
  const placeFromMarker = (live: { marker: LiveMarker; anchor: StoryAnchor }): void => {
    const tile = tileRef.current;
    if (!tile) return;
    const e = live.marker.event;
    // Guarded, not asserted: FLAT targets carry scaledWidth and Studio only
    // ever makes PLANAR ones, but sizing from undefined yields a NaN-sized
    // plane that never appears — the most confusing failure available.
    if (!hasDimensions(e)) return;

    tile.setWidth(tileSize(e, live.anchor.widthInMarkers).width);
    tile.place(
      composeSceneMatrix(e.position, e.rotation, e.scaledWidth, [
        live.anchor.local.position[0],
        live.anchor.local.position[1],
      ]),
    );
  };

  /**
   * The marker-mode tap: latch the scene and start the story.
   *
   * The tap is anywhere on screen rather than on the picture, because aiming a
   * tap while holding a phone steady is awkward (`marker-locator-design.md`
   * §5.1 step 4).
   */
  const latchStory = (): void => {
    if (lockRef.current.status !== 'locked') {
      debugTelemetry.logEvent('story: tap ignored — no picture in view');
      return;
    }
    const live = liveMarkerRef.current;
    if (!live) return;

    placeFromMarker(live);
    applyLock(tapped(lockRef.current));
    // The frame has done its job: it said "this picture is recognised", and
    // the visitor is about to walk away from the print to see the scene.
    markerFrameRef.current?.setVisible(false);
    useStoryStore.getState().place();
    addToast({ type: 'success', message: 'The picture remembers…' });
    debugTelemetry.logEvent('story: latched to picture');
  };
```

**e.** Make `placeStory` branch on the mode. Add as its first line:

```ts
    // Marker mode never plants on the floor. Leaving the ground path reachable
    // here is the shipped defect this flow removes: a visitor on a ?e= link
    // could tap the floor and plant the story before ever seeing a picture.
    if (markerModeRef.current) {
      latchStory();
      return;
    }
```

**f.** In `onStart`, make the reticle marker-mode-aware. Replace

```ts
          const reticle = createReticle();
          scene.add(reticle.mesh);
          camera.add(reticle.scanner);
          reticleRef.current = reticle;
```

with

```ts
          // No reticle at all in marker mode — the printed picture decides
          // where the art goes, so a ground cursor would only invite the wrong
          // gesture. The lock frame takes its place.
          if (markerModeRef.current) {
            const markerFrame = createMarkerFrame();
            sceneRoot.add(markerFrame.object);
            markerFrameRef.current = markerFrame;
            debugTelemetry.setSubsystem('hitTest', 'searching');
          } else {
            const reticle = createReticle();
            scene.add(reticle.mesh);
            camera.add(reticle.scanner);
            reticleRef.current = reticle;
            debugTelemetry.setSubsystem('hitTest', 'searching');
          }
```

and delete the now-duplicated `debugTelemetry.setSubsystem('hitTest', 'searching');`
further down in `onStart`.

**g.** In `onUpdate`, add immediately after the `deltaMs` calculation:

```ts
          if (markerModeRef.current) {
            // No hit-test in marker mode. readReticlePose() runs a raycast
            // every frame and there is nothing here that would use the result.
            tileRef.current?.tick(deltaMs);
            debugTelemetry.tick(now);
            return;
          }
```

**h.** Replace the whole `createMarkerTracking({ … })` call with:

```ts
        const tracking = createMarkerTracking({
          onSelectionChange: ({ current }) => {
            if (current === null) {
              // Nothing owns the session. Started sessions are unaffected —
              // that is the point of latching.
              applyLock(markerLost(lockRef.current));
              liveMarkerRef.current = null;
              markerFrameRef.current?.setVisible(false);
              return;
            }
            const story = exhibitRef.current?.markerStories.get(current);
            if (!story?.anchor) return;

            const wasStarted = lockRef.current.status === 'started';
            // Swap the document; the texture effect above is subscribed to
            // contentStore and re-rasterizes the new story's art on its own.
            useContentStore.getState().load(story);
            applyLock(markerSeen(lockRef.current, current));
            debugTelemetry.logEvent(`story: switched to ${story.id}`);

            // A DIFFERENT picture while already walking a story re-latches on
            // the spot rather than asking for a second tap (§5.3). The first
            // pose arrives on the next frame, so the re-place happens there.
            if (!wasStarted) markerFrameRef.current?.setVisible(true);
          },
          onPose: (marker) => {
            const story = exhibitRef.current?.markerStories.get(marker.name);
            if (!story?.anchor) return;
            const live = { marker, anchor: story.anchor };
            liveMarkerRef.current = live;

            const status = lockRef.current.status;
            if (status === 'started') {
              // Latched. SLAM owns the scene now; the only thing a pose still
              // does is re-place after a switch to a different picture.
              if (lockRef.current.markerId === marker.name && tileRef.current?.placed) return;
              placeFromMarker(live);
              return;
            }
            // Locked but not started: the frame tracks the print so the
            // visitor can see it is recognised.
            const frame = markerFrameRef.current;
            if (frame && hasDimensions(marker.event)) {
              frame.setSize(marker.event.scaledWidth, marker.event.scaledHeight);
              frame.setPose(
                composeSceneMatrix(marker.event.position, marker.event.rotation, 0, [0, 0]),
              );
              frame.setVisible(true);
            }
          },
        });
```

The `tileRef.current?.placed` guard is what makes the re-latch fire exactly once:
`StoryTile.place` sets `_placed`, so after a switch the first pose re-places and
every later pose for the same marker returns early.

**i.** In `handleExitAR`, add before `markerResetRef.current?.();`:

```ts
    markerFrameRef.current?.dispose();
    markerFrameRef.current = null;
    liveMarkerRef.current = null;
    markerModeRef.current = false;
    setMarkerMode(false);
    lockRef.current = INITIAL_LOCK;
    setLock(INITIAL_LOCK);
```

**j.** Pass the lock status to the overlay:

```tsx
      <StoryOverlay surfaceReady={surfaceReady} markerLock={markerMode ? lock.status : null} />
```

**k.** Change the loading message so it is not a lie in marker mode:

```tsx
        message={markerMode ? 'Looking for the picture…' : 'Finding the ground…'}
```

- [ ] **Step 6: Run the full suite, the linter and the type-checker**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/story/StoryOverlay.tsx src/components/story/StoryOverlay.test.tsx src/components/ar/StoryARExperience.tsx
git commit -m "Lock a viewfinder onto the printed picture and let a tap start its story"
```

---

## Task 9: Close MOD-M1 in the docs, then ship

The design docs currently assert the opposite of what the code now does. Leaving
that is how the next person builds against the wrong premise.

**Files:**
- Modify: `docs/marker-layer-design.md`
- Modify: `docs/marker-layer-plan.md`
- Modify: `CLAUDE.md`
- Test: the full suite, plus the on-device checklist below.

**Interfaces:**
- Consumes: everything.
- Produces: nothing.

- [ ] **Step 1: Record the real test count**

Run: `npm run test`
Note the "N passed" file and test counts from the summary line — the next step
needs them.

- [ ] **Step 2: Update `docs/marker-layer-design.md`**

**a.** In the `§10a` table, replace the MOD-M1 row with:

```markdown
| **MOD-M1** | **CLOSED.** Superseded by `docs/marker-locator-design.md` and implemented on `feat/marker-lock-ux`: `widthInMarkers` and `local.position` are authored in Studio and honoured at runtime, so a small print now locates a much larger scene. `MARKER_NORMAL_AXIS` stayed un-needed — the design is coplanar | done |
```

**b.** In the MOD-M2 row, delete the trailing sentence `Settle before MOD-M1` and
replace it with `MOD-M1 shipped first, deliberately, and nothing in it makes this harder`.

**c.** At the top of `§7.2 The 3:4 stage`, insert:

```markdown
> **Superseded.** The 3:4 stage and `MARKER_FRONT` were removed with
> `docs/marker-locator-design.md` §3.1. The premise below — that artwork covers
> the printed picture exactly — no longer holds: the marker is an object inside
> the scene, and there is one stage, always. Kept for the reasoning.
```

**d.** At the top of `§11`'s "Offset placement is not built" bullet, change the
bullet to:

```markdown
- **Offset placement is built.** `local.position` and `widthInMarkers` are
  authored in Studio and honoured at runtime — see
  `docs/marker-locator-design.md`. In-plane rotation (`local.rotation`) is still
  identity and still unbuilt.
```

- [ ] **Step 3: Update `docs/marker-layer-plan.md`**

At the top of the Task 9 section, insert:

```markdown
> **Superseded** by `docs/marker-locator-plan.md` Task 7. The 3:4 stage and the
> faded ghost backdrop were both removed: the marker is now a full-opacity,
> draggable overlay on the one landscape stage.
```

- [ ] **Step 4: Update `CLAUDE.md`**

Replace the stale counts. In the **Commands** block change the `npm run test`
comment, and in the **Testing** section change the bold count line, using the real
numbers from Step 1. Also add to the **Gotchas** list:

```markdown
- **A marker locates the scene; it does not size it.** `widthInMarkers` is how many
  marker-widths wide the whole scene is, and `anchor.local.position` is the
  marker → scene-centre offset in the same unit, `z` always 0. Marker mode runs no
  ground hit-test and no reticle: the visitor points at the print, a lock frame
  appears, and a tap latches the scene into the world frame for SLAM to hold. See
  `docs/marker-locator-design.md`.
```

- [ ] **Step 5: Verify green, end to end**

Run: `npm run type-check && npm run lint && npm run test && npm run build`
Expected: all four pass, and `dist/` builds.

- [ ] **Step 6: Commit**

```bash
git add docs/marker-layer-design.md docs/marker-layer-plan.md CLAUDE.md
git commit -m "Record that a printed marker now locates artwork instead of sizing it"
```

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin feat/marker-lock-ux
gh pr create --base main --head feat/marker-lock-ux \
  --title "Make a printed picture locate artwork much larger than itself" \
  --body "Implements docs/marker-locator-design.md.

A small printed marker now locates a much larger scene instead of being exactly
covered by it. Authors drag and resize the picture on the stage to say how big
the scene is and where the print hangs inside it; the viewer points at the
picture, sees a lock frame, and taps to begin, after which SLAM holds the scene
while they walk around it.

Also fixes a shipped defect: marker mode still ran the ground reticle and
tap-to-place, so a visitor on a ?e= link could plant the story on the floor
before ever seeing a picture.

Plan: docs/marker-locator-plan.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01G6qHSHXwtvSmKp4KF6P4hY"
```

Do **not** merge until the on-device checks below have been run: merging deploys
to production.

- [ ] **Step 8: On-device verification**

These cannot be unit-tested (`marker-locator-design.md` §7). Run them on the
branch preview URL with a printed marker:

1. **The ground never appears.** Open a `?e=<exhibit-id>` link. The prompt must
   read `POINT AT THE PICTURE`, and no reticle may appear anywhere — including
   while pointing at the floor.
2. **The frame reads as locked.** Point at the print. Corner brackets should
   appear on it, sit tight to its edges, and follow it as the phone moves.
3. **Losing it reverts.** Look away. The prompt must return to
   `POINT AT THE PICTURE` and the brackets must vanish.
4. **The tap begins.** Tap anywhere. The story starts, the brackets vanish, and
   the scene appears at the authored size and offset.
5. **Latch survives walking.** Walk around the scene, well out of the print's
   tracking range. The scene must stay put.
6. **A 7× scene does not swing** (§4.1). Author a scene around seven
   marker-widths wide and watch the far edge while standing still. If it visibly
   swings, smoothing goes into `composeSceneMatrix` and nowhere else.
7. **A second picture still switches.** With two prints bound to two stories,
   turn from one to the other mid-story. The story should swap and the scene
   re-latch without a second tap.
8. **Ground mode is untouched.** Open the site with no `?e=`. The reticle,
   `MOVE PHONE TO FIND THE GROUND`, and tap-to-place must all behave exactly as
   before.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| §2 data model — `widthInMarkers`, `local.position`, `mode: 'latch'` | 1 |
| §2.1 validation — bounds, `z` forced to 0, axis convention | 1 (bounds), 6 (the convention's sign, tested) |
| §2.2 backward compatibility — legacy 1:1 keeps working | 1 (`'reads a legacy 1:1 anchor…'`), 6 (`'clamps a legacy 1:1 binding…'`) |
| §3.1 the 3:4 stage is removed | 7 |
| §3.2 the marker becomes a full-opacity draggable overlay | 6 (maths), 7 (UI) |
| §3.3 guard rails — stays on stage, 8% warning | 6 (maths), 7 (UI) |
| §3.4 print-width aid, not stored | 6 (`sceneWidthMetres`), 7 (UI) |
| §4 runtime maths, including the load-bearing `Q ·` | 2 |
| §4.1 jitter — single insertion point for smoothing | 2 (`composeSceneMatrix` doc), 8 (`placeFromMarker`) |
| §5.1 entry flow — no reticle, lock frame, `TAP TO BEGIN`, tap anywhere, revert on loss | 3, 4, 8 |
| §5.2 latch on tap | 3, 8 |
| §5.3 re-detection: same marker holds, different marker re-latches | 3 (machine), 8 (wiring) |
| §6 the shipped ground-reticle defect | 8 |
| §7 testing split | every task's tests; on-device list in 9 |
| §8 stopping points — no rotation, no smoothing, no out-of-plane, MOD-M2 untouched | 1 (rotation forced identity), 2 + 8 (smoothing point named, not built), 1 (`z` forced 0), 9 (MOD-M2 row) |

**Placeholders:** none. Every code step carries the code. The two places a
judgement call remains are named explicitly rather than left blank: the undo test
in Task 5 (if the store's action is not called `undo`, drop that one test) and the
CSS variables in Task 7 (match `.st-dot`, which already uses both).

**Type consistency:** `LockState` / `LockStatus` are used with the same names in
Tasks 3, 8 and `StoryOverlay`. `MarkerRect` is produced in Task 6 and consumed in
Task 7. `composeSceneMatrix`'s four-parameter signature is identical in Tasks 2, 4
(via the `setPose` doc) and 8. `setMarkerLayout`'s argument shape
`{ widthInMarkers, position }` is exactly what `anchorFromRect` returns in Task 6,
which is how Task 7 wires them together with no adapter.
