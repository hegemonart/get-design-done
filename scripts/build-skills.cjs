'use strict';
// Phase 42 — multi-harness skill build orchestrator.
//   node scripts/build-skills.cjs [--harness <id>] [--check] [--zip]
//
// Reads source/skills/**/*.md, applies the pure factory per harness config, and writes:
//   - skills/**                            (the committed Claude-Code surface, regenerated in place)
//   - dist/<bundleSlug>/<configDir>/skills/**  (per-harness bundles; only dist/claude-code/ is committed/shipped)
//
// --check : no writes; verify the committed surfaces (skills/ + dist/claude-code/) equal the freshly
//           compiled output, exit 1 on any byte drift. This is the CI drift gate.
// --harness <id> : restrict to one harness (skips the skills/ in-place regen unless id === claude).
// --zip   : after building, tar -czf dist/<bundleSlug>.tgz each bundle (graceful skip if tar absent).
//
// Idempotent + byte-stable: file walk is sorted; bytes are written verbatim (line endings preserved).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { compile } = require('./lib/build/factory.cjs');
const { CONFIGS, byId, claude } = require('./lib/build/harness-configs.cjs');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'source', 'skills');
const SKILLS = path.join(ROOT, 'skills');
const DIST = path.join(ROOT, 'dist');

function parseArgs(argv) {
  const out = { check: false, zip: false, harness: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') out.check = true;
    else if (a === '--zip') out.zip = true;
    else if (a === '--harness') out.harness = argv[++i];
    else if (a.startsWith('--harness=')) out.harness = a.slice('--harness='.length);
  }
  return out;
}

function walkMd(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMd(p));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/** Compile every source file for one config -> Map<relPath, string>. */
function compileAll(config) {
  const result = new Map();
  for (const abs of walkMd(SRC)) {
    const rel = path.relative(SRC, abs).split(path.sep).join('/');
    result.set(rel, compile(fs.readFileSync(abs, 'utf8'), config));
  }
  return result;
}

function writeMap(map, destRoot) {
  let written = 0;
  for (const [rel, text] of map) {
    const dst = path.join(destRoot, rel.split('/').join(path.sep));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, text);
    written++;
  }
  return written;
}

function bundleDir(config) {
  return path.join(DIST, config.bundleSlug, config.configDir, 'skills');
}

/** Compare a compiled map against on-disk files under destRoot. Returns array of drifting rel paths. */
function diffMap(map, destRoot) {
  const drift = [];
  for (const [rel, text] of map) {
    const dst = path.join(destRoot, rel.split('/').join(path.sep));
    let cur = null;
    try { cur = fs.readFileSync(dst, 'utf8'); } catch { /* missing */ }
    if (cur !== text) drift.push(rel);
  }
  return drift;
}

function runCheck() {
  const cfg = claude();
  const map = compileAll(cfg);
  const driftSkills = diffMap(map, SKILLS);
  // Polish v1.57.3: dist/claude-code/ removed as a byte-identical duplicate of skills/.
  // The committed Claude surface (skills/) is the only drift gate now; other harness
  // bundles remain build-only artifacts produced on demand.
  if (driftSkills.length) {
    process.stderr.write('build-skills --check: DRIFT detected (run `npm run build:skills` and commit).\n');
    for (const r of driftSkills.slice(0, 10)) process.stderr.write(`  skills/${r}\n`);
    if (driftSkills.length > 10) process.stderr.write('  ...\n');
    return 1;
  }
  process.stdout.write(`build-skills --check: OK - skills/ matches source/skills/ (${map.size} files).\n`);
  return 0;
}

function tarBundle(config) {
  const tgz = path.join(DIST, `${config.bundleSlug}.tgz`);
  const r = spawnSync('tar', ['-czf', tgz, '-C', DIST, config.bundleSlug], { stdio: 'ignore' });
  if (r.error || r.status !== 0) {
    process.stderr.write(`  (zip skipped for ${config.bundleSlug}: tar unavailable)\n`);
    return false;
  }
  return true;
}

function runBuild(opts) {
  const targets = opts.harness ? [byId(opts.harness)].filter(Boolean) : CONFIGS;
  if (opts.harness && targets.length === 0) {
    process.stderr.write(`build-skills: unknown harness '${opts.harness}'\n`);
    return 1;
  }
  let total = 0;
  for (const cfg of targets) {
    const map = compileAll(cfg);
    total += writeMap(map, bundleDir(cfg));
    if (cfg.id === 'claude') writeMap(map, SKILLS); // regenerate the committed Claude surface in place
    if (opts.zip) tarBundle(cfg);
    process.stdout.write(`  built ${cfg.bundleSlug} (${map.size} files)${cfg.id === 'claude' ? ' + skills/' : ''}\n`);
  }
  process.stdout.write(`build-skills: wrote ${total} files across ${targets.length} harness bundle(s).\n`);
  return 0;
}

function main(argv) {
  const opts = parseArgs(argv);
  return opts.check ? runCheck() : runBuild(opts);
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, parseArgs, compileAll, bundleDir };
