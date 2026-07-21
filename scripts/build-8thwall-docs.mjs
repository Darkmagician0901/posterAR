/**
 * build-8thwall-docs.mjs — regenerate the 8th Wall engine-docs skill index.
 *
 * Build-time tool (NOT an app runtime dependency). It:
 *   1. Reads every `.claude/skills/8thwall-engine/reference/*.md`, extracting each
 *      documented symbol (one `### ` heading) and its exact line range.
 *   2. Parses this repo's `src/**` with tree-sitter (TypeScript + TSX grammars) to
 *      find every `XR8.<Module>.<method>` usage, cross-referenced to each symbol as
 *      `localUsage` (doc + real in-repo example, together).
 *   3. Validates that every fenced `ts`/`js` example in the reference files parses.
 *   4. Emits deterministic artifacts: `symbols.json`, `INDEX.md`, and the
 *      generated module-map block inside `SKILL.md`.
 *
 * Source of the reference prose: Context7 `/websites/8thwall_api_engine` (curated
 * by an agent session). This script only indexes what already exists on disk, so
 * running it is deterministic and offline. Re-run: `npm run build:8thwall-docs`.
 *
 * Tree-sitter is loaded via web-tree-sitter (wasm) + prebuilt grammars from
 * tree-sitter-wasms — no native build step.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SKILL_DIR = path.join(REPO_ROOT, '.claude', 'skills', '8thwall-engine');
const REFERENCE_DIR = path.join(SKILL_DIR, 'reference');
const SRC_DIR = path.join(REPO_ROOT, 'src');

const SKILL_REL = (abs) => path.relative(SKILL_DIR, abs).split(path.sep).join('/');
const REPO_REL = (abs) => path.relative(REPO_ROOT, abs).split(path.sep).join('/');

/* ------------------------------ tree-sitter ------------------------------- */

async function loadTreeSitter() {
  const mod = await import('web-tree-sitter');
  const Parser = mod.Parser ?? mod.default?.Parser ?? mod.default;

  // web-tree-sitter's `exports` map blocks require.resolve of subpaths, so resolve
  // the wasm files directly under this repo's (flat, npm-hoisted) node_modules. The
  // runtime wasm is `tree-sitter.wasm` (<=0.24) or `web-tree-sitter.wasm` (>=0.25).
  const NM = path.join(REPO_ROOT, 'node_modules');
  const runtimeDir = path.join(NM, 'web-tree-sitter');
  const runtimeWasm = ['tree-sitter.wasm', 'web-tree-sitter.wasm']
    .map((n) => path.join(runtimeDir, n))
    .find(existsSync);
  const grammarDir = path.join(NM, 'tree-sitter-wasms', 'out');
  const tsWasm = path.join(grammarDir, 'tree-sitter-typescript.wasm');
  const tsxWasm = path.join(grammarDir, 'tree-sitter-tsx.wasm');
  for (const p of [runtimeWasm, tsWasm, tsxWasm]) {
    if (!p || !existsSync(p)) {
      throw new Error(`missing tree-sitter wasm under ${NM} — run \`npm install\` (build-only devDeps)`);
    }
  }

  await Parser.init({ locateFile: (name) => path.join(runtimeDir, name) });

  // In web-tree-sitter <=0.20 the Language class is attached to Parser during init.
  const Language = mod.Language ?? Parser.Language;
  const tsLang = await Language.load(tsWasm);
  const tsxLang = await Language.load(tsxWasm);

  const parser = new Parser();
  return {
    parseTs: (code) => (parser.setLanguage(tsLang), parser.parse(code)),
    parseTsx: (code) => (parser.setLanguage(tsxLang), parser.parse(code)),
  };
}

const nodeHasError = (node) =>
  typeof node.hasError === 'function' ? node.hasError() : node.hasError;

/** Walk every node in a tree, invoking `visit` on each. */
function walk(node, visit) {
  visit(node);
  for (let i = 0; i < node.childCount; i++) walk(node.child(i), visit);
}

/* --------------------------- reference parsing ---------------------------- */

// Normalize a member-expression for matching: drop whitespace, optional-chaining,
// and a leading `window.` (the engine global is reachable as both `XR8` and `window.XR8`).
const NORM = (s) => s.replace(/\s+/g, '').replace(/\?\./g, '.').replace(/^window\./, '');

/** Extract the symbol key from a `### ` heading (dotted call or bare identifier). */
function symbolFromHeading(headingText) {
  const backticked = headingText.match(/`([^`]+)`/);
  const raw = (backticked ? backticked[1] : headingText).trim();
  // Take everything up to the first `(` or whitespace: `XR8.X.y(a,b)` -> `XR8.X.y`.
  const token = raw.split(/[(\s]/)[0];
  return token.replace(/`/g, '').trim();
}

/** Parse one reference file into { module, source, symbols:[{symbol,lineStart,lineEnd,signature}] }. */
function parseReference(file) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  // front-matter
  let module = null;
  let source = null;
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length && lines[i] !== '---'; i++) {
      const m = lines[i].match(/^(module|source):\s*(.+)$/);
      if (m) (m[1] === 'module' ? (module = m[2].trim()) : (source = m[2].trim()));
    }
  }

  const headingIdx = [];
  lines.forEach((line, i) => {
    if (/^### /.test(line)) headingIdx.push(i);
  });

  const boundary = (start) => {
    for (let i = start + 1; i < lines.length; i++) {
      if (/^#{1,3} /.test(lines[i])) return i - 1;
    }
    return lines.length - 1;
  };

  const symbols = headingIdx.map((i) => {
    const end = boundary(i);
    const symbol = symbolFromHeading(lines[i].replace(/^###\s+/, ''));
    // signature: first backticked line in the body, else the heading text.
    let signature = lines[i].replace(/^###\s+/, '').replace(/`/g, '');
    for (let j = i + 1; j <= end; j++) {
      const sig = lines[j].match(/^`([^`]+)`\s*$/);
      if (sig) { signature = sig[1]; break; }
    }
    return { symbol, signature, lineStart: i + 1, lineEnd: end + 1 };
  });

  return { file, module, source, symbols };
}

/** Collect fenced ts/js code blocks with their starting line number. */
function codeBlocks(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const blocks = [];
  let inBlock = false;
  let lang = '';
  let buf = [];
  let startLine = 0;
  lines.forEach((line, i) => {
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence && !inBlock) {
      inBlock = true; lang = (fence[1] || '').toLowerCase(); buf = []; startLine = i + 2;
    } else if (fence && inBlock) {
      if (lang === 'ts' || lang === 'tsx' || lang === 'js' || lang === 'javascript') {
        blocks.push({ code: buf.join('\n'), startLine });
      }
      inBlock = false;
    } else if (inBlock) {
      buf.push(line);
    }
  });
  return blocks;
}

/* ------------------------------- src usage -------------------------------- */

function listSrcFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...listSrcFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out.sort();
}

/** Map each XR8.* symbol key -> sorted array of { file, line } usages in src. */
function collectLocalUsage(ts, symbolKeys) {
  const wanted = new Set([...symbolKeys].filter((k) => k.startsWith('XR8.')).map(NORM));
  const usage = new Map();
  for (const file of listSrcFiles(SRC_DIR)) {
    const code = readFileSync(file, 'utf8');
    const tree = file.endsWith('.tsx') ? ts.parseTsx(code) : ts.parseTs(code);
    walk(tree.rootNode, (node) => {
      if (node.type !== 'member_expression') return;
      const key = NORM(node.text);
      if (!wanted.has(key)) return;
      if (!usage.has(key)) usage.set(key, []);
      usage.get(key).push({ file: REPO_REL(file), line: node.startPosition.row + 1 });
    });
  }
  for (const [, arr] of usage) {
    arr.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  }
  return usage;
}

/* --------------------------------- main ----------------------------------- */

async function main() {
  const ts = await loadTreeSitter();

  const refFiles = readdirSync(REFERENCE_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => path.join(REFERENCE_DIR, f));

  const parsed = refFiles.map(parseReference);

  // 1. validate example code blocks parse
  const parseErrors = [];
  for (const file of refFiles) {
    for (const { code, startLine } of codeBlocks(file)) {
      const tree = code.includes('</') || file.endsWith('.tsx')
        ? ts.parseTsx(code) : ts.parseTs(code);
      if (nodeHasError(tree.rootNode)) {
        parseErrors.push(`${SKILL_REL(file)}:${startLine} — code block has a syntax error`);
      }
    }
  }

  // 2. cross-reference src usage
  const allKeys = parsed.flatMap((p) => p.symbols.map((s) => s.symbol));
  const usage = collectLocalUsage(ts, allKeys);

  // 3. build symbols.json (deterministic ordering)
  const symbols = [];
  for (const p of parsed) {
    for (const s of p.symbols) {
      symbols.push({
        symbol: s.symbol,
        module: p.module,
        signature: s.signature,
        file: SKILL_REL(p.file),
        lineStart: s.lineStart,
        lineEnd: s.lineEnd,
        source: p.source,
        localUsage: usage.get(NORM(s.symbol)) ?? [],
      });
    }
  }
  symbols.sort((a, b) =>
    a.file === b.file ? a.lineStart - b.lineStart : a.file < b.file ? -1 : 1
  );

  // 4. validate line ranges
  const rangeErrors = [];
  for (const s of symbols) {
    if (!(s.lineStart >= 1 && s.lineEnd >= s.lineStart)) {
      rangeErrors.push(`${s.file}: bad line range for ${s.symbol}`);
    }
  }

  const errors = [...parseErrors, ...rangeErrors];
  if (errors.length) {
    console.error('build-8thwall-docs FAILED:\n  ' + errors.join('\n  '));
    process.exit(1);
  }

  writeFileSync(
    path.join(SKILL_DIR, 'symbols.json'),
    JSON.stringify(symbols, null, 2) + '\n'
  );

  // 5. INDEX.md
  const usageCount = symbols.reduce((n, s) => n + s.localUsage.length, 0);
  const indexLines = [
    '# 8th Wall engine API — symbol index',
    '',
    '> Generated by `scripts/build-8thwall-docs.mjs`. Do not edit by hand.',
    `> ${symbols.length} symbols across ${parsed.length} modules; ${usageCount} in-repo usages.`,
    '',
    'Read only the cited line range for a symbol (e.g. `reference/xrcontroller.md`',
    'lines 30–58) instead of the whole file. `symbols.json` has the same data machine-readable.',
    '',
  ];
  for (const p of parsed) {
    if (!p.symbols.length) continue;
    indexLines.push(`## ${p.module}`, '');
    indexLines.push(`Source: ${p.source}  ·  \`${SKILL_REL(p.file)}\``, '');
    for (const s of p.symbols) {
      const entry = symbols.find((x) => x.file === SKILL_REL(p.file) && x.symbol === s.symbol && x.lineStart === s.lineStart);
      const uses = entry.localUsage.length
        ? ` — ${entry.localUsage.length} in-repo use${entry.localUsage.length > 1 ? 's' : ''}: ${entry.localUsage.map((u) => `${u.file}:${u.line}`).join(', ')}`
        : '';
      indexLines.push(`- \`${s.signature}\` → \`${SKILL_REL(p.file)}\` L${s.lineStart}-${s.lineEnd}${uses}`);
    }
    indexLines.push('');
  }
  writeFileSync(path.join(SKILL_DIR, 'INDEX.md'), indexLines.join('\n'));

  // 6. regenerate SKILL.md module map between markers
  const skillPath = path.join(SKILL_DIR, 'SKILL.md');
  const skill = readFileSync(skillPath, 'utf8');
  const begin = '<!-- BEGIN GENERATED MODULE MAP -->';
  const end = '<!-- END GENERATED MODULE MAP -->';
  const mapRows = parsed
    .map((p) => `| \`${p.module}\` | \`${SKILL_REL(p.file)}\` | ${p.symbols.length} |`)
    .join('\n');
  const block = [
    begin,
    '',
    '| Module | Reference file | Symbols |',
    '| --- | --- | --- |',
    mapRows,
    '',
    end,
  ].join('\n');
  const re = new RegExp(`${begin}[\\s\\S]*${end}`);
  if (re.test(skill)) {
    writeFileSync(skillPath, skill.replace(re, block));
  } else {
    console.warn('SKILL.md has no generated-map markers; skipping map update.');
  }

  console.log(
    `build-8thwall-docs OK: ${symbols.length} symbols, ${parsed.length} modules, ${usageCount} in-repo usages.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
