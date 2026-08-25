# Marker as locator — design

**Status:** approved in conversation 2026-08-24, section by section. Supersedes
`marker-layer-design.md` §5.1 (tile sizing), §7.2 (the 3:4 stage) and §10a.1
(MOD-M1), and closes MOD-M1. Does **not** touch MOD-M2 (the QR → scene → marker
hierarchy), which remains open and unbuilt.

---

## 1. What changes, and why

The shipped marker layer makes AR artwork **exactly the size of the printed
picture**. That was deliberate — `marker-layer-design.md` §7.2 calls it "a design
intent rather than an accident of geometry" — and it is wrong for the
installation being built. The intended use is a **small printed marker locating a
much larger scene**: the marker says *where*, not *how big*.

Two things make this the right moment. The marker layer is built, deployed and
confirmed stable on device, so this is a change to working code rather than a bet.
And `StoryAnchor` already carries both fields this needs, pinned to constants
precisely so that lifting them would be a UI addition rather than a migration
(`marker-layer-design.md` §3.3).

### 1.1 Decisions taken

| Question | Decision | Why |
|---|---|---|
| Where does artwork sit? | **Same plane as the marker, extending beyond it** | Keeps everything coplanar, so `MARKER_NORMAL_AXIS` stays un-needed — the riskiest unknown is avoided entirely |
| Is the marker centred in the scene? | **No — the author places it** | A print hangs where it hangs; forcing it to the artwork's centre would dictate the physical installation |
| How does the author express it? | **Drag and resize the marker on the scene stage** | The authoring picture matches the wall: you see the print inside your artwork, where it will physically be |
| What holds the scene once started? | **Latch on tap — SLAM holds it** | See §5. Verified: less code than following, and the interaction requires leaving the marker's reliable range |

---

## 2. Data model

**No new fields, and `schemaVersion` stays 4.** Both fields exist and are
currently forced to constants by `sanitizeAnchor`.

```ts
widthInMarkers: number          // was pinned to 1
local: { position: [x, y, 0], rotation: identity }
```

**`widthInMarkers`** — how many marker-widths wide the whole scene is. A print
occupying 14% of the scene's width stores `≈7.14`. Still a ratio, so still
unit-free: the engine never has to disclose whether it reports metres
(`marker-layer-design.md` §5.1's reasoning, now carrying real weight rather than
collapsing to 1).

**`local.position`** — where the scene's centre sits relative to the marker,
**also in marker-widths**, `z` fixed at 0. One unit for both numbers rather than
two mental models. Marker low-right of scene centre → scene centre is up-left of
the marker → roughly `[-0.9, 0.6, 0]`.

**`local.rotation` stays identity.** In-plane rotation — hanging the print at an
angle — is addable later without disturbing anything here. Nobody has asked.

**`mode` becomes `'latch'`** for marker-anchored stories (§5). `'follow'` remains
a permitted value.

### 2.1 Validation

`sanitizeAnchor` stops *forcing* these and starts *bounding* them, because they
now arrive both from a UI and from untrusted published JSON:

- `widthInMarkers`: finite and within `(0, 100]`. A hundred marker-widths is
  already extreme — a 100 mm print locating a 10 m scene — so anything beyond it
  is a mistake rather than an intention. Out of range → fall back to `1`, which
  is the pre-existing behaviour and therefore safe.
- `local.position`: finite; `x` and `y` clamped to `[-100, 100]` for the same
  reason; `z` **forced to 0** — this design is coplanar by construction, so a
  non-zero `z` from anywhere means something upstream is wrong.
- `local.rotation`: forced to identity.

**Axis convention**, stated because the sign is easy to invert and the failure is
silent: `[ox, oy]` is the vector **from the marker to the scene's centre**, in the
marker's own frame, with `+x` right and `+y` up as seen by someone facing the
print. So a marker sitting low and right of centre gives a negative `x` and a
positive `y`.

### 2.2 Backward compatibility

Every story published so far carries `widthInMarkers: 1` and a zero offset. Under
the new maths that means exactly what it means today — artwork covering the
marker — so existing links keep working with no migration and no version bump.

---

## 3. Studio

### 3.1 The 3:4 stage is removed, not adapted

`MARKER_FRONT` and the landscape/portrait stage swap (`marker-layer-plan.md`
Task 9) were built on the premise that artwork covers the marker. That premise is
gone. Binding a marker no longer changes the stage's shape at all: the scene is
the scene, and there is **one stage, the existing landscape one, always**.

`stageGeometry.ts` keeps the `StageFrame` parameterisation — it is harmless and
already tested — but `MARKER_FRONT` and the `anchor ? … : …` frame selection in
`StageEditor.tsx` come out.

### 3.2 The marker becomes an overlay

A rectangle on the scene stage: draggable, resizable from a corner, aspect locked
to 3:4 (what gets printed), with the marker's **thumbnail drawn inside it at full
opacity** — it represents a real object on the wall now, not a faint alignment
guide.

Position and scale both fall out of that one interaction. Nothing is typed.

This also removes a defect rather than working around it: the old ghost was drawn
*behind* the composed art and could be entirely hidden by a full-bleed
background. An overlay on top cannot be.

### 3.3 Guard rails

- **The rectangle stays inside the stage.** A print hanging outside its own
  artwork is possible in principle and almost always a mistake, and there is no
  way to preview it.
- **Below ~8% of scene width, warn.** A marker that small relative to its scene
  forces the visitor close enough to fill the frame with it. A warning, not a
  block — a large room with a large print may be exactly right.

### 3.4 The print-width aid

A field for the intended print width — "100 mm" — displaying "your scene will be
about 0.8 m across". **Not stored, not published.** It is the one place relative
units become a real measurement, and it exists because getting that wrong is
expensive in paper and ink.

---

## 4. Runtime

Given the engine's marker position `P`, orientation `Q`, and width `W`, and the
anchor's `k` (= `widthInMarkers`) and `[ox, oy]` (= `local.position`):

```
scene width    = W × k
scene centre   = P + Q · (ox·W, oy·W, 0)
scene rotation = Q
scene scale    = 1
```

**The `Q ·` is load-bearing.** The offset is expressed in the marker's own frame
and must be rotated into world space before being added. Omit it and the scene
slides in a fixed world direction regardless of the print's orientation — which
looks correct on a print hanging square in front of the tester and fails on a
wall at an angle. **This gets a test with a deliberately rotated marker**, because
it is the mistake this maths invites.

Scale stays out of the matrix, unchanged from `marker-layer-design.md` §5.1: the
engine's own scale estimate wobbles, and folding it in would make the scene
breathe. Size comes from `W × k`, steady because it is a ratio.

### 4.1 Jitter is multiplied

Tracking is confirmed stable on device at 1:1. At seven marker-widths the same
angular error moves the scene's far edge seven times as far, and content furthest
from the print swings most. **Stable at 1:1 does not imply stable at 7×.**

Smoothing is deliberately **not** built now — it costs responsiveness and may be
unnecessary, and §5's latch removes most of the exposure anyway. Instead the pose
passes through a single function on its way to the tile, so a smoothing step can
be inserted in exactly one place if the large scene proves to swing.

---

## 5. Entry flow, and why latch

### 5.1 The flow

Marker mode (`?e=` present):

1. **Ground reticle never appears.** Pointing at the floor is meaningless when
   the story belongs to a picture on a wall.
2. **A lock frame draws on the print** the moment it is recognised — tight,
   registered to the physical object, following it.
3. **Prompt becomes `TAP TO BEGIN`.** Copy replaces
   `MOVE PHONE TO FIND THE GROUND` → `TAP THE GROUND TO PLACE`.
4. **The tap starts the story** — anywhere on screen, not on the picture, because
   aiming a tap while holding a phone steady is awkward.
5. **Losing the print before tapping** reverts to `POINT AT THE PICTURE`.

Ground mode (no `?e=`) is untouched.

### 5.2 Why the pose latches on tap

To be recognised, a marker must fill a good part of the frame — the visitor
stands close. A scene eight marker-widths across then extends far outside their
field of view. **The interaction inherently requires stepping back to look**, and
that is precisely where a marker tracks worst: small in frame, at the moment the
scene it drives is largest and any error is most multiplied.

Latching on tap ends the marker's job at the moment it has finished locating.
SLAM then holds the scene in world space while the visitor walks around it.

This is **less** implementation than following, which is worth stating plainly
because it inverts the obvious assumption. `storyTile.ts`'s own doc comment
records why:

> 8th Wall's SLAM keeps the world frame stable, so once the tile's group matrix
> is set it simply stays put — no per-frame anchor update needed.

World tracking is already enabled in marker mode (`disableWorldTracking` is never
set true). So latch = place once and stop calling; follow = keep calling every
frame. The ground path has always worked this way.

### 5.3 What re-detection does

Once latched, a later detection of the **same** marker does not move the scene —
the visitor has walked around it and SLAM is the authority. Detecting a
**different** marker still switches stories, as today, and re-latches to the new
marker's pose.

---

## 6. A defect this fixes

**In the shipped build, marker mode still runs the ground reticle and
tap-to-place.** A visitor on a `?e=` link can tap the floor and plant the story
before ever seeing a picture. §5.1 removes it as a consequence of the new flow,
but it is a present bug and not merely a missing improvement.

---

## 7. Testing

Holding the line from `arcade-architecture.md` §12 — pure logic is unit-tested,
engine and camera behaviour is verified on device.

| Unit-tested | On-device only |
|---|---|
| `scene centre` maths, **including a rotated marker** (§4) | Whether a 7× scene visibly swings (§4.1) |
| Sizing from `widthInMarkers`, and its bounds | Whether the lock frame reads as "locked" |
| `sanitizeAnchor`'s new bounds, including `z` forced to 0 | Detection range against a small print |
| The lock state machine: unlocked / locked / started, and what a lost marker does to each | Whether latch survives walking around the scene |
| Studio drag/resize maths, and the 8% warning threshold | The feel of tap-to-begin |

---

## 8. Deliberate stopping points

- **In-plane rotation is not built.** `local.rotation` stays identity.
- **Smoothing is not built** — an insertion point exists (§4.1).
- **Out-of-plane offset is still not built**, and this design keeps
  `MARKER_NORMAL_AXIS` un-needed. Content standing off the wall remains future work.
- **MOD-M2 is untouched.** The QR → scene → marker hierarchy, session state, and
  one marker meaning different things per scene are all still open
  (`marker-layer-design.md` §10a.2). Nothing here makes them harder.
- **The print-width aid is not persisted**, so it does not travel between
  devices or authors.
