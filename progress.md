# Progress Log

## Session 1 — 2026-05-27

### Code analysis (read-only)
- Read `src/xr/{reticle,planeRenderer,hitTest,sessionManager,debugTelemetry,anchorManager}.ts`.
- Read `src/components/ar/{ARExperience,IOSARFallback}.tsx`.
- Read `src/components/ui/DebugHUD.{tsx,css}`.
- Read `src/App.tsx`, `src/utils/deviceDetection.ts`.

### Findings
- Pipeline architecture is sound — reticle, planeRenderer, anchorManager are
  well-isolated. Telemetry singleton is the right abstraction.
- User's "no reticle" symptom isn't a bug in reticle code — it's that the
  failure modes (null hit-test source, zero hits, missing plane-detection)
  produce no visual output and the HUD that *would* explain it is hidden by
  default and only mounted on the Android path.

### Plan created
- `task_plan.md` — 8 phases.
- `findings.md` — current state + gaps.
- Phase 1 (design) complete; Phases 2–8 pending.

### Next steps (awaiting user approval to start coding)
- Start Phase 2: extend `debugTelemetry` with `subsystems` field.

### Session 1 — implementation
All phases (2–8) implemented in one pass after user said "keep on going":
- `src/xr/debugTelemetry.ts` — added `SubsystemStatus`, `SubsystemsSnapshot`, `PlatformLabel`, `setSubsystem()`.
- `src/components/ui/DiagnosticPanel.{tsx,css}` — new always-on panel.
- `src/App.tsx` — mounted DiagnosticPanel in all branches, seeded platform/webxr/camera/motion from `detectXRSupport()`.
- `src/xr/reticle.ts` — added `setMode('hidden'|'tracking'|'searching')`, head-locked scanner Group, `tick(timeMs)` for the pulse.
- `src/xr/syntheticSurfaceMesh.ts` — new fallback grid quad for sessions without `detectedPlanes`.
- `src/xr/planeRenderer.ts` — sticky active-plane match (500 ms).
- `src/components/ar/ARExperience.tsx` — wired new reticle modes, scanner attach, synthetic mesh, subsystem writes per frame.
- `src/components/ar/IOSARFallback.tsx` — wires camera/motion/surface/session into telemetry.

Build status:
- `npm run type-check` ✓
- `npm run build` ✓ (1.54s)
- Dev server running at https://localhost:5173/

### Decisions
- Keep `debugTelemetry` singleton as source of truth — no migration to Zustand.
- DiagnosticPanel = always-on, sits beside existing DebugHUD (which stays dev-only).
- Synthetic surface mesh = simple normal-aligned quad at hit pose; not a
  replacement for `planeRenderer`, an addition.

## Session 2 — 2026-05-27 — Segmentation pipeline + desktop mock driver

### Context
User reports: iOS Safari has no WebXR; cannot install WebXR Emulator
extension on desktop browser. Existing iOS fallback uses estimated floor
(no real tracking) and desktop dev has no way to drive the AR pipeline.

### Brainstorming outcome
Option A chosen — TFJS segmentation + IMU stabilizer pipeline (free, works
on iOS Safari, no marker needed). Plus desktop mock-AR driver so the user
can develop without the emulator extension.

### New phases added to task_plan.md
- Phase 9: TFJS + DeepLab deps
- Phase 10: src/xr/segmenter.ts
- Phase 11: src/xr/surfaceLifter.ts
- Phase 12: src/xr/imuStabilizer.ts
- Phase 13: SurfaceMesh visual (reuses syntheticSurfaceMesh shape)
- Phase 14: Wire pipeline into IOSARFallback.tsx
- Phase 15: Desktop mock-AR driver
- Phase 16: DiagnosticPanel new rows
- Phase 17: Verification

### Working in worktree
`.claude/worktrees/ios-segmentation-pipeline` on branch
`worktree-ios-segmentation-pipeline` (bg session isolation).

### Next steps
Starting Phase 9 — add TFJS deps.

### Session 2 — implementation pass
All Phase 9-17 phases implemented:
- `package.json` — added `@tensorflow/tfjs` ^4.x, `@tensorflow-models/deeplab` ^1.x
- `src/xr/debugTelemetry.ts` — extended SubsystemStatus with loading/ready/inferring/anchored/drifting; added segmenter/stabilizer/desktopMock to SubsystemsSnapshot.
- `src/xr/segmenter.ts` — new, DeepLab wrapper with dynamic import for code-splitting; ADE20K class-color matching for wall/floor/ceiling; min 4% coverage threshold; busy flag to prevent overlapping inferences.
- `src/xr/surfaceLifter.ts` — new, pinhole-model 2D centroid → 3D world plane at fixed 2m depth, FOV-derived mesh sizing.
- `src/xr/imuStabilizer.ts` — new, lerps mesh position between detections, holds rotation in world frame, drift detection via camera quat delta.
- `src/xr/desktopMockDriver.ts` — new, pointer-driven orientation quaternion + install/dispose handle.
- `src/components/ar/IOSSurfaceMesh.tsx` — new, R3F mesh with translucent fill + edge outline, color by classId.
- `src/components/ar/IOSSegmentationDriver.tsx` — new, useFrame-driven 5 Hz scheduler that snapshots camera quat at capture, runs segmenter, lifts result, feeds stabilizer, writes surface ref each frame.
- `src/components/ar/IOSARFallback.tsx` — mounted segmentation pipeline alongside FloorGrid/Reticle (graceful fallback); tap-to-place prefers segmented surface; status badge reflects segmenterStatus state.
- `src/components/ar/DesktopMockMode.tsx` — new, full segmentation pipeline on the laptop webcam with mouse-drag orientation.
- `src/App.tsx` — added desktop branch sub-mode behind `?desktopMock=1` URL param routing to DesktopMockMode.
- `src/components/ui/DiagnosticPanel.tsx` — added segmenter/stabilizer/desktopMock rows, new status-color mappings, contextual hints for each pipeline state.
- `vite.config.ts` — added 'tfjs' manualChunks entry so TFJS+DeepLab live in a lazy chunk (392 KB gz) separate from the main vendor chunk (140 KB gz).

### Build status
- `npm run type-check` ✓
- `npm run build` ✓ in 9.5s
- Bundle: vendor 446 KB / 140 KB gz, three 667 KB / 172 KB gz, **tfjs 2.46 MB / 392 KB gz (lazy)**, index 75 KB / 24 KB gz
- `npm run dev` starts cleanly on https://localhost:5174/

### Decisions
- TFJS+DeepLab via dynamic import — non-iOS users don't pay the cost.
- No depth model — fixed 2 m plane at the camera ray through the centroid. Sufficient for room-scale poster placement.
- Reused syntheticSurfaceMesh shape as the visual basis; IOSSurfaceMesh is a small R3F wrapper.
- Desktop mock = same pipeline on webcam + mouse-driven orientation, not a WebXR session mock. Tarpit avoided.
- FloorGrid + GroundReticle still mounted on iOS so the user has a horizon even while the model loads or if it fails.

### Manual verification pending
- iOS Safari on real iPhone: confirm model downloads, segmentation produces detections, mesh appears.
- iOS battery characterization.
- Desktop mock visual: drag rotation, segmenter loading, mesh attaches.
