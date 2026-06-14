'use strict';
// Phase 54 — gdd stack fingerprint. Pure, dep-free. Reads a project root and emits the detected
// design-system / framework / motion libraries so the mapper-spawn composer (scripts/lib/mapper-spawn.cjs)
// can pull the matching reference addendums. Reuses the Phase 41 engine's walk() + SKIP_DIRS so the
// file-signature scans honor the same node_modules/.git/dist/... exclusions and never wander into
// vendored trees. Never touches the network or any optional dependency (SC#10 network-isolation
// scan stays clean), and NEVER throws — an absent / malformed package.json simply yields all-null
// with an `evidence` note explaining why.
//
//   detectStack(root) -> { ds: string|null, framework: string|null, motion_libs: string[], evidence: {ds?, framework?, motion?[]} }
//
// Detection trust (ROADMAP open-q default): ANY presence in `dependencies` OR `devDependencies`
// counts. Config files + import signatures are secondary probes that promote weaker file-pattern
// hits. Priority within a category (CONTEXT R1): explicit dep > config file > file-pattern.

const fs = require('node:fs');
const path = require('node:path');
const { walk, SKIP_DIRS } = require('./engine.cjs');

// ---------------------------------------------------------------------------
// package.json deps reader. Merges dependencies + devDependencies (+ peer/optional
// for completeness). Never throws: a missing file yields {}, a malformed JSON yields
// {} with the parse error surfaced to the caller via `readDeps().error`.
// ---------------------------------------------------------------------------

/**
 * Read + merge the dependency maps from a root package.json.
 * @param {string} root project directory (or a path to package.json directly)
 * @returns {{ deps: Record<string,string>, present: boolean, error: string|null }}
 */
function readDeps(root) {
  const pkgPath = path.basename(String(root || '')) === 'package.json'
    ? root
    : path.join(root || '.', 'package.json');
  let raw;
  try {
    raw = fs.readFileSync(pkgPath, 'utf8');
  } catch {
    return { deps: {}, present: false, error: null }; // absent package.json is a normal case
  }
  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch (e) {
    return { deps: {}, present: true, error: 'package.json is not valid JSON' + (e && e.message ? `: ${e.message}` : '') };
  }
  if (!pkg || typeof pkg !== 'object') {
    return { deps: {}, present: true, error: 'package.json did not parse to an object' };
  }
  const deps = {};
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const m = pkg[field];
    if (m && typeof m === 'object' && !Array.isArray(m)) {
      for (const k of Object.keys(m)) deps[k] = m[k];
    }
  }
  return { deps, present: true, error: null };
}

/** True if `name` (exact) is present in the merged dep map. */
function hasDep(deps, name) {
  return Object.prototype.hasOwnProperty.call(deps, name);
}

/** True if any dep name starts with `prefix` (scoped families, e.g. '@radix-ui/'). */
function hasDepPrefix(deps, prefix) {
  for (const k of Object.keys(deps)) {
    if (k === prefix || k.startsWith(prefix)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Filesystem probes. All are SKIP_DIRS-aware (top-level config checks bypass the
// walk; deep pattern scans go through engine.walk so vendored trees are excluded).
// Bounded: we stop scanning a category once we have a hit (first-match wins).
// ---------------------------------------------------------------------------

/** True if a top-level file matching one of `names` exists directly under root. */
function hasTopLevelFile(root, names) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return false; }
  const set = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
  for (const n of names) if (set.has(n)) return true;
  return false;
}

/** True if a top-level config file whose basename starts with `stem` + '.' exists (e.g. tailwind.config.*). */
function hasTopLevelConfig(root, stem) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return false; }
  const prefix = stem + '.';
  for (const e of entries) {
    if (e.isFile() && e.name.startsWith(prefix)) return true;
  }
  return false;
}

/** True if a top-level directory `name` exists directly under root (e.g. app/ vs pages/). */
function hasTopLevelDir(root, name) {
  try {
    const st = fs.statSync(path.join(root, name));
    return st.isDirectory();
  } catch { return false; }
}

/**
 * Scan walkable files for the first whose basename matches `re` (e.g. *.css.ts, *.module.css,
 * *.stories.*). Returns the project-relative path of the first match, or null. Bounded by walk()'s
 * SKIP_DIRS. We additionally cap at the first hit so this stays cheap on large trees.
 */
function findFileMatching(root, re) {
  let files;
  try { files = walk(root); } catch { return null; }
  for (const abs of files) {
    if (re.test(path.basename(abs))) return relish(root, abs);
  }
  return null;
}

/**
 * Scan walkable file *contents* for the first whose text matches `re` (an import / token signature
 * like `@theme` or `cn(`). Bounded by walk() + a per-file read-failure skip. Returns
 * { file, match } for the first hit or null.
 */
function findContentMatching(root, re, fileFilter) {
  let files;
  try { files = walk(root); } catch { return null; }
  for (const abs of files) {
    if (fileFilter && !fileFilter(abs)) continue;
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const m = re.exec(text);
    if (m) return { file: relish(root, abs), match: m[0] };
  }
  return null;
}

/** project-relative, forward-slashed path (stable across OSes for evidence strings). */
function relish(root, abs) {
  const rel = path.relative(root, abs);
  return (rel || abs).split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// Design-system detection. Priority: explicit dep > config file > file-pattern.
// Returns the STRONGEST single ds (one winner) + the evidence string for it.
// The probe order encodes the cross-system priority (tailwind/shadcn first since
// they are the most common + have the strongest signals; the rest follow).
// ---------------------------------------------------------------------------

const DS_PROBES = [
  {
    id: 'shadcn',
    // shadcn is a tailwind super-set: detect it FIRST so a shadcn project (which also
    // ships tailwind) is labeled shadcn rather than the more generic tailwind.
    detect(root, deps) {
      const hasComponentsJson = hasTopLevelFile(root, ['components.json']);
      // lib/utils.ts `cn(` is shadcn's canonical helper signature.
      const cnHit = hasComponentsJson
        ? null
        : findContentMatching(root, /\bcn\s*\(/, (abs) => /utils\.(t|j)sx?$/.test(abs.split(path.sep).join('/')));
      if (hasComponentsJson) return { ev: 'components.json present (shadcn/ui)' };
      if (cnHit) return { ev: `cn() helper in ${cnHit.file} (shadcn/ui)` };
      return null;
    },
  },
  {
    id: 'tailwind',
    detect(root, deps) {
      if (hasDep(deps, 'tailwindcss')) return { ev: 'tailwindcss in dependencies' };
      if (hasTopLevelConfig(root, 'tailwind.config')) return { ev: 'tailwind.config.* present' };
      const themeHit = findContentMatching(root, /@theme\b/, (abs) => /\.css$/.test(abs));
      if (themeHit) return { ev: `@theme directive in ${themeHit.file} (tailwind v4)` };
      return null;
    },
  },
  {
    id: 'radix-themes',
    detect(root, deps) {
      if (hasDep(deps, '@radix-ui/themes')) return { ev: '@radix-ui/themes in dependencies' };
      return null;
    },
  },
  {
    id: 'mui',
    detect(root, deps) {
      if (hasDep(deps, '@mui/material')) return { ev: '@mui/material in dependencies' };
      return null;
    },
  },
  {
    id: 'chakra',
    detect(root, deps) {
      if (hasDep(deps, '@chakra-ui/react')) return { ev: '@chakra-ui/react in dependencies' };
      return null;
    },
  },
  {
    id: 'vanilla-extract',
    detect(root, deps) {
      if (hasDep(deps, '@vanilla-extract/css')) return { ev: '@vanilla-extract/css in dependencies' };
      const cssTs = findFileMatching(root, /\.css\.ts$/);
      if (cssTs) return { ev: `*.css.ts file ${cssTs} (vanilla-extract)` };
      return null;
    },
  },
  {
    id: 'styled-components',
    detect(root, deps) {
      if (hasDep(deps, 'styled-components')) return { ev: 'styled-components in dependencies' };
      return null;
    },
  },
  {
    id: 'css-modules',
    // Weakest signal (a plain file pattern, no dep). Last so any explicit DS wins over it.
    detect(root, deps) {
      const mod = findFileMatching(root, /\.module\.css$/);
      if (mod) return { ev: `*.module.css file ${mod} (CSS Modules)` };
      return null;
    },
  },
];

function detectDs(root, deps) {
  for (const probe of DS_PROBES) {
    let res = null;
    try { res = probe.detect(root, deps); } catch { res = null; }
    if (res) return { ds: probe.id, evidence: res.ev };
  }
  return { ds: null, evidence: 'no design-system signal (no known DS dep, config file, or file pattern)' };
}

// ---------------------------------------------------------------------------
// Framework detection. Single winner. Priority: explicit dep > config file. Next
// vs Remix vs Vite-React are disambiguated by their unique deps; vite-react is the
// fallback only when vite+react are present WITHOUT a higher-level framework.
// ---------------------------------------------------------------------------

function detectFramework(root, deps) {
  // Next.js: `next` dep. app/ vs pages/ noted as router-style evidence (does not change the label).
  if (hasDep(deps, 'next')) {
    const router = hasTopLevelDir(root, 'app') ? 'app-router'
      : hasTopLevelDir(root, 'pages') ? 'pages-router'
      : (hasTopLevelDir(root, 'src') && hasTopLevelDir(path.join(root, 'src'), 'app')) ? 'app-router (src/)'
      : 'router undetermined';
    return { framework: 'nextjs', evidence: `next in dependencies (${router})` };
  }
  // Remix: the @remix-run/* family (run/react, run/node, run/dev, ...).
  if (hasDepPrefix(deps, '@remix-run/')) {
    return { framework: 'remix', evidence: '@remix-run/* in dependencies' };
  }
  // Astro.
  if (hasDep(deps, 'astro') || hasTopLevelConfig(root, 'astro.config')) {
    return { framework: 'astro', evidence: hasDep(deps, 'astro') ? 'astro in dependencies' : 'astro.config.* present' };
  }
  // SvelteKit.
  if (hasDep(deps, '@sveltejs/kit') || hasTopLevelConfig(root, 'svelte.config')) {
    return {
      framework: 'sveltekit',
      evidence: hasDep(deps, '@sveltejs/kit') ? '@sveltejs/kit in dependencies' : 'svelte.config.* present',
    };
  }
  // Storybook: the `storybook` package or any @storybook/* addon/framework.
  if (hasDep(deps, 'storybook') || hasDepPrefix(deps, '@storybook/')) {
    return { framework: 'storybook', evidence: 'storybook / @storybook/* in dependencies' };
  }
  // Vite + React, with no higher-level framework above -> the SPA fallback.
  if ((hasDep(deps, 'vite') || hasTopLevelConfig(root, 'vite.config')) && (hasDep(deps, 'react') || hasDep(deps, 'react-dom'))) {
    return { framework: 'vite-react', evidence: 'vite + react in dependencies (no next/remix/astro/sveltekit)' };
  }
  return { framework: null, evidence: 'no framework signal (no next/remix/vite-react/astro/sveltekit/storybook)' };
}

// ---------------------------------------------------------------------------
// Motion library detection. MULTIPLE allowed (a project can use framer-motion +
// gsap). All driven by deps. Note: the bare `motion` package is shared by
// framer-motion (its new name) and motion-one (its umbrella). We attribute a bare
// `motion` dep to framer-motion (the dominant React usage) and ALSO surface
// motion-one only when an explicit @motionone/* scope is present, so the two never
// silently collide.
// ---------------------------------------------------------------------------

const MOTION_PROBES = [
  {
    id: 'framer-motion',
    detect(deps) {
      if (hasDep(deps, 'framer-motion')) return 'framer-motion in dependencies';
      if (hasDep(deps, 'motion')) return 'motion in dependencies (framer-motion v11+)';
      return null;
    },
  },
  {
    id: 'gsap',
    detect(deps) {
      if (hasDep(deps, 'gsap')) return 'gsap in dependencies';
      return null;
    },
  },
  {
    id: 'motion-one',
    detect(deps) {
      if (hasDepPrefix(deps, '@motionone/')) return '@motionone/* in dependencies';
      // Bare `motion` already attributed to framer-motion above; only the scoped
      // @motionone/* packages uniquely identify Motion One.
      return null;
    },
  },
  {
    id: 'react-spring',
    detect(deps) {
      if (hasDep(deps, 'react-spring') || hasDepPrefix(deps, '@react-spring/')) return 'react-spring / @react-spring/* in dependencies';
      return null;
    },
  },
];

function detectMotion(deps) {
  const libs = [];
  const evidence = [];
  for (const probe of MOTION_PROBES) {
    let ev = null;
    try { ev = probe.detect(deps); } catch { ev = null; }
    if (ev) { libs.push(probe.id); evidence.push(`${probe.id}: ${ev}`); }
  }
  return { motion_libs: libs, evidence };
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * Detect the design-system / framework / motion stack of a project.
 * @param {string} root project directory (defaults to cwd)
 * @returns {{ ds: string|null, framework: string|null, motion_libs: string[], evidence: { ds?: string, framework?: string, motion?: string[], note?: string } }}
 */
function detectStack(root) {
  const dir = root || process.cwd();
  const evidence = {};

  let exists = false;
  try { exists = fs.existsSync(dir); } catch { exists = false; }
  if (!exists) {
    return {
      ds: null,
      framework: null,
      motion_libs: [],
      evidence: { note: `root path does not exist: ${dir}` },
    };
  }

  const { deps, present, error } = readDeps(dir);
  if (!present) evidence.note = 'no package.json at root — relying on config-file + file-pattern probes only';
  else if (error) evidence.note = `${error} — relying on config-file + file-pattern probes only`;

  let ds = null;
  let framework = null;
  let motion_libs = [];
  try {
    const dsr = detectDs(dir, deps);
    ds = dsr.ds;
    evidence.ds = dsr.evidence;
  } catch (e) { evidence.ds = 'ds detection error: ' + (e && e.message ? e.message : String(e)); }
  try {
    const fwr = detectFramework(dir, deps);
    framework = fwr.framework;
    evidence.framework = fwr.evidence;
  } catch (e) { evidence.framework = 'framework detection error: ' + (e && e.message ? e.message : String(e)); }
  try {
    const mr = detectMotion(deps);
    motion_libs = mr.motion_libs;
    evidence.motion = mr.evidence;
  } catch (e) { evidence.motion = ['motion detection error: ' + (e && e.message ? e.message : String(e))]; }

  return { ds, framework, motion_libs, evidence };
}

// ---------------------------------------------------------------------------
// CLI. `hone-detect-stack <root> [--json]` — prints the fingerprint. JSON by default
// for machine consumption (mapper-spawn / health-mirror); --pretty for a human read.
// Exit codes: 0 always (detection is non-judgmental — absence is not an error).
// ---------------------------------------------------------------------------

const HELP = `gdd stack detection — fingerprint a project's design-system / framework / motion stack.

Usage:
  detect-stack [root] [options]

Arguments:
  [root]            Project directory to scan (defaults to the current directory).

Options:
  --json            Machine-readable JSON (default).
  --pretty          Pretty-printed human summary.
  -h, --help        This help.

Always exits 0 — an undetected stack is reported, not an error.`;

function parseArgs(argv) {
  const opts = { root: null, json: true, pretty: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--pretty') { opts.pretty = true; opts.json = false; }
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (!a.startsWith('-') && opts.root === null) opts.root = a;
  }
  return opts;
}

function renderPretty(res) {
  const lines = [];
  lines.push('gdd stack:');
  lines.push(`  design-system : ${res.ds || '(none detected)'}`);
  lines.push(`  framework     : ${res.framework || '(none detected)'}`);
  lines.push(`  motion        : ${res.motion_libs.length ? res.motion_libs.join(', ') : '(none detected)'}`);
  if (res.evidence && res.evidence.note) lines.push(`  note          : ${res.evidence.note}`);
  return lines.join('\n');
}

/**
 * @param {string[]} argv  process.argv.slice(2)
 * @param {{ cwd?: string, log?: fn, err?: fn }} [io]  injectable for tests
 * @returns {number} exit code (always 0 unless --help on no args)
 */
function main(argv, io) {
  const o = io || {};
  const log = o.log || ((s) => process.stdout.write(s + '\n'));
  const opts = parseArgs(argv);
  if (opts.help) { log(HELP); return 0; }
  const root = opts.root || o.cwd || process.cwd();
  const res = detectStack(root);
  if (opts.pretty) log(renderPretty(res));
  else log(JSON.stringify(res, null, 2));
  return 0;
}

module.exports = {
  detectStack,
  main,
  // internals exported for unit reuse / introspection (kept stable for executors B & F).
  readDeps,
  hasDep,
  hasDepPrefix,
  detectDs,
  detectFramework,
  detectMotion,
  parseArgs,
  HELP,
  SKIP_DIRS,
};

if (require.main === module) process.exit(main(process.argv.slice(2)));
