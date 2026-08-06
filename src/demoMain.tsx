/**
 * demoMain.tsx — entry point for the standalone single-file studio build.
 *
 * Differs from main.tsx in three ways, all of them deliberate:
 *   - It mounts StudioApp directly. There is no /studio path check because the
 *     demo is only ever the studio, and no lazy() because a single file has
 *     nothing to split.
 *   - It adds DemoIntro, the card and reset control that exist only here.
 *   - It loads the latin subsets of the story fonts rather than the full
 *     multi-script files. Every glyph gets base64'd into the one HTML file, so
 *     the Cyrillic/Greek/Vietnamese ranges would be roughly 200 KB of weight
 *     nothing in this demo renders.
 *
 * Built by vite.config.demo.ts; see src/studio/demoMode.ts for what the demo
 * flag switches off.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { StudioApp } from './studio/StudioApp';
import { DemoIntro } from './studio/DemoIntro';
import './index.css';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/vt323/latin-400.css';
// Author-selectable story fonts (see src/story/textStyle.ts).
import '@fontsource/poppins/latin-400.css';
import '@fontsource/anton/latin-400.css';
import '@fontsource/permanent-marker/latin-400.css';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/fredoka/latin-400.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StudioApp />
    <DemoIntro />
  </React.StrictMode>,
);
