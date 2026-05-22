import { useEffect, useState } from 'react';
import { detectXRSupport } from '@/utils/deviceDetection';
import { XRSupport } from '@/types';
import { UI_TEXT } from '@/utils/constants';
import { ARExperience } from '@/components/ar/ARExperience';
import { IOSARFallback } from '@/components/ar/IOSARFallback';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { MainLayout } from '@/components/layout/MainLayout';
import { Toast } from '@/components/ui/Toast';
import { InstructionsOverlay } from '@/components/ui/InstructionsOverlay';

/**
 * Main application component with AR functionality
 */
function App() {
  const [xrSupport, setXrSupport] = useState<XRSupport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeviceInfo, setShowDeviceInfo] = useState(false);

  useEffect(() => {
    // Detect device capabilities on mount
    const checkSupport = async () => {
      try {
        const support = await detectXRSupport();
        setXrSupport(support);
      } catch (error) {
        console.error('Error detecting XR support:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSupport();
  }, []);

  if (isLoading) {
    return (
      <div className="app-container loading">
        <div className="loading-spinner"></div>
        <p>{UI_TEXT.LOADING}</p>
      </div>
    );
  }

  // iOS fallback route: native WebXR is unavailable but we can still run a
  // camera + DeviceOrientation 3DoF experience.
  if (!xrSupport?.hasWebXR && xrSupport?.hasIOSFallback) {
    return (
      <ErrorBoundary>
        <MainLayout>
          <div className="app-container">
            <Toast />
            <InstructionsOverlay />
            <IOSARFallback
              onSessionStart={() => console.log('iOS AR session started')}
              onSessionEnd={() => console.log('iOS AR session ended')}
            />
          </div>
        </MainLayout>
      </ErrorBoundary>
    );
  }

  // Show error if neither native WebXR nor iOS fallback is available
  if (!xrSupport?.hasWebXR) {
    return (
      <div className="app-container">
        <header className="app-header">
          <h1>{UI_TEXT.APP_TITLE}</h1>
          <p>{UI_TEXT.APP_SUBTITLE}</p>
        </header>

        <main className="app-main">
          <div className="error-message">
            <h2>⚠️ AR Not Supported</h2>
            <p>
              Your device or browser doesn't support AR.
            </p>
            <p>
              Please use:
            </p>
            <ul>
              <li>Chrome on Android (version 79+)</li>
              <li>Safari on iOS (camera + motion required)</li>
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

          {showDeviceInfo && xrSupport && (
            <div className="device-info" style={{ marginTop: '20px' }}>
              <h3>Device Information</h3>
              <ul>
                <li>WebXR Supported: {xrSupport.hasWebXR ? '✅' : '❌'}</li>
                <li>WebAR Fallback: {xrSupport.hasWebAR ? '✅' : '❌'}</li>
                <li>Camera Access: {xrSupport.hasCamera ? '✅' : '❌'}</li>
                <li>Gyroscope: {xrSupport.hasGyroscope ? '✅' : '❌'}</li>
                <li>Mobile Device: {xrSupport.isMobile ? '✅' : '❌'}</li>
                <li>Platform: {xrSupport.isIOS ? 'iOS' : xrSupport.isAndroid ? 'Android' : 'Desktop'}</li>
                <li>Browser: {xrSupport.browserName} {xrSupport.browserVersion}</li>
              </ul>
            </div>
          )}
        </main>

        <footer className="app-footer">
          <p>XR Poster v1.0.0</p>
        </footer>
      </div>
    );
  }

  // Main AR experience
  return (
    <ErrorBoundary>
      <MainLayout>
        <div className="app-container">
          {/* Toast notifications */}
          <Toast />

          {/* Instructions overlay */}
          <InstructionsOverlay />

          {/* AR Experience Component */}
          <ARExperience
            onSessionStart={() => {
              console.log('AR session started');
            }}
            onSessionEnd={() => {
              console.log('AR session ended');
            }}
          />

          {/* Device info toggle (hidden during AR session) */}
          <button
            onClick={() => setShowDeviceInfo(!showDeviceInfo)}
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
            ℹ️
          </button>

          {showDeviceInfo && xrSupport && (
            <div style={{
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
            }}>
              <h3 style={{ margin: '0 0 10px 0' }}>Device Info</h3>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                <li>WebXR: {xrSupport.hasWebXR ? '✅' : '❌'}</li>
                <li>Camera: {xrSupport.hasCamera ? '✅' : '❌'}</li>
                <li>Gyroscope: {xrSupport.hasGyroscope ? '✅' : '❌'}</li>
                <li>Platform: {xrSupport.isIOS ? 'iOS' : xrSupport.isAndroid ? 'Android' : 'Desktop'}</li>
                <li>Browser: {xrSupport.browserName}</li>
              </ul>
            </div>
          )}
        </div>
      </MainLayout>
    </ErrorBoundary>
  );
}

export default App;

// Made with Bob
