/**
 * Device detection and 8th Wall (XR8) capability checking utilities.
 *
 * Pure, prompt-free environment checks (user-agent sniffing, secure-context
 * and getUserMedia availability) used by App.tsx to choose its branch:
 * live AR, desktop mock, or "AR Not Supported".
 *
 * Main export: detectXRSupport — aggregates all checks into an XRSupport
 * object; the individual predicates (isMobile, isIOS, hasCameraApi, …) are
 * also exported for targeted use.
 *
 * None of these functions request permissions or open camera streams — see
 * hasCameraApi for why that matters.
 */

import { XRSupport } from '@/types';

/**
 * Camera *capability* check — does this browser expose the getUserMedia API?
 *
 * This is intentionally non-prompting: it does NOT open a camera stream, so
 * it never triggers the OS permission dialog. We use it at startup so the app
 * can decide its branch instantly and let 8th Wall own the actual camera
 * permission prompt at "Start AR". (Opening + closing a stream during
 * detection was the main cause of slow first paint on iOS — the app blocked
 * behind the permission dialog before anything rendered.)
 *
 * @returns True when navigator.mediaDevices.getUserMedia exists.
 */
export function hasCameraApi(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

/**
 * Checks whether the device exposes orientation events (a proxy for "has a
 * gyroscope" — the API existing does not guarantee hardware).
 *
 * @returns True when DeviceOrientationEvent is available on window.
 */
export function checkGyroscope(): boolean {
  return 'DeviceOrientationEvent' in window;
}

/**
 * Detects iOS devices by user agent.
 *
 * @returns True for iPhone/iPad/iPod user agents (excluding IE's fake ones —
 *   see the MSStream note below).
 */
export function isIOS(): boolean {
  // MSStream is a non-standard IE/old-Edge property absent from lib.dom
  // typings; its presence means the UA is IE faking an iOS-like string, not a
  // real iOS device. Typed `unknown` because only its truthiness is read — the
  // property's actual shape is not known or relied on.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as { MSStream?: unknown }).MSStream
  );
}

/**
 * Detects Android devices by user agent.
 *
 * @returns True when the user agent contains "Android".
 */
export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

/**
 * Detects mobile devices via a broad user-agent match covering Android, iOS,
 * and legacy mobile browsers.
 *
 * @returns True when the user agent matches any known mobile token.
 */
export function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Detects desktop devices: anything whose user agent is not mobile.
 *
 * @returns True when none of the mobile/iOS/Android checks match.
 */
export function isDesktop(): boolean {
  return !isMobile() && !isIOS() && !isAndroid();
}

/**
 * Checks whether the page is served in a secure context (required for
 * getUserMedia and 8th Wall).
 *
 * @returns True for HTTPS pages and for localhost (which browsers treat as
 *   secure for development).
 */
export function isSecureContextOk(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.isSecureContext === true || location.hostname === 'localhost')
  );
}

/**
 * Decides whether the device can run the live 8th Wall AR path.
 *
 * @param hasCamera — Result of hasCameraApi(), passed in so detectXRSupport
 *   runs the camera check exactly once.
 * @returns True when the device is mobile, has the camera API, and is in a
 *   secure context.
 */
export function isXr8Compatible(hasCamera: boolean): boolean {
  return isMobile() && hasCamera && isSecureContextOk();
}

/**
 * Extracts a best-effort browser name + major version from the user agent.
 * Order matters: Chrome's UA contains "Safari", and Edge's contains "Chrome",
 * so the more specific checks must run first.
 *
 * @returns `{ name, version }` — e.g. `{ name: 'Chrome', version: '125' }`,
 *   with 'Unknown' for anything unrecognized.
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
 * Comprehensive XR support detection for 8th Wall. Runs all environment
 * checks. Async only to keep the signature stable for future probe-based
 * checks — everything inside is synchronous and prompt-free.
 *
 * @returns A promise resolving to the {@link XRSupport} snapshot App.tsx
 *   branches on; `hasAR8` is the aggregate "can run live AR" verdict.
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
