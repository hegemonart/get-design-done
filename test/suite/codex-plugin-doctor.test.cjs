'use strict';

// Phase 28.8 Plan C2 — codex-plugin doctor reporter test suite.
//
// Phase 28.8 D-10: tmpdir-only — no live `codex` CLI invocation, no
// writes outside tmpdir, no access to `~/.codex/`. Every test reads
// from a fixture under tests/fixtures/codex-plugin-doctor/ or copies
// a fixture into a tmpdir mkdtemp'd root.
//
// Phase 28.8 D-03 / D-16: Codex is single-step. There is NO multi-step
// review-window state machine here — verdict is binary
// (ready-to-install | manifest-only-not-ready). The Cursor doctor
// (B2) carries the multi-step pattern; we deliberately stay simple.
//
// Phase 28.8 D-14: catalog `.claude-plugin/marketplace.json` is reused
// from Claude Code's marketplace; `reusedFromClaude` is always true
// whenever the catalog is present + parseable.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  checkCodexPlugin,
  computeCacheSimulationPath,
  renderCodexPluginSection,
  validateCodexManifest,
  MARKETPLACE_NAME,
  PLUGIN_NAME,
  MANIFEST_REL_PATH,
  CATALOG_REL_PATH,
} = require('../../scripts/lib/install/doctor-codex-plugin.cjs');

const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'codex-plugin-doctor');

function fixturePath(name) {
  return path.join(FIXTURE_ROOT, name);
}

function rmRf(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcP = path.join(src, entry.name);
    const destP = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcP, destP);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcP, destP);
    }
  }
}

// ---------------------------------------------------------------------------
// Fixture-driven scenario tests (one per fixture)
// ---------------------------------------------------------------------------

test('codex-plugin-doctor: manifest-valid → verdict ready-to-install', () => {
  const r = checkCodexPlugin(fixturePath('manifest-valid'));
  assert.equal(r.verdict, 'ready-to-install');
  assert.equal(r.manifest.present, true);
  assert.equal(r.manifest.valid, true);
  assert.equal(r.manifest.version, '1.28.8');
  assert.deepEqual(r.manifest.errors, []);
  assert.equal(r.catalog.present, true);
  assert.equal(r.catalog.referencesCodexPlugin, true);
  assert.equal(r.catalog.reusedFromClaude, true);
  assert.deepEqual(r.verdictReasons, []);
});

test('codex-plugin-doctor: manifest-invalid-schema → verdict manifest-only-not-ready (schema invalid)', () => {
  const r = checkCodexPlugin(fixturePath('manifest-invalid-schema'));
  assert.equal(r.verdict, 'manifest-only-not-ready');
  assert.equal(r.manifest.present, true);
  assert.equal(r.manifest.valid, false);
  assert.ok(r.manifest.errors.length > 0);
  // The invalid-schema fixture uses "Get_Design_Done" — non-kebab-case name.
  assert.match(r.manifest.errors.join('\n'), /name|kebab-case/i);
  assert.ok(
    r.verdictReasons.some((reason) => /schema invalid/i.test(reason)),
    'verdictReasons should mention schema invalid'
  );
});

test('codex-plugin-doctor: manifest-missing-required → verdict manifest-only-not-ready (missing version)', () => {
  const r = checkCodexPlugin(fixturePath('manifest-missing-required'));
  assert.equal(r.verdict, 'manifest-only-not-ready');
  assert.equal(r.manifest.present, true);
  assert.equal(r.manifest.valid, false);
  assert.equal(r.manifest.version, null);
  assert.match(r.manifest.errors.join('\n'), /version/);
  assert.ok(
    r.verdictReasons.some((reason) => /schema invalid/i.test(reason)),
    'verdictReasons should mention schema invalid'
  );
});

test('codex-plugin-doctor: manifest-version-mismatch → semver-valid manifest → verdict ready-to-install', () => {
  // 9.9.9 is semver-shaped, so manifest is schema-valid; version vs
  // package.json mismatch is informational (not surfaced as a schema error
  // per plan task 2 behavior spec).
  const r = checkCodexPlugin(fixturePath('manifest-version-mismatch'));
  assert.equal(r.manifest.present, true);
  assert.equal(r.manifest.valid, true);
  assert.equal(r.manifest.version, '9.9.9');
  assert.equal(r.catalog.present, true);
  assert.equal(r.verdict, 'ready-to-install');
});

test('codex-plugin-doctor: no-manifest → verdict manifest-only-not-ready (both manifest + catalog absent)', () => {
  const r = checkCodexPlugin(fixturePath('no-manifest'));
  assert.equal(r.verdict, 'manifest-only-not-ready');
  assert.equal(r.manifest.present, false);
  assert.equal(r.manifest.valid, null);
  assert.equal(r.manifest.version, null);
  assert.equal(r.catalog.present, false);
  assert.equal(r.catalog.reusedFromClaude, false);
  assert.ok(r.verdictReasons.includes('manifest absent'),
    'verdictReasons should include "manifest absent"');
  assert.ok(r.verdictReasons.includes('catalog absent'),
    'verdictReasons should include "catalog absent"');
});

test('codex-plugin-doctor: no-catalog → verdict manifest-only-not-ready (manifest valid but no catalog)', () => {
  const r = checkCodexPlugin(fixturePath('no-catalog'));
  assert.equal(r.verdict, 'manifest-only-not-ready');
  assert.equal(r.manifest.present, true);
  assert.equal(r.manifest.valid, true);
  assert.equal(r.catalog.present, false);
  assert.ok(r.verdictReasons.includes('catalog absent'),
    'verdictReasons should include "catalog absent"');
  // manifest-related reasons should NOT appear
  assert.ok(!r.verdictReasons.some((reason) => /manifest/.test(reason)),
    'no manifest-related verdictReasons when manifest is valid');
});

// ---------------------------------------------------------------------------
// renderCodexPluginSection — output shape pins
// ---------------------------------------------------------------------------

test('codex-plugin-doctor: rendered section starts with "Codex Plugin status\\n" for every fixture', () => {
  const fixtures = [
    'manifest-valid',
    'manifest-invalid-schema',
    'manifest-missing-required',
    'manifest-version-mismatch',
    'no-manifest',
    'no-catalog',
  ];
  for (const name of fixtures) {
    const r = checkCodexPlugin(fixturePath(name));
    const text = renderCodexPluginSection(r);
    assert.ok(text.startsWith('Codex Plugin status\n'),
      'fixture ' + name + ' missing heading');
    assert.ok(text.endsWith('\n'),
      'fixture ' + name + ' missing trailing newline');
    assert.ok(text.includes('install path (computed, not verified):'),
      'fixture ' + name + ' missing computed-not-verified guarantee');
  }
});

test('codex-plugin-doctor: rendered ready-to-install output does NOT include parenthetical reasons on verdict line', () => {
  const r = checkCodexPlugin(fixturePath('manifest-valid'));
  const text = renderCodexPluginSection(r);
  const verdictLine = text.split('\n').find((l) => l.startsWith('  verdict:'));
  assert.ok(verdictLine, 'should have a verdict line');
  assert.ok(!verdictLine.includes('('),
    'ready-to-install verdict line should not have parenthetical reasons');
  assert.match(verdictLine, /verdict: ready-to-install/);
});

test('codex-plugin-doctor: rendered manifest-only-not-ready output DOES include parenthetical reasons', () => {
  const r = checkCodexPlugin(fixturePath('no-manifest'));
  const text = renderCodexPluginSection(r);
  const verdictLine = text.split('\n').find((l) => l.startsWith('  verdict:'));
  assert.ok(verdictLine, 'should have a verdict line');
  assert.match(verdictLine, /\(.+\)/,
    'manifest-only-not-ready verdict line should have parenthetical reasons');
  assert.match(verdictLine, /manifest absent/);
  assert.match(verdictLine, /catalog absent/);
});

// ---------------------------------------------------------------------------
// computeCacheSimulationPath — pure path composition
// ---------------------------------------------------------------------------

test('codex-plugin-doctor: computeCacheSimulationPath ends with /.codex/plugins/cache/<m>/<p>/<v>/', () => {
  const p = computeCacheSimulationPath('a', 'b', '1.0.0');
  assert.ok(p.endsWith('/.codex/plugins/cache/a/b/1.0.0/'),
    'path should end with the schema; got: ' + p);
});

test('codex-plugin-doctor: computeCacheSimulationPath never throws when version is null/undefined → uses placeholder', () => {
  const pNull = computeCacheSimulationPath('m', 'p', null);
  const pUndef = computeCacheSimulationPath('m', 'p', undefined);
  const pEmpty = computeCacheSimulationPath('m', 'p', '');
  assert.ok(pNull.includes('<version-from-package.json>'),
    'null version should render placeholder');
  assert.ok(pUndef.includes('<version-from-package.json>'),
    'undefined version should render placeholder');
  assert.ok(pEmpty.includes('<version-from-package.json>'),
    'empty version should render placeholder');
});

test('codex-plugin-doctor: cacheSimulation.verified is ALWAYS false (D-10 invariant)', () => {
  const fixtures = ['manifest-valid', 'manifest-invalid-schema', 'no-manifest'];
  for (const name of fixtures) {
    const r = checkCodexPlugin(fixturePath(name));
    assert.equal(r.cacheSimulation.verified, false,
      'fixture ' + name + ' cacheSimulation.verified must be false');
  }
});

// ---------------------------------------------------------------------------
// Purity / read-only / D-10 enforcement
// ---------------------------------------------------------------------------

test('codex-plugin-doctor: checkCodexPlugin is pure — same root yields identical output', () => {
  const a = checkCodexPlugin(fixturePath('manifest-valid'));
  const b = checkCodexPlugin(fixturePath('manifest-valid'));
  assert.deepEqual(a, b);
});

test('codex-plugin-doctor: doctor module source has no child_process / execSync / spawn (D-10)', () => {
  const src = fs.readFileSync(
    require.resolve('../../scripts/lib/install/doctor-codex-plugin.cjs'),
    'utf8'
  );
  // Strip comments + docstrings before grepping — we don't want to false-match
  // notes that mention "spawn" or "child_process" in JSDoc. The doctor module
  // is small and machine-grep on raw source is sufficient for D-10 enforcement.
  assert.ok(!/\bchild_process\b/.test(src),
    'doctor module must not require child_process');
  assert.ok(!/\bexecSync\b/.test(src),
    'doctor module must not call execSync');
  assert.ok(!/\bspawn(?:Sync)?\s*\(/.test(src),
    'doctor module must not call spawn / spawnSync');
});

test('codex-plugin-doctor: doctor test module has no live codex CLI invocation (D-10)', () => {
  // The test file imports child_process (legitimately, to spawn install.cjs
  // for the CLI smoke test) but must not invoke `codex` directly. Allowed:
  // process.execPath spawning install.cjs. Forbidden: spawning codex.
  const src = fs.readFileSync(__filename, 'utf8');
  // Allow execFileSync that targets process.execPath. Forbid any string
  // literal that looks like a codex CLI invocation.
  assert.ok(!/['"`]codex['"`]\s*,/.test(src),
    'test must not spawn the codex CLI');
  assert.ok(!/execFileSync\s*\(\s*['"`]codex/.test(src),
    'test must not execFileSync the codex CLI');
});

test('codex-plugin-doctor: tmpdir-rooted run accepts arbitrary projectRoot (D-10)', () => {
  // Per D-10 the doctor must accept an arbitrary projectRoot — proving it
  // doesn't depend on process.cwd() or any ambient path state. Copy a
  // fixture into a fresh tmpdir, invoke, assert results.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-doctor-'));
  try {
    copyDirRecursive(fixturePath('manifest-valid'), tmpRoot);
    const r = checkCodexPlugin(tmpRoot);
    assert.equal(r.verdict, 'ready-to-install');
    assert.equal(r.manifest.present, true);
    assert.equal(r.catalog.present, true);
    // Path field should point INSIDE tmpRoot — proves we read from the
    // argument, not from process.cwd().
    assert.ok(r.manifest.path.startsWith(tmpRoot),
      'manifest.path should be under tmpRoot');
    assert.ok(r.catalog.path.startsWith(tmpRoot),
      'catalog.path should be under tmpRoot');
  } finally {
    rmRf(tmpRoot);
  }
});

// ---------------------------------------------------------------------------
// CLI smoke test — install.cjs --doctor renders both sections
// ---------------------------------------------------------------------------

test('codex-plugin-doctor: install.cjs --doctor exits 0 + emits Codex Plugin subsection', () => {
  // Phase 28.8-X2: install.cjs --doctor now renders a single aggregated
  // Tier-2 section via scripts/lib/install/doctor-tier2.cjs. C2's
  // checkCodexPlugin reader is unchanged — it's wrapped by the aggregator
  // and surfaces as the "### Codex Plugin" subsection. The verdict
  // (`ready-to-install` / `manifest-only-not-ready`) is preserved verbatim.
  // The Cursor Marketplace subsection co-renders alongside Codex in the
  // same Tier-2 section — must not regress.
  const installCjs = path.resolve(__dirname, '../..', 'scripts', 'install.cjs');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-doctor-cli-'));
  try {
    copyDirRecursive(fixturePath('manifest-valid'), tmpRoot);
    const stdout = execFileSync(process.execPath, [installCjs, '--doctor'], {
      cwd: tmpRoot,
      encoding: 'utf8',
    });
    assert.match(stdout, /## Tier-2 Distribution Channels/);
    assert.match(stdout, /### Codex Plugin/);
    assert.match(stdout, /ready-to-install/);
    assert.match(stdout, /codex plugin marketplace add hegemonart\/get-design-done/);
    // Cursor Marketplace subsection co-renders alongside — must not regress.
    assert.match(stdout, /### Cursor Marketplace/);
  } finally {
    rmRf(tmpRoot);
  }
});

// ---------------------------------------------------------------------------
// validateCodexManifest unit tests
// ---------------------------------------------------------------------------

test('codex-plugin-doctor: validateCodexManifest accepts a full C1-shaped manifest', () => {
  const r = validateCodexManifest({
    name: 'get-design-done',
    version: '1.28.8',
    description: 'pipeline',
  });
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test('codex-plugin-doctor: validateCodexManifest rejects non-kebab-case names', () => {
  const r1 = validateCodexManifest({
    name: 'Get_Design_Done',
    version: '1.28.8',
    description: 'pipeline',
  });
  assert.equal(r1.valid, false);
  assert.match(r1.errors.join('\n'), /kebab-case/);
  const r2 = validateCodexManifest({
    name: 'getDesignDone',
    version: '1.28.8',
    description: 'pipeline',
  });
  assert.equal(r2.valid, false);
});

test('codex-plugin-doctor: validateCodexManifest rejects non-semver version', () => {
  const r = validateCodexManifest({
    name: 'get-design-done',
    version: 'banana',
    description: 'pipeline',
  });
  assert.equal(r.valid, false);
  assert.match(r.errors.join('\n'), /version/);
});

test('codex-plugin-doctor: module exports match the C2 contract', () => {
  // Pin the public surface so future refactors don't silently break
  // call sites (install.cjs --doctor + test imports).
  assert.equal(typeof checkCodexPlugin, 'function');
  assert.equal(typeof computeCacheSimulationPath, 'function');
  assert.equal(typeof renderCodexPluginSection, 'function');
  assert.equal(MARKETPLACE_NAME, 'get-design-done');
  assert.equal(PLUGIN_NAME, 'get-design-done');
  assert.equal(MANIFEST_REL_PATH, '.codex-plugin/plugin.json');
  assert.equal(CATALOG_REL_PATH, '.claude-plugin/marketplace.json');
});

// ---------------------------------------------------------------------------
// Field-test doc shape (D-03 / D-16 — single-step + contrast with Cursor)
// ---------------------------------------------------------------------------

test('codex-plugin-doctor-doc: docs/codex-plugin-field-test.md exists + contains the verbatim command', () => {
  const docPath = path.resolve(__dirname, '../..', 'docs', 'codex-plugin-field-test.md');
  assert.ok(fs.existsSync(docPath), 'docs/codex-plugin-field-test.md must exist');
  const doc = fs.readFileSync(docPath, 'utf8');
  assert.ok(
    doc.includes('codex plugin marketplace add hegemonart/get-design-done'),
    'doc must include the verbatim single-step command'
  );
  // D-03 + D-16 must be referenced explicitly.
  assert.match(doc, /D-03/, 'doc must cite D-03 (install-by-URL works today)');
  assert.match(doc, /D-16/, 'doc must cite D-16 (Codex single-step vs Cursor multi-step)');
  // Contrast with Cursor's multi-step flow per D-16.
  assert.match(doc, /Cursor/i, 'doc must contrast with Cursor');
  assert.match(doc, /single-step/i, 'doc must describe itself as single-step');
});
