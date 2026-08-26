# Marker testbed — AWS storage slice

The smallest amount of AWS that makes the image-marker testbed's persistence
real: **one S3 bucket**, **one Postgres instance**, and **one IAM user** for
the API to sign uploads with.

## What this is not

No ECS, no ALB, no CloudFront, no VPC of its own. The API (`server/`) runs on
your machine and talks to these resources over the internet. That is a
deliberate stopping point, not an oversight — the goal of this phase is to test
whether marker-anchored placements survive a cold start, and that only needs
somewhere real to store them. Moving the API into ECS behind an ALB, and the
frontend onto S3 + CloudFront, is the next phase.

The pieces that *are* here are the ones that carry over unchanged: the bucket
and the database keep their data and their schema when the API moves.

## Apply

```bash
cd infra/terraform
cp example.tfvars terraform.tfvars   # then edit it
terraform init
terraform apply
```

`db_allowed_cidrs` has no default and must be set. The database is
`publicly_accessible` because your laptop needs to reach it, so the security
group is the only thing keeping it private — an accidental `0.0.0.0/0` there
would expose it, and the variable validation refuses that value outright.

RDS takes several minutes to come up.

## Wire up the API

```bash
terraform output -raw server_env > ../../server/.env
cd ../../server
npm install
npm run migrate    # creates assets + marker_bindings
npm run dev
```

Then point the frontend at it, in the repo-root `.env`:

```
VITE_API_BASE_URL=http://<your-laptop-lan-ip>:8787
```

The phone must reach both the Vite dev server and this API, so use the LAN IP
rather than `localhost` in both places.

## Cost

Roughly a few dollars a month if left running: `db.t4g.micro` with 20 GB gp3 is
the dominant line item, and S3 storage for a handful of test posters is
negligible. Nothing here is free-tier-only, so destroy it when you are done:

```bash
terraform destroy
```

Objects also expire from the bucket after 90 days on their own.

## Things worth knowing

- **State is local.** `terraform.tfstate` holds the generated database password
  and the IAM secret key in plaintext, and is gitignored. A remote backend is
  the right call once more than one person applies this.
- **The bucket allows public GET.** The app loads posters by putting their S3
  URL into a texture loader, which cannot carry a signature. Keys are
  unguessable (`<device-uuid>/<uuid>.<ext>`) but not secret. This matches the
  Supabase public-bucket model the project already used. Listing and writing
  stay private.
- **Long-lived IAM keys.** Correct answer is a task role with no keys, which is
  what this becomes under ECS. A role cannot be assumed by a process on a
  laptop without extra federation setup, so the keys are scoped to object
  operations on this one bucket instead.
- **Default VPC.** A purpose-built VPC would not change who can reach the
  database — the security group decides that — and would need a bastion or VPN
  to stay usable from a laptop.
