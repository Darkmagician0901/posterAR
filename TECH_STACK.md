# 🛠️ Technology Stack — XR Poster

Reference for the libraries, tools, and platform APIs the app actually uses.

> **Migrated off WebXR + react-three.** The app no longer depends on
> `@react-three/fiber`, `@react-three/xr`, `@react-three/drei`, or
> `@use-gesture/react`. AR is now provided by the **8th Wall (XR8)** engine
> loaded from CDN, driving a plain **three.js** scene. See
> [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## At a glance

```
┌───────────────────────────── Runtime (browser) ──────────────────────────┐
│  React 18.3  +  TypeScript 5.3        UI / components / state             │
│  three.js 0.160                       3D scene (plain, no R3F)            │
│  Zustand 4                            posterStore + useUIState            │
│  gifuct-js 2.1                        Animated GIF decode (poster pipeline)│
├───────────────────────────────────────────────────────────────────────── │
│  8th Wall / XR8 (loaded via <script> from jsDelivr, NOT an npm dep)       │
│   @8thwall/engine-binary@1.0.0   xr.js loader + SLAM WASM (world-tracking)│
│   @8thwall/xrextras@1.0.0        FullWindowCanvas / Loading / RuntimeError│
│   @8thwall/landing-page@1.0.0    device-permission landing helper         │
├───────────────────────────────────────────────────────────────────────── │
│  Vite 5  (@vitejs/plugin-react, @vitejs/plugin-basic-ssl)                 │
│  Vitest 4  +  happy-dom 20            unit / integration tests            │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Dependencies (`package.json`)

### Runtime
| Package | Version | Role |
|---------|---------|------|
| `react` / `react-dom` | 18.3.1 | UI framework |
| `three` | ^0.160.0 | 3D rendering (plain three.js; the 8th Wall `Threejs` pipeline module renders the scene) |
| `zustand` | ^4.4.7 | State (`posterStore`, `useUIState`) |
| `gifuct-js` | ^2.1.2 | GIF decoding — parses frame data and delays from an `ArrayBuffer`; used by `gifDecode.ts` to animate GIF posters without a server round-trip |

The AR engine is **not** an npm package — it is loaded from CDN at runtime (see below).

### Dev
| Package | Version | Role |
|---------|---------|------|
| `typescript` | ^5.3.3 | Type checking (`tsc --noEmit`) |
| `vite` | ^5.0.8 | Build tool + dev server |
| `@vitejs/plugin-react` | ^4.2.1 | React Fast Refresh / JSX |
| `@vitejs/plugin-basic-ssl` | ^1.0.1 | Self-signed HTTPS for local dev (camera/8th Wall require a secure context) |
| `vitest` | ^4.1.8 | Unit/integration test runner; config in `vitest.config.ts` |
| `happy-dom` | ^20.9.0 | Fast DOM environment for Vitest (replaces jsdom; supports Canvas 2D API needed by GIF animator tests) |
| `@types/node`, `@types/react`, `@types/react-dom`, `@types/three` | — | Type definitions |

`overrides` pin `react`/`react-dom` to 18.3.1; `engines.node` requires ≥ 18.

---

## 8th Wall (XR8) engine

Loaded via three `<script>` tags in `index.html` (pinned `@1.0.0`, from
`https://cdn.jsdelivr.net`), exposing the globals `XR8`, `XRExtras`,
`LandingPage` — typed loosely as `any` in `src/xr8/globals.d.ts`.

- **`engine-binary` (`xr.js`)** — the engine loader; fetches additional runtime
  chunks (notably `slam.js`) dynamically. Provides
  `XR8.GlTextureRenderer`, `XR8.Threejs`, `XR8.XrController`,
  `XR8.addCameraPipelineModules`, `XR8.run`, `XR8.stop`.
- **`xrextras`** — optional UX modules: `FullWindowCanvas`, `Loading`,
  `RuntimeError`.
- **`landing-page`** — optional device/permission landing helper.

Every optional module is **runtime-guarded** before use (`typeof
…pipelineModule === 'function'`) so a partially-loaded CDN bundle never throws.
Load outcomes are recorded in `window.__xr8diag` and surfaced in the Diagnostic
Panel. Integration lives in `src/xr8/` — see [`ARCHITECTURE.md`](ARCHITECTURE.md).

Why 8th Wall over WebXR: consistent SLAM world-tracking across iOS Safari and
Android Chrome without WebXR's patchy iOS support, anchor lifecycle, or
reference-space management.

---

## three.js usage

Plain three.js — no react-three-fiber. The app constructs `Scene`, lights,
`Group`s, `PlaneGeometry`/`MeshBasicMaterial`/`Mesh`, `Texture`/`TextureLoader`,
and math types (`Matrix4`, `Vector3`, `Quaternion`, `Euler`). On the live path
the scene/camera come from `XR8.Threejs.xrScene()` and the engine renders;
`DesktopMockMode` owns its own `WebGLRenderer` and render loop.

---

## State management — Zustand

Two stores, no Provider/context:
- `store/posterStore.ts` — placed posters (capped at `maxPosters`), uploaded
  posters, current image, selection.
- `hooks/useUIState.ts` — overlay visibility, active modal, toast queue.

The 3D scene mirrors `posterStore` mutations via a store subscription in
`ARExperience` (see [`ARCHITECTURE.md`](ARCHITECTURE.md) §5).

---

## Testing (Vitest + happy-dom)

Tests run with `npm run test` (single pass) or `npm run test:watch` (interactive).
Config: `vitest.config.ts` — `environment: 'happy-dom'`, includes
`src/**/*.{test,spec}.{ts,tsx}`.

6 test files / 29 tests, all in `src/`:

```
utils/gifDecode.test.ts        GIF header parsing + data: URL decode
utils/imageUpload.test.ts      Validation, GIF pass-through, WebP compression
xr8/gifPlayhead.test.ts        Frame-timing math
xr8/gifAnimator.test.ts        createPosterTexture branching + static fallback
xr8/posterTextureCache.test.ts Refcount + budget enforcement + dispose
xr8/posterPlacement.test.ts    place / remove / tick / clear
```

The test environment does not load the 8th Wall engine; `XR8` globals are absent
by design — the pipeline tests rely only on three.js and gifuct-js.

---

## Build & dev (Vite)

- **Dev server:** `https: true` (basic-ssl) + `host: true` for LAN/device
  testing on port 5173.
- **Aliases:** `@` → `/src`; react/react-dom/jsx-runtime resolved + deduped (with
  `three`) to avoid duplicate copies.
- **Build:** `target: es2020`, `minify: esbuild`, CSS code-split. `manualChunks`
  splits `three` into its own chunk; everything else (incl. React) stays in
  `vendor` — React is deliberately *not* split out (separate React chunks caused
  a load-order race). The 8th Wall engine is CDN-loaded and not in the bundle.
- **Output:** `dist/` (`index`, `vendor`, `three` chunks + CSS).

`tsconfig.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`,
`jsx: react-jsx`, `moduleResolution: bundler`, path alias `@/* → ./src/*`.

---

## Browser APIs used

| API | Used for |
|-----|----------|
| `getUserMedia` | Camera capability check (non-prompting) + webcam in desktop mock |
| `DeviceOrientationEvent` / `DeviceMotionEvent` | Gyroscope detection; iOS `requestPermission` typings in `vite-env.d.ts` |
| Canvas 2D / `toBlob` / `toDataURL` | Image compression + screenshots |
| `createImageBitmap` | Fast image decode for upload (with `<img>` fallback) |
| File / FileReader | Upload handling |
| Web Share API (`navigator.share`/`canShare`) | Optional screenshot sharing |
| `localStorage` / `sessionStorage` | Tutorial-completed flag; diagnostic-dismissed flag |
| WebGL 2.0 + WebAssembly (SIMD) | three.js rendering + the 8th Wall SLAM engine |

---

## Styling

Vanilla CSS, one co-located `.css` file per component (`Component.tsx` +
`Component.css`), plus global `src/index.css`. No CSS-in-JS, no Tailwind.

---

## Deployment targets

Static SPA → Vercel (`vercel.json`), Netlify (`netlify.toml`), Cloudflare Pages
(`wrangler.toml` + `public/_headers`/`_redirects`), or Docker
(`Dockerfile`/`docker-compose.yml`, nginx). CI in
`.github/workflows/deploy.yml`. See [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## Compatibility

- **Node:** ≥ 18 (build/dev)
- **iOS Safari:** 16.4+ (needs WebAssembly SIMD for the engine)
- **Android Chrome:** recent
- **Desktop:** development only — runs the webcam mock mode

---

**Last updated:** 2026-06-08
