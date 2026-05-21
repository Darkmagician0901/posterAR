: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Build
        run: npm run build
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

### QR Code Generation

For easy mobile access, generate QR codes pointing to your deployment:

```typescript
// utils/qrCode.ts
import QRCode from 'qrcode';

export async function generateQRCode(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });
}
```

### Monitoring & Analytics

**Recommended Tools:**
- **Sentry:** Error tracking and performance monitoring
- **Google Analytics 4:** User behavior analytics
- **Vercel Analytics:** Core Web Vitals tracking

```typescript
// utils/analytics.ts
export function trackARSession(sessionType: ARMode) {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'ar_session_start', {
      session_type: sessionType,
      device: navigator.userAgent
    });
  }
}

export function trackPosterPlacement(posterId: string) {
  if (typeof gtag !== 'undefined') {
    gtag('event', 'poster_placed', {
      poster_id: posterId
    });
  }
}
```

---

## Risk Mitigation

### Technical Risks

#### Risk 1: WebXR Browser Support
**Impact:** High  
**Probability:** Medium  
**Mitigation:**
- Implement robust fallback to WebAR libraries
- Provide 2D preview mode for unsupported devices
- Clear messaging about device requirements
- Test on wide range of devices early

#### Risk 2: Performance on Low-End Devices
**Impact:** High  
**Probability:** High  
**Mitigation:**
- Implement aggressive optimization from start
- Use performance budgets (< 150MB memory)
- Add quality settings (low/medium/high)
- Monitor FPS and adjust rendering quality dynamically
- Test on low-end devices (iPhone SE, budget Android)

#### Risk 3: Camera Permission Denial
**Impact:** Medium  
**Probability:** Medium  
**Mitigation:**
- Clear explanation before requesting permission
- Provide fallback to 2D preview mode
- Instructions for enabling camera in settings
- Graceful error messages

#### Risk 4: HTTPS Requirement
**Impact:** Low  
**Probability:** Low  
**Mitigation:**
- Use Vercel/Netlify for automatic HTTPS
- Document HTTPS requirement clearly
- Provide local HTTPS setup for development

#### Risk 5: Memory Leaks in Long Sessions
**Impact:** High  
**Probability:** Medium  
**Mitigation:**
- Implement proper cleanup in useEffect hooks
- Dispose Three.js resources explicitly
- Monitor memory usage in development
- Add session timeout/refresh mechanism
- Test long-running sessions

### User Experience Risks

#### Risk 6: Confusing AR Placement
**Impact:** Medium  
**Probability:** High  
**Mitigation:**
- Clear visual indicators for surface detection
- Step-by-step tutorial on first launch
- Gesture hints overlay
- Video tutorial accessible from menu

#### Risk 7: Poor Lighting Conditions
**Impact:** Medium  
**Probability:** Medium  
**Mitigation:**
- Detect low light and show warning
- Adjust poster brightness automatically
- Provide manual brightness control
- Tips for better AR experience

### Business Risks

#### Risk 8: High Bounce Rate
**Impact:** High  
**Probability:** Medium  
**Mitigation:**
- Optimize initial load time (< 3s)
- Show progress during loading
- Provide instant preview while AR initializes
- A/B test onboarding flow

#### Risk 9: Limited Device Compatibility
**Impact:** Medium  
**Probability:** Low  
**Mitigation:**
- Support iOS 15+ and Android 8+
- Provide device compatibility checker
- Clear messaging about requirements
- Collect device analytics to prioritize support

---

## Testing Strategy

### Unit Tests
```typescript
// __tests__/hooks/useGestures.test.ts
import { renderHook, act } from '@testing-library/react';
import { useGestures } from '@/hooks/useGestures';

describe('useGestures', () => {
  it('should handle drag gesture', () => {
    const { result } = renderHook(() => useGestures('poster-1'));
    
    act(() => {
      result.current.onDrag({ offset: [10, 20] });
    });
    
    // Assert poster position updated
  });
});
```

### Integration Tests
```typescript
// __tests__/integration/ARSession.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { ARExperience } from '@/components/ar/ARExperience';

describe('AR Session', () => {
  it('should initialize WebXR session', async () => {
    render(<ARExperience />);
    
    await waitFor(() => {
      expect(screen.getByText(/AR Mode Active/i)).toBeInTheDocument();
    });
  });
});
```

### E2E Tests (Playwright)
```typescript
// e2e/ar-placement.spec.ts
import { test, expect } from '@playwright/test';

test('should place poster in AR', async ({ page }) => {
  await page.goto('https://xrposter.com');
  
  // Grant camera permission
  await page.context().grantPermissions(['camera']);
  
  // Wait for AR session
  await page.waitForSelector('[data-testid="ar-active"]');
  
  // Tap to place poster
  await page.tap('[data-testid="ar-canvas"]');
  
  // Verify poster placed
  await expect(page.locator('[data-testid="poster"]')).toBeVisible();
});
```

### Device Testing Matrix

| Device | OS | Browser | Priority |
|--------|----|---------| ---------|
| iPhone 14 Pro | iOS 17 | Safari | High |
| iPhone 12 | iOS 16 | Safari | High |
| iPhone SE (2020) | iOS 15 | Safari | Medium |
| Samsung Galaxy S23 | Android 13 | Chrome | High |
| Google Pixel 7 | Android 13 | Chrome | High |
| OnePlus 9 | Android 12 | Chrome | Medium |
| iPad Pro | iOS 17 | Safari | Low |
| Desktop | Windows | Chrome | Low |

---

## Security Considerations

### Content Security Policy
```html
<!-- index.html -->
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline' 'unsafe-eval'; 
               style-src 'self' 'unsafe-inline'; 
               img-src 'self' data: blob:; 
               connect-src 'self' https://api.xrposter.com;">
```

### User-Generated Content
```typescript
// Validate uploaded images
export function validateImage(file: File): boolean {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (!validTypes.includes(file.type)) {
    throw new Error('Invalid file type');
  }
  
  if (file.size > maxSize) {
    throw new Error('File too large');
  }
  
  return true;
}
```

### Camera Privacy
- Request camera permission only when needed
- Show clear indicator when camera is active
- Provide easy way to revoke permission
- Don't store or transmit camera feed
- Clear privacy policy

---

## Accessibility

### WCAG 2.1 AA Compliance

**Keyboard Navigation:**
```typescript
// Add keyboard controls for desktop
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    switch(e.key) {
      case 'Escape':
        deselectPoster();
        break;
      case 'Delete':
        removeSelectedPoster();
        break;
      case 'ArrowUp':
        movePoster('up');
        break;
      // ... more controls
    }
  };
  
  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, []);
```

**Screen Reader Support:**
```tsx
<button 
  aria-label="Place poster on surface"
  aria-pressed={isPlacing}
  onClick={handlePlace}
>
  <PlaceIcon aria-hidden="true" />
</button>
```

**Color Contrast:**
- Ensure 4.5:1 contrast ratio for text
- Use patterns in addition to color
- Provide high contrast mode

**Motion Sensitivity:**
```typescript
// Respect prefers-reduced-motion
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

// Disable animations if user prefers
const animationDuration = prefersReducedMotion ? 0 : 300;
```

---

## Future Enhancements

### Phase 8: Advanced Features (Post-Launch)

1. **Multi-User Collaboration**
   - Share AR sessions via URL
   - Real-time poster synchronization
   - Collaborative poster placement

2. **Poster Templates**
   - Pre-designed poster templates
   - Text overlay editor
   - Filter and effects

3. **Spatial Audio**
   - Add audio to posters
   - 3D spatial audio positioning
   - Background music

4. **Persistence**
   - Save AR scenes to cloud
   - Load previous sessions
   - Share scenes with others

5. **Advanced Tracking**
   - Image target tracking
   - Object recognition
   - Persistent anchors

6. **Social Features**
   - Share screenshots to social media
   - Poster marketplace
   - User galleries

7. **Analytics Dashboard**
   - Usage statistics
   - Popular posters
   - Session duration metrics

8. **Gamification**
   - Achievement system
   - Poster collections
   - Challenges and rewards

---

## Appendix

### A. Glossary

- **WebXR:** Web standard for AR/VR experiences in browsers
- **Hit Testing:** Ray casting to detect surfaces in AR
- **Plane Detection:** Identifying flat surfaces in the real world
- **Reference Space:** Coordinate system for AR tracking
- **Immersive Session:** Full AR/VR mode taking over the display
- **DOM Overlay:** UI elements shown over AR content

### B. Useful Resources

**Documentation:**
- [WebXR Device API](https://www.w3.org/TR/webxr/)
- [Three.js Documentation](https://threejs.org/docs/)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [MDN WebXR Guide](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)

**Tools:**
- [WebXR Emulator Extension](https://github.com/MozillaReality/WebXR-emulator-extension)
- [Three.js Editor](https://threejs.org/editor/)
- [Spector.js](https://spector.babylonjs.com/) - WebGL debugging

**Communities:**
- [Three.js Discourse](https://discourse.threejs.org/)
- [WebXR Community Group](https://www.w3.org/community/webxr/)
- [Poimandres Discord](https://discord.gg/poimandres) - R3F community

### C. Browser Compatibility Matrix

| Feature | iOS Safari 17+ | Android Chrome 79+ | Desktop Chrome | Desktop Safari |
|---------|----------------|-------------------|----------------|----------------|
| WebXR AR | ✅ | ✅ | ❌ | ❌ |
| getUserMedia | ✅ | ✅ | ✅ | ✅ |
| WebGL 2.0 | ✅ | ✅ | ✅ | ✅ |
| Touch Events | ✅ | ✅ | ❌ | ❌ |
| Device Orientation | ✅ | ✅ | ❌ | ❌ |
| Service Workers | ✅ | ✅ | ✅ | ✅ |

### D. Performance Benchmarks

**Target Metrics:**
- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Time to Interactive: < 3.5s
- Cumulative Layout Shift: < 0.1
- First Input Delay: < 100ms
- Frame Rate: 60 FPS (30 FPS minimum)

**Bundle Size Targets:**
- Initial JS: < 200KB gzipped
- Initial CSS: < 20KB gzipped
- Total Assets: < 500KB
- Runtime Memory: < 150MB

## Deployment Architecture

### Infrastructure Overview

The XR Poster application is designed for serverless deployment with global CDN distribution, ensuring low latency and high availability for users worldwide.

```
┌─────────────────────────────────────────────────────────────┐
│                     User's Mobile Device                     │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Safari   │  │    Chrome    │  │  Camera Access   │   │
│  │  (iOS 15+) │  │ (Android 79+)│  │   (WebXR API)    │   │
│  └────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Global CDN Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │   Vercel     │  │   Netlify    │  │ Cloudflare Pages │ │
│  │   Edge CDN   │  │   Edge CDN   │  │   Edge Network   │ │
│  └──────────────┘  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Automatic SSL/TLS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Static Asset Delivery                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  index.html  │  │  JS Bundles  │  │   CSS/Images     │ │
│  │   (< 5KB)    │  │  (< 200KB)   │  │   (< 300KB)      │ │
│  └──────────────┘  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Client-Side Only
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Browser Runtime (Client)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │   React 18   │  │   Three.js   │  │   WebXR API      │ │
│  │   Zustand    │  │   R3F/XR     │  │   Hit Testing    │ │
│  └──────────────┘  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Deployment Platforms

#### 1. Vercel (Recommended)

**Advantages:**
- Zero-configuration deployment
- Automatic HTTPS with custom domains
- Global edge network (70+ locations)
- Instant rollbacks
- Preview deployments for PRs
- Built-in analytics
- Excellent DX with CLI

**Configuration:**
- File: `vercel.json`
- Build: `npm run build`
- Output: `dist/`
- Auto-deploy: Push to `main` branch

**Performance:**
- Edge caching with stale-while-revalidate
- Brotli compression
- HTTP/2 and HTTP/3 support
- Smart CDN routing

#### 2. Netlify

**Advantages:**
- Similar to Vercel
- Excellent build optimization
- Form handling (if needed)
- Split testing capabilities
- Lighthouse CI integration
- Deploy previews

**Configuration:**
- File: `netlify.toml`
- Build: `npm run build`
- Output: `dist/`
- Plugins: Lighthouse, image optimization

#### 3. Cloudflare Pages

**Advantages:**
- Largest global network (275+ cities)
- DDoS protection included
- Unlimited bandwidth
- Workers integration (if needed)
- Best for high traffic

**Configuration:**
- Files: `wrangler.toml`, `_headers`, `_redirects`
- Build: `npm run build`
- Output: `dist/`

#### 4. Docker (Self-Hosted)

**Advantages:**
- Full control over infrastructure
- Can run anywhere (AWS, GCP, Azure, on-prem)
- Consistent environments
- Easy scaling with orchestration

**Configuration:**
- Files: `Dockerfile`, `docker-compose.yml`
- Base: `nginx:alpine`
- Multi-stage build for optimization

### CI/CD Pipeline

#### GitHub Actions Workflow

```yaml
Trigger: Push to main or PR
  ↓
Install Dependencies (npm ci)
  ↓
Type Check (tsc --noEmit)
  ↓
Build (npm run build)
  ↓
Upload Artifacts
  ↓
┌─────────────┬─────────────┬─────────────┐
│   Vercel    │   Netlify   │   Docker    │
│  Production │  Production │    Build    │
└─────────────┴─────────────┴─────────────┘
  ↓
Notify (Success/Failure)
```

**Automated Checks:**
- TypeScript type checking
- Build verification
- Bundle size analysis
- Deployment status

**Deployment Triggers:**
- `main` branch → Production
- Pull requests → Preview deployments
- Manual trigger → Any environment

### Security Headers

All deployment platforms configured with:

```
Content-Security-Policy: Strict policy for XSS prevention
X-Frame-Options: DENY (prevent clickjacking)
X-Content-Type-Options: nosniff
Strict-Transport-Security: Force HTTPS
Permissions-Policy: Camera access control
Access-Control-Allow-Origin: CORS for WebXR
```

### Caching Strategy

**Static Assets (JS/CSS/Images):**
```
Cache-Control: public, max-age=31536000, immutable
```
- Versioned filenames (content hash)
- Cached for 1 year
- Immutable (never changes)

**HTML:**
```
Cache-Control: public, max-age=0, must-revalidate
```
- Always fresh
- Revalidate on every request

**Posters:**
```
Cache-Control: public, max-age=604800
```
- Cached for 1 week
- Balance between freshness and performance

### Scaling Considerations

#### Horizontal Scaling

**CDN Edge Locations:**
- Vercel: 70+ locations
- Netlify: 100+ locations
- Cloudflare: 275+ locations

**Auto-scaling:**
- Serverless architecture scales automatically
- No server management required
- Pay only for actual usage

#### Performance Optimization

**Code Splitting:**
```javascript
// Automatic code splitting by route
const ARExperience = lazy(() => import('./components/ar/ARExperience'));
const PosterGallery = lazy(() => import('./components/ui/PosterGallery'));
```

**Bundle Optimization:**
- React vendor chunk: ~45KB gzipped
- Three.js vendor chunk: ~120KB gzipped
- App code: ~35KB gzipped
- Total initial load: ~200KB gzipped

**Asset Optimization:**
- Images: WebP format with fallbacks
- Fonts: Subset and preload
- Icons: Inline SVG for critical icons

#### Load Balancing

**CDN-Level:**
- Automatic geographic routing
- Anycast DNS
- Edge caching reduces origin load

**Client-Side:**
- Service Worker for offline support (future)
- IndexedDB for poster caching (future)
- Progressive loading

### Monitoring & Observability

#### Built-in Analytics

**Vercel Analytics:**
- Core Web Vitals tracking
- Real User Monitoring (RUM)
- Geographic distribution
- Device/browser breakdown

**Netlify Analytics:**
- Page views and unique visitors
- Top pages and referrers
- Bandwidth usage

#### Custom Monitoring

**Performance Monitoring:**
```typescript
// Track AR session performance
performance.mark('ar-session-start');
// ... AR session code
performance.mark('ar-session-ready');
performance.measure('ar-init', 'ar-session-start', 'ar-session-ready');
```

**Error Tracking (Optional):**
```typescript
// Sentry integration
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}
```

**Custom Events (Optional):**
```typescript
// Google Analytics 4
gtag('event', 'ar_session_start', {
  session_type: 'immersive-ar',
  device: navigator.userAgent,
});
```

### Disaster Recovery

#### Rollback Procedures

**Vercel:**
```bash
vercel rollback <deployment-url>
```

**Netlify:**
```bash
netlify deploy:restore <deploy-id>
```

**Cloudflare:**
- Dashboard → Rollback to previous deployment

**Docker:**
```bash
docker pull <registry>/xr-poster:<previous-tag>
docker-compose up -d
```

#### Backup Strategy

**Code:**
- Git repository (primary backup)
- GitHub (remote backup)
- Local clones (developer machines)

**Deployments:**
- Platform keeps deployment history
- Vercel: Unlimited deployments
- Netlify: 1 month history (free tier)
- Cloudflare: 30 days history

**User Data:**
- No server-side storage
- All data client-side only
- No backup needed

### Cost Optimization

#### Free Tier Limits

**Vercel (Hobby):**
- 100GB bandwidth/month
- Unlimited deployments
- Automatic SSL
- **Cost:** $0/month

**Netlify (Free):**
- 100GB bandwidth/month
- 300 build minutes/month
- Automatic SSL
- **Cost:** $0/month

**Cloudflare Pages (Free):**
- Unlimited bandwidth
- 500 builds/month
- Automatic SSL
- **Cost:** $0/month

#### Estimated Costs (Production)

**Assumptions:**
- 10,000 users/month
- 5 page views per user
- 200KB average page size

**Bandwidth:**
- 10,000 × 5 × 200KB = 10GB/month
- Well within free tier limits

**Build Minutes:**
- ~2 minutes per build
- ~30 builds/month (daily updates)
- ~60 minutes/month
- Well within free tier limits

**Estimated Monthly Cost:** $0 (free tier sufficient)

### Environment Variables

#### Production Variables

```bash
# Analytics (Optional)
VITE_GA_TRACKING_ID=G-XXXXXXXXXX

# Error Tracking (Optional)
VITE_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx

# Feature Flags
VITE_ENABLE_DEBUG_MODE=false
VITE_MAX_POSTERS=10
```

#### Setting Variables

**Vercel:**
```bash
vercel env add VITE_GA_TRACKING_ID production
```

**Netlify:**
```bash
netlify env:set VITE_GA_TRACKING_ID "G-XXXXXXXXXX"
```

**Cloudflare:**
- Dashboard → Environment Variables

### QR Code Generation

**Purpose:**
- Easy mobile access to deployed app
- Share with testers
- Include in documentation

**Usage:**
```bash
npm run generate-qr -- https://xr-poster.vercel.app
```

**Output:**
- PNG image (300x300px)
- SVG image (scalable)
- HTML preview page
- Terminal output

**Integration:**
```json
{
  "scripts": {
    "postdeploy": "npm run generate-qr -- $DEPLOYMENT_URL"
  }
}
```

### Best Practices

#### Deployment Checklist

- [ ] Type checking passes
- [ ] Production build succeeds
- [ ] No console errors
- [ ] Tested on mobile devices
- [ ] Environment variables set
- [ ] Security headers configured
- [ ] HTTPS enforced
- [ ] QR code generated
- [ ] Documentation updated
- [ ] Monitoring enabled

#### Performance Checklist

- [ ] Bundle size < 200KB gzipped
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3.5s
- [ ] 60 FPS on high-end devices
- [ ] 30+ FPS on mid-range devices
- [ ] Memory usage < 150MB

#### Security Checklist

- [ ] HTTPS enforced
- [ ] Security headers configured
- [ ] CSP policy strict
- [ ] No sensitive data in client
- [ ] Input validation implemented
- [ ] File upload restrictions

---

---

## Conclusion

This architecture provides a solid foundation for building a production-ready mobile-first AR web application. The design prioritizes:

1. **Progressive Enhancement:** WebXR → WebAR → 2D Preview
2. **Performance:** Mobile-optimized with aggressive optimization
3. **User Experience:** Intuitive gestures and clear feedback
4. **Maintainability:** Clean architecture with separation of concerns
5. **Scalability:** Modular design for easy feature additions

The implementation roadmap breaks the project into manageable phases, with MVP achievable in 4-5 weeks and full feature set in 10-11 weeks.

**Next Steps:**
1. Review and approve this architecture
2. Set up development environment
3. Begin Phase 1: Foundation
4. Iterate based on testing and feedback

**Success Criteria:**
- ✅ Works on iOS Safari 15+ and Android Chrome 79+
- ✅ Loads in < 3 seconds on 4G
- ✅ Runs at 30+ FPS on mid-range devices
- ✅ Intuitive poster placement and manipulation
- ✅ Graceful fallback for unsupported devices
- ✅ Production deployment with HTTPS

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-21  
**Author:** Senior Full-Stack + XR Engineer  
**Status:** Ready for Implementation