# The story document format

What the studio produces and the viewer consumes. This is the integration
surface: if you are building storage, a backend, or a native client, this file
is the contract — not the studio's internals.

A story is one JSON object. It is self-contained: every image is inline data, so
a stored document never reaches off-origin to render.

---

## 1. Top-level shape

```jsonc
{
  "schemaVersion": 3,
  "id": "the-ground-remembers",   // published identity; also the ?s= value
  "title": "THE GROUND REMEMBERS",
  "loc": "You're standing on 10th & Center.",
  "intro":  { "title": "…", "subtitle": "…" },
  "outro":  { "title": "…", "subtitle": "…" },
  "frames": [ /* StoryFrame, in play order — see §2 */ ],
  "assets": { /* optional; uploaded images by id — see §4 */ },
  "marker": { /* optional; the printed poster — see §3 */ }
}
```

`schemaVersion` is `3`. `marker` and `assets` are optional and additive, so a
document written before either existed still validates.

**Validation is per-field, never all-or-nothing.** `validateStoryDoc`
(`src/story/storyDoc.ts`) falls back field by field against a known-good
document, so one bad value cannot blank an experience. Frames are the single
exception: if no frame survives sanitising, the fallback's frames are used,
because a story with nothing to walk cannot render. Treat any document arriving
from storage as untrusted and put it through that validator.

## 2. Frames

```jsonc
{
  "key": "wreck",                  // unique within the document
  "year": "1951",                  // badge on the title card
  "label": "F1",                   // short timeline-stop label
  "title": "THE WRECKING YARD",
  "line": "Docent narration…",
  "washColor": "rgba(150,90,40,0.30)",
  "art": "<svg …>…</svg>",         // what the viewer actually renders
  "props": [ /* StoryProp — see §5 */ ],
  "backdrop": "<svg …>…</svg>",    // optional frozen layer behind the props
  "audio": "data:audio/…",         // optional, inline only
  "audioName": "narration.mp3",
  "font": "…", "color": "…"        // optional; must name an offered option
}
```

**`art` is the render target; `props` is the source it was composed from.** The
viewer reads only `art`. `props` exists so a published story stays re-editable,
and so a client that wants real spatial placement has the per-object data to do
it. The two are kept consistent by one function — `composeFrameArt`
(`src/story/props/frameArt.ts`) — which both saving and migration call.

## 3. The marker

The printed poster the whole story is anchored to. **One per story, not one per
frame** — a visitor scans a single poster and plays every frame from it.

```jsonc
"marker": {
  "image": "data:image/webp;base64,…",  // or "" when the author has not set one
  "widthM": 0.297,                      // printed width in metres
  "aspect": 1.4141,                     // printed height / width
  "mountHeight": 1.5                    // floor → poster centre, in metres
}
```

| Field | Range | Notes |
|---|---|---|
| `image` | — | Must be a `data:image/…` URL. Anything else is dropped to `""`. |
| `widthM` | 0.05 – 3 | Clamped. The single most important field: it is what makes every other distance a physical measurement. |
| `aspect` | > 0 | Falls back to A3 portrait when non-positive. Derived from the image on upload. |
| `mountHeight` | 0 – 3 | Clamped. |

Defaults are A3 portrait at eye height: `0.297 m × 0.42 m`, mounted at `1.5 m`.

**Not included: an 8th Wall image target.** The `@8thwall/image-target-cli` is
interactive-only with no headless mode, so the fingerprint cannot be generated
as part of a build. The studio treats the image as authoring reference and
physical dimensions; producing a trackable target is separate work.

## 4. Assets

```jsonc
"assets": { "a1b2c3": { "href": "data:image/webp;base64,…", "aspect": 1.5, "name": "sign.png" } }
```

Keyed by the id that a `"t": "img"` prop references. **Only `data:image/…`
sources are kept** — composed art is rasterised through an `<img>`, which runs
SVG in restricted mode and will not fetch external references, so an http(s)
source would render blank. It is also the rule that stops a hostile document
reaching off-origin.

Uploads are compressed client-side to WebP: ≤ 2 MB on the wire, longest axis
≤ 2048 px (`src/utils/imageUpload.ts`).

## 5. Props and the coordinate model

This is the part a native client needs to get right.

```jsonc
{ "t": "lib", "k": "car", "x": -0.9, "z": 3.64, "h": 1.35, "f": false, "e": 0 }
```

| Field | Meaning |
|---|---|
| `t` | `"lib"` = built-in builder keyed by `k`; `"img"` = uploaded asset id `k` |
| `k` | Builder key or asset id |
| `x` | Metres left(−) / right(+) of the poster's centre, along the wall |
| `z` | Metres **out from the wall**, toward the visitor |
| `h` | Height in metres |
| `f` | Horizontally flipped |
| `e` | Metres above the **floor** |

### The origin

**`z = 0` is the wall plane, and `z` grows out into the room toward the
visitor.** A prop at `z = 0` is flat against the poster and furthest away; a
prop at `z = 4.6` stands nearest the visitor.

This matters because a SLAM world origin is invented fresh on every launch, so a
position measured from the viewer means nothing across sessions. A position
measured from a printed poster is a fact about the room.

| Axis | Valid in a document | Reachable in the editor |
|---|---|---|
| `x` | ±3.4 m | ±3.4 m |
| `z` | 0 – 4.6 m | 0.2 – 4.6 m |
| `e` | 0 – 3 m | 0 – 3 m |
| `h` | 0.1 – 6 m | 0.1 – 6 m |

`z = 0` is valid to store and renders correctly, but the editor's sliders clamp
to `0.2` so an author cannot bury a prop inside the wall (`PROP_LIMITS` in
`src/studio/propEdit.ts`). A client should accept the full range and flag
anything outside it rather than silently clamping.

### Converting to a marker-relative transform

`e` is measured from the floor, not from the marker, because that keeps the
author's Lift control meaning what it says and leaves existing elevations
untouched. Converting to a pose relative to the marker centre is one
subtraction:

```
x_marker = x
y_marker = e - marker.mountHeight
z_marker = z
```

with the marker's own frame being: origin at the poster's centre, `+x` right
along the wall, `+y` up, `+z` out of the wall into the room.

### One projection

Anything that turns a depth into a size uses `src/story/projection.ts` and
nothing else:

```
cameraDepth(z) = 1.9 + (4.6 - clamp(z, 0, 4.6))
depthScale(z)  = 1.9 / cameraDepth(z)
```

`depthScale` is `1` at `z = 4.6` (nearest the visitor) and `0.292` at `z = 0`
(the wall). The studio previously carried two disagreeing depth models — a
painter's approximation and a true pinhole, about 2× apart at the back of the
scene — and showed both to the same author. There is now one, guarded by a test
that asserts every consumer agrees.

### Legacy documents

Depth used to be measured from the viewer's feet across a 6.2 m stage. A
document written under that convention is converted on load:

```
z_new = clamp((1 - z_old / 6.2) * 4.6, 0, 4.6)
```

`fromLegacyZ` in `src/story/projection.ts`. **The presence of `marker` is the
migration flag** — a document that has one is already wall-relative and must not
be converted again. If you are writing documents from another system, always
include `marker`.

## 6. What the AR viewer currently renders

Worth knowing so expectations match reality: the shipping AR path
(`src/xr8/storyTile.ts`) draws each frame as **one flat plane** sized to the
art's aspect and scaled to a fixed `TILE_WIDTH_M = 0.9` m — regardless of what
the author placed. So today a prop authored as 2 m tall is not 2 m tall to a
visitor; the studio's metres are self-consistent but not yet AR scale.

`props` carries everything needed to place each object as its own
marker-anchored billboard instead. Doing that, and retiring `TILE_WIDTH_M`, is
the next piece of work on the runtime side — the schema above is designed so it
needs no change when that happens.

## 7. Where things live

| Concern | File |
|---|---|
| Document type + validation | `src/story/storyDoc.ts` |
| Marker type, defaults, validation | `src/story/marker.ts` |
| Coordinate model and projection | `src/story/projection.ts` |
| Legacy depth migration | `src/story/markerBackfill.ts` |
| Props → SVG composition | `src/story/props/compose.ts`, `props/frameArt.ts` |
| Publish / fetch | `src/services/storyApi.ts` |
| The bundled fallback story | `src/story/defaultStory.ts` |
