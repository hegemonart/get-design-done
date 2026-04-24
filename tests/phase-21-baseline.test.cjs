'use strict';
// tests/phase-21-baseline.test.cjs
// ---------------------------------------------------------------------------
// Plan 21-12, Task 5 — Phase 21 regression baseline.
//
// Complements tests/regression-baseline-phase-20.test.cjs. Captures the
// post-Phase-21 state (modules, CLI, cross-harness entry points) and
// asserts future commits don't silently delete or rename any of it.
//
// Baselines live at test-fixture/baselines/phase-21/ and are locked by
// Task 4 of the same plan. See that directory for snapshot contents.
//
// Philosophy: existence-gates + subcommand-surface assertions — not
// exact equality — so editors can add files under scripts/lib/**
// without breaking the test. Drift that removes a file still fails.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { REPO_ROOT } = require('./helpers.ts');

const BASELINE_DIR = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-21');

function readLines(filename) {
  return fs
    .readFileSync(path.join(BASELINE_DIR, filename), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// 1. directory-list — every baseline file path is a subset of the current tree.
//    Files can be added; files cannot be silently removed.

test('phase-21 baseline: every directory-list entry exists in the repo', () => {
  const entries = readLines('directory-list.txt');
  assert.ok(entries.length > 0, 'directory-list.txt is empty');

  const missing = [];
  for (const rel of entries) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) missing.push(rel);
  }
  assert.deepEqual(
    missing,
    [],
    `phase-21 baseline drift: ${missing.length} file(s) listed in ` +
      `directory-list.txt no longer exist. Either restore them or ` +
      `re-lock the baseline. Missing:\n  - ${missing.join('\n  - ')}`,
  );
});

// ---------------------------------------------------------------------------
// 2. module-list — every Phase-21 module path (directory or file) exists.
//    Protects against accidental deletion of core runner modules.

test('phase-21 baseline: every Phase-21 module path exists', () => {
  const modules = readLines('module-list.txt');
  assert.ok(modules.length > 0, 'module-list.txt is empty');

  const missing = [];
  for (const mod of modules) {
    const abs = path.join(REPO_ROOT, mod);
    if (!fs.existsSync(abs)) missing.push(mod);
  }
  assert.deepEqual(
    missing,
    [],
    `phase-21 module drift: ${missing.length} core runner module(s) missing ` +
      `from disk. Phase-21 shipped these as the headless SDK foundation; ` +
      `deleting one without re-locking the baseline fails CI.\n  - ` +
      missing.join('\n  - '),
  );
});

// ---------------------------------------------------------------------------
// 3. cli-subcommands — `gdd-sdk -h` output surfaces every expected subcommand.

test('phase-21 baseline: gdd-sdk -h lists every baseline subcommand', () => {
  const subcommands = readLines('cli-subcommands.txt');
  assert.ok(subcommands.length > 0, 'cli-subcommands.txt is empty');

  const entry = path.join(REPO_ROOT, 'scripts', 'lib', 'cli', 'index.ts');
  let help;
  try {
    help = execSync(
      `node --experimental-strip-types "${entry}" -h`,
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (err) {
    // `-h` is a valid invocation and should exit 0; if the subprocess errored
    // we still capture stdout for the assertion but re-raise if there is no
    // help text at all.
    help = (err.stdout && err.stdout.toString()) || '';
    if (!help) throw err;
  }

  const missing = subcommands.filter((cmd) => !help.includes(cmd));
  assert.deepEqual(
    missing,
    [],
    `gdd-sdk -h output missing subcommand(s): ${missing.join(', ')}\n\n` +
      `Full help text:\n${help}`,
  );
});

// ---------------------------------------------------------------------------
// 4. cross-harness entry points — the four files that enable Codex + Gemini
//    portability must exist. These are the minimal contract: remove any one
//    and a non-Claude harness breaks silently.

test('phase-21 baseline: cross-harness entry points exist', () => {
  const files = [
    'AGENTS.md',
    'GEMINI.md',
    'reference/codex-tools.md',
    'reference/gemini-tools.md',
  ];

  const missing = [];
  for (const rel of files) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) missing.push(rel);
  }
  assert.deepEqual(
    missing,
    [],
    `cross-harness contract broken: ${missing.length} required file(s) ` +
      `missing. The plugin claims Codex + Gemini portability in ` +
      `CHANGELOG v1.21.0; removing any of these files regresses that ` +
      `claim.\n  - ${missing.join('\n  - ')}`,
  );
});
