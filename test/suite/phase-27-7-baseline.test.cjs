// tests/phase-27-7-baseline.test.cjs — Phase 27.7 regression baseline.
//
// Version-agnostic per the Phase 26 lesson — reads package.json#version
// dynamically instead of hard-coding any version string. After v1.27.7
// ships, this test continues to pass when package.json bumps to v1.28.0+
// as long as the 4 manifests stay aligned and the phase-27-7 baseline
// file matches package.json#version at the time of the bump (subsequent
// phases will replace the baseline pinning during their own closeouts).
//
// Tagged '27.7-07:' per closeout discipline. >= 6 tests; some are marked
// OPTIONAL in the plan and ship as full tests here.
//
// Required reading discipline: this test reads tools/index.ts dynamically
// via `import('../../sdk/mcp/hone-mcp/tools/index.ts')` to verify
// TOOL_COUNT === 13 (raised 12 -> 13 in Phase 52 for hone_context_query)
// and that all 13 tool names match the baseline. The
// TS import requires Node 22+ with --experimental-strip-types.
// (hone-mcp moved scripts/mcp-servers/hone-mcp/ -> sdk/mcp/hone-mcp/ in Plan
//  31-5-05, D-08; bin repointed to the ./bin/hone-mcp trampoline.)

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');
const PLUGIN_PATH = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_PATH = path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-27-7');

function readVersion() {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).version;
}

describe('27.7-07: Phase 27.7 baselines', () => {
  test('27.7-07: 4 manifests aligned to package.json version (version-agnostic)', () => {
    const expected = readVersion();
    const plugin = JSON.parse(fs.readFileSync(PLUGIN_PATH, 'utf8'));
    const market = JSON.parse(fs.readFileSync(MARKETPLACE_PATH, 'utf8'));
    assert.equal(plugin.version, expected, 'plugin.json version mismatch');
    assert.equal(market.metadata.version, expected, 'marketplace.json metadata.version mismatch');
    assert.equal(market.plugins[0].version, expected, 'marketplace.json plugins[0].version mismatch');
  });

  test('27.7-07: phase-27-7/manifests-version.txt baseline matches package.json#version', () => {
    const expected = readVersion();
    const baseline = fs.readFileSync(
      path.join(BASELINE_DIR, 'manifests-version.txt'),
      'utf8',
    ).trim();
    assert.equal(baseline, expected, 'baseline manifests-version.txt must equal package.json#version');
  });

  test('27.7-07: tool-registry baseline matches actual TOOL_MODULES, count === 13, no write-tool names', async () => {
    const reg = JSON.parse(
      fs.readFileSync(path.join(BASELINE_DIR, 'tool-registry.json'), 'utf8'),
    );
    assert.equal(reg.count, 13, 'tool-registry.count must be 13 (raised 12 -> 13 in Phase 52)');
    assert.equal(reg.write_tools.length, 0, 'write_tools must be empty (D-04)');
    // Dynamic import of TS tool registry — verifies baseline matches reality.
    const mod = await import('../../sdk/mcp/hone-mcp/tools/index.ts');
    assert.equal(mod.TOOL_COUNT, 13, 'TOOL_COUNT must be 13 (D-03, raised 12 -> 13 in Phase 52)');
    const actualNames = mod.TOOL_MODULES.map((t) => t.name).sort();
    const baselineNames = [...reg.tools].sort();
    assert.deepEqual(actualNames, baselineNames, 'tool names must match baseline');
    // D-04: no write-verb names in tool registry.
    const writeRegex = /_(create|update|delete|append|clear|write|set)(?:_|$)/;
    for (const name of actualNames) {
      assert.ok(!writeRegex.test(name), 'D-04 violation: write-verb name found: ' + name);
    }
  });

  test('27.7-07: bin-list baselines (phase-20 + current) include hone-mcp', () => {
    for (const rel of [
      'test/fixtures/baselines/phase-20/bin-list.txt',
      'test/fixtures/baselines/current/bin-list.txt',
    ]) {
      const p = path.join(REPO_ROOT, rel);
      const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
      assert.ok(lines.includes('hone-mcp'), rel + ' missing hone-mcp');
    }
  });

  test('27.7-07: schema-list baselines (phase-20 + current) include mcp-hone-tools.schema.json', () => {
    for (const rel of [
      'test/fixtures/baselines/phase-20/schema-list.txt',
      'test/fixtures/baselines/current/schema-list.txt',
    ]) {
      const p = path.join(REPO_ROOT, rel);
      assert.match(
        fs.readFileSync(p, 'utf8'),
        /mcp-hone-tools\.schema\.json/,
        rel + ' missing mcp-hone-tools.schema.json',
      );
    }
  });

  test('27.7-07: lintMcpToolsDir scans production tools clean (Plan 27.7-03 integration)', () => {
    // Explicit /index.cjs because this lib has no package.json#main and
    // Node's default resolution looks for index.js (not index.cjs).
    const { lintMcpToolsDir } = require('../../scripts/lib/mcp-tools-lint/index.cjs');
    const result = lintMcpToolsDir({ dir: 'sdk/mcp/hone-mcp/tools/' });
    if (result.violations && result.violations.length > 0) {
      // Diagnostic: dump violations before failing.
      // eslint-disable-next-line no-console
      console.error('PRODUCTION LINT VIOLATIONS:', JSON.stringify(result.violations, null, 2));
    }
    assert.equal(result.violations.length, 0, 'production tools must lint clean');
  });

  test('27.7-07: package.json bin.hone-mcp points to the ./bin/hone-mcp trampoline (Plan 31-5-05, D-08)', () => {
    const bin = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).bin;
    assert.equal(
      bin['hone-mcp'],
      './bin/hone-mcp',
      'bin.hone-mcp must point at the ./bin/hone-mcp trampoline (was ./scripts/mcp-servers/hone-mcp/server.ts; hone-mcp moved to sdk/mcp/hone-mcp/ in Plan 31-5-05)',
    );
  });

  // .planning/ROADMAP.md is local-only dev material (see PR #65). When the
  // file is absent (CI runs against a clean clone), skip the ROADMAP-shape
  // checkbox assertions — they remain useful as a pre-merge gate locally.
  test('27.7-07: ROADMAP Phase 27.7 plan checkboxes all flipped to [x] (whitespace-tolerant)', (t) => {
    const roadmapPath = path.join(REPO_ROOT, '.planning', 'ROADMAP.md');
    if (!fs.existsSync(roadmapPath)) {
      t.skip('.planning/ROADMAP.md not tracked — local-only dev artifact');
      return;
    }
    const md = fs.readFileSync(roadmapPath, 'utf8');
    // Warning #10 — regex allows leading whitespace (ROADMAP uses 2-space indented bullets).
    const re = /^[ \t]*- \[x\] 27-7-0[1-7]-PLAN\.md/gm;
    const matches = md.match(re) || [];
    assert.equal(
      matches.length,
      7,
      'expected 7 plan checkboxes flipped to [x], found ' + matches.length,
    );
  });

  test('27.7-07: ROADMAP top-level overview Phase 27.7 entry flipped to [x] (scoped)', (t) => {
    const roadmapPath = path.join(REPO_ROOT, '.planning', 'ROADMAP.md');
    if (!fs.existsSync(roadmapPath)) {
      t.skip('.planning/ROADMAP.md not tracked — local-only dev artifact');
      return;
    }
    const md = fs.readFileSync(roadmapPath, 'utf8');
    // Warning #11 — only the overview line is flipped; other phases must not be touched.
    assert.match(
      md,
      /^- \[x\] \[Phase 27\.7\]/m,
      'top-level overview entry for Phase 27.7 must be [x]',
    );
  });
});
