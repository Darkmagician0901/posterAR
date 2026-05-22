/// <reference types="vite/client" />

/**
 * Type definitions for Vite environment variables
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_GA_TRACKING_ID?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_ENABLE_DEBUG_MODE?: string;
  readonly VITE_MAX_POSTERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * WebXR type definitions
 * These extend the Navigator interface to include WebXR API
 */
interface Navigator {
  xr?: XRSystem;
}

interface XRSystem {
  isSessionSupported(mode: XRSessionMode): Promise<boolean>;
  requestSession(mode: XRSessionMode, options?: XRSessionInit): Promise<XRSession>;
}

type XRSessionMode = 'inline' | 'immersive-vr' | 'immersive-ar';

interface XRSessionInit {
  requiredFeatures?: string[];
  optionalFeatures?: string[];
  domOverlay?: { root: Element };
}

interface XRSession extends EventTarget {
  end(): Promise<void>;
  requestReferenceSpace(type: XRReferenceSpaceType): Promise<XRReferenceSpace>;
  requestAnimationFrame(callback: XRFrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
  renderState: XRRenderState;
  inputSources: XRInputSourceArray;
}

type XRReferenceSpaceType = 'viewer' | 'local' | 'local-floor' | 'bounded-floor' | 'unbounded';

interface XRReferenceSpace extends EventTarget {
  getOffsetReferenceSpace(originOffset: XRRigidTransform): XRReferenceSpace;
}

interface XRRenderState {
  baseLayer?: XRWebGLLayer;
}

interface XRWebGLLayer {
  framebuffer: WebGLFramebuffer;
}

interface XRFrame {
  session: XRSession;
  getViewerPose(referenceSpace: XRReferenceSpace): XRViewerPose | null;
  getPose(space: XRSpace, baseSpace: XRSpace): XRPose | null;
}

interface XRViewerPose {
  transform: XRRigidTransform;
  views: XRView[];
}

interface XRView {
  eye: 'left' | 'right' | 'none';
  projectionMatrix: Float32Array;
  transform: XRRigidTransform;
}

interface XRPose {
  transform: XRRigidTransform;
  emulatedPosition: boolean;
}

interface XRRigidTransform {
  position: DOMPointReadOnly;
  orientation: DOMPointReadOnly;
  matrix: Float32Array;
}

interface XRSpace extends EventTarget {}

interface XRInputSourceArray extends Iterable<XRInputSource> {
  length: number;
  [index: number]: XRInputSource;
}

interface XRInputSource {
  handedness: 'none' | 'left' | 'right';
  targetRayMode: 'gaze' | 'tracked-pointer' | 'screen';
  targetRaySpace: XRSpace;
  gripSpace?: XRSpace;
}

type XRFrameRequestCallback = (time: DOMHighResTimeStamp, frame: XRFrame) => void;

/**
 * Minimal type shim for webxr-polyfill (no upstream types in v2.0.3)
 */
declare module 'webxr-polyfill' {
  export interface WebXRPolyfillOptions {
    global?: any;
    webvr?: boolean;
    cardboard?: boolean;
    cardboardConfig?: Record<string, unknown>;
    allowCardboardOnDesktop?: boolean;
  }
  export default class WebXRPolyfill {
    constructor(config?: WebXRPolyfillOptions);
    nativeWebXR: boolean;
    injected: boolean;
  }
}

/**
 * iOS 13+ requestPermission on DeviceOrientationEvent
 */
interface DeviceOrientationEventStatic {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}
interface DeviceMotionEventStatic {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

// Made with Bob
