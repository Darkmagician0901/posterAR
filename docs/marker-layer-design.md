# The image-marker layer — design

**Status:** Approved, not yet built.
**Date:** 2026-08-13

Adds the marker half of ARCADE: an operator uploads a picture, binds it to a
story, and groups stories into an exhibit; a visitor walks a room of printed
pictures and each one comes alive with its own story.

This is the spec `docs/arcade-architecture.md` §14 defers as *"Anchoring — its
own spec."* Where this document and `arcade-architecture.md` disagree, **this
one is current** — §1 explains the one place they do.

| Companion | Contents |
|---|---|
| `docs/arcade-architecture.md` | The system as it stands today |
| `docs/marker-testbed-design.md` | The measurement rig this is gated on |

---

## 1. The constraint that turned out not to exist

`arcade-architecture.md` §10.3 records a hard constraint:

> **Markers cannot be created in-app.** The CLI is interactive-only, so a human
> generates every fingerprint, forever.

**This is false, and it was the only thing blocking operator marker upload.**

`@8thwall/image-target-cli@1.0.0` is MIT, 15 files, and depends on exactly one
package: `sharp`. Its entire PLANAR path, in `src/apply.js`, is:

```js
const croppedImage   = originalImage.clone().extract(crop.geometry)
const thumbnailImage = croppedImage.clone().resize({height: 350})
const luminanceImage = croppedImage.clone().resize({height: 640}).grayscale()
```

plus a JSON document whose `metadata` field is the literal value `null`:

```js
const data = {
  imagePath: `image-targets/${resources.luminanceImage}`,
  metadata: null,
  name,
  type: crop.type,          // 'PLANAR' | 'CYLINDER' | 'CONICAL'
  properties: crop.geometry,
  resources,
  created: Date.now(),
  updated: Date.now(),
}
```

There is **no feature extraction and no proprietary descriptor**. The
"fingerprint" is a grayscale image, a crop rectangle, and some filenames. The
engine computes matchable features on the device at runtime, from the grayscale
image, which is why none of that work appears here.

The CLI is interactive because **choosing a crop is a human judgement**, not
because the computation is secret. Move the crop decision into a browser UI and
the remaining pixel work is a canvas operation.

Two consequences follow, and they shape everything below:

1. Operator marker upload is buildable, entirely client-side, with no new
   service, no native binary, and no new dependency.
2. `arcade-architecture.md` §10.3 needs amending when this ships. Its
   companion advice — that an operator who picks a plain logo will get bad
   tracking and blame the software — remains true and is honoured in §6.

---

## 2. Decisions record

| Decision | Choice | Where |
|---|---|---|
| **Session container** | An **exhibit** — a list of stories, opened at `/?e=<id>` | §3 |
| **Marker binding** | Lives on the **story**, not the exhibit. Derived, never duplicated | §3.2 |
| **What the marker does** | The art is **pinned onto the printed picture** — same plane, same centre, same size | §5 |
| **Frame aspect** | A marker-bound story's stage becomes **3:4**, with the marker as a ghost backdrop | §7.2 |
| **Fingerprint generation** | **Client-side canvas** in Studio, a port of the CLI's PLANAR path | §4 |
| **Concurrency** | **One story live at a time**, selected by the marker you are looking at | §6.2 |
| **Marker identity** | Content-addressed: `markerId = SHA-256(luminance bytes)` | §3.3 |
| **Marker storage** | `markers/<sha>.png`, every object under **its own** hash. No stored `target.json` — the viewer synthesizes it | §3.4, §3.5 |
| **Anchor mode** | `follow` in v1. `latch` stays in the type, unbuilt | §5.2 |

### The one decision that would invalidate rather than extend this

**Does follow-mode tracker jitter read as shimmer against the printed picture's
own edges?**

Art pinned exactly onto a marker is the most demanding possible test of pose
stability, because the physical picture is right there as a reference — a
millimetre of jitter that would be invisible on a floating poster shows as the
art sliding against the border it is meant to cover. If it does, the answer is
not to abandon markers but to move to `latch`, or to inset the art slightly so
its edges do not coincide with the marker's. **Phase 0 exists to find out**
(§10).

---

## 3. Data model

### 3.1 The exhibit

```ts
interface ExhibitDoc {
  schemaVersion: 1;
  id: string;                 // the ?e= value
  title: string;
  storyIds: string[];         // ≤ 10 — the engine's simultaneous-target cap
}
```

Stored at `exhibits/<id>.json`, mutable at a stable key with a 60-second TTL —
the same treatment `stories/<id>.json` gets, and for the same reason: `/?e=<id>`
must resolve without a lookup table, and republishing must be promptly visible.

### 3.2 Why the exhibit does not name markers

The obvious shape is `entries: [{ markerId, storyId }]`. It is rejected, because
`StoryDoc.anchor.markerId` already records which marker a story belongs to.
Storing the pair in the exhibit as well creates two copies of one fact, and two
copies of one fact drift — an operator rebinds a story to a new marker, the
exhibit still names the old one, and the failure is a picture that silently does
nothing.

So **the story owns its marker and the exhibit owns nothing but membership.**
The marker→story map is derived at load time and cannot go stale:

```
exhibit.storyIds → fetch each story → story.anchor.markerId → the map
```

This also matches the authoring order the operator actually follows: upload a
marker, bind it while designing the frame, and only later decide which exhibit
the story belongs to. And a marker-bound story remains openable on its own at
`/?s=<id>` — an exhibit of one, needing no exhibit document at all.

### 3.3 The anchor

Adopted from `arcade-architecture.md` §6.4, narrowed to what v1 builds:

```ts
interface StoryAnchor {
  type: 'marker';
  /** SHA-256 of the luminance PNG — the image the tracker matches. */
  markerId: string;          // ASSET_ID_RE — /^[a-f0-9]{64}$/
  /** SHA-256 of the thumbnail PNG, addressed on its own bytes (§3.4). */
  thumbId: string;           // ASSET_ID_RE
  /** The CLI's `properties` block; feeds the synthesized target (§3.5). */
  crop: MarkerCrop;
  local: LocalTransform;     // identity in v1
  widthInMarkers: 1;
  mode: 'follow';
}
```

`crop` is the `MarkerCrop` produced by `src/markers/markerCrop.ts` — the CLI's
crop rectangle plus `isRotated`, `originalWidth` and `originalHeight`. It lives
in the story rather than in a stored file for the reason §3.4 gives.

Absent ⇒ today's tap-to-place ground hit-test, unchanged. The five-era landscape
story has no anchor and is untouched by every part of this design.

`markerId` reuses `ASSET_ID_RE` from `src/story/assetHash.ts`. That regex is the
whole security property (`arcade-architecture.md` §6.2): 64 hex characters
cannot express a scheme, a host, or a traversal, so a published exhibit — which
is untrusted input — **cannot point a visitor's browser anywhere**. The exhibit
document contains no URL for the same reason the story document contains none.

`local` and `widthInMarkers` are kept in the type despite being fixed in v1.
They cost two fields and they are what §11's growth path needs; removing them
would make offset placement a schema migration instead of a UI addition.

### 3.4 Marker storage

| Key | Contents |
|---|---|
| `markers/<markerId>.png` | 480×640 grayscale — what the tracker matches |
| `markers/<thumbId>.png` | 263×350 — Studio library and the viewer's scan hint |

**Every stored object is addressed by the hash of its own bytes, and there is
no stored `target.json`.**

That is not a stylistic choice. `api/story-assets.ts` is unauthenticated, and
its entire safety model is that the key is derived server-side from the
submitted digest, which is then bound into a *signed* `x-amz-checksum-sha256`
header — so a caller can only ever write bytes that match their own address.
Grouping a marker's files under `markers/<markerId>/` would put a thumbnail and
a JSON document at addresses derived from a *different* object's hash. Nothing
could verify those bytes, and with `If-None-Match: *` making writes first-come,
an unauthenticated caller could squat them ahead of the operator.

The codebase has already met this problem and already solved it: `r1024Id` is a
second content address rather than a slot under its parent's, for exactly this
reason — see the comment in `src/story/assetApi.ts`. This design follows that
precedent instead of re-opening the hole.

A poisoned `target.json` would be the worst of the three, because
`resolveImagePath` deliberately leaves absolute URLs alone, so an
attacker-chosen `imagePath` would reach the engine untouched.

`markerId = SHA-256(luminance bytes)` — the same content addressing assets use
(`arcade-architecture.md` §7.2), buying the same four things: automatic dedup,
immutability so `max-age=31536000, immutable` is safe, existence as a certainty
via `HeadObject`, and safe republishing mid-visit.

The luminance image is hashed rather than the source photo, because the
luminance image is what the tracker actually consumes. Two different source
photos that crop to identical grayscale bytes *are* the same marker; the same
source photo cropped differently is not.

The cropped and original images the CLI also emits are **not stored**. Nothing
reads them — the tracker uses the luminance image and the UI uses the thumbnail
— and keeping the operator's full-resolution original in a public bucket is a
cost with no benefit.

### 3.5 The synthesized target.json

The fingerprint document is **built on the client at load time** rather than
stored. Everything in it is either a constant, derivable from the `markerId`, or
carried by `StoryAnchor.crop`:

```ts
function markerTargetData(anchor: StoryAnchor): ImageTargetData {
  return {
    imagePath: `/image-targets/${anchor.markerId}.png`,   // page-relative — §9
    metadata: null,
    name: anchor.markerId,
    type: 'PLANAR',
    properties: anchor.crop,
    resources: { luminanceImage: `${anchor.markerId}.png` },
    created: 0,
    updated: 0,
  };
}
```

Three things follow, and each one removes a failure mode rather than adding a
capability:

- **There is no unverifiable object to poison.** The document is constructed
  from a story that already passed `validateStoryDoc`, so `imagePath` is built
  from a value that matched `ASSET_ID_RE` and cannot name a host.
- **`name` is the `markerId`.** `imagefound` events carry `name`, so a
  detection keys into §3.2's map directly — no second lookup, and two markers
  cannot collide on a human-chosen label. The operator's own name for a marker
  is Studio-side metadata that never reaches the engine.
- **Both images are PNG**, whatever the source photo was. The CLI mirrors the
  source extension; a fixed extension makes the key derivable from the hash
  alone, and lossless is the right choice for an image the tracker matches
  against.

`created` and `updated` are zeroed because nothing reads them and a wall-clock
value would make the derived document differ between loads for no reason.

Both `resolveImagePath` and the manifest-loading half of
`src/xr8/imageTargetData.ts` become unnecessary on this path — the marker
testbed's manifest flow stays as it is for `?mode=marker`, and the viewer
synthesizes instead.

---

## 4. Marker generation

A direct port of the CLI's PLANAR path into `src/markers/fingerprint.ts`,
engine-agnostic and pure enough to unit-test.

### 4.1 The algorithm

| Step | CLI (`sharp`) | Studio (canvas) |
|---|---|---|
| Default crop | `getDefaultCrop` — centre 3:4, rotating landscape sources | ported verbatim, pure arithmetic |
| Validate | `validateCrop` — ≥480 wide, ≥640 tall, in bounds | ported verbatim |
| Crop | `.extract(geometry)` | `drawImage` with source rect |
| Luminance | `.resize({height:640}).grayscale()` | `createImageBitmap(resizeHeight:640, resizeQuality:'high')` then grayscale |
| Thumbnail | `.resize({height:350})` | `createImageBitmap(resizeHeight:350)` |
| Document | the JSON in §1 | identical, byte-for-byte in shape |

`getDefaultCrop` and `validateCrop` are arithmetic on width and height with no
image data involved, so they port exactly. Only the three pixel operations
change implementation.

### 4.2 The one risk this introduces

Browser resampling is not `sharp`'s Lanczos. The luminance image will differ
slightly from what the CLI produces from the same photo.

This is judged low-risk: the tracker matches that image against a live camera
feed carrying motion blur, rolling shutter, uneven lighting and JPEG artefacts,
which is a far larger perturbation than a resampling kernel. But it is
**unverified**, and it is verified directly in Phase 0 (§10) by generating one
fingerprint each way from the same photo and comparing detection latency and
jitter side by side. If the browser version measurably underperforms, the
fallback is a Lambda running the CLI's own `applyCrop` — the JSON format is
unchanged either way, so nothing downstream moves.

### 4.3 Upload

Two `PUT`s — luminance and thumbnail — through the presign flow in
`api/story-assets.ts`, which needs **one narrow extension**:

```ts
// request gains an optional discriminator; absent ⇒ 'asset', so every
// existing caller is unaffected.
kind?: 'asset' | 'marker'
```

| | `kind: 'asset'` (today) | `kind: 'marker'` |
|---|---|---|
| Accepted type | `image/webp` | `image/png` |
| Key | `assetKey(sha)` → `assets/<sha>/full.webp` | `markerKey(sha)` → `markers/<sha>.png` |

The key stays **derived server-side from the submitted digest**, so the property
that makes this endpoint safe to leave unauthenticated is preserved exactly:
a caller can still only write bytes that match their own address. The client
hashes first, and the signed `If-None-Match: *` and `x-amz-checksum-sha256`
headers apply unchanged. A 412 means an identical marker already exists, which
is a successful dedup, not an error.

A separate prefix rather than a separate endpoint, because the logic is
identical apart from two lookups — and a separate prefix rather than reusing
`assets/`, because §7.4's garbage collector derives reachability from
`doc.assets` alone. Marker ids live in `doc.anchor`, so markers stored under
`assets/` would read as unreachable and be deleted after the grace period.
Keeping them under `markers/` means the GC never sees them and needs no change.

---

## 5. Placement

### 5.1 Why identity retires most of the unverified list

`arcade-architecture.md` §13 lists four unverified device facts. Pinning the art
onto the marker retires three of them outright:

| §13 item | Status under this design |
|---|---|
| Marker normal axis may be +Y, not +Z | **Moot.** `local` is identity; nothing is offset along any axis |
| `configure({ scale })` may need `'absolute'` | **Moot.** See below |
| `scaledWidth`/`scaledHeight` may not be metres | **Moot.** See below |
| ~10 simultaneous-target cap | **Applies.** Enforced by the exhibit validator (§8) |

The scale items are moot because the tile is built from the engine's *own*
reported dimensions:

```
plane = PlaneGeometry(event.scaledWidth, event.scaledHeight)
matrix = rigid(event.position, event.rotation)      // scale deliberately excluded
```

A plane sized from `scaledWidth` covers the marker exactly **whatever those
units mean**, because the same number describes both. The design never needs to
know whether it is metres. This is the same reasoning that made
`widthInMarkers` a ratio, carried one step further to the point where the ratio
is 1 and the question disappears.

Scale is excluded from the matrix for the reason `marker-testbed-design.md` §5
gives: a scale estimate wobbling by 1% would rescale every stored offset.

### 5.2 Follow, not latch

v1 ships `follow` — re-derive the world pose every frame from `imageupdated`.
For content pinned *onto* a picture, follow is correct almost by definition: the
art must stay welded to the physical object, and latch's advantage (surviving
loss of the marker) is worth little when the art is only meaningful while you
are looking at the picture it covers.

`latch` stays in the type as a value `mode` can take, unbuilt, because Phase 0
may show follow's jitter is unacceptable and switching then should be a
renderer change rather than a schema change.

In both modes the rule from `marker-testbed-design.md` §6 holds: **an asset is
never moved while its marker is out of view.**

---

## 6. Viewer

### 6.1 Load

```
/?e=<id>
      │
      ▼  resolveExhibitSource(location.search)      ← beside resolveStorySource
      ▼  GET ${STORY_BASE}/exhibits/<id>.json
      ▼  validateExhibitDoc — per-field fallback, never all-or-nothing
      │
      ▼  for each storyId: GET stories/<storyId>.json   (KB each)
      ▼  collect anchor.markerId  →  Map<markerId, storyId>
      │        (the synthesized target's `name` IS the markerId — §3.5 —
      │         so an imagefound event keys into this map directly)
      │
      ▼  for each anchor: markerTargetData(anchor)      ← synthesized, §3.5
      │        no fetch — the engine loads /image-targets/<markerId>.png
      │        itself, same-origin via the §9 rewrite
      │
      ▼  XR8.XrController.configure({
           disableWorldTracking: false,
           imageTargetData: [ ...targets ],
         })
      ▼  scan prompt, showing each marker's thumbnail as a hint
```

Story **documents** are fetched up front — they are kilobytes, and having them
resident is what makes switching instant. Story **assets** are resolved lazily
on first detection of their marker, through the existing `resolveAssets` LRU in
`src/story/assetResolver.ts`, because those are the megabytes and a visitor may
never walk to half the pictures.

### 6.2 Switching

One story is live at a time. `imagefound` / `imageupdated` name a marker; that
name resolves through the derived map to a story, and when it differs from the
live one the viewer swaps document, textures and narration chrome together.

Selection is by **the marker nearest the centre of the screen**, not by
whichever fired most recently. Two pictures on one wall are both tracked at
once, and "most recent event" would flicker between them as the visitor's hand
moves; "nearest centre" is stable, and it matches what a visitor means by
looking at something.

A short dwell — a marker must hold centre for a beat before it claims the
session — keeps a glance across the room from yanking the story away
mid-sentence.

### 6.3 Rendering

`StoryTile` already accepts a world matrix and an art aspect, so marker
placement is a new **source** for that matrix rather than a new renderer. The
existing ambient tint, GIF pipeline and texture cache are untouched.

---

## 7. Studio

### 7.1 Markers screen

New. Drop a photo → a 3:4 crop box, draggable, defaulting to
`getDefaultCrop` and refusing anything below 480×640 → preview of the exact
grayscale image the tracker will use → upload.

The preview matters: it is the only moment the operator sees what the tracker
sees, and a picture that looks rich in colour can be flat in grayscale. The
screen states the marker rules from `arcade-architecture.md` §10 plainly —
detailed, busy, non-repeating, matte when printed — because §10.3's warning
still stands: an operator who picks a logo gets bad tracking and blames the
software.

The library lists uploaded markers by thumbnail, with which story each is bound
to, and offers a print-ready download of the cropped image at known dimensions.

### 7.2 The 3:4 stage

> **Superseded.** The 3:4 stage and `MARKER_FRONT` were removed with
> `docs/marker-locator-design.md` §3.1. The premise below — that artwork covers
> the printed picture exactly — no longer holds: the marker is an object inside
> the scene, and there is one stage, always. The ghost backdrop became a
> full-opacity, draggable overlay drawn *on top of* the composed art, which also
> fixed a defect in the version described here: drawn behind, it could be
> entirely hidden by a full-bleed background. Kept for the reasoning.

Binding a marker to a story switches the composer stage from the era art's
~2:1 landscape to the marker's 3:4 portrait, and paints the marker's thumbnail
behind the canvas at low opacity.

The operator is then literally designing on top of the picture they printed —
which is what makes "the art covers the marker exactly" a design intent rather
than an accident of geometry. Props are dragged onto the ghost; alignment with
the real picture is visible while authoring instead of discovered on a phone.

Unbinding restores the landscape stage. Existing landscape stories never see
this surface.

### 7.3 Exhibit screen

New and deliberately small: name the exhibit, pick which stories belong to it,
publish. It refuses a story with no anchor (nothing would trigger it) and
refuses an eleventh story (§8).

---

## 8. Validation and error handling

Following `arcade-architecture.md` §9.2 — per-field fallback, never
all-or-nothing — and its rule that a failure which would render as a silent gap
on a visitor's device must be caught at **publish** time instead.

**At publish:**

| Condition | Result |
|---|---|
| A story in the exhibit has no `anchor` | **422.** Nothing would ever trigger it |
| More than 10 stories | **422**, naming the engine's simultaneous-target cap |
| Two stories bound to the same `markerId` | **422.** One picture cannot mean two things |
| `markerId` fails `ASSET_ID_RE` | **422** |
| `markers/<markerId>.png` missing (`HeadObject`) | **422.** The marker was never uploaded |
| `crop` missing or failing `validateCrop` | **422.** The synthesized target would be malformed |

**At runtime:**

| Failure | Behaviour |
|---|---|
| Exhibit fetch fails | Bundled factory story — the existing fallback for every load path |
| One story of several fails | Skip that entry, configure the rest, note it in telemetry |
| One marker's luminance PNG 404s | That picture is inert; the others still track. Surfaced in the HUD |
| No marker detected | Scan prompt persists, showing thumbnails as hints |
| `trackingstatus` → `LIMITED` | Existing HUD treatment, unchanged |

The asymmetry is deliberate: at publish, refuse loudly, because the operator is
present and can fix it. At runtime, degrade quietly, because the visitor cannot.

---

## 9. The same-origin requirement

`arcade-architecture.md` §10.2 records that `imagePath` resolves **relative to
the page URL**, and that the engine's handling of an absolute cross-origin path
is undocumented. That reasoning is unchanged by the move to Amplify: the app is
served from Amplify and content from the S3/CloudFront origin, so
`VITE_STORY_BASE_URL` and `VITE_ASSET_BASE_URL` are still set and marker files
are still cross-origin.

So the viewer must request a **same-origin** `/image-targets/<markerId>.png`
path, and Amplify app `d114nr20m4npww` needs a rewrite mapping
`/image-targets/<path>` to `markers/<path>` on the content distribution, ordered
**before** the SPA catch-all.

Note this rewrite serves only the luminance **image**. There is no
`target.json` to fetch (§3.5), so the undocumented-path question applies to
exactly one file per marker.

This is an ops item, not a code item, and it is **not yet written**: the real
distribution domain has to be read back from the account first. It is listed in
§12 rather than guessed at here.

---

## 10. Build sequence

| Phase | Delivers | Gated by |
|---|---|---|
| **0** | **Device verification.** Generate one fingerprint with the CLI and one with the ported browser code from the same photo. Print matte. Run `?mode=marker`. Record detection latency, follow-mode jitter, and the two generators side by side | nothing |
| **1** | `fingerprint.ts`, the Markers screen, marker upload | phase 0 |
| **2** | `StoryAnchor` on `StoryDoc`, the 3:4 stage, the ghost backdrop | phase 1 |
| **3** | `ExhibitDoc`, its validator, the Exhibit screen, publish | phase 2 |
| **4** | Viewer `/?e=<id>`, multi-target configure, marker-driven switching | phase 3, OPS-M1 |

**Phase 0 is a gate, not a formality.** It answers §2's invalidating question
and §4.2's resampling risk in one sitting, and both answers change what gets
built. The testbed on `feat/marker-spaces-testbed` already measures exactly
these quantities and needs no changes to serve this purpose.

---

## 10a. Model mismatches recorded for a later revision

**Raised 2026-08-21, during Phase 0 testing. Nothing here is being changed now** —
recorded so a later revision resolves them deliberately rather than rediscovering
them. Both are *product model* questions, not defects: what is built matches what
this document specified, and this section says where that specification and the
intended installation diverge.

### 10a.1 Content is currently the size of the marker

§5.1 sizes the tile from the engine's own `scaledWidth`/`scaledHeight`, and
`widthInMarkers` is pinned to 1, so **the art covers the printed marker exactly**.
That is stated as intent throughout: §7.2 calls it "a design intent rather than an
accident of geometry", and the 3:4 composer stage exists to serve it.

The intended installation is the other way round: **a small marker acting as a
locator, with content substantially larger than it** — the marker locates the
scene, it does not bound it. Under the shipped model, a small printed card yields
a small story.

The schema already anticipates this and is why §3.3 kept both fields:
`widthInMarkers` is a ratio and `local` is a transform, so this is a UI addition,
not a migration. `sanitizeAnchor` currently *forces* both (to `1` and identity),
and that clamp is the thing a revision removes.

What a revision has to supply:

- **A Studio control** for scale and offset, and the clamp lifted from
  `sanitizeAnchor`.
- **`MARKER_NORMAL_AXIS`.** §5.1 retires this question by keeping everything
  coplanar — nothing is offset along any axis, so which way is "off the picture"
  never has to be known. Floating content reinstates it. Worth answering during a
  Phase 0 run while the testbed is already standing.
- **Offsets expressed in marker-widths, not metres.** The same reasoning that made
  `widthInMarkers` a ratio: the ratio cancels the units, so the design never has to
  decide whether the engine reports metres.
- **A different composer stage.** §7.2's 3:4 stage *is* the marker. When the marker
  is a token inside a larger scene, the stage wants to show the marker small within
  that scene instead.

**The risk to weigh, and it is the real one:** jitter scales with
`widthInMarkers`. §5.1 already excludes scale from the pose matrix because a 1%
wobble would rescale every stored offset. At 1:1 an angular error moves the art
millimetres; at 8x it moves it eight times as far, and the content furthest from
the marker swings most. VER-M1's jitter measurement was already the more important
of the two — under this model it is decisive, and should be re-read with a large
multiplier in mind rather than at 1:1.

### 10a.2 The intended hierarchy is QR to scene to marker, and is one level deeper

The installation is meant to run:

```
one QR code  ->  starts a session at a SCENE
                 the scene contains several MARKERS
                 scanning a marker  ->  shows something
```

What is built maps onto that only partly:

| Intended | Built | Gap |
|---|---|---|
| QR opens a scene | `?e=<id>` opens an exhibit | Close enough; an exhibit is a scene |
| A scene holds several markers | An exhibit lists stories, each owning one marker | Works |
| Scanning a marker shows something | A marker resolves to a whole `StoryDoc` | Granularity — "something" may be smaller than a five-frame story |
| A session has state | Loading is stateless | **No session concept exists** |
| A marker may mean different things | One marker resolves to one story | **1:1, enforced** |

Two of those are structural.

**There is no session.** `resolveExhibitId` and `buildMarkerStoryMap` (§3.2, §6.1)
run once at load and produce a fixed map. Nothing carries state between marker
scans, so "the third picture behaves differently once you have seen the first two"
has nowhere to live. A revision adds a session layer above the marker map; it does
not modify the map.

**A marker binds to exactly one story, and that is enforced in two places.**
`api/publish-exhibit.ts` refuses two stories on one marker with a 422, and
`buildMarkerStoryMap` keeps the first writer at runtime. Both were deliberate —
§8's reasoning is that one picture meaning two things is an operator error a
visitor cannot recover from.

The intended hierarchy wants the opposite in one specific sense: the *same physical
marker* may need to mean different things **depending on scene or session state**.
Note the binding direction makes this harder than it looks — the anchor lives on
the *story* (`doc.anchor`), so a story owns its marker globally. Expressing "this
marker, in this scene, means X" requires the binding to gain a scene dimension:
either it moves onto the exhibit, or the exhibit carries an override map.

That is a genuine schema change rather than a clamp being lifted, and it is the
larger of the two items here. It also reframes the refusal: the publish-time check
would become "one marker means one thing *within a scene*", which is still worth
enforcing and is a narrower rule than the one built.

**Sequencing note.** 10a.1 is a UI addition on an anticipated schema. 10a.2 changes
where a marker binding lives. If both are wanted, settle 10a.2 first — moving the
binding would otherwise mean building the scale/offset UI twice.

---

## 11. Deliberate stopping points

- **Offset placement IS built**, as of `docs/marker-locator-design.md`.
  `local.position` and `widthInMarkers` are authored by dragging the picture on
  the stage and honoured at runtime. It stayed clear of `MARKER_NORMAL_AXIS`
  because the offset is *in the marker's plane*: art that floats **in front of**
  a picture is still unbuilt, and still needs that verification. In-plane
  rotation (`local.rotation`) is also still identity and still unbuilt.
- **`latch` IS built**, and is now the only mode that renders — see
  `marker-locator-design.md` §5.2, which found it to be *less* code than follow,
  not more. `sanitizeAnchor` forces it, including on documents published as
  `follow`.
- **Curved markers are not supported.** The CLI emits `CYLINDER` and `CONICAL`
  with real geometry maths in `unconify.js`; Studio generates `PLANAR` only.
  Nothing in the storage layout prevents adding them.
- **Ten markers per exhibit**, from the engine's cap. Splitting a larger room
  into several exhibits works today; loading marker sets by proximity does not.
- **No marker deletion.** Markers are content-addressed and immutable, and sit
  outside the asset GC's prefix entirely (§4.3), so nothing collects them. At
  a few kilobytes each that is the right trade for now.
- **The marker library is per-device until a marker is bound.** A marker's
  metadata — its `crop` and `thumbId` — lives in `StoryAnchor` (§3.3), so a
  marker uploaded but not yet attached to a story is recorded only in the
  Studio's `localStorage` draft. Its bytes are safely in S3 and its id is
  recoverable by re-uploading the same crop of the same photo, which
  content addressing makes deterministic — but the library will not follow the
  operator to a second browser until the story is saved. A published
  `markers/index.json` would fix it and is deliberately not built, because it
  reintroduces a mutable document that can disagree with the stories.
- **Read authorization stays absent.** An exhibit is as public as a story.

---

## 12. Open items

| Id | Item | Owner |
|---|---|---|
| **OPS-M1** | Amplify app `d114nr20m4npww`: add a rewrite from `/image-targets/<path>` to the content distribution, before the SPA catch-all. Needs the real distribution domain read back from the account first (§9) | ops |
| **DOC-M1** | Amend `arcade-architecture.md` §10.3 once §1 ships, and regenerate `.claude/skills/8thwall-engine/reference/imagetargets.md`, which still documents the retired hosted API | with phase 1 |
| **VER-M1** | Phase 0's two measurements: follow-mode jitter against a printed edge, and browser-generated vs CLI-generated fingerprints | phase 0 |
| **MOD-M1** | **CLOSED.** Superseded by `docs/marker-locator-design.md` and built on `feat/marker-lock-ux`: `widthInMarkers` and `local.position` are authored in Studio and honoured at runtime, so a small print now locates a much larger scene. `MARKER_NORMAL_AXIS` stayed un-needed — the design is coplanar by construction | done |
| **MOD-M2** | Intended hierarchy is QR → scene → marker → content, one level deeper than what is built. No session state exists, and a marker binds to exactly one story globally (§10a.2). MOD-M1 shipped first, deliberately, and nothing in it makes this harder | later revision |

---

## 13. Testing

Holding `arcade-architecture.md` §12's line — pure logic is unit-tested, engine
and canvas interactions are verified on device.

| Unit-tested | On-device only |
|---|---|
| `getDefaultCrop` / `validateCrop` ports, against the CLI's own test cases | Detection latency and follow-mode jitter |
| Fingerprint JSON construction | Browser-generated vs CLI-generated fingerprints |
| `markerId` derivation and `ASSET_ID_RE` conformance | Story switching between two pictures |
| `validateExhibitDoc`, including every §8 publish refusal | Nearest-centre selection and the dwell interval |
| Marker→story derivation from anchors | The art's edges against the printed picture's |
| Nearest-centre selection, as pure geometry | Grayscale preview vs what the tracker matches |
| Luminance pipeline output dimensions | |

The CLI ships `crop.test.js` under the same MIT licence, so the port's tests
have a reference implementation to agree with rather than assumptions to encode.
