/**
 * Device detection and WebXR capability checking utilities
 */

import { XRSupport, DeviceCapability } from '@/types';

/**
 * Detect if immersive-ar is supported. iOS Safari returns false here even
 * with the polyfill installed — the polyfill cannot synthesize immersive-ar
 * on platforms that don't expose the underlying APIs.
 */
export async function checkWebXRSupport(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.xr) {
    return false;
  }

  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch (error) {
    console.error('Error checking immersive-ar support:', error);
    return false;
  }
}

/**
 * Check if camera access is available
 */
export async function checkCameraAccess(): Promise<boolean> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    // Stop the stream immediately after checking
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (error) {
    console.warn('Camera access denied or unavailable:', error);
    return false;
  }
}

/**
 * Check if device has gyroscope
 */
export function checkGyroscope(): boolean {
  return 'DeviceOrientationEvent' in window;
}

/**
 * Detect if device is iOS
 */
export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

/**
 * Detect if device is Android
 */
export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

/**
 * Detect if device is mobile
 */
export function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Desktop = not a mobile UA. Used to decide whether to drop the
 * "AR Not Supported" wall in favor of dev mode.
 */
export function isDesktop(): boolean {
  return !isMobile() && !isIOS() && !isAndroid();
}

/**
 * True when navigator.xr advertises immersive-ar support on a desktop UA.
 * The only realistic way for that to happen is the WebXR API Emulator
 * extension being installed and enabled.
 */
export async function detectWebXREmulator(): Promise<boolean> {
  if (!isDesktop()) return false;
  return await checkWebXRSupport();
}

/**
 * Get browser name and version
 */
export function getBrowserInfo(): { name: string; version: string } {
  const ua = navigator.userAgent;
  let browserName = 'Unknown';
  let browserVersion = 'Unknown';

  // Chrome
  if (ua.indexOf('Chrome') > -1 && ua.indexOf('Edg') === -1) {
    browserName = 'Chrome';
    const match = ua.match(/Chrome\/(\d+)/);
    browserVersion = match ? match[1] : 'Unknown';
  }
  // Safari
  else if (ua.indexOf('Safari') > -1 && ua.indexOf('Chrome') === -1) {
    browserName = 'Safari';
    const match = ua.match(/Version\/(\d+)/);
    browserVersion = match ? match[1] : 'Unknown';
  }
  // Firefox
  else if (ua.indexOf('Firefox') > -1) {
    browserName = 'Firefox';
    const match = ua.match(/Firefox\/(\d+)/);
    browserVersion = match ? match[1] : 'Unknown';
  }
  // Edge
  else if (ua.indexOf('Edg') > -1) {
    browserName = 'Edge';
    const match = ua.match(/Edg\/(\d+)/);
    browserVersion = match ? match[1] : 'Unknown';
  }

  return { name: browserName, version: browserVersion };
}

/**
 * Comprehensive XR support detection
 */
export async function detectXRSupport(): Promise<XRSupport> {
  const hasWebXR = await checkWebXRSupport();
  const hasCamera = await checkCameraAccess();
  const hasGyroscope = checkGyroscope();
  const deviceIsIOS = isIOS();
  const deviceIsAndroid = isAndroid();
  const deviceIsMobile = isMobile();
  const deviceIsDesktop = isDesktop();
  const browser = getBrowserInfo();

  // WebAR fallback support (for devices without WebXR)
  const hasWebAR = !hasWebXR && hasCamera && deviceIsMobile;

  // iOS Safari cannot run immersive-ar (Apple doesn't ship it), but we can
  // render an AR-lite experience with getUserMedia + DeviceOrientation.
  const hasIOSFallback =
    !hasWebXR && deviceIsIOS && hasCamera && hasGyroscope;

  // Desktop browser advertising immersive-ar = WebXR API Emulator extension.
  const hasWebXREmulator = deviceIsDesktop && hasWebXR;

  return {
    hasWebXR,
    hasIOSFallback,
    hasWebXREmulator,
    hasWebAR,
    hasCamera,
    hasGyroscope,
    isIOS: deviceIsIOS,
    isAndroid: deviceIsAndroid,
    isMobile: deviceIsMobile,
    isDesktop: deviceIsDesktop,
    browserName: browser.name,
    browserVersion: browser.version,
  };
}

/**
 * Get device capabilities as array
 */
export async function getDeviceCapabilities(): Promise<DeviceCapability[]> {
  const capabilities: DeviceCapability[] = [];

  if (await checkWebXRSupport()) {
    capabilities.push(DeviceCapability.WEBXR_SUPPORTED);
  }

  if (await checkCameraAccess()) {
    capabilities.push(DeviceCapability.CAMERA_AVAILABLE);
  }

  if (checkGyroscope()) {
    capabilities.push(DeviceCapability.GYROSCOPE_AVAILABLE);
  }

  if ('ontouchstart' in window) {
    capabilities.push(DeviceCapability.TOUCH_SUPPORTED);
  }

  // Check for WebAR support (fallback)
  const support = await detectXRSupport();
  if (support.hasWebAR) {
    capabilities.push(DeviceCapability.WEBAR_SUPPORTED);
  }

  return capabilities.length > 0 ? capabilities : [DeviceCapability.NONE];
}

/**
 * Check if device meets minimum requirements
 */
export async function meetsMinimumRequirements(): Promise<{
  meets: boolean;
  missing: string[];
}> {
  const missing: string[] = [];
  const support = await detectXRSupport();

  if (!support.hasWebXR && !support.hasWebAR) {
    missing.push('WebXR or WebAR support');
  }

  if (!support.hasCamera) {
    missing.push('Camera access');
  }

  if (!support.isMobile) {
    missing.push('Mobile device (recommended)');
  }

  return {
    meets: missing.length === 0,
    missing,
  };
}

// Made with Bob
