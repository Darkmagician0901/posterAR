/**
 * App.tsx — root component and capability router.
 *
 * Detects device capabilities once on mount (detectXRSupport) and renders one
 * of three branches: live 8th Wall AR, the desktop webcam mock, or an
 * "AR Not Supported" panel. Also seeds the DiagnosticPanel with platform
 * facts and bridges index.html's engine-load diagnostics into telemetry.
 *
 * Default export: App. Key dependencies: deviceDetection, debugTelemetry,
 * StoryARExperience, DesktopMockMode.
 */

import { useEffect, useState } from 'react';
import { detectXRSupport } from '@/utils/deviceDetection';
import { XRSupport } from '@/types';
import { UI_TEXT } from '@/utils/constants';
import { isPersistenceEnabled, listAssets } from '@/services/posterApi';
import { loadStoryForLocation } from '@/services/storyApi';
import { usePosterStore } from '@/store/posterStore';
import { useContentStore } from '@/store/contentStore';
import { DesktopMockMode } from '@/components/ar/DesktopMockMode';
import { StoryARExperience } from '@/components/ar/StoryARExperience';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { MainLayout } from '@/components/layout/MainLayout';
import { Toast } from '@/components/ui/Toast';
import { InstructionsOverlay } from '@/components/ui/InstructionsOverlay';
import { DiagnosticPanel } from '@/components/ui/DiagnosticPanel';
import { debugTelemetry } from '@/xr/debugTelemetry';

/**
 * Root component that detects device capabilities once and renders one of
 * three branches:
 *   1. hasAR8 (mobile + camera + secure context) → StoryARExperience via 8th Wall
 *   2. isDesktop                                 → DesktopMockMode
 *   3. Everything else                           → "AR Not Supported" panel
 *
 * Takes no props; capability detection runs in an effect on mount and a
 * loading spinner is shown until it resolves.
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
        // On a capable device `engine` starts as 'loading' because the 8th
        // Wall engine script and its SLAM module (SLAM = "Simultaneous
        // Localization and Mapping", the surface-tracking system, shipped as
        // a WebAssembly download) start downloading as soon as the page
        // loads. src/xr8/pipeline.ts flips the status to 'ready' once the
        // engine fires its 'xrloaded' event.
        debugTelemetry.setSubsystem('engine', support.hasAR8 ? 'loading' : 'unsupported');
        debugTelemetry.setSubsystem('camera', support.hasCamera ? 'ok' : 'unavailable');
        debugTelemetry.setSubsystem('motion', support.hasGyroscope ? 'ok' : 'unavailable');

        if (support.hasAR8) {
          debugTelemetry.setSubsystem(
            'platform',
            support.isIOS ? 'ios-safari' : support.isAndroid ? 'android-chrome' : 'mobile-web',
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

  // Bridge engine-load diagnostics into the panel from boot, so the
  // engine-script load state is visible even before "Start AR" is tapped.
  // `window.__xr8diag` is a plain object written by a small inline <script>
  // in index.html that records whether each 8th Wall <script> tag loaded.
  useEffect(() => {
    // Convert the index.html script-load states ('loaded'/'error'/anything
    // else) to the telemetry status values the diagnostic panel expects.
    const mapScript = (s?: string): 'ready' | 'error' | 'loading' =>
      s === 'loaded' ? 'ready' : s === 'error' ? 'error' : 'loading';
    // Poll once per second; give up after 30 s if the engine never settles
    // (the interval also stops as soon as it reaches 'loaded' or 'error').
    const MAX_POLL_TICKS = 30;
    let ticks = 0;
    const id = setInterval(() => {
      const d =
        (
          window as unknown as {
            __xr8diag?: {
              engine?: string;
              xrextras?: string;
              landingPage?: string;
              error?: string | null;
            };
          }
        ).__xr8diag ?? {};
      debugTelemetry.setSubsystem('engineScript', mapScript(d.engine));
      debugTelemetry.setSubsystem(
        'helpers',
        d.xrextras === 'error' || d.landingPage === 'error'
          ? 'error'
          : d.xrextras === 'loaded' && d.landingPage === 'loaded'
            ? 'ready'
            : 'loading',
      );
      // Distinguish a fatal engine failure from a non-fatal helper failure.
      // The xrextras and landing-page scripts are optional add-ons: runXr8
      // (in src/xr8/pipeline.ts) wraps their use in existence checks, so AR
      // still works when they fail to load. Their failure must therefore not
      // be reported as "engine failed".
      if (d.engine === 'error') {
        debugTelemetry.setNote(
          'Engine script failed to load — AR cannot start. Check network/CDN reachability.',
        );
      } else if (d.xrextras === 'error' || d.landingPage === 'error') {
        debugTelemetry.setNote(
          'Optional helper failed to load (xrextras/landing-page) — AR still works.',
        );
      }
      ticks += 1;
      if (d.engine === 'loaded' || d.engine === 'error' || ticks > MAX_POLL_TICKS) {
        clearInterval(id);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isPersistenceEnabled()) return;
    let cancelled = false;
    listAssets()
      .then((assets) => {
        if (!cancelled) usePosterStore.getState().hydrateUploads(assets);
      })
      .catch((err) => console.warn('Asset hydration failed:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the story this URL asks for (?s=<id>, or ?draft=1 for the studio's
  // local preview). loadStoryForLocation resolves null on every failure path,
  // in which case the content store keeps the bundled default — so a bad link
  // or an offline device still gets a complete experience.
  useEffect(() => {
    let cancelled = false;
    void loadStoryForLocation(window.location.search).then((doc) => {
      if (cancelled || doc === null) return;
      useContentStore.getState().load(doc);
      debugTelemetry.logEvent('story: loaded authored document');
    });
    return () => {
      cancelled = true;
    };
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
            <DiagnosticPanel />
            <StoryARExperience />
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

/**
 * Static capability table shown on the "AR Not Supported" branch.
 *
 * The single `support` prop is the capability-detection result from
 * detectXRSupport(); every row simply prints one of its boolean/string fields.
 */
const DeviceInfoTable: React.FC<{ support: XRSupport }> = ({ support }) => (
  <div className="device-info" style={{ marginTop: '20px' }}>
    <h3>Device Information</h3>
    <ul>
      <li>AR (8th Wall) capable: {support.hasAR8 ? 'yes' : 'no'}</li>
      <li>Camera Access: {support.hasCamera ? 'yes' : 'no'}</li>
      <li>Gyroscope: {support.hasGyroscope ? 'yes' : 'no'}</li>
      <li>Mobile Device: {support.isMobile ? 'yes' : 'no'}</li>
      <li>Platform: {support.isIOS ? 'iOS' : support.isAndroid ? 'Android' : 'Desktop'}</li>
      <li>
        Browser: {support.browserName} {support.browserVersion}
      </li>
    </ul>
  </div>
);

/**
 * Floating "Info" button + popover used on the AR and desktop-mock branches.
 * Visibility is controlled by the parent (`show`/`onToggle`) so both branches
 * share one piece of state.
 */
const DeviceInfoButton: React.FC<{
  /** Whether the popover is currently open. */
  show: boolean;
  /** Called when the Info button is clicked; the parent flips `show`. */
  onToggle: () => void;
  /** Capability-detection result whose fields fill the popover rows. */
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
          <li>Platform: {support.isIOS ? 'iOS' : support.isAndroid ? 'Android' : 'Desktop'}</li>
          <li>Browser: {support.browserName}</li>
        </ul>
      </div>
    )}
  </>
);

export default App;
