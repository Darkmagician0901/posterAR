# 🎯 XR Poster - Mobile AR Web Application

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-blue)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-0.160-blue)](https://threejs.org/)

A production-ready mobile-first web application for placing 2D posters in augmented reality using WebXR. Experience immersive AR directly in your mobile browser—no app installation required!

![XR Poster Demo](https://via.placeholder.com/800x400/667eea/ffffff?text=XR+Poster+AR+Experience)

## ✨ Features

### Core AR Functionality
- ✅ **WebXR-Powered AR** - Native AR experience using WebXR Device API
- ✅ **Real-Time Surface Detection** - Intelligent hit testing for accurate poster placement
- ✅ **Tap-to-Place** - Intuitive poster placement with a single tap
- ✅ **Multiple Posters** - Place up to 10 posters simultaneously
- ✅ **Poster Management** - Select, move, and delete placed posters

### Gesture Controls
- ✅ **Drag Gesture** - Move posters freely in 3D space
- ✅ **Pinch Gesture** - Scale posters up and down
- ✅ **Rotate Gesture** - Rotate posters around the Y-axis
- ✅ **Multi-Touch Support** - Smooth, responsive gesture handling

### User Interface
- ✅ **Instructions Overlay** - First-time user guidance
- ✅ **Control Panel** - Easy access to all features
- ✅ **Poster Gallery** - Browse and select from default posters
- ✅ **Loading Screen** - Smooth loading experience
- ✅ **Toast Notifications** - Real-time user feedback
- ✅ **Error Boundary** - Graceful error handling

### Advanced Features
- ✅ **Custom Poster Upload** - Upload your own images (JPEG, PNG, WebP)
- ✅ **Screenshot Capture** - Take high-quality photos of your AR scene
- ✅ **Image Optimization** - Automatic compression for optimal performance
- ✅ **Responsive Design** - Works on all screen sizes

### Performance
- ✅ **Mobile Optimized** - Runs smoothly on mid-range devices
- ✅ **60 FPS Target** - Smooth animations and interactions
- ✅ **Code Splitting** - Optimized bundle loading
- ✅ **Lazy Loading** - Load resources on demand
- ✅ **Memory Management** - Efficient resource cleanup

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** 9.0.0 or higher
- **Mobile Device** with WebXR support:
  - iOS: Safari 15+ on iPhone/iPad
  - Android: Chrome 79+ on Android device

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/xr-poster.git
cd xr-poster

# Install dependencies
npm install

# Start development server (with HTTPS)
npm run dev
```

The app will be available at:
- **Local:** `https://localhost:5173`
- **Network:** `https://[your-ip]:5173` (for mobile testing)

> **Note:** You may see a browser warning about the self-signed certificate. This is normal for local development. Click "Advanced" and proceed to the site.

### Testing on Mobile

1. Ensure your mobile device is on the same network as your development machine
2. Find your local IP address:
   - Windows: `ipconfig`
   - Mac/Linux: `ifconfig` or `ip addr`
3. Open `https://[your-ip]:5173` on your mobile device
4. Accept the security warning
5. Grant camera permissions when prompted

## 📦 Tech Stack

### Core Technologies
- **[React 18](https://reactjs.org/)** - UI framework with concurrent features
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe development
- **[Vite](https://vitejs.dev/)** - Lightning-fast build tool
- **[Three.js](https://threejs.org/)** - 3D graphics library

### AR & 3D
- **[@react-three/fiber](https://docs.pmnd.rs/react-three-fiber)** - React renderer for Three.js
- **[@react-three/xr](https://github.com/pmndrs/xr)** - WebXR integration for React
- **[@react-three/drei](https://github.com/pmndrs/drei)** - Useful Three.js helpers

### State & Gestures
- **[Zustand](https://github.com/pmndrs/zustand)** - Lightweight state management
- **[@use-gesture/react](https://use-gesture.netlify.app/)** - Touch gesture handling

## 🎮 Usage

### Starting an AR Session

1. Open the app on your mobile device
2. Tap the **"Enter AR"** button
3. Grant camera permission when prompted
4. Point your device at a flat surface (floor, table, wall)
5. Wait for the reticle to appear on the detected surface

### Placing Posters

1. Tap the screen where the reticle appears
2. A poster will be placed at that location
3. The poster automatically faces the camera
4. Repeat to place more posters (up to 10)

### Manipulating Posters

**Select a Poster:**
- Tap on any placed poster to select it
- Selected poster will be highlighted

**Move a Poster:**
- Tap and drag the selected poster
- Poster follows your finger in 3D space

**Scale a Poster:**
- Use pinch gesture (two fingers) to scale up/down
- Maintains aspect ratio

**Rotate a Poster:**
- Use rotate gesture (two fingers) to rotate
- Rotates around the Y-axis

**Delete a Poster:**
- Select the poster
- Tap the delete button in the control panel

### Using the Poster Gallery

1. Tap the gallery icon in the control panel
2. Browse available posters
3. Tap a poster to select it
4. Place the selected poster in AR

### Uploading Custom Posters

1. Tap the upload button
2. Select an image from your device
3. Supported formats: JPEG, PNG, WebP (max 10MB)
4. The uploaded poster appears in the gallery
5. Place it like any other poster

### Taking Screenshots

1. Arrange your posters in AR
2. Tap the camera button
3. The screenshot is automatically downloaded
4. Share on social media or save for later

## 🏗️ Project Structure

```
xr_poster/
├── public/                      # Static assets
│   ├── posters/                # Default poster images
│   ├── _headers                # Cloudflare Pages headers
│   └── _redirects              # Cloudflare Pages redirects
├── src/
│   ├── components/             # React components
│   │   ├── ar/                # AR-specific components
│   │   │   ├── ARExperience.tsx
│   │   │   └── PosterMesh.tsx
│   │   ├── ui/                # UI components
│   │   │   ├── ControlPanel.tsx
│   │   │   ├── PosterGallery.tsx
│   │   │   ├── LoadingScreen.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── InstructionsOverlay.tsx
│   │   └── layout/            # Layout components
│   │       ├── Header.tsx
│   │       └── MainLayout.tsx
│   ├── hooks/                 # Custom React hooks
│   │   ├── useXRSession.ts
│   │   ├── useHitTest.ts
│   │   ├── useGestures.ts
│   │   ├── usePosterPlacement.ts
│   │   ├── usePosterUpload.ts
│   │   ├── useScreenshot.ts
│   │   └── useUIState.ts
│   ├── xr/                    # WebXR utilities
│   │   ├── sessionManager.ts
│   │   └── hitTest.ts
│   ├── store/                 # State management
│   │   └── posterStore.ts
│   ├── utils/                 # Utility functions
│   │   ├── deviceDetection.ts
│   │   ├── constants.ts
│   │   ├── imageUpload.ts
│   │   └── screenshot.ts
│   ├── types/                 # TypeScript definitions
│   │   └── index.ts
│   ├── assets/                # App assets
│   ├── App.tsx                # Main app component
│   ├── main.tsx               # Entry point
│   └── index.css              # Global styles
├── scripts/                   # Build scripts
│   └── generate-qr.js         # QR code generator
├── .github/                   # GitHub configuration
│   └── workflows/
│       └── deploy.yml         # CI/CD pipeline
├── vercel.json                # Vercel config
├── netlify.toml               # Netlify config
├── wrangler.toml              # Cloudflare config
├── Dockerfile                 # Docker config
├── docker-compose.yml         # Docker Compose
├── vite.config.ts             # Vite configuration
├── tsconfig.json              # TypeScript config
├── package.json               # Dependencies
├── README.md                  # This file
├── ARCHITECTURE.md            # Technical architecture
├── DEPLOYMENT.md              # Deployment guide
├── CONTRIBUTING.md            # Contribution guidelines
├── TESTING.md                 # Testing procedures
└── CHANGELOG.md               # Version history
```

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev              # Start dev server with HTTPS
npm run type-check       # Run TypeScript type checking
npm run build            # Production build
npm run build:prod       # Production build with env
npm run preview          # Preview production build
npm run preview:prod     # Build and preview

# Deployment
npm run deploy:vercel           # Deploy to Vercel
npm run deploy:vercel:preview   # Deploy preview to Vercel
npm run deploy:netlify          # Deploy to Netlify
npm run deploy:netlify:preview  # Deploy preview to Netlify

# Docker
npm run docker:build     # Build Docker image
npm run docker:run       # Run Docker container
npm run docker:compose   # Start with Docker Compose
npm run docker:compose:down  # Stop Docker Compose

# Utilities
npm run generate-qr      # Generate QR code for deployment
npm run analyze          # Analyze bundle size
```

### Environment Variables

Create a `.env.local` file for local development:

```env
# Feature Flags
VITE_ENABLE_DEBUG_MODE=false
VITE_MAX_POSTERS=10

# Analytics (Optional)
VITE_GA_TRACKING_ID=G-XXXXXXXXXX

# Error Tracking (Optional)
VITE_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
```

See `.env.production.example` for all available variables.

## 🚀 Deployment

### One-Click Deployment

#### Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/xr-poster)

#### Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/yourusername/xr-poster)

### Manual Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions for:
- Vercel
- Netlify
- Cloudflare Pages
- Docker
- Custom hosting

### QR Code Generation

Generate QR codes for easy mobile access:

```bash
# Basic usage
npm run generate-qr -- https://your-deployment-url.com

# Custom options
npm run generate-qr -- https://your-deployment-url.com --size 500 --format png
```

## 📱 Browser Support

### Fully Supported

| Browser | Version | Platform | WebXR Support |
|---------|---------|----------|---------------|
| Safari | 15.0+ | iOS | ✅ Full |
| Chrome | 79+ | Android | ✅ Full |

### Partially Supported

| Browser | Version | Platform | Notes |
|---------|---------|----------|-------|
| Safari | 17+ | macOS | Development only |
| Chrome | Latest | Desktop | Development only |
| Edge | Latest | Desktop | Development only |

### Requirements

- **HTTPS** - Required for WebXR API access
- **Camera Permission** - Required for AR functionality
- **Modern Browser** - ES2020+ support
- **WebGL 2.0** - For 3D rendering

## 🎨 Features in Detail

### WebXR Integration

The app uses the WebXR Device API for native AR experiences:

```typescript
// Request AR session
const session = await navigator.xr.requestSession('immersive-ar', {
  requiredFeatures: ['hit-test', 'dom-overlay'],
  optionalFeatures: ['light-estimation', 'anchors']
});
```

### Hit Testing

Real-time surface detection for accurate poster placement:

```typescript
// Perform hit test
const hitTestResults = frame.getHitTestResults(hitTestSource);
if (hitTestResults.length > 0) {
  const hit = hitTestResults[0];
  const pose = hit.getPose(referenceSpace);
  // Place poster at hit location
}
```

### Gesture System

Multi-touch gesture recognition for intuitive controls:

```typescript
// Drag gesture
const bind = useGesture({
  onDrag: ({ offset: [x, y] }) => {
    updatePosterPosition(posterId, x, y);
  },
  onPinch: ({ offset: [scale] }) => {
    updatePosterScale(posterId, scale);
  },
  onRotate: ({ offset: [angle] }) => {
    updatePosterRotation(posterId, angle);
  }
});
```

## 🧪 Testing

### Running Tests

```bash
# Type checking
npm run type-check

# Build verification
npm run build

# Preview build
npm run preview
```

### Testing Checklist

See [TESTING.md](TESTING.md) for comprehensive testing procedures including:
- Device testing matrix
- Feature testing steps
- Performance benchmarks
- Browser compatibility
- Accessibility testing

## 📊 Performance

### Target Metrics

- **First Contentful Paint:** < 1.5s
- **Largest Contentful Paint:** < 2.5s
- **Time to Interactive:** < 3.5s
- **Frame Rate:** 60 FPS (30 FPS minimum)
- **Bundle Size:** < 200KB gzipped
- **Memory Usage:** < 150MB

### Optimization Techniques

- Code splitting by route and vendor
- Lazy loading of components
- Image optimization and compression
- Aggressive tree-shaking
- Efficient memory management
- GPU-accelerated rendering

## 🔒 Security

### Security Features

- **HTTPS Enforced** - All traffic encrypted
- **Content Security Policy** - XSS protection
- **Input Validation** - File upload restrictions
- **No Server Storage** - Client-side only processing
- **Camera Privacy** - Permission-based access

### Security Headers

```
Content-Security-Policy: default-src 'self'; ...
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=63072000
Permissions-Policy: camera=*
```

## ♿ Accessibility

- **Keyboard Navigation** - Full keyboard support
- **Screen Reader** - ARIA labels and announcements
- **Color Contrast** - WCAG 2.1 AA compliant
- **Motion Sensitivity** - Respects prefers-reduced-motion
- **Focus Indicators** - Clear focus states

## 🐛 Troubleshooting

### Common Issues

**WebXR not supported:**
- Ensure you're using a supported browser (iOS Safari 15+ or Android Chrome 79+)
- Check that you're accessing via HTTPS
- Verify device has ARCore/ARKit support

**Camera permission denied:**
- Check browser settings
- Grant camera access for the site
- Reload the page after granting permission

**Poor performance:**
- Reduce number of placed posters
- Close other apps to free memory
- Ensure good lighting conditions
- Try on a more powerful device

**Posters not placing correctly:**
- Ensure good lighting
- Point at flat, textured surfaces
- Move device slowly to improve tracking
- Avoid reflective or transparent surfaces

See [TESTING.md](TESTING.md) for more troubleshooting tips.

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Code of conduct
- Development workflow
- Coding standards
- Commit guidelines
- Pull request process

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Three.js](https://threejs.org/) - 3D graphics library
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) - React renderer for Three.js
- [Poimandres](https://github.com/pmndrs) - Amazing React Three ecosystem
- [WebXR Community](https://www.w3.org/community/webxr/) - WebXR standards

## 📚 Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical architecture and design decisions
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Comprehensive deployment guide
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contribution guidelines
- **[TESTING.md](TESTING.md)** - Testing procedures and checklist
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and release notes

## 🔗 Links

- **Repository:** https://github.com/yourusername/xr-poster
- **Issues:** https://github.com/yourusername/xr-poster/issues
- **Discussions:** https://github.com/yourusername/xr-poster/discussions
- **Live Demo:** https://xr-poster.vercel.app

## 📞 Support

- 📧 Email: support@xr-poster.com
- 💬 Discord: [Join our community](https://discord.gg/xrposter)
- 🐦 Twitter: [@xrposter](https://twitter.com/xrposter)

---

**Made with ❤️ by the XR Poster Team**

**Version:** 1.0.0  
**Status:** Production Ready ✅  
**Last Updated:** 2026-05-21
