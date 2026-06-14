'use strict';

/**
 * tests/install-doctor-tier-2.test.cjs — Phase 28.8 Plan 28-8-X2.
 *
 * Tier-2 doctor aggregator fixture-driven test suite. Covers the
 * 4 scenarios per Plan 28-8-X2 §<action> Part B:
 *
 *   1. empty                   — no skills/, no .cursor-plugin/, no .codex-plugin/
 *   2. complete                — all 3 channels populated
 *   3. partial-codex-only      — only Codex Plugin manifest present
 *   4. summary-consistency     — summary line counts match per-channel verdicts
 *
 * Plus a 5th group: aggregator API surface guards (exports, throw safety,
 * sourceRoot resolution) — these are X2-specific contracts not covered
 * by B2's / C2's individual reporter tests.
 *
 * Per Phase 28.8 D-10: tmpdir-only — no live marketplace calls, no fs
 * writes to repo root, no `cursor`/`codex` CLI invocation. Every fixture
 * mkdtemp's a tmpdir, plants files, runs the aggregator, rmRfs the dir.
 *
 * Per Phase 28.7 D-13 (inherited): fixture roots must contain their own
 * package.json so findInstallSourceRoot walk-up anchors at tmpdir
 * (T-X2-06 mitigation). The aggregator accepts an explicit `sourceRoot`
 * parameter (no implicit findInstallSourceRoot call) but we plant
 * package.json anyway for forward-compat with future call sites that
 * might add a fallback walk-up.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  readTier2Status,
  formatTier2Section,
  summarizeTier2Status,
} = require('../../scripts/lib/install/doctor-tier2.cjs');

// ────────────────────────────────────────────────────────────────────────
// Fixture builder + cleanup
// ────────────────────────────────────────────────────────────────────────

function rmRf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch (_e) {
    /* swallow — tmpdir cleanup is best-effort */
  }
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

/**
 * Build a fixture tmpdir per Plan 28-8-X2 §<interfaces> §test-fixture-shape.
 *
 * @param {'empty'|'complete'|'partial-codex-only'} state
 * @returns {string}  absolute tmpdir path with sentinel package.json planted
 */
function makeTmpFixture(state) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-doctor-tier2-' + state + '-'));
  // Anchor walk-up at tmpdir (T-X2-06).
  writeJson(path.join(tmpDir, 'package.json'), {
    name: 'hone-doctor-tier2-test-' + state,
    version: '1.28.8',
  });

  if (state === 'complete' || state === 'partial-codex-only') {
    // Codex plugin manifest — valid C1 shape: name + version +
    // description + at least one of entrypoint/commands/skills.
    writeJson(path.join(tmpDir, '.codex-plugin', 'plugin.json'), {
      name: 'hone-doctor-tier2-test',
      version: '1.28.8',
      description: 'X2 doctor aggregator test fixture',
      skills: [],
    });
    // C2 verdict `ready-to-install` requires BOTH manifest valid AND
    // catalog present (.claude-plugin/marketplace.json, reused from Claude
    // Code per D-14). Plant a minimal catalog so the codex channel reaches
    // `ready-to-install`. Without this the verdict is
    // `manifest-only-not-ready` with `catalog absent` reason.
    writeJson(path.join(tmpDir, '.claude-plugin', 'marketplace.json'), {
      name: 'hone',
      plugins: [
        { name: 'hone-doctor-tier2-test', version: '1.28.8' },
      ],
    });
  }

  if (state === 'complete') {
    // Cursor manifest + state file — D-16 submitted-pending state.
    writeJson(path.join(tmpDir, '.cursor-plugin', 'plugin.json'), {
      name: 'hone-doctor-tier2-test',
      version: '1.28.8',
      description: 'X2 doctor aggregator test fixture',
      author: { name: 'hone-test-author' },
      keywords: ['gdd', 'test'],
    });
    writeJson(path.join(tmpDir, '.cursor-plugin', 'marketplace-state.json'), {
      status: 'submitted-pending',
      'submitted-at': '2026-05-19T12:00:00Z',
    });
    // agentskills.io lint pass — plant a single valid SKILL.md.
    writeText(
      path.join(tmpDir, 'skills', 'hone-tier2-fixture', 'SKILL.md'),
      '---\n' +
      'name: hone-tier2-fixture\n' +
      'description: minimal fixture for Plan 28-8-X2 doctor aggregator tests\n' +
      '---\n' +
      '# hone-tier2-fixture\n\n' +
      'Body content (lint-clean per Phase 28.5 contract).\n'
    );
  }

  return tmpDir;
}

// ────────────────────────────────────────────────────────────────────────
// Scenario 1 — empty state
// ────────────────────────────────────────────────────────────────────────

test('doctor tier-2: empty state — all 3 channels not configured', () => {
  const tmpDir = makeTmpFixture('empty');
  try {
    const status = readTier2Status({ sourceRoot: tmpDir });
    assert.equal(status.agentskillsIo.state, 'not-configured',
      'agentskills.io should be not-configured when skills/ absent');
    assert.equal(status.cursorMarketplace.state, 'not-configured',
      'cursor should be not-configured when .cursor-plugin/ absent');
    assert.equal(status.codexPlugin.state, 'not-configured',
      'codex should be not-configured when .codex-plugin/ absent');
    assert.equal(status.summary.readyCount, 0,
      'no channels ready in empty fixture');
    assert.equal(status.summary.totalChannels, 3);
    assert.match(status.summary.oneLineSummary, /tier-2 status: 0 of 3 channels ready/);

    const text = formatTier2Section(status);
    assert.match(text, /## Tier-2 Distribution Channels/);
    assert.match(text, /tier-2 status: 0 of 3 channels ready/);
    assert.match(text, /### agentskills\.io/);
    assert.match(text, /### Cursor Marketplace/);
    assert.match(text, /### Codex Plugin/);
    assert.doesNotMatch(text, /Error|EACCES|ENOENT/);
  } finally {
    rmRf(tmpDir);
  }
});

test('doctor tier-2: empty state — no exception thrown when all dirs absent', () => {
  const tmpDir = makeTmpFixture('empty');
  try {
    // Wrap in fn to assert .doesNotThrow.
    assert.doesNotThrow(
      () => readTier2Status({ sourceRoot: tmpDir }),
      'aggregator must handle missing skills/, .cursor-plugin/, .codex-plugin/ without throwing'
    );
    const status = readTier2Status({ sourceRoot: tmpDir });
    assert.doesNotThrow(
      () => formatTier2Section(status),
      'formatter must handle not-configured status without throwing'
    );
  } finally {
    rmRf(tmpDir);
  }
});

// ────────────────────────────────────────────────────────────────────────
// Scenario 2 — complete state
// ────────────────────────────────────────────────────────────────────────

test('doctor tier-2: complete state — all 3 channels populated', () => {
  const tmpDir = makeTmpFixture('complete');
  try {
    const status = readTier2Status({ sourceRoot: tmpDir });

    // agentskills.io: 1 PASS skill → state === 'pass'
    assert.equal(status.agentskillsIo.state, 'pass',
      'agentskills.io should be PASS with single valid SKILL.md fixture');
    assert.ok(status.agentskillsIo.counts, 'counts present when lint ran');
    assert.ok(status.agentskillsIo.counts.pass >= 1,
      'at least 1 PASS skill in complete fixture');
    assert.equal(status.agentskillsIo.counts.fail, 0,
      'no FAIL skills in complete fixture');

    // Cursor: state-file says submitted-pending
    assert.equal(status.cursorMarketplace.state, 'submitted-pending',
      'cursor should be submitted-pending per state file');
    assert.equal(status.cursorMarketplace.manifestPresent, true);
    assert.equal(status.cursorMarketplace.stateFilePresent, true);

    // Codex: valid manifest → ready-to-install
    assert.equal(status.codexPlugin.state, 'ready-to-install',
      'codex should be ready-to-install with valid plugin.json');
    assert.equal(status.codexPlugin.manifestPresent, true);
    assert.equal(status.codexPlugin.manifestValid, true);
    assert.equal(status.codexPlugin.simulatedInstallOk, true);

    // Summary — readyCount counts agentskills.io PASS + codex ready;
    // cursor is `submitted-pending` (NOT `approved-published`) so does
    // NOT count as ready per X2 mapping.
    assert.equal(status.summary.readyCount, 2,
      'agentskills.io PASS + codex ready = 2; cursor submitted-pending is NOT ready');

    const text = formatTier2Section(status);
    assert.match(text, /submitted-pending/);
    assert.match(text, /ready-to-install/);
    assert.match(text, /tier-2 status: 2 of 3 channels ready/);
  } finally {
    rmRf(tmpDir);
  }
});

// ────────────────────────────────────────────────────────────────────────
// Scenario 3 — partial state (codex only)
// ────────────────────────────────────────────────────────────────────────

test('doctor tier-2: partial state — only codex ready', () => {
  const tmpDir = makeTmpFixture('partial-codex-only');
  try {
    const status = readTier2Status({ sourceRoot: tmpDir });

    assert.equal(status.agentskillsIo.state, 'not-configured',
      'agentskills.io should be not-configured when skills/ absent');
    assert.equal(status.cursorMarketplace.state, 'not-configured',
      'cursor should be not-configured when .cursor-plugin/ absent');
    assert.equal(status.codexPlugin.state, 'ready-to-install',
      'codex should be ready-to-install with valid plugin.json present');

    assert.equal(status.summary.readyCount, 1,
      'only codex ready in partial-codex-only fixture');
    assert.match(status.summary.oneLineSummary, /tier-2 status: 1 of 3 channels ready/);
    // Confirm the summary mentions each channel by name.
    assert.match(status.summary.oneLineSummary, /codex/);
    assert.match(status.summary.oneLineSummary, /cursor/);
    assert.ok(status.summary.oneLineSummary.includes('agentskills.io'), 'summary mentions agentskills.io');
  } finally {
    rmRf(tmpDir);
  }
});

// ────────────────────────────────────────────────────────────────────────
// Scenario 4 — summary line consistency
// ────────────────────────────────────────────────────────────────────────

test('doctor tier-2: summary line counts match per-channel verdicts (all fixtures)', () => {
  for (const stateName of ['empty', 'complete', 'partial-codex-only']) {
    const tmpDir = makeTmpFixture(stateName);
    try {
      const status = readTier2Status({ sourceRoot: tmpDir });

      // Recompute readyCount from channels and assert summary matches.
      let expected = 0;
      if (status.agentskillsIo.state === 'pass') expected++;
      if (status.cursorMarketplace.state === 'approved-published') expected++;
      if (status.codexPlugin.state === 'ready-to-install') expected++;
      assert.equal(status.summary.readyCount, expected,
        `[${stateName}] readyCount mismatch with channel states`);

      // oneLineSummary must mention each channel name by substring.
      assert.match(status.summary.oneLineSummary, /codex/,
        `[${stateName}] summary mentions codex`);
      assert.match(status.summary.oneLineSummary, /cursor/,
        `[${stateName}] summary mentions cursor`);
      assert.ok(status.summary.oneLineSummary.includes('agentskills.io'),
        `[${stateName}] summary mentions agentskills.io`);

      // The numeric readyCount in summary text must match the field.
      const m = status.summary.oneLineSummary.match(/(\d+) of 3 channels ready/);
      assert.ok(m, `[${stateName}] summary text contains "N of 3 channels ready"`);
      assert.equal(parseInt(m[1], 10), status.summary.readyCount,
        `[${stateName}] summary text count matches readyCount field`);

      // summarizeTier2Status convenience export must return oneLineSummary.
      assert.equal(summarizeTier2Status(status), status.summary.oneLineSummary,
        `[${stateName}] summarizeTier2Status returns oneLineSummary verbatim`);
    } finally {
      rmRf(tmpDir);
    }
  }
});

// ────────────────────────────────────────────────────────────────────────
// Scenario 5 — module API surface + edge cases (X2-specific guards)
// ────────────────────────────────────────────────────────────────────────

test('doctor tier-2: module exports match the X2 contract', () => {
  // Pin the public API so future refactors don't silently break callers.
  const m = require('../../scripts/lib/install/doctor-tier2.cjs');
  assert.equal(typeof m.readTier2Status, 'function');
  assert.equal(typeof m.formatTier2Section, 'function');
  assert.equal(typeof m.summarizeTier2Status, 'function');
});

test('doctor tier-2: unresolved sourceRoot returns uniform not-configured (no throw)', () => {
  // T-X2-06: a sourceRoot pointing at a non-existent path should NOT crash
  // the aggregator — it should return a uniform not-configured status.
  const fakeRoot = path.join(os.tmpdir(), '__definitely_not_a_real_dir_28-8-X2__' + Date.now());
  assert.doesNotThrow(() => readTier2Status({ sourceRoot: fakeRoot }));
  const status = readTier2Status({ sourceRoot: fakeRoot });
  assert.equal(status.agentskillsIo.state, 'not-configured');
  assert.equal(status.cursorMarketplace.state, 'not-configured');
  assert.equal(status.codexPlugin.state, 'not-configured');
  assert.equal(status.summary.readyCount, 0);
});

test('doctor tier-2: malformed marketplace-state.json does NOT crash aggregator', () => {
  // T-X2-03 mitigation — B2 throws on malformed state-file; aggregator
  // catches and surfaces as not-configured with detail. This test guards
  // that contract.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-doctor-tier2-malformed-'));
  try {
    writeJson(path.join(tmpDir, 'package.json'), { name: 'x', version: '0.0.0' });
    writeJson(path.join(tmpDir, '.cursor-plugin', 'plugin.json'), {
      name: 'gdd', version: '1.28.8', description: 'x',
      author: { name: 'gdd' }, keywords: ['x'],
    });
    // Deliberately malformed state file — not JSON.
    writeText(
      path.join(tmpDir, '.cursor-plugin', 'marketplace-state.json'),
      '{ this is not valid json'
    );
    assert.doesNotThrow(
      () => readTier2Status({ sourceRoot: tmpDir }),
      'aggregator must catch B2 throws and surface as not-configured'
    );
    const status = readTier2Status({ sourceRoot: tmpDir });
    // The aggregator translates the malformed-state error into not-configured
    // (or surfaces some recoverable cursor state — either is acceptable so long
    // as the doctor does not crash).
    assert.notEqual(status.cursorMarketplace.state, undefined);
    assert.match(status.cursorMarketplace.detail, /error|invalid|parse|malformed/i);
  } finally {
    rmRf(tmpDir);
  }
});

test('doctor tier-2: install.cjs --doctor in empty tmpdir emits aggregated section', () => {
  // CLI smoke — confirm the aggregator is wired into runDoctor() and
  // that empty-tmpdir invocation emits the single aggregated Tier-2 section
  // with the 3 subsections per Plan 28-8-X2 §verification.
  const installCjs = path.resolve(__dirname, '../..', 'scripts', 'install.cjs');
  const tmpDir = makeTmpFixture('empty');
  try {
    const stdout = execFileSync(process.execPath, [installCjs, '--doctor'], {
      cwd: tmpDir,
      encoding: 'utf8',
    });
    assert.match(stdout, /## Tier-2 Distribution Channels/);
    assert.match(stdout, /tier-2 status: 0 of 3 channels ready/);
    assert.match(stdout, /### agentskills\.io/);
    assert.match(stdout, /### Cursor Marketplace/);
    assert.match(stdout, /### Codex Plugin/);
  } finally {
    rmRf(tmpDir);
  }
});
