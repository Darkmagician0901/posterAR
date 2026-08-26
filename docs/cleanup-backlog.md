# Cleanup backlog

Findings from a three-agent audit on **2026-08-26**, recording what was *not*
done and why. Everything here was verified against the code or a real command's
output at that date; re-verify before acting, since some of it will rot.

What *was* done in the same pass: stale test counts corrected across six docs,
`DEPLOYMENT.md`'s Vercel/Netlify fiction replaced with the real Amplify
topology, `CONTRIBUTING.md`'s Conventional-Commits section replaced with the
convention actually used, the false "ARExperience still exists" claim removed,
the `TECH_STACK.md` ↔ `ARCHITECTURE.md` contradiction resolved in favour of the
code, a marker section added to `CLAUDE.md`, and two genuinely dead exports
deleted from `imageTargetController.ts`.

---

## 1. Five lint warnings (0 errors — CI is green)

All are `react-hooks/set-state-in-effect`, and they are in **five different
files**, not one:

| File | Line |
|---|---|
| `src/components/story/useStoryTypewriter.ts` | 35 |
| `src/components/ui/InstructionsOverlay.tsx` | 75 |
| `src/components/ui/LoadingScreen.tsx` | 47 |
| `src/hooks/useArLoadProgress.ts` | 93 |
| `src/studio/useResolvedAssets.ts` | 32 |

**Not fixed on purpose.** These five hooks drive real UI behaviour — a
typewriter interval, a loading bar, two fade animations — and **none of them has
a test**. Rewriting untested animation code to silence warnings that do not fail
CI is a poor trade; fix them alongside tests, not before.

**Two things worth knowing before anyone tries.**

- The `useMemo`-during-render shape used to fix `StageEditor.tsx` does **not**
  generalise here. That worked because `markerRect` was a pure derivation with
  no side effects; four of these five need genuinely async work. The applicable
  idiom is React's sibling technique, *adjusting state during render* — compare
  a `prev` value to the current prop and call the setter in the render body, so
  the call is never inside `useEffect` at all.
- **`InstructionsOverlay` is a trap.** Its fade-in needs two browser paints
  (paint without the class, then add it — `InstructionsOverlay.css:15-16`). The
  render-time idiom collapses that into one paint and silently kills the
  animation. The correct fix there is `requestAnimationFrame` inside the effect,
  which escapes the rule the same way the file's own `setTimeout` call already
  does. `LoadingScreen` was checked and has no fade-*in*, so it does not share
  this constraint.

Note the rule reports only the **first** offending call per effect, so a partial
fix will surface a new warning rather than reducing the count.

## 2. Test gaps, ranked

The suite is pure-logic-only by design; XR8, canvas and DOM interactions are
manually tested. These are pure-logic modules with **no** test file:

1. **`src/store/posterStore.ts`** — only `hydrateUploads` is covered. Nine
   actions are untested, including two branches with real logic: the
   `maxPosters` cap rejection, and `removePoster` clearing a selection that
   pointed at the removed poster. Its sibling stores (`spaceStore`,
   `storyStore`, `contentStore`) are all fully covered.
2. **`src/services/spaceApi.ts`** — every other API client has a test; this one
   arrived with the testbed and does not.
3. **`src/hooks/useUIState.ts`** — a core store per `CLAUDE.md`, untested.
4. **`src/xr/debugTelemetry.ts`** — real logic: idempotent `mark()`,
   notify-only-on-transition, EMA FPS smoothing, ring-buffer eviction. Feeds
   both the loading bar and the diagnostic HUD.
5. **`src/story/props/builders.ts`** — its own doc comment claims it is
   unit-testable; it is not tested.
6. **`src/xr/reticle.ts`** — pure three.js matrix work. Precedent exists:
   `posterPlacement.ts` does the same kind of thing and *is* tested.

Lower priority: `utils/deviceDetection.ts`, `hooks/useScreenshot.ts` (injectable
`capture`, so orchestration is testable), `components/ui/ErrorBoundary.tsx`.

## 3. Duplication left in place

Landing the testbed alongside the shipped marker layer left two implementations
of similar ideas. **Nothing is broken** — `App.tsx` picks one branch, so they
never run together — but the names collide confusingly:

- `ImageTargetData` is declared **twice** with different shapes:
  `src/markers/markerTarget.ts:28` (shipped, built in memory) and
  `src/xr8/imageTargetData.ts:36` (testbed, fetched from a manifest).
- `LocalTransform` / `IDENTITY_LOCAL` are declared twice:
  `src/story/storyDoc.ts:135` and `src/xr/markerRelativeTransform.ts:49,63`.
- The literal `/image-targets` is defined twice: `MARKER_IMAGE_ROUTE`
  (`markerTarget.ts:25`) and `IMAGE_TARGET_DIR` (`imageTargetData.ts:26`).
- `markerTracking.ts` (shipped) and `imageTargetController.ts` (testbed) are
  independent hand-rolled parsers for the same three XR8 events.

Converge these only if the testbed's findings are folded into the shipping path.
Until then the duplication is the price of keeping a working diagnostic tool.

## 4. Kept deliberately — do not "clean up"

- `ControlPanel.tsx`, `DevBanner.tsx`, `PosterControls.tsx` — unreferenced, each
  says **PARKED** in its own header. Retained for a future admin panel.
- `usePosterUpload.ts` — same, documented as parked.
- `worldToMarkerLocal` (`markerRelativeTransform.ts:174`) and
  `spaceStore.setLocal` — no call sites outside tests, but both are one half of
  a documented symmetric pair. Machinery for a not-yet-built interaction, not
  cruft.
- The whole of `server/` — see below.

## 5. `server/` is in an odd state

A complete, self-consistent, independently-tested Fastify service that is in
**no** automated build, test, or deploy path except lint:

- `tsconfig.json` `include` is `["src", "api"]` — excluded from the build.
- `vitest.config.ts` excludes it; its 33 tests run only via `cd server && npm test`,
  which **CI never does**.
- `package.json`'s `lint` script is `eslint src server/src` — the one root-level
  thing that touches it.
- Production's backend is the Lambda from `api/_lambda.ts`, whose route table
  serves only `/api/story-assets`, `/api/publish`, `/api/publish-exhibit`.

It is nonetheless the **only** implementation of `/api/assets` and `/api/spaces`,
which `posterApi.ts` and `spaceApi.ts` call. Both gate on `VITE_API_BASE_URL`,
which is unset in Amplify, so those features are cleanly **disabled** rather than
broken. Deleting `server/` would remove the only backend for a feature the
frontend still calls. Two honest options: wire its tests into CI, or move it to
a clearly-labelled parked directory. Not decided.

## 6. Infrastructure still open

- **OPS-3 — cache headers.** `markers/` objects serve `Cache-Control: max-age=0`.
  Content-addressed keys can never change, so every AR session re-downloads each
  marker PNG (212 KB for the live one) before tracking starts. Should be
  `immutable`; `stories/` should be ~60s.
- **OPS-6 — OIDC.** `infra/terraform/iam.tf` still provisions an IAM user with
  static access keys.
- **OPS-7 — CloudFront.** No distribution fronts `eml-arcade-storage`; assets are
  served straight from S3.
- **RDS.** Possibly still billing (~$15/month) for an instance v1 does not use.
  Could not verify: `PokemonGoServices` lacks `rds:DescribeDBInstances`, and
  granting it is a root action.
- **Bucket litter.** `stories/` holds `manual-test-1.json`, `manual-test-2.json`,
  `probe.json` and a 0-byte key; `exhibits/` holds `break-test.json`.

`infra/terraform/` now exists on `main` and its `s3.tf` / `variables.tf` were
reconciled against the live account on 2026-08-26. **OPS-1 and OPS-2 in
`arcade-storage-ops-checklist.md` are resolved but still show unchecked boxes** —
that checklist needs a pass.

## 7. Documentation still stale

- **`TESTING.md`'s file table** (lines ~38-58) lists 21 files against a real 68.
  The headline count was corrected; the table was not.
- **`CHANGELOG.md`** `[Unreleased]` has no entry for the marker layer, the marker
  locator, the testbed merge, ARCADE Studio, or the Vercel→Amplify migration. It
  still ends in the GIF-pipeline era.
- **`LICENSE` does not exist**, but `README.md:3` carries an MIT badge and
  `README.md:357` links to the file. Left alone deliberately — declaring a
  licence is the owner's call, not a cleanup decision. Either add the file or
  drop the claim.
- **`DOC-M1`** — `.claude/skills/8thwall-engine/reference/imagetargets.md` still
  documents the retired hosted `imageTargets: ['name']` API, which detects
  nothing. Regenerate with `npm run build:8thwall-docs`.

## 8. Fixed during this pass, recorded so it is not re-diagnosed

**The custom domain could not load any content.** `arcade.ubc-dxl.ca` serves the
same build as `main.d114nr20m4npww.amplifyapp.com`, but the S3 CORS allowlist
contained only the two `amplifyapp.com` origins. A preflight from the custom
domain returned **403 AccessForbidden**, so `storyApi` and `exhibitApi` — which
fetch S3 cross-origin — failed there. Because both degrade gracefully by design,
visitors silently got the bundled demo story instead of authored content.

Fixed by adding `https://arcade.ubc-dxl.ca` to the bucket's `AllowedOrigins`;
verified afterwards that story and exhibit GETs return `200` with
`Access-Control-Allow-Origin` set, and that the marker route resolves on the
custom domain.

**The lesson worth keeping:** graceful degradation hid a total content failure.
Any future origin — a new custom domain, a preview branch — needs adding to the
bucket CORS, and the symptom will be "the demo story appears" rather than an
error.
