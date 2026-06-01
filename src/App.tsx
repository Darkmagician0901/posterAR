import { useEffect, useState } from 'react';
import { detectXRSupport } from '@/utils/deviceDetection';
import { XRSupport } from '@/types';
import { UI_TEXT } from '@/utils/constants';
import { ARExperience } from '@/components/ar/ARExperience';
import { DesktopMockMode } from '@/components/ar/DesktopMockMode';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { MainLayout } from '@/components/layout/MainLayout';
import { Toast } from '@/components/ui/Toast';
import { InstructionsOverlay } from '@/components/ui/InstructionsOverlay';
import { DiagnosticPanel } from '@/components/ui/DiagnosticPanel';
import { debugTelemetry } from '@/xr/debugTelemetry';

/**
 * Three branches:
 *   1. hasAR8 (mobile + camera + secure context) → ARExperience via 8th Wall
 *   2. isDesktop                                 → DesktopMockMode
 *   3. Everything else                           → "AR Not Supported" panel
 */
function App() {
  const [xrSupport, setXrSupport] = useState<XRSupport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeviceInfo, setShowDeviceInfo] = useState(false);

  useEffect(() => {
    debugTelemetry.mark('appMounted');
    detectXRSupport()
      .then((support) => {
        setXrSupport(support);
        debugTelemetry.mark('supportDetected');

        // Seed the diagnostic panel with platform-level facts so the panel
        // is meaningful even before any AR session is started.
        // `engine` = 'loading' on a capable device because the XR8 binary +
        // SLAM WASM begin downloading immediately; pipeline.ts flips it to
        // 'ready' once the engine fires 'xrloaded'.
        debugTelemetry.setSubsystem(
          'engine',
          support.hasAR8 ? 'loading' : 'unsupported'
        );
        debugTelemetry.setSubsystem(
          'camera',
          support.hasCamera ? 'ok' : 'unavailable'
        );
        debugTelemetry.setSubsystem(
          'motion',
          support.hasGyroscope ? 'ok' : 'unavailable'
        );

        if (support.hasAR8) {
          debugTelemetry.setSubsystem(
            'platform',
            support.isIOS ? 'ios-safari' : support.isAndroid ? 'android-chrome' : 'mobile-web'
          );
        } else if (support.isDesktop) {
          debugTelemetry.setSubsystem('platform', 'desktop-mock');
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

  // Branch 1: 8th Wall capable — mobile device with camera in a secure context.
  if (xrSupport?.hasAR8) {
    return (
      <ErrorBoundary>
        <MainLayout>
          <div className="app-container">
            <Toast />
            <InstructionsOverlay />
            <DiagnosticPanel />
            <ARExperience
              mode="live"
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

  // Branch 2: desktop — always the mock mode.
  if (xrSupport?.isDesktop) {
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
          <p>To use this app, you need a mobile device with camera access:</p>
          <ul>
            <li>iOS 13+ Safari or Android Chrome, camera permission required</li>
          </ul>
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
      <li>AR (8th Wall) capable: {support.hasAR8 ? 'yes' : 'no'}</li>
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
          <li>AR (8th Wall): {support.hasAR8 ? 'yes' : 'no'}</li>
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
