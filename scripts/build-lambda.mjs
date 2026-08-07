/**
 * build-lambda.mjs — package the API as a Lambda deployment zip.
 *
 * Produces `dist-lambda.zip` containing a single bundled `index.mjs`, ready to
 * upload to a function whose handler is `index.handler`.
 *
 * The AWS SDK is bundled rather than left to the runtime's built-in copy. The
 * Node runtimes ship their own version of it, which moves when AWS updates the
 * runtime — so relying on it means the deployed code can start behaving
 * differently without anything in this repo changing. The presigner in
 * particular depends on signing behaviour that `api/_s3.ts` works around
 * precisely; that workaround should be pinned to a version tests have run
 * against, not to whatever the platform is shipping this month.
 */

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const OUT_DIR = 'dist-lambda';
const ZIP = 'dist-lambda.zip';

rmSync(OUT_DIR, { recursive: true, force: true });
rmSync(ZIP, { force: true });
mkdirSync(OUT_DIR, { recursive: true });

await build({
  entryPoints: ['api/_lambda.ts'],
  outfile: `${OUT_DIR}/index.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: true,
  // Keep function names readable so a stack trace in CloudWatch points
  // somewhere useful; minification otherwise renames them to single letters.
  keepNames: true,
  // The AWS SDK still reaches for `require('node:https')` internally. ESM has
  // no `require`, so esbuild emits a shim that throws "Dynamic require of
  // node:https is not supported" — at import time, meaning the function dies on
  // cold start before it can handle anything. Defining a real `require` lets
  // that shim resolve to it. Without this the zip builds and uploads happily
  // and only fails once deployed.
  banner: {
    js: [
      "import { createRequire as __nodeCreateRequire } from 'node:module';",
      'const require = __nodeCreateRequire(import.meta.url);',
    ].join('\n'),
  },
});

// Import the artifact we just wrote and invoke it. A bundling problem of the
// kind above is invisible to `npm run test` — the tests exercise the TypeScript
// sources, not the bundle — so this is the only place it can be caught before
// the zip reaches AWS.
const bundleUrl = pathToFileURL(resolve(OUT_DIR, 'index.mjs')).href;
const { handler } = await import(bundleUrl);

if (typeof handler !== 'function') {
  throw new Error('bundle does not export a handler — check the entry point');
}

const probe = await handler({
  rawPath: '/api/__buildprobe',
  requestContext: { domainName: 'build.invalid', http: { method: 'GET' } },
});

if (probe?.statusCode !== 404) {
  throw new Error(
    `bundle did not route: expected 404 for an unknown path, got ${probe?.statusCode}`,
  );
}

// Lambda wants the handler file at the ROOT of the archive, not inside a
// folder — `index.handler` resolves `index.mjs` relative to the zip root.
if (process.platform === 'win32') {
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${OUT_DIR}/*' -DestinationPath '${ZIP}' -Force`,
    ],
    { stdio: 'inherit' },
  );
} else {
  execFileSync('zip', ['-j', '-q', ZIP, `${OUT_DIR}/index.mjs`], { stdio: 'inherit' });
}

const kb = (statSync(ZIP).size / 1024).toFixed(0);
console.log(`\n${ZIP} — ${kb} KB`);
console.log('Upload it to the function, with the handler set to: index.handler');
