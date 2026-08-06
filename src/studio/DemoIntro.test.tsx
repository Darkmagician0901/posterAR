import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { DemoIntro } from './DemoIntro';
import { dismissIntro, DEMO_NOTE } from './demoMode';

/**
 * Render-level coverage for the demo build's intro card. Like StudioApp's
 * tests, these use renderToString rather than a full client render — the
 * dismissal transition is state the store tests already cover, so what matters
 * here is what a first-time visitor is shown.
 */
describe('DemoIntro', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('greets a first-time visitor with the card', () => {
    const html = renderToString(<DemoIntro width={1440} />);
    expect(html).toContain('ARCADE STUDIO');
    expect(html).toContain('START EXPLORING');
  });

  it('explains why publishing is unavailable', () => {
    const html = renderToString(<DemoIntro width={1440} />);
    expect(html).toContain('standalone build');
    expect(DEMO_NOTE).toContain('standalone build');
  });

  it('stays out of the way once dismissed', () => {
    dismissIntro(window.localStorage);
    const html = renderToString(<DemoIntro width={1440} />);
    expect(html).not.toContain('START EXPLORING');
  });

  it('warns that a narrow viewport is the wrong place for this', () => {
    const html = renderToString(<DemoIntro width={430} />);
    expect(html).toContain('laptop');
  });

  it('says nothing about laptops on a desktop viewport', () => {
    const html = renderToString(<DemoIntro width={1440} />);
    expect(html).not.toContain('laptop');
  });

  it('keeps the reset control available after the card is gone', () => {
    dismissIntro(window.localStorage);
    const html = renderToString(<DemoIntro width={1440} />);
    expect(html).toContain('RESET DEMO');
  });

  it('renders without throwing', () => {
    expect(() => renderToString(<DemoIntro width={1440} />)).not.toThrow();
  });
});
