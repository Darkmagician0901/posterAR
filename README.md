# 🎯 XR Poster — Mobile AR Web App (8th Wall)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-blue)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-0.160-blue)](https://threejs.org/)
[![8th Wall](https://img.shields.io/badge/AR-8th%20Wall%20(XR8)-7c3aed)](https://www.8thwall.com/)

A mobile-first web app for placing 2D posters in augmented reality. AR runs
directly in the mobile browser — no app install required — powered by the
**8th Wall (XR8)** WebAR engine with SLAM world-tracking.

> **Migrated off WebXR.** Earlier versions used the WebXR Device API with
> `@react-three/fiber` / `@react-three/xr`. The app now uses the 8th Wall engine
> (loaded from CDN) driving a plain **three.js** scene. See
> [`CHANGELOG.md`](CHANGELOG.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md).

## ✨ Features

### AR (live, mobile)
- **8th Wall SLAM world-tracking** — stable AR without WebXR
- **Center-screen hit-test reticle** — `searching` (head-locked, pulsing) vs.
  `tracking` (locked to a detected horizontal surface); lies flat on the surface
  when tracking
- **Tap to place** — tap anywhere to drop a poster flat on the detected surface
  at the reticle; the image's top edge ("head") points away from the viewer
  (up to `VITE_MAX_POSTERS`, default 10)
- **Per-poster controls** — the placed poster is auto-selected; a slider rescales
  it and a button deletes it

### Content
- **Custom upload** — JPEG/PNG/WebP compressed client-side to WebP
  (≤ 2 MB wire size, longest axis ≤ 2048 px); input cap 50 MB. **Animated GIFs
  are preserved and played back** as posters (decoded per-frame to a
  `CanvasTexture`; max 8 MB)
- **Poster gallery** — pick the default poster or any uploaded image
- **Screenshot** — capture/download/share the canvas (see the
  [screenshot caveat](#known-limitations))

### Desktop development
- **Webcam mock mode** — on desktop the app runs `DesktopMockMode`: a raw
  three.js scene over the laptop webcam, mouse-drag to look around, with a fake
  floor hit-test so the reticle + placement code can be exercised without a phone

### Diagnostics & UX
- **Always-on Diagnostic Panel** — subsystem health (engine, camera, motion,
  world-tracking, hit-test, …) plus a startup load-timing track
- **Debug HUD** — FPS + live subsystem state (toggle in-app, or `?debug=1`)
- **Determinate loading bar** — tracks 8th Wall engine + SLAM WASM download
- Instructions overlay, toast notifications, and a React error boundary

## 🚀 Quick Start

### Prerequisites
- **Node.js** ≥ 18
- A **mobile device** for live AR:
  - iOS Safari (16.4+ recommended — needs WebAssembly SIMD)
  - Android Chrome (recent)
- Desktop browsers run the **webcam mock mode** for development

### Install & run
```bash
git clone https://github.com/yourusername/xr-poster.git
cd xr-poster
npm install
npm run dev        # Vite dev server over HTTPS, exposed on the LAN (--host)
```

The dev server serves HTTPS via `@vitejs/plugin-basic-ssl` (required for camera
access and 8th Wall). Open:
- **Local:** `https://localhost:5173`
- **Network:** `https://<your-lan-ip>:5173` (for on-device testing)

> You'll see a self-signed-certificate warning in the browser — expected for
> local dev. Choose "Advanced" → proceed.

### Testing on a phone
1. Put the phone on the same network as your machine.
2. Find your LAN IP (`ipconfig` on Windows, `ifconfig`/`ip addr` on macOS/Linux).
3. Open `https://<your-lan-ip>:5173`, accept the cert warning, allow camera.

## 🧩 How it works (in brief)

`App.tsx` detects capabilities once at startup and renders one of three branches:

| Condition | Branch | Component |
|-----------|--------|-----------|
| Mobile + camera API + secure context (`hasAR8`) | Live AR | `ARExperience` (8th Wall) |
| Desktop | Webcam mock | `DesktopMockMode` |
| Otherwise | "AR Not Supported" panel | — |

On the live path the 8th Wall engine (loaded via `<script>` in `index.html`)
owns the canvas, camera feed, three.js renderer, and the render loop. The app
registers a **custom camera-pipeline module** (`onStart`/`onUpdate`) that builds
the scene, runs a center-screen hit-test each frame, drives the reticle, and
places posters on tap. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full flow.

## 📦 Tech Stack

| Layer | Choice |
|-------|--------|
| UI | **React 18.3** + **TypeScript 5.3** |
| Build | **Vite 5** (`@vitejs/plugin-react`, `@vitejs/plugin-basic-ssl`) |
| 3D | **three.js 0.160** (plain, no react-three-fiber) |
| AR engine | **8th Wall / XR8** `engine-binary`, `xrextras`, `landing-page` `@1.0.0`, loaded from jsDelivr |
| State | **Zustand 4** (`posterStore`, `useUIState`) |
| GIF decode | **gifuct-js ^2.1.2** (frame-by-frame GIF decode; data: URL support) |
| Testing | **vitest ^4.1.8** + **happy-dom ^20.9.0** |

There are **no** `@react-three/*` or `@use-gesture/*` dependencies — they were
removed in the 8th Wall migration. See [`TECH_STACK.md`](TECH_STACK.md).

## 🗂️ Project Structure

```
xr_poster/
├── index.html                  # Loads 8th Wall engine scripts (jsDelivr) + engine-load diagnostics
├── public/
│   ├── posters/default-poster.png
│   ├── _headers / _redirects   # Cloudflare Pages config
│   └── vite.svg
├── src/
│   ├── App.tsx                 # 3-branch root (live AR / desktop mock / unsupported)
│   ├── main.tsx                # React entry point
│   ├── index.css               # Global styles
│   ├── components/
│   │   ├── ar/
│   │   │   ├── ARExperience.tsx       # Live 8th Wall camera pipeline + scene
│   │   │   └── DesktopMockMode.tsx    # Desktop webcam sandbox
│   │   ├── layout/             # Header, MainLayout
│   │   └── ui/                 # ControlPanel, PosterControls, PosterGallery,
│   │       │                   #   LoadingScreen, Toast, InstructionsOverlay,
│   │       │                   #   DiagnosticPanel, DebugHUD, DevBanner, ErrorBoundary
│   ├── hooks/
│   │   ├── useArLoadProgress.ts       # Startup loading-bar progress
│   │   ├── usePosterUpload.ts         # File select → validate/compress
│   │   ├── useScreenshot.ts
│   │   └── useUIState.ts              # Global UI store (overlays, toasts)
│   ├── store/posterStore.ts           # Placed + uploaded posters (Zustand)
│   ├── types/index.ts
│   ├── utils/
│   │   ├── constants.ts
│   │   ├── deviceDetection.ts          # XR8 capability detection
│   │   ├── imageUpload.ts + .test.ts   # Client-side WebP compression; GIFs preserved as-is
│   │   ├── gifDecode.ts + .test.ts     # Typed gifuct-js adapter; decodes data: URLs
│   │   └── screenshot.ts
│   ├── xr/                     # Engine-agnostic 3D helpers
│   │   ├── debugTelemetry.ts          # Telemetry singleton (HUD/panel source)
│   │   ├── desktopMockDriver.ts        # Mouse-drag → camera orientation
│   │   └── reticle.ts                  # Surface reticle (searching/tracking)
│   └── xr8/                    # 8th Wall (XR8) integration
│       ├── globals.d.ts                # Ambient XR8/XRExtras/LandingPage typings
│       ├── pipeline.ts                 # Engine lifecycle: onXr8Ready/runXr8/stopXr8
│       ├── hitTestController.ts        # XrController.hitTest → reticle pose
│       ├── posterPlacement.ts + .test.ts  # Places/removes poster meshes in the scene
│       ├── gifAnimator.ts + .test.ts   # Drives a CanvasTexture per-frame for GIF posters
│       ├── gifPlayhead.ts + .test.ts   # Pure frame-timing playhead
│       └── posterTextureCache.ts + .test.ts  # createPosterTexture + refcounted animator cache
├── scripts/generate-qr.js
├── vite.config.ts · tsconfig*.json
├── vercel.json · netlify.toml · wrangler.toml · Dockerfile · docker-compose.yml
└── README.md · ARCHITECTURE.md · TECH_STACK.md · DEPLOYMENT.md · CONTRIBUTING.md · TESTING.md · CHANGELOG.md
```

## 🔧 Development

### Scripts
```bash
npm run dev          # Dev server (HTTPS, --host)
npm run test         # vitest run (one-shot; 29 tests across 6 files)
npm run test:watch   # vitest (interactive watch mode)
npm run type-check   # tsc --noEmit
npm run build        # tsc && vite build  →  dist/
npm run build:prod   # production-mode build
npm run preview      # Serve the production build
npm run analyze      # Build with mode=analyze

# Deploy
npm run deploy:vercel            # vercel --prod
npm run deploy:vercel:preview
npm run deploy:netlify           # netlify deploy --prod
npm run deploy:netlify:preview

# Docker
npm run docker:build / docker:run / docker:compose / docker:compose:down

# Utilities
npm run generate-qr -- https://your-deployment-url.com
```

### Environment variables
Create `.env.local` (all optional):
```env
VITE_MAX_POSTERS=10              # Max simultaneously placed posters
VITE_ENABLE_DEBUG_MODE=false     # Surfaces APP_CONFIG.enableDebugMode
VITE_GA_TRACKING_ID=G-XXXXXXXXXX # (optional) analytics
VITE_SENTRY_DSN=...              # (optional) error tracking
VITE_API_URL=...                 # (optional)
```
Tip: append `?debug=1` to the URL to open the app with the Debug HUD visible.

## 📱 Browser Support

| Platform | Browser | Mode |
|----------|---------|------|
| iOS | Safari 16.4+ | Live AR (8th Wall) |
| Android | Chrome (recent) | Live AR (8th Wall) |
| Desktop | Chrome/Edge/Safari | Webcam mock mode (dev) |

Requirements: **HTTPS** (or `localhost`), **camera permission**, **WebGL 2.0**,
and — on iOS — **WebAssembly SIMD** (the engine + SLAM WASM won't initialize on
older iOS). The Diagnostic Panel explains *why* AR didn't start when it doesn't.

## 🔒 Security

- HTTPS enforced in production; HSTS preload
- Content-Security-Policy allows the engine CDN (`https://cdn.jsdelivr.net`) in
  `script-src`; see `vercel.json` / `public/_headers`
- Engine helper scripts (`xrextras`, `landing-page`) are pinned with SRI hashes;
  `engine-binary` omits SRI because its loader fetches runtime chunks (`slam.js`)
  dynamically that a static hash cannot cover (documented inline in `index.html`)
- Uploaded images are processed entirely client-side — nothing is sent to a server

## <a id="known-limitations"></a>⚠️ Known Limitations

- **Horizontal surfaces only — walls are not supported.** 8th Wall SLAM world
  tracking detects a single horizontal ground plane; it cannot detect vertical
  surfaces such as walls. Posters are therefore placed flat on floors and tables
  only. Placing on a wall ("wall-from-floor") is a deferred future feature.
- **Screenshots on live AR may be blank.** The 8th Wall canvas is created
  without `preserveDrawingBuffer`, so `canvas.toDataURL()` outside the render
  loop can read an empty frame. Reliable capture needs to read pixels inside an
  engine render callback. The desktop mock path is unaffected. (See
  `src/utils/screenshot.ts`.)
- **No move/pinch/rotate gestures.** Posters are placed by tapping and resized
  via the scale slider; free-hand manipulation was part of the old gesture stack
  and is not implemented on the 8th Wall path.

## 🚀 Deployment

Static SPA → any static host. Build output is `dist/`. Configs are included for
Vercel (`vercel.json`), Netlify (`netlify.toml`), Cloudflare Pages
(`wrangler.toml`, `public/_headers`, `public/_redirects`), and Docker
(`Dockerfile`, `docker-compose.yml`). See [`DEPLOYMENT.md`](DEPLOYMENT.md).

The GitHub Actions workflow (`.github/workflows/deploy.yml`) type-checks, builds,
and deploys to Netlify on pushes to `main` (Vercel auto-deploys from Git; its
job is left commented out).

## 🧪 Testing

The project has a **vitest** unit test suite (environment: happy-dom) covering
pure logic:

| File | Coverage |
|------|----------|
| `src/utils/gifDecode.test.ts` | GIF size reading, data: URL decode |
| `src/utils/imageUpload.test.ts` | Upload validation, compression rules |
| `src/xr8/gifAnimator.test.ts` | CanvasTexture frame-update logic |
| `src/xr8/gifPlayhead.test.ts` | Frame-timing playhead |
| `src/xr8/posterPlacement.test.ts` | Poster mesh placement/removal |
| `src/xr8/posterTextureCache.test.ts` | Refcounted animator cache + memory budget |

```bash
npm run test         # vitest run  (29 tests, all passing, < 1 s)
npm run test:watch   # vitest interactive watch
```

End-to-end verification is still `npm run type-check` + `npm run build` + on-device
manual testing. See [`TESTING.md`](TESTING.md) for the manual checklist and device
matrix.

## 🤝 Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for workflow, coding standards, and
commit conventions.

## 📄 License

MIT — see [`LICENSE`](LICENSE).

## 📚 Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system design & data flow
- [`TECH_STACK.md`](TECH_STACK.md) — stack reference & rationale
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — deployment guide
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution guidelines
- [`TESTING.md`](TESTING.md) — manual testing procedures
- [`CHANGELOG.md`](CHANGELOG.md) — version history

---

**Status:** Active · **AR engine:** 8th Wall (XR8) · **Last updated:** 2026-06-15
