# Image-marker space testbed — design

**Status:** implemented (Phase 1)
**Date:** 2026-07-27
**Supersedes nothing.** Builds the runtime half of the marker-anchoring work
scoped in `docs/superpowers/specs/2026-06-25-persistent-marker-anchored-posters-design.md`
(local, untracked), which was designed but never built.

---

## 1. Why

Everything downstream — marker upload, asset editing, position persistence,
recovery after quitting, an admin panel that monitors marker stability —
depends on one unverified assumption: **that 8th Wall image-target tracking is
stable enough on real phones to anchor content to a printed picture, and that a
marker-relative transform round-trips accurately across sessions.**

That assumption has never been measured on this project's hardware. The prior
spec called the on-device image-target latch "the highest residual risk,
unverified."

So this phase builds the smallest thing that measures it, and nothing else.

## 2. What it answers

1. **Tracking stability and frame rate.** What FPS, what detection latency,
   how much pose jitter, and how far does an asset jump when the marker is
   re-acquired?
2. **Distance adjustment.** Can an asset's distance from the marker be changed
   and stored?
3. **The spaces data structure.** Does "marker as origin, assets bound to it
   with relative positions" hold up, with several markers coexisting?

Answering these decides whether the larger marker feature is worth building at
all — and if so, which anchoring mode it should use.

## 3. Scope

**In:**

- Detecting a self-hosted image target and reading its world pose.
- Marker-relative anchoring maths (latch and restore).
- A per-marker "space" holding bound assets with relative transforms.
- A distance slider along the marker's normal.
- An on-screen readout of FPS, detection latency, jitter, and drift.
- Persistence to **real AWS** (S3 + Postgres) via the existing `server/`.
- Terraform for that storage slice.

**Out — deliberately parked, not cancelled:**

- ECS/Fargate + ALB deploy of the API; CloudFront + S3 hosting of the frontend.
- In-app marker upload and server-side fingerprint generation.
- An admin/monitoring dashboard and telemetry ingestion.
- Any change to the shipping story mode.

## 4. Grounding: how 8th Wall image targets actually work

Since 8th Wall went open source (Feb 2026) the hosted platform is gone. That
changes how targets are defined and nothing else:

- A marker is registered by running the open-source
  `npx @8thwall/image-target-cli@latest` on a picture. It emits a **JSON
  fingerprint** plus processed images (a cropped 480x640 luminance image the
  tracker matches against, and a thumbnail).
- The engine is configured with the target **data**, inline:
  `XR8.XrController.configure({ imageTargetData: [ ...json ] })`. The old
  hosted form — `configure({ imageTargets: ['name'] })`, referencing a name
  registered in the console — no longer resolves to anything.
- Detection still fires `reality.imagefound` / `imageupdated` / `imagelost`,
  carrying `{ name, position, rotation, scale, scaledWidth, scaledHeight }`,
  with position and rotation **in the same world frame as SLAM**. That shared
  frame is what makes the anchoring maths below valid.
- Up to **10 targets** can be scanned simultaneously.
- Everything runs on the device. No image, fingerprint, or camera frame is
  sent anywhere.

The CLI is **interactive only** — no documented flags or headless mode — which
is precisely why in-app marker upload is out of scope for this phase.

> The repo's `.claude/skills/8thwall-engine/reference/imagetargets.md` still
> documents the retired hosted API and needs regenerating.

## 5. The maths

A marker defines its own coordinate space. Assets are stored relative to it,
never in world coordinates — SLAM invents a fresh world origin on every launch,
so a world position means nothing across sessions, while "12 cm out from this
printed picture" is a fact about the room.

```
latch:    T_local = inverse(T_marker_world) · T_asset_world
restore:  T_asset_world' = T_marker_world' · T_local
```

Two decisions inside this:

- **The marker frame is rigid** — built from position and rotation only, with
  the engine's reported `scale` deliberately excluded. Folding scale in would
  make the inverse rescale every stored offset, so a scale estimate wobbling by
  1% would move a 1 m offset by 1 cm. Physical size is kept separately and used
  for sizing assets, not anchoring them.
- **Transforms are stored decomposed** (3 floats position + quaternion +
  uniform scale) rather than as a packed 16-float matrix, so a bad placement is
  diagnosable in psql without reconstructing a matrix by hand.

**One thing to verify on device:** the distance axis is assumed to be the
marker's local **+Z** (out of the printed surface), matching the plane
convention three.js and PLANAR targets share. If the slider slides the asset
across the marker instead of lifting it off, the engine's planar frame uses +Y
and `MARKER_NORMAL_AXIS` in `src/xr/markerRelativeTransform.ts` becomes `1`. It
is a named constant so that is a one-line correction.

## 6. Anchoring modes

Which mode is right is exactly what the testbed should reveal, so both ship
behind a toggle:

| Mode | Behaviour | Trade-off |
|------|-----------|-----------|
| **Follow** | Re-derive the world pose from the marker every frame | Rigidly stuck to the picture; inherits all tracker jitter |
| **Latch** | Derive once on (re)acquisition, then leave it to SLAM | Rock steady; drifts if SLAM's world estimate drifts |

In both modes an asset is **never moved while its marker is out of view** —
SLAM holds the last pose, which is what makes it stay put when you look away.

## 7. Measurements

| Metric | Meaning |
|--------|---------|
| FPS | Render loop health with detection running |
| Detection latency | `configure()` → first `imagefound` |
| Update rate | `imageupdated` frequency while tracked |
| Position jitter (RMS / peak) | Deviation from a 2 s rolling mean, in mm |
| Rotation jitter (RMS) | Angular deviation from the window's mean orientation |
| **Re-acquire drift** | How far an asset jumps when the marker returns to view |

Jitter is measured against the **window mean**, not the previous sample.
Frame-to-frame difference conflates real hand movement (large, smooth,
expected) with tracking noise (small, zero-mean, the thing we care about);
deviation from a short rolling mean isolates the noise floor.

Re-acquire drift is the headline number: it is the visible jump a user would
see, and the same quantity that decides whether a scene restored after a cold
start lands in the right place.

## 8. Data model

```
Space { markerName (origin), assets: [ { id, assetUrl, assetName, local } ] }
```

Persisted as a flat `marker_bindings` table — the per-marker grouping is a
client-side presentation concern, and a flat list keeps the response shape
stable.

Poster **bytes** go to S3 through the existing `/api/assets` pipeline; only the
resulting **URL** plus a few hundred bytes of transform go to Postgres.
`assetUrl` is validated as an `http(s)` URL or a site-relative path, which
keeps multi-megabyte `data:` URLs out of a text column and keeps a
`javascript:` string out of a texture loader.

## 9. Architecture

**New:**

| Module | Role |
|--------|------|
| `src/xr/markerRelativeTransform.ts` | Pure latch/restore maths (engine-agnostic) |
| `src/xr/markerStability.ts` | Pure rolling jitter / update-rate metrics |
| `src/xr8/imageTargetData.ts` | Loads self-hosted fingerprints, fixes `imagePath` |
| `src/xr8/imageTargetController.ts` | Configure + found/updated/lost + pose registry |
| `src/xr8/markerAnchoredAssets.ts` | Reconciles a space into meshes each frame |
| `src/store/spaceStore.ts` | Zustand: spaces, bindings, selection |
| `src/services/spaceApi.ts` | Client for the bindings API |
| `src/components/ar/MarkerTestbedExperience.tsx` | The AR mode |
| `src/components/ui/MarkerHUD.tsx` | Readout + controls |
| `server/migrations/002_marker_bindings.sql`, `db/markerBindingsRepo.ts`, `routes/spaces.ts` | Persistence |
| `infra/terraform/` | S3 + RDS + IAM |

**Reused unchanged:** `xr8/pipeline.ts`, `PosterPlacement` (plus one new
`setPose`), `posterTextureCache`, `debugTelemetry` (plus one new subsystem),
`DebugHUD` / `DiagnosticPanel`, and the whole `server/` asset pipeline.

**Reached at `?mode=marker`.** A query flag rather than a router: the app has
no routing, the testbed is a diagnostic surface, and a URL you can paste into a
phone is the right amount of machinery. The shipping story mode is the default
and is untouched.

## 10. Deliberate stopping points

- **The API runs on a laptop**, not in ECS. Testing recovery needs somewhere
  real to store things, not a deployment pipeline. The bucket and the schema
  carry over unchanged when the API does move.
- **Terraform state is local**, and holds the generated DB password in
  plaintext. Fine for one operator; a remote backend is needed before a second.
- **The bucket allows public GET.** The app puts S3 URLs straight into a
  texture loader, which cannot carry a signature. Keys are unguessable but not
  secret. This matches the Supabase public-bucket model already in use.
- **Long-lived IAM keys**, scoped to object operations on one bucket. A task
  role with no keys is correct and is what this becomes under ECS; a role
  cannot be assumed from a laptop without extra federation machinery.
- **No fingerprint is committed.** It is tied to whichever picture you print,
  so generating one is step one — see `public/image-targets/README.md`.

## 11. Marker choice matters

8th Wall uses **natural-feature tracking**, not fiducial markers. A plain
high-contrast shape — a solid square, a simple logo — has almost nothing to
match against and tracks badly. Using one would make the tracker look unstable
when the marker is at fault, invalidating the exact measurement this testbed
exists to take. Use a **detailed, busy, non-repeating** picture, 3:4 portrait,
at least 480x640, printed flat and matte.

## 12. What the results should decide

- **Jitter and drift acceptable in Follow mode** → build on Follow; content is
  rigidly attached to the picture.
- **Jitter too visible, drift small** → build on Latch.
- **Both poor** → the marker approach needs reconsidering before any of the
  upload / editing / admin work is worth starting.
