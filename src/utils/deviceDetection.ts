/**
 * Device detection and 8th Wall (XR8) capability checking utilities
 */

import { XRSupport, DeviceCapability } from '@/types';

/**
 * Camera *capability* check — does this browser expose the getUserMedia API?
 *
 * This is intentionally non-prompting: it does NOT open a camera stream, so
 * it never triggers the OS permission dialog. We use it at startup so the app
 * can decide its branch instantly and let 8th Wall own the actual camera
 * permission prompt at "Start AR". (Opening + closing a stream during
 * detection was the main cause of slow first paint on iOS — the app blocked
 * behind the permission dialog before anything rendered.)
 */
export function hasCameraApi(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

/**
 * Explicit camera *permission* check — actually opens (and immediately stops)
 * a stream, which prompts the user. NOT used during startup detection; kept
 * for flows that genuinely need to confirm a grant up front.
 */
export async function checkCameraAccess(): Promise<boolean> {
  if (!hasCameraApi()) {
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
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
 * Desktop = not a mobile UA.
 */
export function isDesktop(): boolean {
  return !isMobile() && !isIOS() && !isAndroid();
}

/**
 * Returns true when the page is served in a secure context (required for
 * getUserMedia and 8th Wall).
 */
export function isSecureContextOk(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.isSecureContext === true || location.hostname === 'localhost')
  );
}

/**
 * Returns true when the device is compatible with 8th Wall:
 * must be mobile, have camera access, and be in a secure context.
 */
export function isXr8Compatible(hasCamera: boolean): boolean {
  return isMobile() && hasCamera && isSecureContextOk();
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
 * Comprehensive XR support detection for 8th Wall
 */
export async function detectXRSupport(): Promise<XRSupport> {
  // Non-prompting capability check — do not open a camera stream here.
  const hasCamera = hasCameraApi();
  const hasGyroscope = checkGyroscope();
  const deviceIsIOS = isIOS();
  const deviceIsAndroid = isAndroid();
  const deviceIsMobile = isMobile();
  const deviceIsDesktop = isDesktop();
  const browser = getBrowserInfo();

  const hasAR8 = isXr8Compatible(hasCamera);

  return {
    hasAR8,
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

  const support = await detectXRSupport();

  if (support.hasAR8) {
    capabilities.push(DeviceCapability.AR8_SUPPORTED);
  }

  if (support.hasCamera) {
    capabilities.push(DeviceCapability.CAMERA_AVAILABLE);
  }

  if (support.hasGyroscope) {
    capabilities.push(DeviceCapability.GYROSCOPE_AVAILABLE);
  }

  if ('ontouchstart' in window) {
    capabilities.push(DeviceCapability.TOUCH_SUPPORTED);
  }

  return capabilities.length > 0 ? capabilities : [DeviceCapability.NONE];
}

/**
 * Check if device meets minimum requirements to run 8th Wall AR
 */
export async function meetsMinimumRequirements(): Promise<{
  meets: boolean;
  missing: string[];
}> {
  const missing: string[] = [];
  const support = await detectXRSupport();

  if (!support.hasAR8) {
    missing.push('8th Wall AR support (mobile device with camera in secure context required)');
  }

  if (!support.hasCamera) {
    missing.push('Camera access');
  }

  if (!support.isMobile) {
    missing.push('Mobile device (iOS Safari or Android Chrome required)');
  }

  return {
    meets: missing.length === 0,
    missing,
  };
}
