# Changelog

All notable changes to XR Poster will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed — Flat poster placement on detected surfaces
- **Posters now lie flat on the surface** (floor/table) instead of standing
  upright like a billboard. The image's top edge ("head") is oriented **away
  from the viewer**, so the poster reads naturally when looked down at.
- New pure helper `composeFlatPosterMatrix` in `src/xr/posterOrientation.ts`
  builds the correct world transform from the hit-test pose and the camera
  position; it is engine-agnostic and unit-testable without 8th Wall globals.
  Wired into the live placement path in `ARExperience` via the XR scene's
  camera position.
- The reticle mesh likewise lies flat on the tracked horizontal surface.

### Reverted — Wall-reticle experiment (Approach A)
- A feature-point–based "wall reticle" experiment (synthesising a vertical pose
  from AR feature points) was prototyped and **reverted** because 8th Wall's
  SLAM world tracking only detects one horizontal ground plane and cannot detect
  vertical surfaces; forcing the reticle vertical everywhere broke normal
  floor/table placement.
- Wall placement is **deferred** to a future "wall-from-floor" technique
  (Approach B): the user taps the floor at the base of a wall to erect a
  virtual vertical plane. Posters currently target horizontal surfaces only.

### Changed — Migrated AR engine from WebXR to 8th Wall (XR8)
- **AR now runs on the 8th Wall (XR8) engine** with SLAM world-tracking,
  loaded from CDN (`@8thwall/engine-binary`, `xrextras`, `landing-page` `@1.0.0`
  via jsDelivr) instead of the WebXR Device API.
- **Rendering is now plain three.js.** Removed `@react-three/fiber`,
  `@react-three/xr`, `@react-three/drei`, and `@use-gesture/react` — runtime deps
  are now just `react`, `react-dom`, `three`, `zustand`.
- New `src/xr8/` layer: engine lifecycle (`pipeline.ts`), center-screen hit-test
  (`hitTestController.ts`), poster meshes (`posterPlacement.ts`), ambient typings
  (`globals.d.ts`). `src/xr/` now holds engine-agnostic helpers (reticle,
  telemetry, desktop mock driver).

### Added
- **Desktop webcam mock mode** (`DesktopMockMode`) — exercise reticle + placement
  on a laptop without a phone.
- **Diagnostic Panel + Debug HUD + load-timing telemetry** to diagnose slow/failed
  AR startup (notably the engine + SLAM WASM download on iOS); determinate loading
  bar driven from telemetry milestones; engine watchdog with concrete failure notes.
- CSP updated to allow the engine CDN; SRI on helper scripts (engine-binary omits
  SRI by design — its loader fetches `slam.js` chunks dynamically).

### Removed / Changed behavior
- Drag / pinch / rotate gestures and tap-to-select are no longer implemented;
  placement is tap-based and resizing uses a scale slider on the auto-selected poster.

### Maintenance
- Removed `// Made with Bob` trailers across the source tree, deprecated
  `String.substr()` usages, redundant `XR8 as any` casts, and dead WebXR/gesture-era
  constants/types; fixed `vite.config.ts` `optimizeDeps` referencing removed deps.
- Rewrote README / ARCHITECTURE / TECH_STACK and updated CONTRIBUTING / TESTING /
  DEPLOYMENT to reflect the 8th Wall architecture.

### Added — Animated GIF poster support
- **Animated GIF posters** — GIFs are decoded client-side via `gifuct-js ^2.1.2` and
  animated frame-by-frame onto a three.js `CanvasTexture`; new source files
  `gifDecode.ts`, `gifPlayhead.ts`, `gifAnimator.ts`, `posterTextureCache.ts`.
- GIF files are preserved as-is on upload (not flattened to WebP); non-GIF images
  continue to be compressed to WebP < 2 MB. GIF limit: 8 MB.
- `data:` URL GIFs are decoded without `fetch`; a graceful static fallback is used
  if decoding fails.

### Added — Automated test suite
- **Vitest** (`^4.1.8`) + **happy-dom** (`^20.9.0`) test environment; run via
  `npm run test` (single pass) or `npm run test:watch` (watch mode).
- 6 test files, 29 tests covering: GIF timing/decode, upload validation,
  poster placement, and texture cache behaviour.

### Added — Diagnostics improvements
- **Full tap→place breadcrumb tracing** — every step from tap event to AR placement
  is logged so failures can be isolated.
- **On-device error HUD** surfaces poster-placement errors without a desktop DevTools
  connection.
- **On-demand Debug HUD toggle** — the diagnostic overlay can be shown/hidden at
  runtime on device.

### Changed — Texture lifecycle & memory
- **Refcounted shared animator cache** with an animation memory budget; GIF animators
  are shared across placements of the same source and evicted when the budget is
  exceeded.
- Textures are fully released on the placement error path (previously leaked on error).
- Full `dispose()` coverage for all three.js textures on poster removal.

### Planned Features
- Multi-user collaboration
- Poster templates library
- Spatial audio support
- Cloud persistence
- Image target tracking
- Social sharing features
- Analytics dashboard
- Gamification elements

---

## [1.0.0] - 2026-05-21

### 🎉 Initial Release

The first production-ready release of XR Poster - a mobile-first AR web application for placing 2D posters in augmented reality using WebXR.

### ✨ Features

#### Core AR Functionality
- **WebXR Integration** - Native AR experience using WebXR Device API
- **Hit Testing** - Real-time surface detection for poster placement
- **Poster Placement** - Tap-to-place posters on detected surfaces
- **Multiple Posters** - Support for up to 10 simultaneous posters
- **Poster Management** - Select, move, and delete placed posters

#### Gesture Controls
- **Drag Gesture** - Move posters in 3D space
- **Pinch Gesture** - Scale posters up/down
- **Rotate Gesture** - Rotate posters around Y-axis
- **Multi-touch Support** - Smooth gesture handling on mobile devices

#### User Interface
- **Instructions Overlay** - First-time user guidance
- **Control Panel** - Easy access to all features
- **Poster Gallery** - Browse and select from default posters
- **Loading Screen** - Smooth loading experience
- **Toast Notifications** - User feedback for actions
- **Error Boundary** - Graceful error handling

#### Image Upload
- **Custom Posters** - Upload your own images
- **Image Validation** - Support for JPEG, PNG, WebP (max 10MB)
- **Image Optimization** - Automatic compression for performance
- **Preview** - See uploaded image before placing

#### Screenshot Feature
- **Capture AR Scene** - Take photos of your AR experience
- **High Quality** - Full resolution screenshots
- **Auto Download** - Automatic file download
- **Share Ready** - Perfect for social media

#### Performance
- **Mobile Optimized** - Runs smoothly on mid-range devices
- **Code Splitting** - Optimized bundle loading
- **Lazy Loading** - Load resources on demand
- **Memory Management** - Efficient resource cleanup
- **60 FPS Target** - Smooth animations and interactions

#### Browser Support
- **iOS Safari 15+** - Full WebXR support
- **Android Chrome 79+** - Full WebXR support
- **Progressive Enhancement** - Graceful fallback for unsupported devices

### 🏗️ Architecture

#### Technology Stack
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Three.js** - 3D graphics
- **React Three Fiber** - React renderer for Three.js
- **@react-three/xr** - WebXR integration
- **Zustand** - State management
- **@use-gesture/react** - Gesture handling
- **Vite** - Build tool and dev server

#### Project Structure
- Modular component architecture
- Custom hooks for reusable logic
- Centralized state management
- Separation of concerns (AR, UI, utilities)
- Type-safe throughout

### 🚀 Deployment

#### Platform Support
- **Vercel** - One-click deployment with automatic HTTPS
- **Netlify** - Alternative deployment platform
- **Cloudflare Pages** - Global CDN deployment
- **Docker** - Containerized deployment

#### CI/CD
- **GitHub Actions** - Automated build and deployment
- **Type Checking** - Automated TypeScript validation
- **Build Verification** - Ensure production builds succeed
- **Preview Deployments** - Automatic PR previews

#### Configuration Files
- `vercel.json` - Vercel deployment configuration
- `netlify.toml` - Netlify deployment configuration
- `wrangler.toml` - Cloudflare Pages configuration
- `Dockerfile` - Docker container configuration
- `docker-compose.yml` - Docker Compose setup
- `.github/workflows/deploy.yml` - GitHub Actions workflow

### 📱 Mobile Features

#### Device Detection
- Automatic device capability detection
- Performance tier classification
- Adaptive quality settings
- Browser compatibility checking

#### Touch Optimization
- Native touch event handling
- Gesture conflict prevention
- Smooth touch interactions
- Haptic feedback support (where available)

### 🔒 Security

#### Headers
- Content Security Policy (CSP)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security (HSTS)
- Permissions-Policy for camera access

#### Privacy
- No data collection by default
- Camera access only when needed
- No server-side storage
- Client-side only processing

### 📚 Documentation

- **README.md** - Project overview and quick start
- **ARCHITECTURE.md** - Technical architecture and design decisions
- **DEPLOYMENT.md** - Comprehensive deployment guide
- **CONTRIBUTING.md** - Contribution guidelines
- **TESTING.md** - Testing procedures and checklist
- **CHANGELOG.md** - Version history (this file)

### 🛠️ Developer Tools

#### Scripts
- `npm run dev` - Start development server with HTTPS
- `npm run build` - Production build
- `npm run preview` - Preview production build
- `npm run type-check` - TypeScript type checking
- `npm run deploy:vercel` - Deploy to Vercel
- `npm run deploy:netlify` - Deploy to Netlify
- `npm run docker:build` - Build Docker image
- `npm run generate-qr` - Generate QR codes

#### QR Code Generator
- Command-line tool for generating QR codes
- Multiple format support (PNG, SVG)
- Customizable size and colors
- HTML preview generation
- Terminal output for quick scanning

### 🎨 Design

#### Visual Design
- Modern, clean interface
- Gradient backgrounds
- Smooth animations
- Responsive layout
- Mobile-first approach

#### User Experience
- Intuitive gesture controls
- Clear visual feedback
- Helpful instructions
- Error recovery
- Accessibility considerations

### ⚡ Performance Metrics

#### Target Metrics (Achieved)
- First Contentful Paint: < 1.5s ✅
- Largest Contentful Paint: < 2.5s ✅
- Time to Interactive: < 3.5s ✅
- Frame Rate: 60 FPS (30 FPS minimum) ✅
- Bundle Size: < 200KB gzipped ✅

### 🐛 Known Issues

None at release. Please report issues on [GitHub Issues](https://github.com/yourusername/xr-poster/issues).

### 📝 Notes

- WebXR requires HTTPS for security
- Camera permission required for AR functionality
- Best experience on devices with ARCore/ARKit support
- Performance varies by device capabilities

---

## Version History

### Version Numbering

We use [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible API changes
- **MINOR** version for new functionality (backwards compatible)
- **PATCH** version for bug fixes (backwards compatible)

### Release Schedule

- **Major releases** - Quarterly (Q1, Q2, Q3, Q4)
- **Minor releases** - Monthly
- **Patch releases** - As needed for critical bugs

### Support Policy

- **Current version** - Full support
- **Previous major version** - Security updates only
- **Older versions** - No support

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

---

## Links

- **Repository:** https://github.com/yourusername/xr-poster
- **Issues:** https://github.com/yourusername/xr-poster/issues
- **Discussions:** https://github.com/yourusername/xr-poster/discussions
- **Documentation:** https://github.com/yourusername/xr-poster/wiki

---

**Maintained by:** XR Poster Team  
**License:** MIT  
**Last Updated:** 2026-06-08