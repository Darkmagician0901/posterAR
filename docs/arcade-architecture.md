# ARCADE STUDIO — system architecture

**Status:** Current state, all decisions settled.
**Date:** 2026-07-28

This is the reference document: what the system *is*. It reads as though
designed this way from the start.

For *why* — the alternatives weighed, the amendments, the reasoning that got
here — see `docs/arcade-storage-aws-design.md`. Where the two differ, this
document is current and that one is history.

| Companion | Contents |
|---|---|
| `docs/arcade-storage-aws-design.md` | Design reasoning and its evolution |
| `docs/arcade-storage-plan-a.md` | Implementation, phases 0–3 |
| `docs/arcade-storage-plan-b.md` | Implementation, phases 4–6 |
| `docs/arcade-storage-ops-checklist.md` | Manual configuration, by hand |

---

## 1. What this is

An operator edits an AR exhibit's content and publishes it, never touching
code. A visitor opens a link on a phone and sees a story told in augmented
reality — five eras of hand-drawn art growing out of the ground, or anchored to
a printed picture on a wall.

Three surfaces:

| Surface | Who | Where |
|---|---|---|
| **Viewer** | exhibit visitor, phone | `/?s=<id>` |
| **Studio** | operator, desktop | `/studio` |
| **Storage** | neither — it is infrastructure | S3 behind CloudFront |

---

## 2. Decisions record

Everything settled, in one place.

| Decision | Choice |
|---|---|
| **Deployment** | Vercel serves the app and functions; AWS serves content. Split origin. Unified AWS deferred, not rejected (§8.3) |
| **Database** | **None in v1.** S3 is the whole storage layer. Control-plane schema designed, not created (§7.5) |
| **Asset identity** | Content-addressed: `assetId` = SHA-256 of the stored bytes |
| **Assets in documents** | Opaque id only. Never a URL, never bytes (§6.2) |
| **Marker cardinality** | Schema supports many; v1 runtime resolves one |
| **Animated GIFs in frame art** | Refused. The existing GIF poster pipeline is untouched (§9.4) |
| **Undo** | Snapshots retained. Event sourcing solves a problem this design deletes |
| **Read authorization** | None. Published exhibits are public by design (§10) |
| **Build order** | Storage first; marker device-verification in parallel; anchoring last |

### The one decision that would invalidate rather than extend this

**Could an exhibit ever need to be private, unlisted, or view-tracked?**

Everything rests on the read path being a public CDN GET with no backend (§4).
If a published story must be access-controlled, the read path moves behind an
API and the central claim stops being true. Currently answered **no**, inherited
from `arcade-studio-plan.md`: *"the public read path (`/?s=<id>`) stays
unauthenticated by design."*

---

## 3. System map

```
┌── AUTHOR (desktop) ──────────────────────────────────────────────┐
│  /studio                                                          │
│    prop library → frame composer → draft (localStorage)           │
│    drop image ──▶ compress ──▶ SHA-256 ──▶ upload ──▶ assetId     │
└────────────────────────────┬──────────────────────────────────────┘
                             │ POST /api/publish   Bearer secret
                             ▼
┌── VERCEL FUNCTIONS ───────────────────────────────────────────────┐
│  /api/story-assets   dedup check + conditional presign            │
│  /api/publish        validate, verify assets exist, write artifact│
└────────────────────────────┬──────────────────────────────────────┘
                             │ PutObject / HeadObject
                             ▼
┌── S3  (the whole storage layer) ──────────────────────────────────┐
│  stories/<id>.json          mutable at a stable key · 60 s TTL    │
│  assets/<sha256>/full.webp  immutable · cached indefinitely       │
│  assets/<sha256>/r1024.webp immutable · the display derivative    │
│  markers/<id>/target.json   immutable · fingerprint               │
│  markers/<id>/luminance.png immutable · what the tracker matches  │
│  tmp/                       scratch · expires after 90 days       │
└────────────────────────────┬──────────────────────────────────────┘
                             ▼
                        CloudFront
                             │
┌── VIEWER (phone) ───────────┴─────────────────────────────────────┐
│  /?s=<id>                                                         │
│    fetch document ──▶ validate ──▶ resolve assets to data: URLs   │
│    ──▶ hydrate art ──▶ rasterize ──▶ texture                      │
│    ──▶ 8th Wall places it: ground hit-test, or marker anchor      │
│                                                                   │
│  No API call. No database. Nothing but the CDN.                   │
└───────────────────────────────────────────────────────────────────┘

RDS ── provisioned, unused. Earns its place when a management UI exists.
```

---

## 4. Invariants

Five facts the whole system rests on. Breaking any one breaks something that
will not announce itself.

### 4.1 Artifact authority

> The S3 artifact is the source of truth for rendering. Anything else is a
> derived index. If they diverge, the artifact wins.

With no control plane in v1, the artifact is simply the only copy — the
cleanest possible expression of the rule.

### 4.2 SVG in an image context cannot load external resources

> *"External resources (e.g., images, stylesheets) cannot be loaded, though they
> can be used if inlined through `data:` URLs."*
> — [MDN, SVG as an image](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image)

Specified behaviour, not a quirk. `svgTexture.ts` rasterizes by assigning the
SVG to `img.src`, so **an `https://` image reference inside `frame.art` renders
blank with no error**. This single fact produces the entire token-and-hydrate
design (§6.3).

### 4.3 SLAM invents a new world origin every session

World coordinates are meaningless across app restarts. Anything that must
survive a relaunch is stored **relative to a marker**, never in world space
(§9.5).

### 4.4 8th Wall cannot detect walls

World tracking finds **one horizontal ground plane**. `DETECTED_SURFACE` and
`ESTIMATED_SURFACE` hits are always horizontal; `FEATURE_POINT` hits have no
reliable normal. Posters lie flat via `composeFlatPosterMatrix`. Wall-mounted
content is exactly what image markers are for.

### 4.5 The read path touches no backend

A visitor's device talks only to CloudFront. This is what makes the exhibit
cost nothing per view, survive an API outage, and load in tens of milliseconds
rather than hundreds.

---

## 5. 8th Wall integration

8th Wall went free and open source (MIT) on **2026-02-28**. Niantic retired the
entire hosted platform — logins, Cloud Editor, XR Studio, and the Platform API
at `api.8thwall.com`. **Pre-2026 knowledge about this engine is actively
wrong.** Everything below is verified against the open-source engine or this
repository.

### 5.1 What the engine owns

XR8 owns the canvas, the camera feed, the three.js renderer, and the render
loop. The application does not drive rendering; it plugs into it.

### 5.2 Camera pipeline modules

The unit of integration. An object with a `name`, optional `onStart` /
`onUpdate` / `onRender` / `onException` / `onDetach`, and a `listeners` array
of `{ event, process }`.

Registration order matters:

```
GlTextureRenderer → Threejs → XrController → (CanvasScreenshot)
  → LandingPage → FullWindowCanvas → Loading → RuntimeError
  → custom modules last
```

`window.THREE` **must** be set before `XR8.Threejs.pipelineModule()` is
registered. The app imports three as an ES module, so it assigns the global
explicitly.

```
XR8.addCameraPipelineModules([...])  →  XR8.run({ canvas })  →  XR8.stop()
XR8.Threejs.xrScene()  →  { scene, camera, renderer }
```

`XR8.XrController.configure({...})` is modifiable at runtime, and a later call
**replaces** the previous configuration for the keys it names.

### 5.3 Repository layout

| Directory | Contents |
|---|---|
| `src/xr/` | Engine-**agnostic** 3D helpers — reticle, telemetry, poster orientation, marker-relative transform math, marker stability |
| `src/xr8/` | XR8-**specific** integration — pipeline, hit-test, poster placement, ambient probe, GIF animator, texture cache, story tile, image-target controller |

The split is deliberate: everything in `src/xr/` is pure and unit-tested;
everything in `src/xr8/` touches engine globals and is verified on device.

### 5.4 Engine facts that shape the app

| Fact | Consequence |
|---|---|
| Loads from `cdn.jsdelivr.net` via `<script>` | CSP `script-src` must allow it |
| Loader fetches runtime chunks (`slam.js`) dynamically | **No SRI hash is possible** — documented inline in `index.html` |
| HTTPS or localhost required | Camera and engine both refuse otherwise |
| Canvas has **no** `preserveDrawingBuffer` | `canvas.toDataURL()` outside the render loop returns a blank frame — screenshots on live AR must be taken inside it |
| No native light estimation | `ambientProbe` samples `XR8.CameraPixelArray` and multiplies an approximate room colour into each poster material |
| `reality.trackingstatus` → `NORMAL` \| `LIMITED` \| `NOT_AVAILABLE` | Drives the HUD |

### 5.5 The three-branch router

`src/App.tsx` picks one branch on mount:

| Condition | Branch |
|---|---|
| Mobile + secure context (`hasAR8`) | `StoryARExperience`, or `MarkerTestbedExperience` when `?mode=marker` |
| Desktop | `DesktopMockMode` — webcam + mouse-look sandbox |
| Otherwise | "AR Not Supported" panel |

`ARExperience` still exists and is **retained legacy** — unused, not wired in,
deliberately not deleted.

---

## 6. Data model

### 6.1 `StoryDoc` v4

```ts
interface StoryDoc {
  schemaVersion: 4;
  id: string;                                // the ?s= value
  title: string;
  loc: string;                               // "You're standing on 10th & Center."
  intro: { title: string; subtitle: string };
  outro: { title: string; subtitle: string };
  frames: StoryFrame[];
  assets?: Record<string, StoryAsset>;       // alias → reference
  anchor?: StoryAnchor;                      // absent ⇒ tap-to-place
}

interface StoryFrame {
  key: string;
  year: string;                              // "1951" … "TODAY"
  label: string;
  title: string;
  line: string;                              // docent narration
  washColor: string;                         // HUD vignette mood
  art: string;                               // COMPLETE SVG document
  props?: StoryProp[];                       // authored source, re-editable
  backdrop?: string;                         // frozen hand-drawn layer
}
```

**The viewer reads only `art`.** It never runs the prop composer. That is why
the five hand-drawn eras port over with zero visual change — they are SVG paths
with no `<image>` element at all, and pass through every stage untouched.

### 6.2 Asset references

```ts
/** v4: an opaque content address. Never a URL, never bytes. */
interface StoryAssetRef {
  assetId: string;   // /^[a-f0-9]{64}$/ — enforced by the validator
  aspect: number;
  name?: string;
}

/** v3: retained so documents published before the move still render. */
interface StoryAssetLegacy {
  href: string;      // must be a data: URL
  aspect: number;
  name?: string;
}
```

**The security property.** The document contains no URL. `assetId` is 64 hex
characters, validated by regex, so it cannot express a scheme, a host, or a
traversal. The base URL comes from build configuration, never from the
document. A published document — untrusted input — therefore **cannot point a
viewer's browser anywhere**. v3 achieved this by permitting only `data:`; v4
carries the same guarantee across the move to remote bytes, and it is strictly
stronger than storing URLs would have been.

Map **keys** are aliases matching `/^[A-Za-z0-9_-]{1,64}$/`, because they are
interpolated into art as `asset:<alias>`.

### 6.3 Tokens in art

```
authored:   <image href="asset:logo" x="…" width="…"/>
at render:  <image href="data:image/webp;base64,…" x="…" width="…"/>
```

The alias indirection is load-bearing: art references `logo`, and
`assets.logo.assetId` names the bytes. **Swapping an image is a one-field
metadata change and the art string never moves.**

`compose.ts` required no logic change to produce this — both `<image href>`
emission sites already take the href from the caller's `images` map, so an
adapter at the call site was the whole change.

### 6.4 The anchor

```ts
interface StoryAnchor {
  type: 'marker';
  markerId: string;
  local: LocalTransform;    // marker-relative placement
  widthInMarkers: number;   // tile width as a MULTIPLE of marker width
  mode: 'follow' | 'latch';
}
```

Absent ⇒ today's tap-to-place ground hit-test, unchanged.

`widthInMarkers` is deliberately relative rather than metric. Two unverified
device facts — whether `configure({ scale })` needs `'absolute'`, and whether
`scaledWidth` is true physical metres — would invalidate any absolute
measurement. **A ratio holds under any scale mode.** This is the only place the
data model touches an unverified item, and it is shaped so neither outcome
forces a schema change.

### 6.5 Version compatibility

v3 documents remain readable **unchanged and forever**. v3 needs no hydration
because its bytes are already inline. The studio migrates a v3 draft on open by
uploading each inline asset and rewriting the references.

The validator discriminates **by shape, not by `schemaVersion`** — an entry
carrying `assetId` is a v4 reference, one carrying a `data:` `href` is v3
legacy. This is deliberate: `schemaVersion` is untrusted input like everything
else in a published document, so a missing or wrong value must not decide how
the assets are read. Shape discrimination degrades correctly where version
dispatch would not.

---

## 7. Storage

### 7.1 S3 layout

| Prefix | Mutability | `Cache-Control` | Lifetime |
|---|---|---|---|
| `stories/<id>.json` | **mutable at a stable key** | `public, max-age=60, must-revalidate` | permanent |
| `assets/<sha>/full.webp` | immutable by construction | `public, max-age=31536000, immutable` | GC by reachability |
| `assets/<sha>/r1024.webp` | immutable by construction | `public, max-age=31536000, immutable` | GC by reachability |
| `markers/<id>/target.json` | immutable per marker | `public, max-age=31536000, immutable` | permanent |
| `markers/<id>/luminance.png` | immutable per marker | `public, max-age=31536000, immutable` | permanent |
| `tmp/` | scratch | `no-store` | 90 days |

`stories/<id>.json` is the **only** object that changes under a fixed key —
that is how `/?s=<id>` resolves without a lookup table. Its 60-second TTL is
what makes republishing promptly visible. Everything else is content-addressed
or write-once, which is what makes `immutable` safe.

### 7.2 Why content addressing

`assetId = SHA-256(stored bytes)` buys four things at once:

1. **Dedup is automatic and global.** The same logo in three stories is one
   object, with no bookkeeping.
2. **Assets are immutable**, so they can be cached forever. A returning visitor
   fetches zero asset bytes.
3. **Existence is a certainty, not an inference** — a `HeadObject` hit means
   *those exact bytes* are stored.
4. **Republishing is safe mid-visit.** A visitor already holding resolved
   assets keeps valid ones, because an address never changes meaning.

### 7.3 Upload integrity

The client hashes before upload, so the presigned PUT binds two headers, both
**signed** — a client that drops or alters one gets a signature mismatch, not a
silent success:

| Header | Purpose |
|---|---|
| `If-None-Match: *` | Conditional write. A concurrent upload of identical bytes cannot clobber a completed object; S3 answers **412**, which the client treats as a successful dedup |
| `x-amz-checksum-sha256` | Integrity. Without it a dishonest client could store bytes X under the key `SHA256(Y)` — and because dedup is **global**, that would poison the address for every story |

### 7.4 Garbage collection

Reachability is **derived from the published documents**, which §4.1 names as
the source of truth. Deriving rather than counting means the answer cannot
drift from what is actually served:

```
reachable = ⋃ { a.assetId : a ∈ doc.assets }  over every stories/*.json
stored    = ListObjectsV2 under assets/
delete    = stored − reachable, minus anything newer than the grace cutoff
```

The **30-day grace period** exists because uploads happen on drop: an asset
legitimately has no references between being added and its story being
published. Without the window, GC would delete work in progress.

An asset shared by two stories survives the deletion of either. An operator
therefore cannot delete "their" asset if another story uses it — correct, and
worth surfacing in the UI when there is one.

### 7.5 No database in v1

S3 answers every question a control plane would:

| Question | Postgres would say | S3 says |
|---|---|---|
| Do these bytes exist? | `select … where sha256` | `HeadObject` → 200 |
| Did the upload complete? | a `committed` flag | the object exists at all |
| Two uploaders racing | `on conflict do nothing` | `If-None-Match: *` → 412 |
| Aspect, filename | row columns | already in `StoryAssetRef` |
| Which assets are used? | an `asset_usage` join | derived from `stories/*.json` |

A `committed` flag exists only to cover a window where a row precedes its
bytes. With S3 as the register, **that window does not exist**.

There is also a structural reason: Vercel functions have no stable egress
address, so there is no CIDR to allowlist against the RDS security group, and
opening it to `0.0.0.0/0` is refused — correctly. Rather than work around that,
v1 removes the dependency.

**What this costs:** listing an owner's assets is `ListObjectsV2` rather than an
indexed query. At one operator and tens of assets, not a cost. **What it buys:**
no VPC connectivity problem, no migrations, no ORM, one fewer always-on service.

The control-plane schema stays designed (`arcade-storage-aws-design.md` §6.1)
for when a story browser, multi-operator accounts, or audit history need it.
**The connectivity question returns at that point** and must be answered then.

---

## 8. Deployment

### 8.1 Shape

| Component | Where | Why |
|---|---|---|
| Frontend | Vercel (`postarr`) | Already live; per-branch preview URLs are part of the review workflow |
| `/api/publish`, `/api/story-assets` | Vercel functions | Author-time only — one operator, a few writes per week |
| `stories/`, `assets/`, `markers/` | S3 behind CloudFront | Durable, cheap, no compute per view |
| Credentials | Vercel OIDC → AWS role | Short-lived tokens via `AssumeRoleWithWebIdentity`; no static secret stored |

Cost is roughly **$1–3/month** — S3 and CloudFront at this volume, with no VPC
and no always-on compute.

### 8.2 The cost of split origin

Asset bytes are fetched cross-origin, so **three CORS requirements are
mandatory**, and any one missing produces a failure that depends on cache
state — it passes a casual test and breaks for a real visitor:

1. **S3 CORS with explicit origins** (not `*`).
2. **A CloudFront cache policy that includes `Origin` in the cache key.** This
   is the trap: without it, a first request lacking `Origin` caches a CORS-less
   response, which is then served to cross-origin callers until it expires.
3. **The managed `CORS-S3Origin` origin request policy**, so `Origin` reaches
   the bucket at all.

The acceptance test must prime a **cold** cache without an `Origin` header, then
immediately fetch cross-origin and require success. Testing only the warm path
hides precisely this defect.

### 8.3 If unified AWS is adopted later

Deferred, not rejected. [Amplify Hosting](https://docs.aws.amazon.com/amplify/latest/userguide/pr-previews.html)
provides the same per-branch PR preview URLs, so the review workflow would
survive. Every change is a **deletion**:

- §8.2's three CORS requirements become unnecessary — fetches are same-origin.
- §9.3's marker rewrite becomes unnecessary.
- `VITE_STORY_BASE_URL` and `VITE_ASSET_BASE_URL` return to empty.
- Vercel OIDC is replaced by an IAM role on the compute.

That every item is subtractive is the evidence that hosting can change without
redoing this architecture.

---

## 9. Function flows

### 9.1 Author → compose

```
operator drops an image
      │
      ▼  validateAndProcessImage — WebP, ≤2048 px, ≤2 MB (GIFs kept as GIFs)
canonical bytes
      │
      ▼  checkComposable — refuses animated GIFs (§9.4)
      │
      ▼  sha256Hex(bytes)                       [secure context: already required]
  assetId
      │
      ▼  POST /api/story-assets { sha256, sha256Base64, contentType }
      │
      ├── HeadObject hit ──▶ { exists: true }             DEDUP — nothing uploaded
      │
      └── miss ──▶ { uploadUrl, requiredHeaders }
                        │
                        ▼  PUT  If-None-Match: * · x-amz-checksum-sha256
                        │
                        ├── 200 ──▶ stored
                        ├── 412 ──▶ raced; the bytes are there — success
                        └── else ─▶ error surfaced to the operator
      │
      ▼
doc.assets[alias] = { assetId, aspect, name }        ← no bytes, ever
      │
      ▼  compose() with href = "asset:<alias>"
frame.art = "<svg>…<image href='asset:logo'/>…</svg>"
      │
      ▼  studioDraftStore.commit()
localStorage draft (KB) + 50 undo snapshots (~1 MB total)
```

There is **no commit endpoint**. The stored object is itself the record that the
upload happened.

### 9.2 Publish

```
POST /api/publish   { id, doc }   Authorization: Bearer <secret>
      │
      ▼  timingSafeEqual · in-memory rate limit · 12 MB cap
      ▼  validateStoryDoc — per-field fallback, never all-or-nothing
      │
      ▼  every asset: token in art must have an assets entry
      ▼  every assets entry: HeadObject must find the bytes
      │      ↳ either failure ⇒ 422. Both would otherwise render as a silent
      │        transparent gap on every visitor's device, discovered long
      │        after the operator walked away.
      ▼
PutObject stories/<id>.json    Cache-Control: public, max-age=60, must-revalidate
      │
      ▼  { id, url }
```

### 9.3 Fetch → render

```
/?s=<id>
      │
      ▼  resolveStorySource(location.search)
      │     ?s=<id>   ──▶ GET ${STORY_BASE}/stories/<id>.json   (CloudFront)
      │     ?draft=1  ──▶ localStorage         (same device only)
      │     neither   ──▶ bundled factory story
      │     ── any failure on any path ──▶ bundled factory story
      ▼
validateStoryDoc()
      │
      ▼  collectAssetRefs over every frame → unique assetIds
      ▼  for each: GET assets/<sha>/r1024.webp  (404 ⇒ full.webp)
      │     blob → FileReader.readAsDataURL
      │     bounded LRU cache — N frames sharing an asset cost ONE fetch
      ▼
Map<alias, dataUrl>
      │
      ▼  hydrateArt(frame.art, map)          ← bytes inline, finally
      ▼  svgToTexture()                       blob: URL → <img> → canvas
      ▼  CanvasTexture (SRGBColorSpace, imageSmoothingEnabled = false)
      ▼  StoryTile — one ~0.9 m plane, alphaTest, DoubleSide
```

A hydrated document is **render-only**. Its art strings carry full image
payloads and must never be persisted, published, or written back to the draft.

### 9.4 Why animated GIFs are refused in frame art

Frame art becomes **one** `CanvasTexture`. An animated GIF inlined into it
renders as its **first frame only, silently** — the exact failure `CLAUDE.md`
warns about, arriving through a new door.

So the studio refuses them at upload with an explanation. The existing GIF
pipeline is a different render path and is untouched:

```
gifDecode → gifPlayhead → gifAnimator → CanvasTexture
                                             ↑
                                    posterTextureCache
                          (refcounts shared animators, enforces a
                           memory budget, falls back to static on
                           decode failure)
```

The growth path, if animated frame content is ever wanted, is a sibling plane on
that pipeline — a **render** change, not a storage one.

### 9.5 Anchor → place

Two placement paths, chosen by whether `doc.anchor` is present.

**Anchorless (ships today).** Centre-screen hit-test every frame drives a
reticle; a tap plants the tile on the detected ground via
`composePosterMatrix`. Position is not persisted — SLAM reinvents the world
origin each launch (§4.3), so there is nothing meaningful to store.

**Marker-anchored.** The marker defines a space; the asset is stored relative to
it:

```
latch:    T_local        = inverse(T_marker_world) · T_asset_world
restore:  T_asset_world' = T_marker_world' · T_local
```

The marker frame is **rigid** — position and rotation only. The engine's
reported `scale` is deliberately excluded: folding it in would make the inverse
rescale every stored offset, so a 1% scale wobble would move a 1 m offset by
1 cm.

Two modes behind a toggle:

| Mode | Behaviour | Trade-off |
|---|---|---|
| **Follow** | Re-derive world pose every frame | Rigidly attached; inherits tracker jitter |
| **Latch** | Derive once on acquisition, then let SLAM hold it | Steadier; drifts with SLAM |

In both, **an asset is never moved while its marker is out of view** — SLAM
holds the last pose, which is what makes it stay put when you look away.

---

## 10. The image-marker process

Marker tracking is **natural-feature**, not fiducial: the engine matches
distinctive detail *inside* a picture. QR/ArUco-style patterns, plain
high-contrast shapes, generated grids, and repeating textures track **badly** —
and it will look like the tracker is broken when the marker is at fault.

### 10.1 End to end

```
HUMAN                                    MACHINE
─────                                    ───────
choose a detailed, busy,
non-repeating picture
  3:4 portrait, ≥480×640, <2048×2048
      │
      ▼
npx @8thwall/image-target-cli@latest
  INTERACTIVE ONLY — prompts for image,
  crop, name, output folder. No documented
  flags, no headless mode.
      │
      ▼  ~6 files: target JSON, original, cropped,
      │  thumbnail (263×350), luminance (480×640)
      │
      ▼
upload to markers/<marker-id>/
      │
      ▼
print flat and MATTE
  (gloss reflects and washes out features)
                                         │
                                         ▼
                          story names its marker: anchor.markerId
                                         │
                                         ▼
                          GET /image-targets/<id>/target.json
                            same-origin (§10.2)
                                         │
                                         ▼
                          resolveImagePath rewrites imagePath
                            to sit beside the JSON
                                         │
                                         ▼
                          XR8.XrController.configure({
                            disableWorldTracking: false,
                            imageTargetData: [json],
                          })
                                         │
                                         ▼
                          reality.imagefound / imageupdated / imagelost
                            { name, type, position, rotation, scale,
                              scaledWidth, scaledHeight }
                                         │
                                         ▼
                          marker pose is in the SAME world frame as SLAM
                            — this is what makes anchoring valid
```

**Everything runs on the device.** No image, fingerprint, or camera frame is
sent anywhere. There is no 8th Wall server any more.

`imageupdated` fires **continuously** while tracked, not once.

### 10.2 Why fingerprints are served same-origin

`imagePath` resolves **relative to the page URL**, and the engine's handling of
an absolute cross-origin path is **undocumented** — every reference frames it as
page-relative, and the CLI README gives no hosting guidance at all.

Undocumented behaviour is not a foundation. So the app never asks the engine to
resolve a cross-origin path: a Vercel rewrite maps `/image-targets/:path*` to
the CDN, and the page requests a same-origin path.

```jsonc
// must precede the SPA catch-all, which matches /((?!api/).*)
{ "source": "/image-targets/:path*", "destination": "https://<cdn>/markers/:path*" }
```

Recorded because the "simplification" of pointing the manifest straight at the
CDN domain looks obviously correct and rests on nothing.

### 10.3 Hard constraint

**Markers cannot be created in-app.** The CLI is interactive-only, so a human
generates every fingerprint, forever. The studio can *manage* markers — list
them, bind one to a story, show which is in use — but not make them. The UI
must teach the choice, because an operator who picks a logo will get bad
tracking and blame the software.

---

## 11. Security model

| Concern | Position |
|---|---|
| Off-origin references in published art | **Structurally impossible** — §6.2 |
| Content-address poisoning | Prevented by signed `x-amz-checksum-sha256` — §7.3 |
| Stored XSS via upload | Content-type allowlist; `image/svg+xml` deliberately excluded, since an SVG served from the bucket origin is active content |
| Publish authorization | Bearer shared secret, `timingSafeEqual`, in-memory rate limit |
| `/studio` route gate | **UX only, not a security control** |
| Read authorization | None — published exhibits are public by design |
| AWS credentials | Vercel OIDC, short-lived. No static secret stored |

Two honest limits, both accepted deliberately:

- **The publish secret lives in a browser** — prompted once per session, held in
  `sessionStorage`. Acceptable for a single-operator tool; the first thing to
  replace if the exhibit gains more operators.
- **A `VITE_`-prefixed variable is inlined into the bundle at build time** and
  is readable by anyone. This is exactly how `feat/admin-panel-ui`'s
  `VITE_ADMIN_PASSPHRASE` failed. The gate that matters is on the write.

---

## 12. Testing posture

**Pure logic is unit-tested. Engine and browser-canvas interactions are verified
on device.** That line is drawn deliberately and consistently.

| Unit-tested | On-device only |
|---|---|
| Token collection and hydration | Hydrated art renders identically to inlined |
| SHA-256 and content addressing | Cross-origin asset fetch under real CORS |
| Document validation, both versions | Marker detection, latency, jitter |
| Marker-relative transform maths | Re-acquisition drift |
| Marker stability metrics | Screenshot capture on the live canvas |
| GIF timing and decode | Ambient tint against a real room |
| Placement, orientation, texture cache | Republish visible within the TTL |
| Asset resolution and caching | The `data:` URL size ceiling (§13) |
| Publish ordering and asset verification | |

Stack: **vitest ^4.1.8** + **happy-dom ^20.9.0**.

---

## 13. Unverified — design accommodates both outcomes

Four device facts remain unconfirmed. **None blocks the storage work**; all four
gate the anchoring work.

| Item | Where it bites | Accommodation |
|---|---|---|
| Marker normal axis may be +Y, not +Z | `StoryAnchor.local` values, not its shape | `MARKER_NORMAL_AXIS`, a named constant — a one-line fix |
| `configure({ scale })` may need `'absolute'` | Any metric sizing | `widthInMarkers` is a ratio (§6.4) |
| `scaledWidth`/`scaledHeight` may not be metres | Same | Same |
| The ~10 simultaneous-target cap | Only when one story spans many markers | v1 resolves one marker |

One further risk, introduced by this architecture rather than inherited:

| Risk | Mitigation |
|---|---|
| **`data:` URL size ceiling on iOS Safari** when several images hydrate into one SVG assigned to `img.src` | Ship the `r1024` derivative; add a per-frame hydrated-size budget with a telemetry warning. **Needs a worst-case device test.** |

---

## 14. Build sequence

| Phase | Delivers | Gated by |
|---|---|---|
| **0** | Pure logic: `storyDoc` v4, `artTokens`, `assetHash` | nothing |
| **1** | S3 helper + presign endpoint | nothing |
| **2** | Upload on drop, dedup, GIF guard | OPS-1 before touching a real bucket |
| **3** | **The flip** — compose emits tokens, viewer hydrates. Documents go MB → KB | phases 0–2 |
| **4** | Publish to S3, off Vercel Blob | phase 3 |
| **5** | CloudFront, CORS, marker rewrite, `r1024` | OPS-2, OPS-7, OPS-8 |
| **6** | Garbage collection | phase 4 |
| **—** | **Anchoring** — its own spec | device verification of §13 |

Phase 3 is the only step that feels irreversible, and it is guarded: v3
documents stay readable forever (§6.5), so a rollback is a configuration change
rather than a data migration.

---

## 15. What this achieves

A 2 MB photo used in three frames:

| | Before | After |
|---|---|---|
| `doc.assets` | 2.66 MB base64 | ~110 bytes |
| `frame.art` × 3 | 8 MB | ~60 bytes |
| **Published document** | **~10.6 MB** | **~KB** |
| vs. the 12 MB publish cap | 88% consumed | negligible |
| vs. ~5 MB `localStorage` | already broken | fits, 50 undo snapshots ≈ 1 MB |
| Same image, second story | stored again | stored once, automatically |
| Repeat visit | refetches everything | **zero asset bytes** |
| Cost per view | — | a CDN GET; no compute, no database |

And the operator never touches code.
