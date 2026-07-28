# ARCADE STUDIO — AWS-native storage design

**Date:** 2026-07-28
**Status:** Design, awaiting approval. No implementation code until approved.
**Scope:** The storage layer only — where story documents, image assets, and
marker fingerprints live, and how they move between the studio, AWS, and the
viewer.

---

## 1. What this covers, and what it does not

**In scope**

- S3 object layout and the caching/lifecycle rules per prefix
- RDS schema for the control plane
- Content-addressed asset pipeline (upload, dedup, integrity, garbage collection)
- `StoryDoc` schema v4 — asset tokens instead of inlined bytes
- The token → `data:` URL hydration path that keeps SVG rasterization working
- Publish and read flows, including failure ordering
- Module decomposition, test strategy, and a dependency-ordered build sequence

**Supersedes** the *Storage* section of `docs/arcade-studio-plan.md`, which chose
Vercel Blob and rejected "the plan doc's Postgres + Supabase S3 design" on the
grounds that it "is wrong for moving a 3 KB document."

That reasoning was correct, and its precondition has since changed. The estimate
it rested on — *"the published doc is a few KB because props are references; even
with composed SVGs inlined a five-frame story is well under 100 KB"* — holds only
while no uploaded raster images exist. The same document names the exception:
custom image uploads, deferred there to Phase 4. That is the work being designed
here. A five-frame story with one 2 MB photo is ~10.6 MB, not 100 KB, so the
document is no longer the thing being moved — the images are.

Nothing else in `arcade-studio-plan.md` is superseded. Its auth model (§10), its
routing (`/studio`, `/?s=<id>`), and its per-field fallback guarantee are all
carried forward unchanged.

**Explicitly out of scope** (each is its own later spec)

- **Marker anchoring runtime.** The `anchor` field is defined here so the schema
  is stable, but resolving it to a pose is separate work that depends on device
  verification (§3).
- **Video and audio assets.** The bucket layout accommodates them; no render
  path exists. See §12.
- **Multi-operator auth.** The schema carries `owner_id` throughout so real
  identity replaces a value, not a column. See §10.
- **The frontend hosting decision.** Deliberately factored out; see §2.2.

---

## 2. Assumptions

Two questions were open when this was written. Both are answered here with a
defensible default so the design is complete. Both are cheap to flip.

### 2.1 Animated GIFs are not permitted in composed frame art

`hydrateArt` bakes an image into a static SVG which `svgTexture.ts` rasterizes
through `<img>` into one `CanvasTexture`. **An animated GIF inlined that way
renders as its first frame only, silently.** This is exactly the failure
`CLAUDE.md` warns about ("GIFs must stay GIFs… never flatten a GIF to WebP")
arriving through a new door.

**Decision:** the studio rejects animated GIFs as *composed frame assets*, with
a message explaining why. The existing GIF pipeline (`gifDecode` →
`gifPlayhead` → `gifAnimator` → `posterTextureCache`) is untouched and continues
to serve the poster path.

**Growth path if this is wrong:** animated assets bypass composition entirely —
a GIF becomes a sibling plane with its own animator, positioned like a prop but
rendered on the existing GIF path. That is a second render path, not a storage
change, so **this decision does not constrain the storage design**. The
`story_assets` table already carries `is_animated`.

### 2.2 Deployment shape — Vercel app, AWS content (decided)

**The app and the publish function stay on Vercel. All storage moves to AWS.**
The frontend is served from the existing `postarr` project; `stories/`,
`assets/`, and `markers/` are served from S3 behind CloudFront.

This is a **split-origin** deployment, which is the consequential part: asset
bytes are fetched cross-origin, so the CORS configuration in §9 is **mandatory,
not optional**, and the marker-fingerprint rewrite in §14.1 is **required, not
one of two alternatives**. Treat §9 as the highest-risk configuration in the
build — its failure mode is intermittent and cache-dependent.

*Why this rather than unified AWS.* Migration cost and workflow, not
architecture. Production is live on Vercel today, `api/publish.ts` already
exists in Vercel-function form, and the build pipeline is wired. Per-branch
preview URLs are part of the project's stated review workflow (`CLAUDE.md`:
ship so work "can be reviewed by just opening the URL").

*What was weighed against it.* Vercel does nothing here AWS could not —
[Amplify Hosting](https://docs.aws.amazon.com/amplify/latest/userguide/pr-previews.html)
provides the same per-branch PR preview URLs, so "unified AWS" would not have
cost the review workflow. Unified would also eliminate CORS entirely and remove
the fingerprint rewrite. That option is **deferred, not rejected** — see §9.1
for what changes if it is taken later. The word in the decision is *first*.

*Consequence for credentials.* Because Vercel functions now hold AWS access,
`infra/terraform/iam.tf`'s IAM **user with long-lived keys** should be replaced
by [Vercel OIDC federation](https://vercel.com/docs/oidc/aws): the function
exchanges a short-lived Vercel-signed token for AWS credentials via
`AssumeRoleWithWebIdentity`, so no static secret is stored. This is a Phase 4
concern, listed in §13.

---

## 2.3 Decisions record

| Decision | Settled | Where |
|---|---|---|
| Deployment shape | **Vercel app + AWS content, split origin.** Unified AWS deferred, not rejected | §2.2, §9.1 |
| Database in v1 | **None.** S3 is the whole storage layer; the control-plane schema is designed but not created | §4, §6, §7.3 |
| Marker cardinality | **Schema supports many, v1 runtime resolves one.** `story_markers` join table models both, so enabling multi-marker needs no migration | §6, §8.1 |
| Build order | **Storage first**, device verification of the four unverified marker items in parallel. Phases 0–4 depend on none of them | §13 |
| Animated GIFs in composed art | **Rejected**, existing GIF pipeline untouched | §2.1 |
| Undo | **Snapshots retained.** Event sourcing solves a problem this design deletes | — |

### The one question that would invalidate rather than extend this design

**Could an exhibit ever need to be private, unlisted, or view-tracked?**

Everything above rests on the read path being a public CDN GET with no backend
(§4). If a published story must be access-controlled, the read path moves behind
the API, and the central claim — *the viewer never touches RDS or the API* —
stops being true. That is a different architecture, not an extension of this
one.

Currently answered **no**: `arcade-studio-plan.md` states "the public read path
(`/?s=<id>`) stays unauthenticated by design." This design inherits that and
depends on it. **It is only load-bearing from Phase 3 onward**, so Phases 0–2
can proceed while it is confirmed.

---

## 3. Verified constraints

Everything below was confirmed against the repository or primary documentation.
Nothing here is recalled from training data.

### 3.1 SVG in an image context cannot load external resources

> "External resources (e.g., images, stylesheets) cannot be loaded, though they
> can be used if inlined through `data:` URLs."
> — [MDN, *SVG as an image*](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image)

This is specified behaviour, not a browser quirk. `svgTexture.ts:110-118`
rasterizes by assigning the SVG to `img.src`, so **an `https://` image reference
inside `frame.art` renders blank with no error**. This single fact determines the
entire asset design: bytes must be `data:` URLs *at the moment of
rasterization*, and must not be `data:` URLs anywhere else.

### 3.2 The current schema enforces the duplication

`storyDoc.ts::sanitizeAssets` rejects any `href` not matching `^data:image/`.
Bytes are stored in `doc.assets` *and* inlined again into every `frame.art` that
uses them. A 2 MB photo in 3 frames ≈ 10.6 MB against a 12 MB publish cap
(`api/publish.ts::MAX_BODY_BYTES`), a ~5 MB `localStorage` limit, and 50 undo
snapshots.

### 3.3 Composition has exactly two image-emission sites

`src/story/props/compose.ts` lines 82 and 161, both
`<image href="${escapeAttr(href)}" …/>`. Changing what goes in that attribute is
a contained edit.

### 3.4 S3 supports conditional writes

`If-None-Match: *` on `PutObject` uploads only if the key does not exist,
returning **412 Precondition Failed** otherwise, and **409
ConditionalRequestConflict** if a concurrent write races. Requires SigV4.
— [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)

### 3.5 Presigned URLs support SHA-256 checksums

Presigned URLs created with **SigV4** support algorithm-specific checksum
headers including `x-amz-checksum-sha256`. S3 validates the uploaded bytes
against the supplied checksum.
— [Checking object integrity](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity.html),
[Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)

### 3.6 CloudFront caches CORS-less responses unless `Origin` is in the cache key

> "If CloudFront receives a first request without an `Origin` header, it caches
> the response without CORS headers and uses this cached response for all future
> requests until it expires."
> — [AWS re:Post](https://repost.aws/knowledge-center/no-access-control-allow-origin-error)

This produces intermittent, cache-state-dependent CORS failures. §9 handles it.

### 3.7 Existing infrastructure facts

- `infra/terraform/s3.tf:86-103` applies `expiration { days = 90 }` with
  `filter {}` — **whole bucket**. Written for a throwaway testbed. It would
  silently delete published exhibits after three months.
- `infra/terraform/iam.tf` provisions an IAM **user** with long-lived keys.
- `server/src/config.ts` defaults `S3_FORCE_PATH_STYLE=true` (a Supabase
  legacy); real AWS S3 requires `false`.
- Auth today is `x-owner-id`, a device token — identity, **not
  authentication** (`server/src/routes/assets.ts:31-34`).
- `src/services/storyApi.ts` already fetches
  `${VITE_STORY_BASE_URL}/stories/<id>.json`. **The read path is host-agnostic
  already** — pointing it at CloudFront is configuration, not code.

---

## 4. Architecture

**S3 is the whole storage layer for v1.** The control plane is designed (§6) but
deferred: nothing in v1 reads or writes Postgres.

```
                        PUBLISH (operator, a few times a week)
                                     │
                                     ▼
                     Vercel function ──── HeadObject: do the
                            │              referenced assets exist?
                            │
                            ▼
                     S3  (content plane)
                     ──────────────────
                     stories/<id>.json        mutable, 60 s TTL
                     assets/<sha256>/…        immutable, cached forever
                     markers/<id>/…           immutable
                            │
                            ▼
                       CloudFront
                            │
                            ▼
                         VIEWER
        (read path touches no API, no database, nothing but the CDN)

                     RDS ── provisioned, unused in v1.
                            Earns its place when a management UI exists (§6).
```

> **Invariant — artifact authority.**
> The S3 artifact is the source of truth for rendering. Anything else is a
> derived index. If they ever diverge, the artifact wins and the index is
> rebuilt from it.

That invariant is why `anchor` and `assets` live in the artifact rather than in
a table: the viewer reads only S3, so anything it needs must be there. With the
control plane deferred, the artifact is simply the only copy — which is the
cleanest possible expression of the rule.

**Why frames are not rows.** A frame's dominant payload is `art`, a complete SVG
document of several KB to tens of KB. The viewer needs all frames, always, in
order — there is no query, only "give me the document". Putting them in Postgres
would turn every visitor into a Lambda invocation plus a DB connection
(≈100–800 ms cold) instead of a CDN GET (≈20–50 ms edge-cached), would cost per
view, and would take the exhibit down whenever the API is down.

**A note on Lambda + RDS.** This pairing is normally an anti-pattern, and here
the objection turned out to be structural rather than merely a performance
concern: Vercel functions have no stable egress address, so there is no CIDR to
allowlist against `rds.tf`'s security group, and opening it to `0.0.0.0/0` is
refused by `variables.tf` — correctly. Rather than work around that, v1 removes
the dependency (§6). When a management UI eventually needs the control plane,
the connectivity question returns and must be answered then, not now.

---

## 5. S3 layout

| Prefix | Mutability | `Cache-Control` | Lifecycle |
|---|---|---|---|
| `stories/<story_id>.json` | **mutable at a stable key** | `public, max-age=60, must-revalidate` | persistent |
| `assets/<sha256>/full.webp` | immutable by construction | `public, max-age=31536000, immutable` | persistent, GC by refcount |
| `assets/<sha256>/r1024.webp` | immutable by construction | `public, max-age=31536000, immutable` | persistent, GC by refcount |
| `markers/<marker_id>/target.json` | immutable per marker | `public, max-age=31536000, immutable` | persistent |
| `markers/<marker_id>/luminance.png` | immutable per marker | `public, max-age=31536000, immutable` | persistent |
| `tmp/` | scratch | `no-store` | **expire after 90 days** |

`stories/<id>.json` is the one object that changes under a fixed key — that is
how `/?s=<id>` resolves without a lookup table. The 60-second TTL is what makes
republishing visible promptly; it matches what Vercel Blob does today
(`cacheControlMaxAge: 60`). Everything else is content-addressed or
write-once, which is what makes the `immutable` directive safe.

**Terraform change required:** the existing bucket-wide
`expiration { days = 90 }` (`s3.tf:86-103`) must be scoped to the `tmp/` prefix.
Left as-is it deletes published exhibits.

**`r1024.webp` ships in v1.** It was initially scoped as a deferrable
optimization; §14.2 promotes it to required. `svgTexture.ts` rasterizes at
`RASTER_MAX = 1024` on the longest axis of the *whole composed frame*, so a
full-resolution asset is decoded and then largely thrown away — and, more
importantly, every hydrated byte inflates the `data:` URL that gets assigned to
`img.src`, which is the one place this design has an unquantified device limit.
Keeping the hydrated payload small is a correctness margin, not just a
performance win.

Generated in the browser at upload time; the existing `imageUpload.ts` canvas
path already does this kind of work, so this is a second invocation rather than
new machinery. Both variants upload under the same content address, so the
schema is unchanged either way and `full.webp` remains the fallback (§8.4).

### 5.1 Base URLs

| Variable | Points at | Empty means |
|---|---|---|
| `VITE_STORY_BASE_URL` | origin serving `stories/` | same-origin, relative |
| `VITE_ASSET_BASE_URL` | origin serving `assets/` | same-origin, relative |

Two variables rather than one, because the split-origin deployment may serve the
document and the assets from different places. Both default to empty, which
yields relative paths — the correct value for the single-origin shape. Neither
ever appears **inside** a document; they are build configuration, which is what
makes §8.2's guarantee hold.

Marker fingerprints get no variable: they are always fetched from a same-origin
path (§14.1).

---

## 6. RDS schema — deferred in full for v1

> **Amended 2026-07-28.** v1 does not read or write Postgres at all.
>
> This section originally specified five tables and noted that three were not
> load-bearing. Planning the deployment finished that argument: **the remaining
> two are not load-bearing either.**
>
> Two things forced it. First, the deployment decision (§2.2) puts the API on
> Vercel functions, which have no stable egress address to allowlist against
> `rds.tf`'s security group — and `variables.tf` rightly refuses `0.0.0.0/0`.
> Second, once that was examined, S3 turned out to already answer every
> question `story_assets` was going to:
>
> | Question | Postgres | S3 |
> |---|---|---|
> | Do these exact bytes exist? | `select … where sha256 = $1` | `HeadObject assets/<sha>/full.webp` → 200 |
> | Did the upload complete? | `committed` flag | the object exists at all |
> | Two uploaders racing | `on conflict do nothing` | `If-None-Match: *` → 412 (§3.4) |
> | Dimensions, filename, aspect | row columns | **already in the document** — `StoryAssetRef` |
>
> The `committed` flag existed only because a row could be written before its
> bytes arrived. With S3 as the register that window does not exist: the object
> either is there or is not, and the conditional write that created it was
> atomic. The metadata columns turned out to duplicate `StoryAssetRef`.
>
> `asset_usage` goes the same way — reachability is derived by reading
> `stories/*.json`, which §4 already names as the source of truth for
> rendering. Deriving it means it cannot drift from what is actually served.
>
> **What this costs:** listing every asset an owner uploaded becomes an S3
> `ListObjectsV2` rather than an indexed query. At one operator and tens of
> assets, that is not a cost. **What it buys:** no VPC connectivity problem, no
> migrations, no ORM, and one fewer always-on service on the bill.
>
> The schema below is retained as the design for **when a management UI exists**
> — a story browser, multi-operator accounts, or audit history would each need
> it. Nothing in Plan A or Plan B creates these tables.

### 6.1 The deferred schema

Control plane only. Never read by a viewer.

```sql
-- 003_stories.sql

CREATE TABLE stories (
  id             text PRIMARY KEY,          -- the ?s= slug
  owner_id       text NOT NULL,
  title          text NOT NULL,
  artifact_key   text NOT NULL,             -- 'stories/<id>.json'
  artifact_etag  text,                      -- S3 ETag of the last publish
  schema_version integer NOT NULL,
  published_at   timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- NOT `assets`. Migration 001 already defines an `assets` table for the poster
-- path: uuid primary key, `<owner>/<uuid>.<ext>` storage keys, no content
-- addressing. That table is live and must not be disturbed. Unifying the two
-- asset systems is deliberately deferred — it would mean rekeying every
-- existing poster object for no benefit to this work.
CREATE TABLE story_assets (
  sha256        text PRIMARY KEY,           -- lowercase hex, the content address
  owner_id      text NOT NULL,              -- first uploader
  content_type  text NOT NULL,
  byte_size     bigint NOT NULL,
  width         integer NOT NULL,
  height        integer NOT NULL,
  is_animated   boolean NOT NULL,
  original_name text,
  committed     boolean NOT NULL DEFAULT false,  -- see §7.3
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE asset_usage (
  story_id text NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  sha256   text NOT NULL REFERENCES story_assets(sha256),
  PRIMARY KEY (story_id, sha256)
);
CREATE INDEX asset_usage_sha256_idx ON asset_usage(sha256);

CREATE TABLE markers (
  id         text PRIMARY KEY,              -- 'poster-01'
  owner_id   text NOT NULL,
  name       text NOT NULL,
  target_key text NOT NULL,                 -- 'markers/<id>/target.json'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A join table rather than stories.marker_id: this models one-marker-per-story
-- and many-markers-per-story identically, so resolving that open question later
-- needs no migration.
CREATE TABLE story_markers (
  story_id  text NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  marker_id text NOT NULL REFERENCES markers(id),
  PRIMARY KEY (story_id, marker_id)
);
```

**Two name collisions were checked and avoided.** Migration 001 owns `assets`
(poster path) and migration 002 owns `marker_bindings` (the testbed's
asset-to-marker placements). Neither is touched. `markers` here is a *registry* —
which fingerprints exist and who owns them — which is a different concern from
`marker_bindings`, and the two can coexist.

> **Only two of these five tables are load-bearing in v1.**
>
> `story_assets` and `asset_usage` are needed from day one: the first carries the
> `committed` flag and the dedup index, the second is the refcount that makes
> garbage collection safe (§7.4). Build them in Phase 2.
>
> `stories`, `markers`, and `story_markers` are forward-looking.
> `arcade-studio-plan.md` resolved that v1 ships **one story at a time**, with no
> browser, list, or management UI — publishing overwrites the current story. An
> index nobody queries earns nothing yet. They are specified here so the shape is
> settled and adding them is additive, but **Phase 4 can ship without them**, with
> the artifact in S3 as the only record of a published story. Create them when a
> story browser or a marker manager actually exists.
>
> This is the one place the design deliberately specifies more than v1 needs, and
> it is called out rather than hidden.

No `users` table yet. `owner_id` is the existing device token
(`src/utils/deviceToken.ts`); introducing real accounts replaces the *value* in
that column, not the column. See §10.

The refcount for garbage collection is `SELECT count(*) FROM asset_usage WHERE
sha256 = $1`, which is why `asset_usage_sha256_idx` exists.

---

## 7. Asset pipeline

### 7.1 Upload on drop

Uploading at publish time would leave base64 in `localStorage` and fix only the
published side. Assets upload the moment the file lands.

```
User drops file
      │
      ▼  existing imageUpload.ts (WebP, ≤2048 px, ≤2 MB)
canonical bytes
      │
      ▼  crypto.subtle.digest('SHA-256', bytes)      [secure context: already required]
  assetId (64 hex)
      │
      ▼  POST /api/assets/presign { sha256, contentType, byteSize, width, height, isAnimated }
      │
      ├── row exists AND committed ──▶ { exists: true }        DEDUP HIT — no upload
      │
      └── no row, OR row exists but uncommitted ──▶ { uploadUrl, requiredHeaders }
              (an uncommitted row means a previous upload was abandoned;
               re-presigning the same key is safe and idempotent)
                              │
                              ▼  PUT assets/<sha256>/full.webp
                              │     If-None-Match: *
                              │     x-amz-checksum-sha256: <base64 of the digest>
                              │
                              ├── 200 ──▶ POST /api/assets/<sha>/commit
                              ├── 412 ──▶ object already exists; treat as success
                              └── 409 ──▶ concurrent write; retry once
                              │
                              ▼
                    draft stores { assetId } only
              (in-memory data: URL retained for instant preview)
```

### 7.2 Why the two S3 headers matter

**`If-None-Match: *`** makes the write conditional, so a concurrent upload of
identical bytes cannot clobber a completed object, and a 412 is a *successful*
dedup rather than an error (§3.4).

**`x-amz-checksum-sha256`** closes a real integrity hole. Content addressing
requires the *client* to hash before upload, so a dishonest client could upload
bytes X under the key `SHA256(Y)`. Because dedup is **global**, that one upload
would poison that address for every story. Binding the checksum into the
presigned signature makes S3 itself reject the mismatch (§3.5). With a single
trusted operator this is theoretical; it stops being theoretical the moment the
`owner_id` column carries real accounts.

### 7.3 S3 is the register — there is no `committed` flag

This originally described a `committed` boolean covering the window between
issuing a presigned URL and the bytes arriving. **That window does not exist**,
because the object itself is the record:

- **Existence** is `HeadObject assets/<sha>/full.webp`. A 200 means those exact
  bytes are stored — a certainty rather than an inference, because the key *is*
  the hash.
- **Atomicity** is `If-None-Match: *`. There is no partially-written state to
  represent: S3 either accepted the write or answered 412 (§3.4).
- **Metadata** — aspect, filename — is already in the document's
  `StoryAssetRef`. The table duplicated it rather than owning it.

Publish still refuses a document referencing an asset that never uploaded. The
check is N `HeadObject` calls rather than one indexed query; at a handful of
assets per story, published a few times a week, that is not a cost worth a
database for.

**The failure this protects against is worth naming.** Without the check, a
document referencing a missing asset publishes cleanly and then renders a
silent transparent gap on every visitor's device — discovered long after the
operator has walked away.

### 7.4 Garbage collection

Reachability is **derived from the published documents**, which §4 already names
as the source of truth for rendering. Deriving it rather than maintaining a
counter means the answer cannot drift from what is actually being served:

```
reachable = ⋃ { a.assetId : a ∈ doc.assets }  for every doc in stories/
stored    = ListObjectsV2 under assets/
delete    = stored − reachable, minus anything newer than the grace cutoff
```

The **30-day grace period** exists because uploads happen on drop: an asset
legitimately has no references between being added and its story being
published. Without the window, GC would delete work in progress.

An asset shared by two stories survives the deletion of either, because it is
still reachable from the other. An operator therefore cannot delete "their"
asset if someone else's story uses it — correct behaviour, and worth surfacing
in the UI when there is one.

---

## 8. Document schema v4 and the hydration path

### 8.1 `StoryDoc` v4

```ts
interface StoryDoc {
  schemaVersion: 4;
  id: string;
  title: string;
  loc: string;
  intro: { title: string; subtitle: string };
  outro: { title: string; subtitle: string };
  frames: StoryFrame[];                      // art carries asset: tokens
  assets?: Record<string, StoryAssetRef>;    // alias → reference
  anchor?: StoryAnchor;                      // absent ⇒ today's tap-to-place
}

/** No URL. No bytes. An opaque content address. */
interface StoryAssetRef {
  assetId: string;   // /^[a-f0-9]{64}$/ — enforced by the validator
  aspect: number;
  name?: string;
}
// The KEYS of `assets` are aliases and must match /^[A-Za-z0-9_-]{1,64}$/ —
// the same charset the art token accepts (§8.3). The validator drops any entry
// whose key or assetId fails its pattern, so an alias can never carry markup.

interface StoryAnchor {
  type: 'marker';
  markerId: string;              // /^[a-z0-9][a-z0-9-]{0,63}$/
  local: LocalTransform;         // reuses src/xr/markerRelativeTransform.ts
  widthInMarkers: number;        // tile width as a MULTIPLE of marker width
  mode: 'follow' | 'latch';
}
```

`widthInMarkers` is deliberately relative rather than metres. Two of the four
unverified device items — whether `configure({ scale })` needs `'absolute'`, and
whether `scaledWidth` is true physical metres — would invalidate any absolute
measurement. A ratio holds under any scale mode. **This is the only place the
storage design touches an unverified item, and it is structured so that neither
outcome forces a schema change.**

### 8.2 The security property

The document contains **no URL**. `assetId` is 64 hex characters, validated by
regex, so it cannot contain `../`, a scheme, or a host. The base URL comes from
build configuration (`VITE_ASSET_BASE_URL`), never from the document.

This is strictly stronger than the current design and strictly stronger than
storing URLs. Today's `^data:image/` check guarantees composed art cannot reach
off-origin; storing `https://` URLs would surrender that, letting a hostile
published document point every viewer's browser at arbitrary hosts. An opaque ID
resolved client-side **cannot express an off-origin reference at all**.

### 8.3 Tokens in art

```
authored:   <image href="asset:logo" x="…" y="…" width="…" height="…"/>
at render:  <image href="data:image/webp;base64,…" x="…" …/>
```

The alias indirection is load-bearing: `frame.art` references `logo`, and
`assets.logo.assetId` names the bytes. Swapping the underlying image is a
one-field metadata change and **the art string never moves**.

```ts
// src/story/artTokens.ts — pure, no DOM, no network
const ASSET_TOKEN_RE = /\b(xlink:href|href)="asset:([A-Za-z0-9_-]{1,64})"/g;

function collectAssetRefs(art: string): string[];
function hydrateArt(art: string, resolved: ReadonlyMap<string, string>): string;
```

The regex is bounded to the attribute form and the alias charset, so no other
content can be matched or injected, and the replacement is attribute-escaped by
the same `escapeAttr` the composer uses. An alias missing from the map is
replaced with a 1×1 transparent `data:` URL — a gap in the art, never a broken
document.

### 8.4 Read path

```
GET ${STORY_BASE}/stories/<id>.json          ← CloudFront, 60 s TTL
      │
      ▼  validateStoryDoc()  — dispatches on schemaVersion
   StoryDoc v4
      │
      ▼  collectAssetRefs over every frame → unique assetIds
      │
      ▼  for each, GET ${ASSET_BASE}/assets/<sha>/r1024.webp    ← immutable, cached forever
      │    (404 ⇒ fall back to full.webp)
      │    blob → FileReader.readAsDataURL
      │    bounded LRU cache keyed by assetId; N unique assets, not N×frames
      ▼
  Map<alias, dataUrl>
      │
      ▼  hydrateArt(frame.art, map)
      │
      ▼  svgToTexture()  →  CanvasTexture  →  StoryTile  →  render
```

Every failure degrades: a missing asset becomes a transparent pixel, a missing
or malformed document falls back to the bundled factory story — preserving the
existing guarantee that no failure path leaves a visitor with a broken exhibit.

### 8.5 Backward compatibility

v3 documents (`assets[k].href` = `data:` URL, art with inlined data URLs) remain
readable **unchanged and forever**. The validator dispatches on
`schemaVersion`; v3 needs no hydration because its bytes are already inline.
Only newly published documents are v4. The studio migrates a v3 draft on open by
uploading each inline asset and rewriting the references.

The five hand-drawn eras contain no `<image>` at all — they are pure SVG paths —
so the shipping story mode is unaffected by any of this.

### 8.6 One rasterizer change

`svgTexture.ts:112` builds
`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`. Once base64
payloads are inlined, `encodeURIComponent` expands `+`, `/` and `=` three-for-one
— roughly 6% on top of base64's 33%, plus a large intermediate string. Replacing
it with `URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))` (and
`revokeObjectURL` on load) avoids both.

Restricted mode still applies to a `blob:` URL — the restriction is a property of
the image context, not the URL scheme — so the token design remains mandatory.
CSP already permits `blob:` in `img-src`.

---

## 9. Caching and CORS

`hydrateArt` needs the *bytes* in the browser: `fetch → blob →
FileReader.readAsDataURL`. That is an XHR-class request and needs
`Access-Control-Allow-Origin` on the **response** unless it is same-origin.

The chosen deployment (§2.2) is **split-origin**, so this section is required
configuration rather than background. **All three parts are mandatory. Any one
of them missing produces a failure that depends on cache state — it will pass a
casual test and break for a real visitor.**

1. **S3 CORS with explicit origins.** `cors_allowed_origins` in `variables.tf`
   currently defaults to `["*"]`; it must list the actual Vercel production and
   preview origins. Note that preview deployments get generated hostnames, so
   either enumerate them or accept that asset loading is production-only —
   decide this deliberately rather than discovering it.
2. **A CloudFront cache policy that includes `Origin` in the cache key.** This
   is the trap. Without it, a first request lacking `Origin` caches a CORS-less
   response, which CloudFront then serves to cross-origin callers until it
   expires (§3.6).
3. **The managed `CORS-S3Origin` origin request policy**, so `Origin` reaches
   the bucket at all — otherwise S3 does not treat the request as cross-origin
   and returns no CORS headers regardless of its own configuration.

**Acceptance test for this phase:** with a cold CloudFront cache, request an
asset *without* an `Origin` header, then immediately fetch the same asset from
the app origin via `fetch()`. The second request must succeed. Testing only the
warm path hides exactly the defect this section exists to prevent.

### 9.1 If unified AWS is adopted later

Deferred, not rejected (§2.2). Should the app move to Amplify or a single
CloudFront distribution serving both the frontend and the buckets, the changes
are subtractive and none of them touch the storage contract:

- §9's three CORS requirements become unnecessary — fetches are same-origin.
- §14.1's Vercel rewrite becomes unnecessary — `/markers/*` is a behaviour on
  the same domain.
- `VITE_STORY_BASE_URL` and `VITE_ASSET_BASE_URL` (§5.1) go back to empty,
  which is what they already default to.
- Vercel OIDC federation is replaced by an IAM role attached to the compute.

That every one of those is a deletion is the point: this design does not have to
be redone to change hosting, only trimmed.

---

## 10. Security model

| Concern | Position |
|---|---|
| Off-origin references in published art | Structurally impossible — §8.2 |
| Content-address poisoning | Prevented by `x-amz-checksum-sha256` — §7.2 |
| Publish authorization | Bearer shared secret, `timingSafeEqual`, as today |
| Asset upload authorization | `x-owner-id` device token — **identity, not authentication** |
| Read authorization | None. Published artifacts are public objects |
| Stored-XSS via upload | Content-type allowlist retained (`assets.ts:12-17`) |

Two honest gaps, both pre-existing and both deliberately unchanged here:

- The publish secret is held in a browser — prompted once per session and kept
  in `sessionStorage`, per `arcade-studio-plan.md`. Acceptable for a
  single-operator tool; it is the thing to replace first if the exhibit gains
  more operators. Note that the `/studio` route gate is a UX affordance and
  **not** a security control: a `VITE_`-prefixed variable is inlined into the
  bundle at build time, which is exactly how `feat/admin-panel-ui`'s
  `VITE_ADMIN_PASSPHRASE` failed. The gate that matters is on the write.
- `x-owner-id` is a device token, so any client can claim any owner. The schema
  is written so that adding real accounts changes the value in `owner_id`, not
  the shape of any table.

Read access is public by design — a published exhibit is meant to be opened by
any visitor with the link. **If unlisted or access-controlled exhibits are ever
required, the read path must move behind the API and §4's central claim changes.**
That is the one decision that would invalidate this architecture rather than
extend it.

---

## 11. Module decomposition

**New — pure logic, no infrastructure, fully unit-testable**

| Module | Responsibility | Depends on |
|---|---|---|
| `src/story/artTokens.ts` | `collectAssetRefs`, `hydrateArt`, the token regex | nothing |
| `src/story/assetHash.ts` | `sha256Hex(bytes)` via `crypto.subtle` | secure context |

**New — I/O**

| Module | Responsibility |
|---|---|
| `src/story/assetResolver.ts` | `assetId` → `data:` URL, module-level cache, never throws |
| `src/services/assetApi.ts` | presign / commit client, dedup handling, 412 + 409 paths |
| `server/src/db/storiesRepo.ts` | `stories` upsert, read |
| `server/src/db/assetUsageRepo.ts` | usage replace-in-transaction, refcount query |
| `server/src/db/markersRepo.ts` | marker registry |
| `server/migrations/003_stories.sql` | §6 schema |

**Changed**

| Module | Change |
|---|---|
| `src/story/storyDoc.ts` | v4 types; validator dispatches on `schemaVersion`; `assetId` regex |
| `src/story/props/compose.ts` | emit `asset:<alias>` at the two `<image href>` sites |
| `src/story/svgTexture.ts` | blob URL instead of percent-encoded data URL (§8.6) |
| `src/services/storyApi.ts` | resolve + hydrate assets after fetching the document |
| `server/src/storage/objectStore.ts` | add `presignPutConditional`, `putJson`, `headObject` |
| `api/publish.ts` | S3 `PutObject` instead of `@vercel/blob`; RDS index write |
| `infra/terraform/s3.tf` | prefix-scoped lifecycle, per-prefix cache-control, explicit CORS origins |
| `infra/terraform/cloudfront.tf` | new — distribution, cache policy, response headers policy |

Each unit answers the three questions cleanly: `artTokens` transforms a string
and knows nothing about networks; `assetResolver` fetches bytes and knows
nothing about SVG; `storyDoc` validates shape and knows nothing about storage.

---

## 12. Testing

Consistent with the project's existing posture — pure logic is unit-tested,
engine and browser-canvas interactions are verified on device.

| Suite | Cases |
|---|---|
| `artTokens.test.ts` | token replacement; `xlink:href` form; unknown alias → transparent pixel; **no false positive on the literal text `asset:` in SVG text content**; attribute escaping |
| `assetHash.test.ts` | known SHA-256 vectors; empty input |
| `storyDoc.test.ts` | v3 accepted unchanged; v4 validated; non-hex `assetId` rejected; `https://` and `data:` in an `assetId` rejected; unknown `schemaVersion` → fallback |
| `assetResolver.test.ts` | cache hit serves one fetch for N frames; fetch failure → transparent fallback, never throws |
| `svgTexture.test.ts` | extend for the blob-URL path; `revokeObjectURL` called |
| server `publish.test.ts` | S3-before-RDS ordering; RDS failure leaves a usable artifact; uncommitted asset rejected; usage rows replaced not appended |
| server `assets.test.ts` | dedup hit skips presign; 412 treated as success; 409 retried |

**On device (cannot be unit-tested):** hydrated art renders identically to
inlined art; a 60 s TTL makes a republish visible; cross-origin asset fetch
succeeds under the chosen deployment shape.

---

## 13. Dependency-ordered build sequence

Each phase is independently valuable and independently revisable.

| Phase | Work | Depends on | Ships |
|---|---|---|---|
| **0** | `storyDoc` v4, `artTokens`, `assetHash` | nothing | Pure logic, green tests, zero AWS. Nothing behaves differently yet. |
| **1** | Terraform: prefix-scoped lifecycle (**fixes the 90-day deletion bug**), per-prefix cache-control, explicit CORS origins, `S3_FORCE_PATH_STYLE=false` | 0 | Bucket is safe to hold production data. |
| **2** | Presign/commit endpoints; client upload-on-drop; dedup; `story_assets` + `asset_usage` tables | 1 | Assets live in S3, deduped. Documents unchanged. |
| **3** | `compose.ts` emits tokens; hydration on read; blob-URL rasterizer | 0, 2 | **The flip.** Documents drop from MB to KB. |
| **4** | Publish writes the S3 artifact; migrate off Vercel Blob; swap the IAM user for Vercel OIDC federation (§2.2). `stories` table **optional** — see §6 | 2, 3 | All storage on AWS. |
| **5** | CloudFront distribution, per-prefix cache policy, **the three CORS requirements and their cold-cache acceptance test (§9)**, and the `/image-targets/*` rewrite (§14.1) | 4 | Read path on CDN. |
| **6** | GC job; verify lifecycle; backfill `asset_usage` | 4 | Steady state. |

Phase 3 is the only irreversible-feeling step, and it is guarded: v3 documents
stay readable forever (§8.5), so a rollback is a config change, not a data
migration.

**Anchoring is not in this sequence.** It is the next spec and depends on device
verification of the four unverified marker items. The `anchor` field is defined
here (§8.1) purely so that adding it later requires no schema change.

---

## 14. Where this design rests on unverified ground

| Item | Where it bites | Mitigation |
|---|---|---|
| `configure({ scale })` may need `'absolute'` | `StoryAnchor` sizing | `widthInMarkers` is a ratio — holds under any scale mode (§8.1) |
| `scaledWidth`/`scaledHeight` may not be metres | `StoryAnchor` sizing | Same |
| Marker normal axis may be +Y not +Z | `StoryAnchor.local` values, not its shape | `MARKER_NORMAL_AXIS`, a one-line fix |
| ~10 simultaneous target cap | Only if one story spans many markers | `story_markers` join table models 1 and N identically (§6) |
The four above are the project's known unverified items. This design adds no
dependency on any of them beyond `StoryAnchor`, which is shaped to survive
either outcome.

### 14.1 Cross-origin `imagePath` — closed by design, not by verification

Serving marker fingerprints from S3 raised the question of whether the engine
accepts an absolute, cross-origin `imagePath`. **The published documentation is
silent on it.** Every reference frames the field as page-relative — *"The
`imagePath` field in the JSON must resolve relative to your page URL (e.g.
`/targets/my-target_luminance.jpeg`)"* — and the CLI README gives no hosting
guidance at all, only local `require()` examples. Absolute URLs are neither
documented as supported nor as forbidden.

Undocumented behaviour is not a foundation. **The design therefore never asks
the engine to resolve a cross-origin path.**

Under the chosen split-origin deployment (§2.2) this is a **required Vercel
rewrite**, not an option:

```jsonc
// vercel.json — note this must precede the SPA catch-all rewrite,
// which currently matches /((?!api/).*) and would otherwise swallow it
{ "source": "/image-targets/:path*",
  "destination": "https://<cdn-domain>/markers/:path*" }
```

The page then requests a same-origin `/image-targets/…` path, and the engine
resolves `imagePath` page-relative exactly as documented.
`loadImageTargets(manifestUrl)` is already parameterized and `resolveImagePath`
already roots `imagePath` in the manifest's directory, so **no application code
changes** — this is entirely routing.

Recorded explicitly because the "simplification" of pointing the manifest
straight at the CloudFront domain looks obviously correct, would appear to work
in any test where the engine happens to tolerate it, and rests on behaviour no
documentation promises. If a future change makes fingerprints load from an
absolute URL, that is a deliberate bet and should be verified on device first.

### 14.2 Risks that remain open

| Risk | Severity | Mitigation |
|---|---|---|
| **`data:` URL size ceiling on iOS Safari** when several images are hydrated into one SVG that is then assigned to `img.src` | Medium — unquantified | Ship the `r1024` derivative in v1 (§5), not later. Add a per-frame hydrated-size budget with a telemetry warning. **Verify on device with a worst-case frame.** |
| Unbounded growth of the resolved-asset cache | Low | Bound it, mirroring `posterTextureCache`, which already enforces a memory budget — reuse that precedent rather than inventing one |
| Story deletion is unspecified (S3 artifact + `asset_usage` cascade) | Low | Out of scope: v1 has no management UI. Define it with the story browser |

---

## 15. Expected outcome

A 2 MB photo used in three frames:

| | Today | This design |
|---|---|---|
| `doc.assets` | 2.66 MB base64 | ~110 bytes |
| `frame.art` × 3 | 8 MB | ~60 bytes |
| **Published document** | **~10.6 MB** | **~KB** |
| vs. 12 MB publish cap | 88% consumed | negligible |
| vs. ~5 MB `localStorage` | already broken | fits, with 50 undo snapshots ≈ 1 MB |
| Same image in a second story | stored again | stored once, automatically |
| Bytes fetched on a repeat visit | all of it | zero — `immutable`, cached |
| Cost per view | — | CDN GET only; no compute, no DB |
