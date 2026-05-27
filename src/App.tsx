import { useEffect, useState } from 'react';
import { detectXRSupport } from '@/utils/deviceDetection';
import { XRSupport } from '@/types';
import { UI_TEXT } from '@/utils/constants';
import { ARExperience } from '@/components/ar/ARExperience';
import { IOSARFallback } from '@/components/ar/IOSARFallback';
import { DesktopMockMode } from '@/components/ar/DesktopMockMode';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { MainLayout } from '@/components/layout/MainLayout';
import { Toast } from '@/components/ui/Toast';
import { InstructionsOverlay } from '@/components/ui/InstructionsOverlay';
import { DiagnosticPanel } from '@/components/ui/DiagnosticPanel';
import { debugTelemetry } from '@/xr/debugTelemetry';

/**
 * Three branches:
 *   1. Native immersive-ar supported  → ARExperience (Android Chrome path)
 *   2. iOS Safari with camera + motion → IOSARFallback (3DoF AR-lite)
 *   3. Everything else                → explicit "AR Not Supported" panel
 *
 * Branch selection is gated on the result of navigator.xr.isSessionSupported.
 * There is no silent fallback — the user always sees which branch they
 * landed on.
 */
/**
 * URL flag: `?desktopMock=1` opts the desktop branch into the segmentation
 * sandbox (laptop webcam + DeepLab + mouse-driven orientation). Useful for
 * iterating on the iOS pipeline without an iPhone or WebXR Emulator.
 */
const desktopMockRequested = (): boolean => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('desktopMock') === '1';
};

function App() {
  const [xrSupport, setXrSupport] = useState<XRSupport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeviceInfo, setShowDeviceInfo] = useState(false);
  const useDesktopMock = desktopMockRequested();

  useEffect(() => {
    detectXRSupport()
      .then((support) => {
        setXrSupport(support);

        // Seed the diagnostic panel with platform-level facts so the panel
        // is meaningful even before any AR session is started.
        debugTelemetry.setSubsystem(
          'webxr',
          support.hasWebXR ? 'ok' : 'unsupported'
        );
        debugTelemetry.setSubsystem(
          'camera',
          support.hasCamera ? 'ok' : 'unavailable'
        );
        debugTelemetry.setSubsystem(
          'motion',
          support.hasGyroscope ? 'ok' : 'unavailable'
        );

        if (support.hasWebXR) {
          debugTelemetry.setSubsystem(
            'platform',
            support.hasWebXREmulator ? 'desktop-emulator' : 'android-webxr'
          );
        } else if (support.hasIOSFallback) {
          debugTelemetry.setSubsystem('platform', 'ios-fallback');
        } else if (support.isDesktop) {
          debugTelemetry.setSubsystem('platform', 'desktop-dev');
        } else {
          debugTelemetry.setSubsystem('platform', 'unsupported');
        }
      })
      .catch((error) => console.error('Error detecting XR support:', error))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="app-container loading">
        <div className="loading-spinner"></div>
        <p>{UI_TEXT.LOADING}</p>
      </div>
    );
  }

  // Branch 1: native WebXR immersive-ar (Android Chrome, or desktop with the
  // WebXR API Emulator extension).
  if (xrSupport?.hasWebXR) {
    const mode = xrSupport.hasWebXREmulator ? 'dev' : 'live';
    return (
      <ErrorBoundary>
        <MainLayout>
          <div className="app-container">
            <Toast />
            <InstructionsOverlay />
            <DiagnosticPanel />
            <ARExperience
              mode={mode}
              hasEmulator={xrSupport.hasWebXREmulator}
              onSessionStart={() => console.log('AR session started')}
              onSessionEnd={() => console.log('AR session ended')}
            />
            <DeviceInfoButton
              show={showDeviceInfo}
              onToggle={() => setShowDeviceInfo((s) => !s)}
              support={xrSupport}
            />
          </div>
        </MainLayout>
      </ErrorBoundary>
    );
  }

  // Branch 1b: desktop without the emulator extension. Two sub-modes:
  //   - ?desktopMock=1  → DesktopMockMode (segmentation pipeline on the
  //     laptop webcam, mouse-driven orientation). Lets the user iterate on
  //     the iOS pipeline without an iPhone or WebXR Emulator extension.
  //   - default         → ARExperience in dev mode (existing wall stub).
  if (xrSupport?.isDesktop) {
    if (useDesktopMock) {
      return (
        <ErrorBoundary>
          <MainLayout>
            <div className="app-container">
              <Toast />
              <InstructionsOverlay />
              <DiagnosticPanel />
              <DesktopMockMode />
              <DeviceInfoButton
                show={showDeviceInfo}
                onToggle={() => setShowDeviceInfo((s) => !s)}
                support={xrSupport}
              />
            </div>
          </MainLayout>
        </ErrorBoundary>
      );
    }
    return (
      <ErrorBoundary>
        <MainLayout>
          <div className="app-container">
            <Toast />
            <InstructionsOverlay />
            <DiagnosticPanel />
            <ARExperience
              mode="dev"
              hasEmulator={false}
              onSessionStart={() => console.log('AR session started')}
              onSessionEnd={() => console.log('AR session ended')}
            />
            <DeviceInfoButton
              show={showDeviceInfo}
              onToggle={() => setShowDeviceInfo((s) => !s)}
              support={xrSupport}
            />
          </div>
        </MainLayout>
      </ErrorBoundary>
    );
  }

  // Branch 2: iOS Safari — no immersive-ar, but we can run camera + motion.
  if (xrSupport?.hasIOSFallback) {
    return (
      <ErrorBoundary>
        <MainLayout>
          <div className="app-container">
            <Toast />
            <InstructionsOverlay />
            <DiagnosticPanel />
            <IOSARFallback
              onSessionStart={() => console.log('iOS AR session started')}
              onSessionEnd={() => console.log('iOS AR session ended')}
            />
          </div>
        </MainLayout>
      </ErrorBoundary>
    );
  }

  // Branch 3: explicit unsupported message.
  return (
    <div className="app-container">
      <DiagnosticPanel />
      <header className="app-header">
        <h1>{UI_TEXT.APP_TITLE}</h1>
        <p>{UI_TEXT.APP_SUBTITLE}</p>
      </header>

      <main className="app-main">
        <div className="error-message">
          <h2>AR Not Supported</h2>
          <p>This device or browser cannot run the AR experience.</p>
          <p>To use this app:</p>
          <ul>
            <li>Android: Chrome 90+ with ARCore installed</li>
            <li>iOS: Safari with camera + motion permissions allowed</li>
          </ul>
          <p style={{ marginTop: '12px', fontSize: '13px', opacity: 0.8 }}>
            Required WebXR features: hit-test, anchors, dom-overlay.
          </p>
        </div>

        <button
          onClick={() => setShowDeviceInfo(!showDeviceInfo)}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          {showDeviceInfo ? 'Hide' : 'Show'} Device Info
        </button>

        {showDeviceInfo && xrSupport && <DeviceInfoTable support={xrSupport} />}
      </main>

      <footer className="app-footer">
        <p>XR Poster v1.0.0</p>
      </footer>
    </div>
  );
}

const DeviceInfoTable: React.FC<{ support: XRSupport }> = ({ support }) => (
  <div className="device-info" style={{ marginTop: '20px' }}>
    <h3>Device Information</h3>
    <ul>
      <li>WebXR immersive-ar: {support.hasWebXR ? 'yes' : 'no'}</li>
      <li>iOS Fallback eligible: {support.hasIOSFallback ? 'yes' : 'no'}</li>
      <li>Camera Access: {support.hasCamera ? 'yes' : 'no'}</li>
      <li>Gyroscope: {support.hasGyroscope ? 'yes' : 'no'}</li>
      <li>Mobile Device: {support.isMobile ? 'yes' : 'no'}</li>
      <li>
        Platform:{' '}
        {support.isIOS ? 'iOS' : support.isAndroid ? 'Android' : 'Desktop'}
      </li>
      <li>
        Browser: {support.browserName} {support.browserVersion}
      </li>
    </ul>
  </div>
);

const DeviceInfoButton: React.FC<{
  show: boolean;
  onToggle: () => void;
  support: XRSupport;
}> = ({ show, onToggle, support }) => (
  <>
    <button
      onClick={onToggle}
      style={{
        position: 'fixed',
        top: '70px',
        right: '20px',
        padding: '10px',
        fontSize: '12px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        zIndex: 2000,
      }}
    >
      Info
    </button>
    {show && (
      <div
        style={{
          position: 'fixed',
          top: '110px',
          right: '20px',
          padding: '15px',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          borderRadius: '10px',
          zIndex: 2000,
          maxWidth: '300px',
          fontSize: '12px',
        }}
      >
        <h3 style={{ margin: '0 0 10px 0' }}>Device Info</h3>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li>WebXR: {support.hasWebXR ? 'yes' : 'no'}</li>
          <li>Camera: {support.hasCamera ? 'yes' : 'no'}</li>
          <li>Gyroscope: {support.hasGyroscope ? 'yes' : 'no'}</li>
          <li>
            Platform:{' '}
            {support.isIOS ? 'iOS' : support.isAndroid ? 'Android' : 'Desktop'}
          </li>
          <li>Browser: {support.browserName}</li>
        </ul>
      </div>
    )}
  </>
);

export default App;
