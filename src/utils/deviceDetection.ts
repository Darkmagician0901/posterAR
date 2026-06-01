/**
 * Device detection and 8th Wall (XR8) capability checking utilities
 */

import { XRSupport, DeviceCapability } from '@/types';

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
  const hasCamera = await checkCameraAccess();
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

// Made with Bob
