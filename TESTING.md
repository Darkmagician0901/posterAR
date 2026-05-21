# Testing Guide - XR Poster

Comprehensive testing procedures and checklist for the XR Poster AR web application.

## Table of Contents

- [Testing Overview](#testing-overview)
- [Device Testing Matrix](#device-testing-matrix)
- [Pre-Deployment Testing](#pre-deployment-testing)
- [Feature Testing](#feature-testing)
- [Performance Testing](#performance-testing)
- [Browser Compatibility](#browser-compatibility)
- [Accessibility Testing](#accessibility-testing)
- [Security Testing](#security-testing)
- [Regression Testing](#regression-testing)
- [Bug Reporting](#bug-reporting)

---

## Testing Overview

### Testing Levels

1. **Unit Testing** - Individual functions and components
2. **Integration Testing** - Component interactions
3. **System Testing** - End-to-end functionality
4. **Acceptance Testing** - User experience validation

### Testing Environments

- **Local Development** - `https://localhost:5173`
- **Preview Deployment** - Vercel/Netlify preview URLs
- **Staging** - Pre-production environment
- **Production** - Live deployment

---

## Device Testing Matrix

### Priority Devices (Must Test)

| Device | OS | Browser | Priority | Notes |
|--------|----|---------| ---------|-------|
| iPhone 14 Pro | iOS 17 | Safari | High | Latest flagship |
| iPhone 12 | iOS 16 | Safari | High | Common device |
| iPhone SE (2020) | iOS 15 | Safari | Medium | Low-end iOS |
| Samsung Galaxy S23 | Android 13 | Chrome | High | Latest flagship |
| Google Pixel 7 | Android 13 | Chrome | High | Reference device |
| OnePlus 9 | Android 12 | Chrome | Medium | Mid-range |
| Samsung Galaxy A52 | Android 11 | Chrome | Medium | Budget device |

### Secondary Devices (Nice to Test)

| Device | OS | Browser | Priority | Notes |
|--------|----|---------| ---------|-------|
| iPad Pro | iOS 17 | Safari | Low | Tablet support |
| iPad Air | iOS 16 | Safari | Low | Tablet support |
| Desktop | Windows | Chrome | Low | Development only |
| Desktop | macOS | Safari | Low | Development only |

### Minimum Requirements

- **iOS:** Safari 15.0+
- **Android:** Chrome 79+
- **Screen Size:** 4.7" minimum (iPhone SE)
- **RAM:** 2GB minimum
- **Camera:** Required for AR

---

## Pre-Deployment Testing

### Build Verification

```bash
# 1. Clean install
rm -rf node_modules package-lock.json
npm install

# 2. Type checking
npm run type-check
# Expected: No errors

# 3. Production build
npm run build
# Expected: Build succeeds, no errors

# 4. Preview build
npm run preview
# Expected: Server starts, app loads
```

### Checklist

- [ ] Clean install succeeds
- [ ] No TypeScript errors
- [ ] Production build succeeds
- [ ] No build warnings
- [ ] Bundle size < 200KB gzipped
- [ ] Preview build works locally
- [ ] HTTPS enabled in preview

---

## Feature Testing

### 1. WebXR Session Initialization

**Test Steps:**
1. Open app on mobile device
2. Tap "Enter AR" button
3. Grant camera permission when prompted

**Expected Results:**
- [ ] Camera permission prompt appears
- [ ] AR session starts successfully
- [ ] Camera feed visible
- [ ] Instructions overlay appears
- [ ] No console errors

**Common Issues:**
- Permission denied → Check browser settings
- Session fails → Ensure HTTPS enabled
- Black screen → Check camera access

---

### 2. Surface Detection (Hit Testing)

**Test Steps:**
1. Start AR session
2. Move device to scan environment
3. Point at flat surfaces (floor, table, wall)

**Expected Results:**
- [ ] Reticle appears on detected surfaces
- [ ] Reticle follows surface as device moves
- [ ] Reticle disappears when no surface detected
- [ ] Smooth reticle movement
- [ ] No lag or stuttering

**Common Issues:**
- No reticle → Poor lighting or no flat surfaces
- Jittery reticle → Device tracking issues
- Reticle stuck → Hit test not updating

---

### 3. Poster Placement

**Test Steps:**
1. Detect a surface
2. Tap screen to place poster
3. Verify poster appears at tap location

**Expected Results:**
- [ ] Poster appears instantly
- [ ] Poster positioned correctly on surface
- [ ] Poster faces camera
- [ ] Poster has correct default size
- [ ] Toast notification shows success
- [ ] Can place multiple posters (up to 10)

**Common Issues:**
- Poster doesn't appear → Check console for errors
- Wrong position → Hit test accuracy issue
- Poster floating → Surface detection inaccurate

---

### 4. Gesture Controls

#### Drag Gesture

**Test Steps:**
1. Place a poster
2. Tap and hold poster
3. Drag finger across screen

**Expected Results:**
- [ ] Poster follows finger movement
- [ ] Smooth dragging motion
- [ ] Poster stays on surface plane
- [ ] No lag during drag
- [ ] Poster deselects on release

#### Pinch Gesture

**Test Steps:**
1. Select a poster
2. Pinch with two fingers (zoom in/out)

**Expected Results:**
- [ ] Poster scales up/down
- [ ] Smooth scaling animation
- [ ] Maintains aspect ratio
- [ ] Min/max scale limits enforced
- [ ] No distortion

#### Rotate Gesture

**Test Steps:**
1. Select a poster
2. Rotate with two fingers

**Expected Results:**
- [ ] Poster rotates around Y-axis
- [ ] Smooth rotation
- [ ] 360° rotation possible
- [ ] No snapping or jumping
- [ ] Rotation persists after release

**Common Issues:**
- Gestures conflict → Check gesture priority
- Laggy gestures → Performance issue
- Gestures don't work → Touch event handling

---

### 5. Poster Selection

**Test Steps:**
1. Place multiple posters
2. Tap different posters to select

**Expected Results:**
- [ ] Selected poster highlighted
- [ ] Only one poster selected at a time
- [ ] Selection indicator visible
- [ ] Control panel shows for selected poster
- [ ] Tap empty space to deselect

---

### 6. Poster Deletion

**Test Steps:**
1. Select a poster
2. Tap delete button in control panel

**Expected Results:**
- [ ] Confirmation prompt appears (optional)
- [ ] Poster removed from scene
- [ ] Toast notification shows success
- [ ] Memory cleaned up properly
- [ ] Can delete all posters

---

### 7. Poster Gallery

**Test Steps:**
1. Open poster gallery
2. Browse available posters
3. Select a poster
4. Place selected poster

**Expected Results:**
- [ ] Gallery opens smoothly
- [ ] All default posters visible
- [ ] Poster thumbnails load
- [ ] Selection highlights poster
- [ ] Gallery closes after selection
- [ ] Selected poster ready to place

---

### 8. Custom Poster Upload

**Test Steps:**
1. Tap upload button
2. Select image from device
3. Wait for upload processing
4. Place uploaded poster

**Expected Results:**
- [ ] File picker opens
- [ ] Can select JPEG/PNG/WebP
- [ ] File size validation (max 10MB)
- [ ] Image loads and displays
- [ ] Image optimized for performance
- [ ] Uploaded poster appears in gallery
- [ ] Can place uploaded poster

**Test Cases:**
- [ ] Valid JPEG image
- [ ] Valid PNG image
- [ ] Valid WebP image
- [ ] Image > 10MB (should reject)
- [ ] Invalid file type (should reject)
- [ ] Very large resolution (should compress)

**Common Issues:**
- Upload fails → Check file size/type
- Image quality poor → Compression too aggressive
- Memory issues → Image too large

---

### 9. Screenshot Feature

**Test Steps:**
1. Place posters in AR
2. Tap screenshot button
3. Wait for capture
4. Check downloaded file

**Expected Results:**
- [ ] Screenshot captures full scene
- [ ] High quality image
- [ ] File downloads automatically
- [ ] Filename includes timestamp
- [ ] Toast notification shows success
- [ ] No UI elements in screenshot

**Common Issues:**
- Black screenshot → Canvas access issue
- Low quality → Resolution settings
- Download fails → Browser permissions

---

### 10. UI Components

#### Instructions Overlay

**Test Steps:**
1. First time user opens app
2. Read instructions
3. Dismiss overlay

**Expected Results:**
- [ ] Overlay appears on first launch
- [ ] Instructions clear and helpful
- [ ] Can dismiss overlay
- [ ] Doesn't appear again (localStorage)
- [ ] Can manually show again

#### Control Panel

**Test Steps:**
1. Select a poster
2. Use control panel buttons

**Expected Results:**
- [ ] Panel appears when poster selected
- [ ] All buttons functional
- [ ] Icons clear and intuitive
- [ ] Panel dismisses when deselected
- [ ] Responsive to screen size

#### Toast Notifications

**Test Steps:**
1. Perform various actions
2. Observe toast messages

**Expected Results:**
- [ ] Toasts appear for actions
- [ ] Messages clear and helpful
- [ ] Auto-dismiss after 3 seconds
- [ ] Multiple toasts stack properly
- [ ] Can manually dismiss

#### Loading Screen

**Test Steps:**
1. Load app
2. Observe loading screen

**Expected Results:**
- [ ] Loading screen appears immediately
- [ ] Progress indicator visible
- [ ] Smooth transition to app
- [ ] No flash of unstyled content

---

## Performance Testing

### Frame Rate Testing

**Test Steps:**
1. Start AR session
2. Place 10 posters
3. Perform gestures
4. Monitor FPS

**Expected Results:**
- [ ] 60 FPS on high-end devices
- [ ] 30+ FPS on mid-range devices
- [ ] No dropped frames during gestures
- [ ] Smooth animations
- [ ] No stuttering

**Tools:**
- Chrome DevTools Performance tab
- Safari Web Inspector
- FPS counter overlay

### Memory Testing

**Test Steps:**
1. Start AR session
2. Place and delete posters repeatedly
3. Upload multiple images
4. Monitor memory usage

**Expected Results:**
- [ ] Memory usage < 150MB
- [ ] No memory leaks
- [ ] Proper cleanup on poster deletion
- [ ] Stable memory over time

**Tools:**
- Chrome DevTools Memory profiler
- Safari Web Inspector Memory

### Load Time Testing

**Test Steps:**
1. Clear browser cache
2. Load app
3. Measure load times

**Expected Results:**
- [ ] First Contentful Paint < 1.5s
- [ ] Largest Contentful Paint < 2.5s
- [ ] Time to Interactive < 3.5s
- [ ] Total load time < 5s on 4G

**Tools:**
- Chrome DevTools Lighthouse
- WebPageTest.org
- Vercel Analytics

### Bundle Size Testing

**Test Steps:**
```bash
npm run build
# Check dist/ folder size
```

**Expected Results:**
- [ ] Total bundle < 500KB
- [ ] Initial JS < 200KB gzipped
- [ ] CSS < 20KB gzipped
- [ ] Code splitting working
- [ ] Lazy loading implemented

---

## Browser Compatibility

### iOS Safari

**Versions to Test:**
- [ ] iOS 17 (latest)
- [ ] iOS 16
- [ ] iOS 15 (minimum)

**Features to Verify:**
- [ ] WebXR session starts
- [ ] Camera access works
- [ ] Touch gestures work
- [ ] File upload works
- [ ] Screenshot works
- [ ] No console errors

### Android Chrome

**Versions to Test:**
- [ ] Chrome 120+ (latest)
- [ ] Chrome 100
- [ ] Chrome 79 (minimum)

**Features to Verify:**
- [ ] WebXR session starts
- [ ] Camera access works
- [ ] Touch gestures work
- [ ] File upload works
- [ ] Screenshot works
- [ ] No console errors

### Desktop Browsers (Development Only)

**Browsers:**
- [ ] Chrome (latest)
- [ ] Edge (latest)
- [ ] Safari (latest)

**Expected:**
- [ ] App loads
- [ ] Shows "WebXR not supported" message
- [ ] UI functional
- [ ] No errors

---

## Accessibility Testing

### Keyboard Navigation

**Test Steps:**
1. Navigate app using keyboard only
2. Tab through interactive elements

**Expected Results:**
- [ ] All buttons accessible via Tab
- [ ] Focus indicators visible
- [ ] Enter/Space activates buttons
- [ ] Escape closes modals
- [ ] Logical tab order

### Screen Reader

**Test Steps:**
1. Enable screen reader (VoiceOver/TalkBack)
2. Navigate app

**Expected Results:**
- [ ] All buttons have labels
- [ ] Images have alt text
- [ ] ARIA labels present
- [ ] Meaningful announcements
- [ ] No unlabeled elements

### Color Contrast

**Test Steps:**
1. Check color contrast ratios
2. Test with color blindness simulators

**Expected Results:**
- [ ] Text contrast ≥ 4.5:1
- [ ] UI elements contrast ≥ 3:1
- [ ] Readable in bright sunlight
- [ ] Colorblind-friendly

### Motion Sensitivity

**Test Steps:**
1. Enable "Reduce Motion" in OS settings
2. Use app

**Expected Results:**
- [ ] Animations reduced/disabled
- [ ] No motion sickness triggers
- [ ] Still functional

---

## Security Testing

### HTTPS Enforcement

**Test Steps:**
1. Try accessing via HTTP
2. Check redirect

**Expected Results:**
- [ ] HTTP redirects to HTTPS
- [ ] SSL certificate valid
- [ ] No mixed content warnings
- [ ] Secure connection indicator

### Headers Testing

**Test Steps:**
```bash
curl -I https://your-app.vercel.app
```

**Expected Headers:**
- [ ] Content-Security-Policy present
- [ ] X-Frame-Options: DENY
- [ ] X-Content-Type-Options: nosniff
- [ ] Strict-Transport-Security present
- [ ] Permissions-Policy present

### Input Validation

**Test Steps:**
1. Upload invalid files
2. Try XSS attacks
3. Test file size limits

**Expected Results:**
- [ ] Invalid files rejected
- [ ] XSS attempts sanitized
- [ ] File size limits enforced
- [ ] No code injection possible

---

## Regression Testing

### After Each Update

- [ ] All feature tests pass
- [ ] No new console errors
- [ ] Performance unchanged or improved
- [ ] No visual regressions
- [ ] Existing functionality works

### Visual Regression

**Tools:**
- Percy.io
- Chromatic
- Manual screenshots

**Test:**
- [ ] UI components unchanged
- [ ] Layout correct on all screens
- [ ] Colors and fonts correct
- [ ] Animations smooth

---

## Bug Reporting

### Bug Report Template

```markdown
**Bug Description:**
Clear description of the issue

**Steps to Reproduce:**
1. Step one
2. Step two
3. Step three

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happens

**Environment:**
- Device: iPhone 14 Pro
- OS: iOS 17.0
- Browser: Safari 17.0
- App Version: 1.0.0
- Network: WiFi / 4G / 5G

**Screenshots/Video:**
[Attach media]

**Console Errors:**
```
[Paste console errors]
```

**Additional Context:**
Any other relevant information
```

### Severity Levels

- **Critical** - App unusable, data loss
- **High** - Major feature broken
- **Medium** - Feature partially broken
- **Low** - Minor issue, cosmetic

---

## Testing Checklist Summary

### Pre-Deployment ✅

- [ ] Clean install succeeds
- [ ] Type checking passes
- [ ] Production build succeeds
- [ ] No console errors
- [ ] Bundle size acceptable

### Core Features ✅

- [ ] WebXR session starts
- [ ] Surface detection works
- [ ] Poster placement works
- [ ] All gestures work
- [ ] Poster deletion works
- [ ] Gallery works
- [ ] Upload works
- [ ] Screenshot works

### Performance ✅

- [ ] 30+ FPS maintained
- [ ] Memory usage < 150MB
- [ ] Load time < 5s
- [ ] No memory leaks

### Compatibility ✅

- [ ] iOS Safari 15+ works
- [ ] Android Chrome 79+ works
- [ ] All target devices tested

### Quality ✅

- [ ] No console errors
- [ ] No visual bugs
- [ ] Smooth animations
- [ ] Responsive design
- [ ] Accessibility features

---

**Last Updated:** 2026-05-21  
**Version:** 1.0.0