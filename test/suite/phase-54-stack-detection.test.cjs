'use strict';
/**
 * test/suite/phase-54-stack-detection.test.cjs — Phase 54 (Composable Reference Addendums), DETECT-01 (executor A).
 *
 * Tag: '54-01:'.
 *
 * Proves scripts/lib/detect/stack.cjs#detectStack(root): a pure, dep-free, never-throwing
 * fingerprinter that reads a project's package.json (deps + devDeps), probes config files
 * (tailwind.config.* / @theme / components.json / *.css.ts / astro.config.* / svelte.config.* /
 * vite.config.* / app vs pages), and import signatures (cn(), @theme), then emits
 *   { ds: string|null, framework: string|null, motion_libs: string[], evidence: {...} }.
 *
 * Detection priority (CONTEXT R1): explicit dep > config file > file-pattern, single winner for
 * ds + framework, MULTIPLE allowed for motion_libs. Detection trust = ANY presence in dependencies
 * OR devDependencies (ROADMAP open-q default).
 *
 * HERMETIC: every fixture is a throwaway tree under os.tmpdir() built by writing a package.json +
 * marker files, and torn down in an after() hook. No spawning, no network, no real repo reads.
 * detectStack reuses engine.cjs walk()/SKIP_DIRS, so a node_modules/ planted with decoy markers
 * must be ignored — asserted explicitly.
 *
 * Executors B (mapper-spawn composeAddendums) and F (registry + wiring) consume the OUTPUT SHAPE
 * pinned here: { ds, framework, motion_libs[], evidence }.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stack = require('../../scripts/lib/detect/stack.cjs');
const { detectStack } = stack;

// ---------------------------------------------------------------------------
// Hermetic fixture helpers. Each fixture is an isolated tmpdir; all are tracked
// and removed in the after() hook so the suite leaves no residue.
// ---------------------------------------------------------------------------

const FIXTURES = [];

/** Make a fresh tmpdir and register it for teardown. */
function mkroot(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gdd-p54-${label}-`));
  FIXTURES.push(dir);
  return dir;
}

/** Write a package.json with the given dependencies / devDependencies. */
function writePkg(root, { deps, devDeps } = {}) {
  const pkg = { name: 'fixture', version: '0.0.0' };
  if (deps) pkg.dependencies = deps;
  if (devDeps) pkg.devDependencies = devDeps;
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
}

/** Write a file (creating parent dirs), with optional content. */
function writeFile(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content == null ? '' : content, 'utf8');
}

/** Make a directory under root. */
function mkdir(root, rel) {
  fs.mkdirSync(path.join(root, rel), { recursive: true });
}

test.after(() => {
  for (const dir of FIXTURES) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ---------------------------------------------------------------------------
// 54-01: the three canonical combinations from the dispatch.
// ---------------------------------------------------------------------------

test('54-01: tailwind + next + framer-motion -> {ds:tailwind, framework:nextjs, motion_libs:[framer-motion]}', () => {
  const root = mkroot('tw-next-framer');
  writePkg(root, {
    deps: { next: '^15.0.0', react: '^19.0.0', 'react-dom': '^19.0.0', 'framer-motion': '^11.0.0' },
    devDeps: { tailwindcss: '^3.4.0' },
  });
  mkdir(root, 'app'); // Next app-router signal
  writeFile(root, 'tailwind.config.ts', 'export default { content: [] };');

  const res = detectStack(root);
  assert.equal(res.ds, 'tailwind');
  assert.equal(res.framework, 'nextjs');
  assert.deepEqual(res.motion_libs, ['framer-motion']);
  // Output-shape contract (executors B & F depend on this).
  assert.deepEqual(Object.keys(res).sort(), ['ds', 'evidence', 'framework', 'motion_libs']);
  assert.equal(typeof res.evidence, 'object');
  assert.match(res.evidence.framework, /app-router/);
});

test('54-01: shadcn + vite + gsap -> {ds:shadcn, framework:vite-react, motion_libs:[gsap]}', () => {
  const root = mkroot('shadcn-vite-gsap');
  writePkg(root, {
    deps: { react: '^18.2.0', 'react-dom': '^18.2.0', gsap: '^3.12.0' },
    devDeps: { vite: '^5.0.0', tailwindcss: '^3.4.0' },
  });
  // shadcn's canonical signal: components.json (+ it also ships tailwind, which must LOSE to shadcn).
  writeFile(root, 'components.json', JSON.stringify({ style: 'default', tailwind: {} }));
  writeFile(root, 'vite.config.ts', 'export default {};');
  writeFile(root, 'src/lib/utils.ts', 'export function cn(...a){return a.join(" ");}');

  const res = detectStack(root);
  assert.equal(res.ds, 'shadcn', 'shadcn wins over the tailwind it ships on top of');
  assert.equal(res.framework, 'vite-react');
  assert.deepEqual(res.motion_libs, ['gsap']);
  assert.match(res.evidence.ds, /components\.json/);
});

test('54-01: vanilla-extract + remix + motion-one -> {ds:vanilla-extract, framework:remix, motion_libs:[motion-one]}', () => {
  const root = mkroot('ve-remix-motionone');
  writePkg(root, {
    deps: {
      '@remix-run/react': '^2.0.0',
      '@remix-run/node': '^2.0.0',
      '@vanilla-extract/css': '^1.14.0',
      '@motionone/dom': '^10.18.0',
    },
  });

  const res = detectStack(root);
  assert.equal(res.ds, 'vanilla-extract');
  assert.equal(res.framework, 'remix');
  assert.deepEqual(res.motion_libs, ['motion-one']);
  assert.match(res.evidence.framework, /@remix-run/);
});

// ---------------------------------------------------------------------------
// 54-01: bare HTML — no package.json, no config — everything null/empty (never throws).
// ---------------------------------------------------------------------------

test('54-01: bare-html (no package.json) -> all null / empty, with an explanatory note', () => {
  const root = mkroot('bare-html');
  writeFile(root, 'index.html', '<!doctype html><html><body><h1>hi</h1></body></html>');
  writeFile(root, 'styles.css', 'body { margin: 0; }'); // plain CSS, no @theme, not a *.module.css

  const res = detectStack(root);
  assert.equal(res.ds, null);
  assert.equal(res.framework, null);
  assert.deepEqual(res.motion_libs, []);
  assert.match(res.evidence.note, /no package\.json/);
});

test('54-01: a non-existent root never throws and reports the missing path', () => {
  const ghost = path.join(os.tmpdir(), 'gdd-p54-does-not-exist-' + Date.now());
  const res = detectStack(ghost);
  assert.equal(res.ds, null);
  assert.equal(res.framework, null);
  assert.deepEqual(res.motion_libs, []);
  assert.match(res.evidence.note, /does not exist/);
});

test('54-01: a malformed package.json never throws and falls back to file-pattern probes', () => {
  const root = mkroot('garbage-pkg');
  writeFile(root, 'package.json', '{ this is : not valid json ,,, }');
  // Provide a config-file signal so the fallback path is shown to still work.
  writeFile(root, 'tailwind.config.js', 'module.exports = {};');

  const res = detectStack(root);
  // The deps reader could not parse, but the config-file probe still finds tailwind.
  assert.equal(res.ds, 'tailwind');
  assert.match(res.evidence.note, /not valid JSON/);
});

// ---------------------------------------------------------------------------
// 54-01: storybook detection (a framework distinct from the host SPA bundler).
// ---------------------------------------------------------------------------

test('54-01: storybook detection via @storybook/* devDependency', () => {
  const root = mkroot('storybook');
  writePkg(root, {
    deps: { react: '^18.2.0', 'react-dom': '^18.2.0' },
    devDeps: { storybook: '^8.0.0', '@storybook/react-vite': '^8.0.0' },
  });
  const res = detectStack(root);
  assert.equal(res.framework, 'storybook');
  assert.match(res.evidence.framework, /storybook/);
});

// ---------------------------------------------------------------------------
// 54-01: MULTIPLE motion libs coexist (framer-motion + gsap + react-spring).
// ---------------------------------------------------------------------------

test('54-01: multiple motion libs are all surfaced (framer-motion + gsap + react-spring)', () => {
  const root = mkroot('multi-motion');
  writePkg(root, {
    deps: {
      'framer-motion': '^11.0.0',
      gsap: '^3.12.0',
      '@react-spring/web': '^9.7.0',
    },
  });
  const res = detectStack(root);
  // Order is the deterministic probe order: framer-motion, gsap, motion-one, react-spring.
  assert.deepEqual(res.motion_libs, ['framer-motion', 'gsap', 'react-spring']);
  assert.equal(res.evidence.motion.length, 3);
});

// ---------------------------------------------------------------------------
// 54-01: detection-priority + trust-source edge cases (lock the R1 contract).
// ---------------------------------------------------------------------------

test('54-01: devDependencies count the same as dependencies (ANY-presence trust)', () => {
  const root = mkroot('devdep-trust');
  writePkg(root, { devDeps: { '@mui/material': '^6.0.0' } });
  const res = detectStack(root);
  assert.equal(res.ds, 'mui', 'a devDependency alone is sufficient evidence');
});

test('54-01: explicit DS dep beats a weaker file-pattern (tailwind dep over a stray *.module.css)', () => {
  const root = mkroot('priority-dep-over-pattern');
  writePkg(root, { deps: { tailwindcss: '^3.4.0' } });
  writeFile(root, 'src/legacy.module.css', '.x{}'); // css-modules file pattern present too
  const res = detectStack(root);
  assert.equal(res.ds, 'tailwind', 'explicit tailwind dep wins over the css-modules file pattern');
});

test('54-01: css-modules is detected only as a last-resort file pattern', () => {
  const root = mkroot('css-modules-only');
  writePkg(root, { deps: { react: '^18.2.0' } }); // no DS dep at all
  writeFile(root, 'src/button.module.css', '.btn{}');
  const res = detectStack(root);
  assert.equal(res.ds, 'css-modules');
  assert.match(res.evidence.ds, /module\.css/);
});

test('54-01: tailwind v4 @theme directive (no dep, no config) is detected from CSS content', () => {
  const root = mkroot('tw-v4-theme');
  // No tailwindcss dep, no tailwind.config — only the v4 @theme CSS directive.
  writePkg(root, { deps: { react: '^19.0.0' } });
  writeFile(root, 'src/app.css', '@import "tailwindcss";\n@theme {\n  --color-brand: #1a2b3c;\n}');
  const res = detectStack(root);
  assert.equal(res.ds, 'tailwind');
  assert.match(res.evidence.ds, /@theme/);
});

test('54-01: vite-react is the SPA fallback only when no higher framework outranks it', () => {
  const root = mkroot('next-outranks-vite');
  // Both next AND vite present -> next must win (it outranks the vite-react fallback).
  writePkg(root, {
    deps: { next: '^15.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
    devDeps: { vite: '^5.0.0' },
  });
  mkdir(root, 'pages'); // pages-router signal
  const res = detectStack(root);
  assert.equal(res.framework, 'nextjs', 'next outranks the vite-react fallback');
  assert.match(res.evidence.framework, /pages-router/);
});

test('54-01: SKIP_DIRS are honored — decoy markers inside node_modules are ignored', () => {
  const root = mkroot('skipdirs');
  writePkg(root, { deps: { react: '^18.2.0' } }); // no DS / framework at the real root
  // Plant decoys that would FALSELY trigger if the walk descended into node_modules.
  writeFile(root, 'node_modules/some-pkg/styles.css.ts', 'export const x = 1;'); // would look like vanilla-extract
  writeFile(root, 'node_modules/some-pkg/x.module.css', '.y{}');                 // would look like css-modules
  const res = detectStack(root);
  assert.equal(res.ds, null, 'file-pattern probes never descend into node_modules (engine SKIP_DIRS)');
  assert.equal(res.framework, null);
});

test('54-01: detectStack is deterministic — identical fixture yields identical output across runs', () => {
  const root = mkroot('determinism');
  writePkg(root, {
    deps: { next: '^15.0.0', react: '^19.0.0', 'framer-motion': '^11.0.0', gsap: '^3.12.0' },
    devDeps: { tailwindcss: '^3.4.0' },
  });
  mkdir(root, 'app');
  const a = detectStack(root);
  const b = detectStack(root);
  assert.deepEqual(a, b, 'output is byte-identical across repeated runs (pure over the FS snapshot)');
});

// ---------------------------------------------------------------------------
// 54-01: CLI smoke — main(argv, io) prints JSON and exits 0.
// ---------------------------------------------------------------------------

test('54-01: CLI main() prints JSON of the detected stack and exits 0', () => {
  const root = mkroot('cli');
  writePkg(root, { deps: { astro: '^4.0.0' } });
  let out = '';
  const code = stack.main([root, '--json'], { log: (s) => { out += s; } });
  assert.equal(code, 0);
  const parsed = JSON.parse(out);
  assert.equal(parsed.framework, 'astro');
  assert.deepEqual(Object.keys(parsed).sort(), ['ds', 'evidence', 'framework', 'motion_libs']);
});
