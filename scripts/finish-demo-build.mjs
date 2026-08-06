/**
 * finish-demo-build.mjs — finalise and verify the single-file studio build.
 *
 * Vite names its output after the entry (`demo.html`); static hosts want
 * `index.html`. This renames it, then proves the promise the build makes: one
 * file, no external subresources. A stylesheet that still points at
 * `/assets/some.woff2` would load fine from the dev server and 404 on Netlify,
 * so the check looks inside the inlined CSS too, not just at src/href.
 *
 * Run by `npm run build:demo`. Exits non-zero on any escape.
 */

import { readFileSync, renameSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'demo-dist';
const emitted = join(DIR, 'demo.html');
const target = join(DIR, 'index.html');

if (existsSync(emitted)) renameSync(emitted, target);

if (!existsSync(target)) {
  console.error(`✗ ${target} was never produced — did the Vite build fail?`);
  process.exit(1);
}

const html = readFileSync(target, 'utf8');

/**
 * Script bodies are excluded before scanning for tags: the bundle builds SVG
 * markup from template literals at runtime, so it is full of `href="..."`
 * fragments that are strings the app writes into the DOM, not subresources the
 * browser fetches. Inlined <style> blocks stay in — a font url() there would be
 * a real escape.
 */
const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>');

/** Anything a browser would have to fetch separately. */
const isExternal = (url) => !url.startsWith('data:') && !url.startsWith('#') && url.trim() !== '';

const tagRefs = [...markup.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((m) => m[1]);
const cssRefs = [...markup.matchAll(/url\((['"]?)([^'")]*)\1\)/g)].map((m) => m[2]);
const escaped = [...tagRefs, ...cssRefs].filter(isExternal);

if (escaped.length > 0) {
  console.error('✗ not self-contained — these are still fetched over the network:');
  for (const url of [...new Set(escaped)]) console.error(`    ${url.slice(0, 120)}`);
  process.exit(1);
}

// Dotfiles (.vite/) are build bookkeeping, not something a host would serve.
const strays = readdirSync(DIR).filter((f) => f !== 'index.html' && !f.startsWith('.'));
if (strays.length > 0) {
  console.error(`✗ expected one file, also found: ${strays.join(', ')}`);
  process.exit(1);
}

const kb = Math.round(statSync(target).size / 1024);
console.log(`✓ ${target} — one file, no external requests, ${kb} KB`);
