'use strict';

// test/suite/phase-33-shims-removed.test.cjs — Phase 33 closeout (D-04, BREAKING).
//
// Plan 31-5-06 re-created 10 thin GDD-DEPRECATION-SHIM re-exports at the OLD
// SDK paths after 31-5-04/05 moved the real code into sdk/. They carried a
// one-minor grace window (1.31.5 ships with shims -> 1.32.0 still has them ->
// 1.33.0 removes them). Phase 33 (33-06) is the v1.33.0 closeout: it DELETES
// the 10 shims (D-04). This test is the removal LOCK — it asserts:
//
//   (a) Each of the 10 old shim paths is GONE (fs.existsSync === false).
//   (b) Each sdk/ counterpart the shim used to re-export STILL resolves
//       (require.resolve for the 4 .cjs primitives; fs.existsSync for the 6
//       .ts sdk/ targets — .ts cannot be require.resolve'd without the
//       strip-types loader, and these tests run plain `node --test`).
//   (c) scripts/mcp-servers/ is gone entirely (the 2 mcp shims were its only
//       contents) AND "scripts/mcp-servers/" is absent from package.json
//       files[] (the now-empty subtree was dropped from the npm allowlist).
//
// Counterpart to the (now-deleted) sdk-shim-deprecation.test.cjs which proved
// the shims behaved correctly DURING the grace window. All tests tag `33-06:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const abs = (rel) => path.join(REPO_ROOT, rel);

// ---------------------------------------------------------------------------
// The 10 deleted shims, each with the sdk/ counterpart it used to re-export.
// `kind`: 'cjs' targets are resolved via require.resolve; 'ts' targets are
// checked via fs.existsSync (no strip-types loader under plain node --test).
// ---------------------------------------------------------------------------

const REMOVED_SHIMS = [
  // Group A — 4 TS index shims (export * from sdk/...).
  { old: 'scripts/lib/cli/index.ts', sdk: 'sdk/cli/index.ts', kind: 'ts' },
  { old: 'scripts/lib/event-stream/index.ts', sdk: 'sdk/event-stream/index.ts', kind: 'ts' },
  { old: 'scripts/lib/hone-state/index.ts', sdk: 'sdk/state/index.ts', kind: 'ts' },
  { old: 'scripts/lib/hone-errors/index.ts', sdk: 'sdk/errors/index.ts', kind: 'ts' },
  // Group B — 4 root .cjs primitive shims (module.exports = require(sdk)).
  { old: 'scripts/lib/error-classifier.cjs', sdk: 'sdk/primitives/error-classifier.cjs', kind: 'cjs' },
  { old: 'scripts/lib/iteration-budget.cjs', sdk: 'sdk/primitives/iteration-budget.cjs', kind: 'cjs' },
  { old: 'scripts/lib/jittered-backoff.cjs', sdk: 'sdk/primitives/jittered-backoff.cjs', kind: 'cjs' },
  { old: 'scripts/lib/lockfile.cjs', sdk: 'sdk/primitives/lockfile.cjs', kind: 'cjs' },
  // Group C — 2 mcp-server .ts shims (export * from sdk/mcp/...).
  { old: 'scripts/mcp-servers/hone-state/server.ts', sdk: 'sdk/mcp/hone-state/server.ts', kind: 'ts' },
  { old: 'scripts/mcp-servers/hone-mcp/server.ts', sdk: 'sdk/mcp/hone-mcp/server.ts', kind: 'ts' },
];

// ── (a) every old shim path is GONE ───────────────────────────────────────────

test('33-06: all 10 Phase-31.5 deprecation-shim paths are deleted (existsSync false)', () => {
  const stillPresent = [];
  for (const { old } of REMOVED_SHIMS) {
    if (fs.existsSync(abs(old))) stillPresent.push(old);
  }
  assert.deepEqual(
    stillPresent,
    [],
    `these shim paths must be DELETED in v1.33.0 (D-04) but still exist:\n  ${stillPresent.join('\n  ')}`,
  );
});

// ── (b) every sdk/ counterpart STILL resolves ─────────────────────────────────

test('33-06: every sdk/ counterpart the deleted shims re-exported still resolves', () => {
  const missing = [];
  for (const { old, sdk, kind } of REMOVED_SHIMS) {
    if (kind === 'cjs') {
      try {
        require.resolve(abs(sdk));
      } catch {
        missing.push(`${sdk} (was re-exported by ${old})`);
      }
    } else {
      if (!fs.existsSync(abs(sdk))) {
        missing.push(`${sdk} (was re-exported by ${old})`);
      }
    }
  }
  assert.deepEqual(
    missing,
    [],
    `the SDK targets the shims pointed at must still exist after shim removal:\n  ${missing.join('\n  ')}`,
  );
});

test('33-06: the 4 sdk/primitives .cjs counterparts load + export a non-empty surface', () => {
  // Stronger than resolve: actually require the 4 primitives the .cjs shims
  // forwarded to, proving the real implementation is intact post-removal.
  for (const { old, sdk, kind } of REMOVED_SHIMS) {
    if (kind !== 'cjs') continue;
    const mod = require(abs(sdk));
    assert.ok(
      mod && (typeof mod === 'object' || typeof mod === 'function'),
      `${sdk} (sdk counterpart of deleted ${old}) must load as a module`,
    );
    assert.ok(
      Object.keys(mod).length > 0 || typeof mod === 'function',
      `${sdk} must export at least one value`,
    );
  }
});

// ── (c) scripts/mcp-servers/ gone + dropped from files[] ──────────────────────

test('33-06: scripts/mcp-servers/ directory is gone (its only contents were the 2 shims)', () => {
  assert.equal(
    fs.existsSync(abs('scripts/mcp-servers')),
    false,
    'scripts/mcp-servers/ must be removed entirely after the 2 mcp shims are deleted',
  );
});

test('33-06: "scripts/mcp-servers/" is absent from package.json files[] (npm allowlist)', () => {
  const pkg = JSON.parse(fs.readFileSync(abs('package.json'), 'utf8'));
  assert.ok(Array.isArray(pkg.files), 'package.json must have a files[] array');
  assert.ok(
    !pkg.files.includes('scripts/mcp-servers/'),
    'package.json files[] must NOT list scripts/mcp-servers/ (dropped in v1.33.0, D-04)',
  );
  // The kept runtime subtrees must remain (regression guard — we dropped ONLY
  // the empty mcp-servers entry, not the live scripts/lib/ or scripts/cli/).
  assert.ok(pkg.files.includes('scripts/lib/'), 'files[] must keep scripts/lib/');
  assert.ok(pkg.files.includes('scripts/cli/'), 'files[] must keep scripts/cli/');
  assert.ok(pkg.files.includes('scripts/install.cjs'), 'files[] must keep scripts/install.cjs');
});
