'use strict';

// Phase 28.8 Plan B2 — cursor-marketplace doctor reporter test suite.
//
// Phase 28.8 D-10: tmpdir-only — no live marketplace, no writes outside
// tmpdir. Every test mkdtempSync's its own root.
// Phase 28.8 D-16: 4 maintainer-local state values: not-submitted /
// submitted-pending / approved-published / rejected. Each fixture file
// is loaded verbatim into the tmpdir to assert the contract.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  reportCursorMarketplace,
  formatCursorMarketplaceReport,
  validateManifest,
  MARKETPLACE_STATES,
} = require('../../scripts/lib/install/doctor-cursor-marketplace.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'cursor-marketplace');

const VALID_MANIFEST = Object.freeze({
  name: 'hone',
  description: 'fixture description for doctor tests',
  version: '1.28.8',
  author: { name: 'hegemonart' },
  homepage: 'https://github.com/hegemonart/hone',
  repository: 'https://github.com/hegemonart/hone',
  license: 'MIT',
  keywords: ['design', 'ui', 'skill'],
});

/**
 * Build a tmpdir-rooted fixture project.
 *
 * @param {Object} args
 * @param {string} [args.stateFixture]    Filename under tests/fixtures/cursor-marketplace/
 * @param {Object|string} [args.manifest] Manifest object to write OR raw JSON string
 *                                         (string lets a test write malformed JSON).
 * @param {string} [args.packageVersion]  package.json version to seed.
 * @param {boolean} [args.createPluginDir] Force .cursor-plugin/ dir even if no files
 *                                         (for empty-dir test).
 * @returns {string}                       absolute path to tmpdir root.
 */
function setupTmpProject(args) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-doctor-cursor-'));
  if (args && args.packageVersion) {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'fixture', version: args.packageVersion }, null, 2)
    );
  }
  const pluginDir = path.join(root, '.cursor-plugin');
  if (
    (args && args.manifest !== undefined)
    || (args && args.stateFixture !== undefined)
    || (args && args.createPluginDir)
  ) {
    fs.mkdirSync(pluginDir, { recursive: true });
  }
  if (args && args.manifest !== undefined) {
    const contents =
      typeof args.manifest === 'string'
        ? args.manifest
        : JSON.stringify(args.manifest, null, 2);
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), contents);
  }
  if (args && args.stateFixture !== undefined) {
    const src = path.join(FIXTURE_DIR, args.stateFixture);
    fs.copyFileSync(src, path.join(pluginDir, 'marketplace-state.json'));
  }
  return root;
}

function rmRf(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function listAllPaths(root) {
  const out = [];
  function walk(dir, rel) {
    const entries = fs.readdirSync(dir);
    for (const e of entries) {
      const full = path.join(dir, e);
      const r = rel ? `${rel}/${e}` : e;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        out.push(r + '/');
        walk(full, r);
      } else {
        out.push(r);
      }
    }
  }
  walk(root, '');
  out.sort();
  return out;
}

// ---------------------------------------------------------------------------
// Fixture-driven tests: each of the 4 D-16 state values
// ---------------------------------------------------------------------------

test('cursor-marketplace-doctor: state-not-submitted fixture → state=not-submitted', () => {
  const root = setupTmpProject({
    stateFixture: 'state-not-submitted.json',
    manifest: VALID_MANIFEST,
    packageVersion: '1.28.8',
  });
  try {
    const r = reportCursorMarketplace({ projectRoot: root });
    assert.equal(r.state, MARKETPLACE_STATES.NOT_SUBMITTED);
    assert.equal(r.submittedAt, null);
    assert.equal(r.approvedAt, null);
    assert.equal(r.marketplaceUrl, null);
    assert.equal(r.rejectionReason, null);
    assert.match(r.guidance, /cursor\.com\/marketplace\/publish/);
  } finally {
    rmRf(root);
  }
});

test('cursor-marketplace-doctor: state-submitted-pending fixture → state=submitted-pending', () => {
  const root = setupTmpProject({
    stateFixture: 'state-submitted-pending.json',
    manifest: VALID_MANIFEST,
    packageVersion: '1.28.8',
  });
  try {
    const r = reportCursorMarketplace({ projectRoot: root });
    assert.equal(r.state, MARKETPLACE_STATES.SUBMITTED_PENDING);
    assert.equal(r.submittedAt, '2026-05-22T14:00:00Z');
    assert.equal(r.approvedAt, null);
    assert.equal(r.marketplaceUrl, null);
    assert.match(r.guidance, /no published SLA/);
  } finally {
    rmRf(root);
  }
});

test('cursor-marketplace-doctor: state-approved-published fixture → state=approved-published', () => {
  const root = setupTmpProject({
    stateFixture: 'state-approved-published.json',
    manifest: VALID_MANIFEST,
    packageVersion: '1.28.8',
  });
  try {
    const r = reportCursorMarketplace({ projectRoot: root });
    assert.equal(r.state, MARKETPLACE_STATES.APPROVED_PUBLISHED);
    assert.equal(
      r.marketplaceUrl,
      'https://cursor.com/marketplace/hegemonart/hone'
    );
    assert.equal(r.submittedAt, '2026-05-22T14:00:00Z');
    assert.equal(r.approvedAt, '2026-06-01T09:30:00Z');
    assert.match(r.guidance, /live at/);
    assert.match(r.guidance, /cursor\.com/);
  } finally {
    rmRf(root);
  }
});

test('cursor-marketplace-doctor: state-rejected fixture → state=rejected', () => {
  const root = setupTmpProject({
    stateFixture: 'state-rejected.json',
    manifest: VALID_MANIFEST,
    packageVersion: '1.28.8',
  });
  try {
    const r = reportCursorMarketplace({ projectRoot: root });
    assert.equal(r.state, MARKETPLACE_STATES.REJECTED);
    assert.equal(r.submittedAt, '2026-05-22T14:00:00Z');
    assert.equal(
      r.rejectionReason,
      'manifest description exceeds 200 char limit'
    );
    // Guidance must surface the reason text so the maintainer sees it
    // in every doctor invocation per T-04 mitigation.
    assert.match(r.guidance, /manifest description exceeds 200 char limit/);
  } finally {
    rmRf(root);
  }
});

// ---------------------------------------------------------------------------
// Absent-file / absent-dir scenarios
// ---------------------------------------------------------------------------

test('cursor-marketplace-doctor: absent marketplace-state.json → state=not-submitted', () => {
  // manifest present, state file absent
  const root = setupTmpProject({
    manifest: VALID_MANIFEST,
    packageVersion: '1.28.8',
  });
  try {
    const r = reportCursorMarketplace({ projectRoot: root });
    assert.equal(r.state, MARKETPLACE_STATES.NOT_SUBMITTED);
    assert.equal(r.manifestPresent, true);
  } finally {
    rmRf(root);
  }
});

test('cursor-marketplace-doctor: empty .cursor-plugin/ dir → state=not-submitted, manifestPresent=false', () => {
  const root = setupTmpProject({
    packageVersion: '1.28.8',
    createPluginDir: true,
  });
  try {
    const r = reportCursorMarketplace({ projectRoot: root });
    assert.equal(r.state, MARKETPLACE_STATES.NOT_SUBMITTED);
    assert.equal(r.manifestPresent, false);
    assert.equal(r.manifestSchemaValid, false);
  } finally {
    rmRf(root);
  }
});

test('cursor-marketplace-doctor: no .cursor-plugin/ dir at all → state=not-submitted, manifestPresent=false', () => {
  const root = setupTmpProject({ packageVersion: '1.28.8' });
  try {
    const r = reportCursorMarketplace({ projectRoot: root });
    assert.equal(r.state, MARKETPLACE_STATES.NOT_SUBMITTED);
    assert.equal(r.manifestPresent, false);
    assert.equal(r.manifestSchemaValid, false);
    assert.equal(r.manifestVersion, null);
    assert.deepEqual(r.manifestSchemaErrors, ['manifest absent']);
  } finally {
    rmRf(root);
  }
});

// ---------------------------------------------------------------------------
// Manifest validity matrix
// ---------------------------------------------------------------------------

test('cursor-marketplace-doctor: valid manifest + version match → versionMatch=true, schema valid', () => {
  const root = setupTmpProject({
    manifest: VALID_MANIFEST,
    packageVersion: '1.28.8',
  });
  try {
    const r = reportCursorMarketplace({ projectRoot: root });
    assert.equal(r.manifestPresent, true);
    assert.equal(r.manifestSchemaValid, true);
    assert.deepEqual(r.manifestSchemaErrors, []);
    assert.equal(r.versionMatch, true);
    assert.equal(r.manifestVersion, '1.28.8');
    assert.equal(r.packageVersion, '1.28.8');
  } finally {
    rmRf(root);
  }
});

test('cursor-marketplace-doctor: valid manifest + version mismatch → versionMatch=false, schema still valid', () => {
  const root = setupTmpProject({
    manifest: { ...VALID_MANIFEST, version: '1.28.7' },
    packageVersion: '1.28.8',
  });
  try {
    const r = reportCursorMarketplace({ projectRoot: root });
    assert.equal(r.manifestSchemaValid, true);
    assert.equal(r.versionMatch, false);
    assert.equal(r.manifestVersion, '1.28.7');
    assert.equal(r.packageVersion, '1.28.8');
  } finally {
    rmRf(root);
  }
});

test('cursor-marketplace-doctor: invalid manifest (missing required fields) → schema invalid', () => {
  // Manifest object missing required name + description + author.name.
  const invalid = { version: '1.28.8', keywords: ['ui'] };
  const root = setupTmpProject({
    manifest: invalid,
    packageVersion: '1.28.8',
  });
  try {
    const r = reportCursorMarketplace({ projectRoot: root });
    assert.equal(r.manifestPresent, true);
    assert.equal(r.manifestSchemaValid, false);
    assert.ok(r.manifestSchemaErrors.length > 0);
    // At minimum: name + description + author.name failures.
    const joined = r.manifestSchemaErrors.join('\n');
    assert.match(joined, /name/);
    assert.match(joined, /description/);
    assert.match(joined, /author\.name/);
  } finally {
    rmRf(root);
  }
});

// ---------------------------------------------------------------------------
// Error-path tests: malformed JSON + unknown status
// ---------------------------------------------------------------------------

test('cursor-marketplace-doctor: malformed marketplace-state.json → throws with descriptive error', () => {
  const root = setupTmpProject({
    manifest: VALID_MANIFEST,
    packageVersion: '1.28.8',
  });
  try {
    // Hand-write malformed JSON (not a fixture file).
    fs.writeFileSync(
      path.join(root, '.cursor-plugin', 'marketplace-state.json'),
      '{not valid json'
    );
    assert.throws(
      () => reportCursorMarketplace({ projectRoot: root }),
      /JSON parse failed|malformed/i
    );
  } finally {
    rmRf(root);
  }
});

test('cursor-marketplace-doctor: unknown status value → throws with bad status in message', () => {
  const root = setupTmpProject({
    manifest: VALID_MANIFEST,
    packageVersion: '1.28.8',
  });
  try {
    fs.writeFileSync(
      path.join(root, '.cursor-plugin', 'marketplace-state.json'),
      JSON.stringify({ status: 'in-orbit' })
    );
    assert.throws(
      () => reportCursorMarketplace({ projectRoot: root }),
      /in-orbit/
    );
  } finally {
    rmRf(root);
  }
});

// ---------------------------------------------------------------------------
// Read-only invariant (directory snapshot before/after)
// ---------------------------------------------------------------------------

test('cursor-marketplace-doctor: read-only — no files created/modified by reporter', () => {
  const root = setupTmpProject({
    stateFixture: 'state-approved-published.json',
    manifest: VALID_MANIFEST,
    packageVersion: '1.28.8',
  });
  try {
    const before = listAllPaths(root);
    const beforeStats = before
      .filter((p) => !p.endsWith('/'))
      .map((p) => ({
        p,
        mtime: fs.statSync(path.join(root, p)).mtimeMs,
        size: fs.statSync(path.join(root, p)).size,
      }));

    reportCursorMarketplace({ projectRoot: root });

    const after = listAllPaths(root);
    const afterStats = after
      .filter((p) => !p.endsWith('/'))
      .map((p) => ({
        p,
        mtime: fs.statSync(path.join(root, p)).mtimeMs,
        size: fs.statSync(path.join(root, p)).size,
      }));

    assert.deepEqual(after, before, 'directory tree changed');
    assert.deepEqual(afterStats, beforeStats, 'file stats changed');
  } finally {
    rmRf(root);
  }
});

// ---------------------------------------------------------------------------
// CLI smoke test — invoke install.cjs --doctor in a tmpdir
// ---------------------------------------------------------------------------

test('cursor-marketplace-doctor: CLI --doctor exits 0 + prints Cursor Marketplace subsection', () => {
  // Compute the absolute path to install.cjs from THIS test file's location
  // (do NOT rely on the tmpdir's cwd).
  // Phase 28.8-X2: install.cjs --doctor now renders a single aggregated
  // Tier-2 section via scripts/lib/install/doctor-tier2.cjs that wraps
  // B2's reportCursorMarketplace as the Cursor Marketplace subsection
  // (### header) rather than B2's standalone `=== Cursor Marketplace
  // status ===` block. The underlying B2 reporter is unchanged; only
  // the CLI rendering shape moved.
  const installCjs = path.resolve(__dirname, '../..', 'scripts', 'install.cjs');
  const root = setupTmpProject({
    stateFixture: 'state-approved-published.json',
    manifest: VALID_MANIFEST,
    packageVersion: '1.28.8',
  });
  try {
    const stdout = execFileSync(process.execPath, [installCjs, '--doctor'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.match(stdout, /## Tier-2 Distribution Channels/);
    assert.match(stdout, /### Cursor Marketplace/);
    assert.match(stdout, /approved-published/);
    assert.match(stdout, /tier-2 status:/);
  } finally {
    rmRf(root);
  }
});

test('cursor-marketplace-doctor: CLI --doctor in clean tmpdir → not-configured state in aggregator', () => {
  // Phase 28.8-X2: when no .cursor-plugin/plugin.json is present, the
  // aggregator surfaces the cursor channel as `not-configured` (X2
  // interface contract) — distinct from B2's standalone `not-submitted`
  // default. The B2 module itself still emits `not-submitted`; the
  // aggregator normalizes manifest-absent into `not-configured` so the
  // summary line's "ready" count is computed consistently across channels.
  const installCjs = path.resolve(__dirname, '../..', 'scripts', 'install.cjs');
  const root = setupTmpProject({ packageVersion: '1.28.8' });
  try {
    const stdout = execFileSync(process.execPath, [installCjs, '--doctor'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.match(stdout, /## Tier-2 Distribution Channels/);
    assert.match(stdout, /### Cursor Marketplace/);
    assert.match(stdout, /not-configured/);
  } finally {
    rmRf(root);
  }
});

// ---------------------------------------------------------------------------
// validateManifest unit tests (B1-validator surrogate exported by doctor)
// ---------------------------------------------------------------------------

test('cursor-marketplace-doctor: validateManifest accepts a full B1-shaped manifest', () => {
  const r = validateManifest(VALID_MANIFEST);
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test('cursor-marketplace-doctor: validateManifest rejects non-object input', () => {
  const r1 = validateManifest(null);
  assert.equal(r1.valid, false);
  assert.ok(r1.errors.length > 0);
  const r2 = validateManifest('a string');
  assert.equal(r2.valid, false);
  const r3 = validateManifest([]);
  assert.equal(r3.valid, false);
});

test('cursor-marketplace-doctor: validateManifest rejects non-semver version', () => {
  const r = validateManifest({ ...VALID_MANIFEST, version: 'banana' });
  assert.equal(r.valid, false);
  assert.match(r.errors.join('\n'), /version/);
});

// ---------------------------------------------------------------------------
// formatCursorMarketplaceReport — output shape pin
// ---------------------------------------------------------------------------

test('cursor-marketplace-doctor: formatCursorMarketplaceReport renders 4-line section for approved', () => {
  const root = setupTmpProject({
    stateFixture: 'state-approved-published.json',
    manifest: VALID_MANIFEST,
    packageVersion: '1.28.8',
  });
  try {
    const r = reportCursorMarketplace({ projectRoot: root });
    const text = formatCursorMarketplaceReport(r);
    const lines = text.split('\n');
    assert.equal(lines[0], '=== Cursor Marketplace status ===');
    assert.match(lines[1], /Manifest:/);
    assert.match(lines[2], /Schema validity:/);
    assert.match(lines[3], /Application:\s+approved-published/);
    assert.match(lines[4], /Next step:/);
  } finally {
    rmRf(root);
  }
});
