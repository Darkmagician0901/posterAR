# ARCADE Storage — manual operations checklist

Everything in the storage migration that a person configures by hand: AWS
provisioning, Vercel project settings, secrets, and the marker CLI. No agent
performs any of these.

Companion documents: `docs/arcade-storage-aws-design.md` (the design, §
references below point there), `docs/arcade-storage-plan-a.md`,
`docs/arcade-storage-plan-b.md`.

**Conventions**

| Marker | Meaning |
|---|---|
| 🔴 **BLOCKING** | Code cannot proceed past a named task until this is done |
| 🟡 **GATING** | Needed before a phase can be verified end to end |
| ⚪ **WHEN CONVENIENT** | Improves posture; nothing waits on it |

---

## ✅ OPS-0 — RESOLVED: v1 uses no database

*Recorded because the reasoning matters, not because anything is outstanding.*

Planning surfaced a structural problem: **a Vercel function cannot reach the
RDS instance as provisioned.** `rds.tf` gates Postgres behind
`var.db_allowed_cidrs`, and `variables.tf` refuses `0.0.0.0/0` — correctly —
but Vercel functions have no stable egress address on non-Enterprise plans, so
there is no CIDR to allowlist. Meanwhile §2.2 rules out running Fastify on ECS.

**Resolution: drop Postgres from v1 entirely** (design §6, §7.3). S3 already
answers every question the tables were going to:

| Question | Postgres | S3 |
|---|---|---|
| Do these exact bytes exist? | `select … where sha256` | `HeadObject` → 200 |
| Did the upload complete? | `committed` flag | the object exists at all |
| Two uploaders racing | `on conflict do nothing` | `If-None-Match: *` → 412 |
| Aspect, filename | row columns | **already in `StoryAssetRef`** |
| Which assets are still used? | `asset_usage` join | derived from `stories/*.json` |

The `committed` flag only ever existed to cover a window where a row could
precede its bytes. With S3 as the register that window does not exist.

**What this removed:** a migration, a repo, the Fastify routes, the `/commit`
round trip, the RDS connectivity problem, and an always-on service from the
bill. **What it costs:** listing an owner's assets becomes `ListObjectsV2`
rather than an indexed query — at one operator and tens of assets, not a cost.

The RDS instance stays provisioned and unused. The control-plane schema stays
designed (§6.1) for when a management UI needs it; **the connectivity question
returns at that point and must be answered then.**

- [x] Decided — no action required
- [ ] **Optional cleanup:** consider `terraform destroy -target=aws_db_instance.main` to stop paying ~$15/month for an unused instance. Reversible — the schema is in §6.1 and the migration runner still works.

## 🔴 OPS-1 — Scope the S3 lifecycle rule to `tmp/`

**Blocks: Plan A Task 8 running against a real bucket.**

`infra/terraform/s3.tf:86-103` expires **the whole bucket** after 90 days. It
was written when the bucket held only disposable testbed uploads. Published
exhibits reference assets indefinitely, so every asset uploaded by Task 8 would
be deleted three months later — silently, and long after anyone would connect
the two events.

**Note:** `infra/terraform/` exists **only on `feat/marker-spaces-testbed`**
(PR #40) — not on `main`, not on `feat/story-composition`. Apply this there, or
move `infra/` to `main` first.

Replace `aws_s3_bucket_lifecycle_configuration.assets`:

```hcl
# Only scratch objects expire.
#
# This rule previously used `filter {}` — the WHOLE BUCKET — with a 90-day
# expiration, written when the bucket held nothing but disposable testbed
# uploads. Published exhibits reference assets indefinitely, so an unscoped
# expiry would silently delete live content three months after upload.
# Lifetime for assets/ is governed by reference counting, not by age.
resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    id     = "expire-scratch-only"
    status = "Enabled"

    filter {
      prefix = "tmp/"
    }

    expiration {
      days = 90
    }
  }

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
```

- [ ] Applied
- [ ] `terraform plan` showed the **lifecycle rule** replaced — **not** the bucket. *If the plan proposes destroying `aws_s3_bucket.assets`, stop.*

---

## 🔴 OPS-2 — Replace the wildcard CORS origin

**Blocks: Plan B Phase 5 verification.**

`infra/terraform/variables.tf` defaults `cors_allowed_origins` to `["*"]`. The
viewer now fetches asset bytes cross-origin in order to convert them to `data:`
URLs (§9), so this value is load-bearing rather than cosmetic.

```hcl
variable "cors_allowed_origins" {
  description = <<-EOT
    Origins allowed to read assets and issue presigned PUT uploads.

    Deliberately has NO default. The viewer fetches asset bytes cross-origin to
    convert them to data: URLs, so a wrong value is a broken exhibit and a
    wildcard is an open bucket.
  EOT
  type = list(string)

  validation {
    condition     = !contains(var.cors_allowed_origins, "*")
    error_message = "Refusing a wildcard CORS origin. List specific origins."
  }
}
```

Set it to the real origins:

```hcl
cors_allowed_origins = [
  "https://<production-domain>",
  "https://postarr.vercel.app",
]
```

- [ ] Wildcard removed, validation added
- [ ] Production origin listed
- [ ] **Preview-deployment decision made** — Vercel preview URLs are generated per deployment, so they cannot be enumerated in advance. Either accept that **assets load only in production** (previews show transparent gaps where images would be), or front assets through a stable custom domain. Decide deliberately; discovering it during a review is worse.

---

## 🟡 OPS-3 — Per-prefix cache headers

Only correct because assets are content-addressed and therefore immutable.

| Prefix | `Cache-Control` | Why |
|---|---|---|
| `stories/<id>.json` | `public, max-age=60, must-revalidate` | **Mutable at a stable key** — this is how `/?s=<id>` resolves without a lookup. Without the short TTL, republishing is invisible to visitors until the cache expires. |
| `assets/<sha>/*` | `public, max-age=31536000, immutable` | Content-addressed: the bytes at a key can never change. |
| `markers/<id>/*` | `public, max-age=31536000, immutable` | Written once per marker. |
| `tmp/*` | `no-store` | Scratch. |

Set on the objects at write time (the publish function sets `stories/`;
the presign sets `assets/`), or as a CloudFront response-headers policy.

- [ ] `stories/` TTL is 60s, not longer
- [ ] `assets/` is `immutable`

---

## 🟡 OPS-4 — Apply and verify Terraform

- [ ] `terraform fmt -check` and `terraform validate` pass
- [ ] `terraform plan -var-file=…` reviewed line by line
- [ ] Plan does **not** destroy `aws_s3_bucket.assets`
- [ ] Applied

`S3_FORCE_PATH_STYLE` is not relevant to the new code paths — the Vercel
functions use the AWS SDK's default virtual-hosted addressing. The `true`
default in `server/src/config.ts` is a Supabase legacy affecting only the
poster path, which this work does not touch.

---

## 🟡 OPS-5 — Environment variables

Client variables are **inlined into the bundle at build time** and are readable
by anyone. Never put a secret in a `VITE_`-prefixed variable — that is exactly
how `feat/admin-panel-ui`'s `VITE_ADMIN_PASSPHRASE` failed.

**Vercel project `postarr` — client (public, safe to expose)**

| Variable | Value | Notes |
|---|---|---|
| `VITE_ASSET_BASE_URL` | CloudFront domain serving `assets/` | Empty = same-origin |
| `VITE_STORY_BASE_URL` | CloudFront domain serving `stories/` | Plan B; empty disables remote stories |
| `VITE_API_BASE_URL` | origin of the presign/publish functions | Empty disables persistence |

**Vercel project `postarr` — server only (never `VITE_`-prefixed)**

| Variable | Notes |
|---|---|
| `STUDIO_PUBLISH_SECRET` | Bearer secret for `POST /api/publish` |
| `AWS_ROLE_ARN` | If using OIDC (OPS-6) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Only if **not** using OIDC |
| `S3_BUCKET`, `S3_REGION` | Required — the presign and publish functions both 503 without them |
| `STORY_PUBLIC_BASE_URL` | Returned in the publish response so the studio can show a link |

No `DATABASE_URL`: v1 uses no database (OPS-0).

- [ ] No secret carries a `VITE_` prefix
- [ ] `BLOB_READ_WRITE_TOKEN` retained until Plan B Phase 4 completes, then removed

---

## ⚪ OPS-6 — Vercel OIDC instead of long-lived AWS keys

`infra/terraform/iam.tf` provisions an IAM **user** with static access keys.
Its own comment says a role is the better answer and that this was scaffolding
for a laptop-hosted API. With functions on Vercel, that upgrade is available:
[Vercel OIDC federation](https://vercel.com/docs/oidc/aws) exchanges a
short-lived Vercel-signed token for AWS credentials via
`AssumeRoleWithWebIdentity`, so no static secret is stored anywhere.

- [ ] IAM role created, trusting Vercel's OIDC provider, scoped to the bucket
- [ ] `AWS_ROLE_ARN` set on the Vercel project
- [ ] Function uses `awsCredentialsProvider` from `@vercel/functions`
- [ ] IAM user and its access keys deleted once the role works

---

## 🟡 OPS-7 — CloudFront distribution

**Plan B Phase 5.** Three requirements; **any one missing produces a failure
that depends on cache state — it will pass a casual test and break for a real
visitor** (§3.6, §9).

- [ ] Distribution created, S3 origin, OAC or public-read as appropriate
- [ ] **Cache policy includes `Origin` in the cache key** ← the trap. Without it, a first request lacking `Origin` caches a CORS-less response that is then served to cross-origin callers.
- [ ] Managed **`CORS-S3Origin`** origin request policy attached, so `Origin` reaches the bucket at all
- [ ] Per-prefix behaviours matching OPS-3

**Acceptance test — run exactly this, in this order, on a cold cache:**

```bash
# 1. Prime the cache WITHOUT an Origin header.
curl -sI "https://<cdn>/assets/<sha>/full.webp" | grep -i "access-control\|x-cache"

# 2. Now request as a browser would, cross-origin.
curl -sI -H "Origin: https://<app-domain>" "https://<cdn>/assets/<sha>/full.webp" \
  | grep -i "access-control-allow-origin\|x-cache"
```

Step 2 **must** return `access-control-allow-origin`. If it does not, the cache
key is missing `Origin`. Testing only the warm path hides precisely this defect.

- [ ] Acceptance test passed from a cold cache

---

## 🟡 OPS-8 — Vercel rewrite for marker fingerprints

**Plan B Phase 5.** The engine's handling of an absolute cross-origin
`imagePath` is **undocumented** — every reference frames it as page-relative
(§14.1). The design deliberately never asks it to resolve one.

In `vercel.json`, **before** the SPA catch-all (which currently matches
`/((?!api/).*)` and would otherwise swallow it):

```jsonc
{
  "rewrites": [
    { "source": "/image-targets/:path*", "destination": "https://<cdn>/markers/:path*" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

- [ ] Rewrite added **above** the catch-all
- [ ] `curl https://<app>/image-targets/manifest.json` returns the manifest
- [ ] Not "simplified" later by pointing the manifest at the CDN domain directly — that rests on behaviour no documentation promises

---

## ⚪ OPS-9 — Marker fingerprints

Only needed for the anchoring work, which is a later spec. Recorded here so it
is not rediscovered.

```bash
npx @8thwall/image-target-cli@latest
```

**Interactive only** — it prompts for the source image, a crop, a name, and an
output folder. There is no documented flag-driven or headless mode, so this is
a manual step per marker, by a human, forever.

Marker choice is not cosmetic. 8th Wall does **natural-feature tracking**, not
fiducial detection: it matches distinctive detail inside a picture. A generated
pattern, a QR-style grid, a plain logo, or any repeating texture tracks
**badly** — and it will look like the tracker is broken when the marker is
actually at fault.

- [ ] Source image is detailed, busy, non-repeating, 3:4 portrait, ≥480×640, <2048×2048
- [ ] Printed flat and **matte** — gloss reflects and washes out features
- [ ] ~6 output files uploaded to `markers/<marker-id>/`
- [ ] `manifest.json` lists the target JSON

---

## Ordering

```
OPS-0  ✅ resolved — no database in v1

OPS-1  lifecycle ─────────────► unblocks Plan A Task 8 (real bucket)
   │
OPS-2  CORS origins
OPS-4  terraform apply
OPS-5  env vars ──────────────► unblocks Plan A end-to-end verification
   │
OPS-3  cache headers
OPS-7  CloudFront + acceptance test
OPS-8  vercel rewrite ────────► unblocks Plan B Phase 5
   │
OPS-6  OIDC          (when convenient)
OPS-9  fingerprints  (anchoring spec)
```

**Only OPS-1 blocks anything now**, and only Plan A Task 8 running against a
real bucket. **Plan A Tasks 0 through 7 need nothing from this list** — that is
every pure-logic module, the S3 helper, and the presign endpoint, all of which
are unit-tested against mocks.

The practical reading: OPS-1 is the one thing worth doing today, and it takes
minutes. Everything else can follow the code.
