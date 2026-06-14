'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'scripts', 'skill-templates');
const SKILLS = path.join(ROOT, 'skills');
// Polish v1.57.3: dist/claude-code/ removed as a byte-identical duplicate of skills/.
// The bundle is now a build-only artifact; the npm tarball ships skills/ directly.

const orch = require('../../scripts/build-skills.cjs');
const { compile } = require('../../scripts/lib/build/factory.cjs');
const { claude, byId } = require('../../scripts/lib/build/harness-configs.cjs');

function walkMd(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMd(p));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

test('42-build-01: orchestrator exposes main/parseArgs/compileAll/bundleDir', () => {
  for (const k of ['main', 'parseArgs', 'compileAll', 'bundleDir']) assert.equal(typeof orch[k], 'function', k);
});

test('42-build-02: parseArgs handles --check / --harness / --zip', () => {
  assert.deepEqual(orch.parseArgs(['--check']), { check: true, zip: false, harness: null });
  assert.deepEqual(orch.parseArgs(['--harness', 'codex', '--zip']), { check: false, zip: true, harness: 'codex' });
  assert.deepEqual(orch.parseArgs(['--harness=gemini']), { check: false, zip: false, harness: 'gemini' });
});

test('42-build-03: --check (drift gate) passes on the committed tree, no writes', () => {
  const code = orch.main(['--check']);
  assert.equal(code, 0, 'committed skills/ + dist/claude-code/ must match scripts/skill-templates/');
});

test('42-build-04: Claude compile reproduces skills/ byte-for-byte (118 files)', () => {
  const cfg = claude();
  const files = walkMd(SRC);
  assert.equal(files.length, 118);
  for (const abs of files) {
    const rel = path.relative(SRC, abs);
    const got = compile(fs.readFileSync(abs, 'utf8'), cfg);
    const want = fs.readFileSync(path.join(SKILLS, rel), 'utf8');
    assert.equal(got, want, `drift in ${rel}`);
  }
});

test('42-build-05: compileAll is deterministic / byte-stable', () => {
  const a = orch.compileAll(claude());
  const b = orch.compileAll(claude());
  assert.deepEqual([...a.entries()].sort(), [...b.entries()].sort());
});

test('42-build-06: dist/claude-code/ is NOT committed (polish v1.57.3 removed the duplicate)', () => {
  // Polish v1.57.3: dist/claude-code/ was a byte-identical mirror of skills/
  // (Claude Code reads ./skills/ via package.json#skills, making the bundle
  // pure duplication). Removed to drop ~120 files from the npm tarball.
  // The directory may exist locally as a build artifact (gitignored), but
  // package.json#files must not include it and it must not be git-tracked.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(
    !pkg.files.includes('dist/claude-code/'),
    'package.json#files must not include dist/claude-code/ (removed in polish v1.57.3)',
  );
  const tracked = spawnSync('git', ['ls-files', 'dist/claude-code/'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(
    (tracked.stdout || '').trim(),
    '',
    'dist/claude-code/ must not be git-tracked (added to .gitignore in polish v1.57.3)',
  );
});

test('42-build-07: codex compile substitutes the flat /hone- prefix (multi-harness proof)', () => {
  const cfg = byId('codex');
  // pick a source file that uses {{command_prefix}}
  const sample = walkMd(SRC).find((f) => fs.readFileSync(f, 'utf8').includes('{{command_prefix}}'));
  assert.ok(sample, 'expected a source file using {{command_prefix}}');
  const out = compile(fs.readFileSync(sample, 'utf8'), cfg);
  assert.ok(out.includes('/hone-'), 'codex output must contain the flat /hone- prefix');
  assert.ok(!out.includes('{{command_prefix}}'), 'no unresolved placeholder');
});

test('42-build-08: SDK `hone-sdk build` routes correctly (exit codes)', () => {
  const cli = path.join(ROOT, 'sdk', 'cli', 'index.ts');
  const run = (args) => spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], { encoding: 'utf8' });
  assert.equal(run(['build', 'skills', '--check']).status, 0, 'build skills --check -> 0');
  assert.equal(run(['build']).status, 3, 'build (no target) -> 3');
  const help = run(['build', 'skills', '--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /hone-sdk build skills/);
});
