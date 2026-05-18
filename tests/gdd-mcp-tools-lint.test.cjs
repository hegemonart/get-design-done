'use strict';
// tests/gdd-mcp-tools-lint.test.cjs
// ---------------------------------------------------------------------------
// Plan 27.7-03 — static lint for scripts/mcp-servers/gdd-mcp/tools/.
//
// 4 enforced rules (D-XX in Phase 27.7 CONTEXT):
//   - forbid-fs-path (D-06): no `node:fs`/`node:path` (or bare `fs`/`path`)
//     imports inside individual tool .ts files.
//   - max-loc       (D-06): each tool file ≤ 30 non-blank-non-comment LOC.
//   - no-write-names (D-04): no tool name with a write-verb substring
//     (_create|_update|_delete|_append|_clear|_write|_set).
//   - tool-count-cap (D-03): ≤ 12 files matching `gdd_*.ts` in the dir.
//
// Tests all carry the `27.7-03:` tag.
// macOS symlink discipline: tmp dirs canonicalized via fs.realpathSync.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { lintMcpToolsDir } = require('../scripts/lib/mcp-tools-lint/index.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const PROD_TOOLS_DIR = path.join(
  REPO_ROOT,
  'scripts',
  'mcp-servers',
  'gdd-mcp',
  'tools',
);

/** Canonicalized tmpdir — macOS symlink discipline (Phase 27.6 lesson). */
function tmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
  return fs.realpathSync(d);
}

function writeTool(dir, fname, content) {
  fs.writeFileSync(path.join(dir, fname), content, 'utf8');
}

/** Minimal clean tool body — passes all 4 rules. */
function cleanToolBody(name) {
  return (
    "export const name = '" + name + "';\n" +
    "export const schemaPath = '../schemas/x.json';\n" +
    "export async function handle() { return { success: true, data: {} }; }\n"
  );
}

describe('27.7-03: gdd-mcp tools lint', () => {
  test('27.7-03: production-clean — scripts/mcp-servers/gdd-mcp/tools/ has zero violations', () => {
    const result = lintMcpToolsDir({ dir: PROD_TOOLS_DIR });
    if (result.violations.length > 0) {
      // Surface details so a regression is debuggable in CI.
      // eslint-disable-next-line no-console
      console.error(
        'PRODUCTION LINT VIOLATIONS:',
        JSON.stringify(result.violations, null, 2),
      );
    }
    assert.equal(result.violations.length, 0, 'production tools must be clean');
    assert.ok(
      result.summary.files_scanned >= 12,
      'expected >=12 files scanned (12 tools + index.ts + shared.ts)',
    );
  });

  test('27.7-03: forbid-fs-path — synthetic tool with node:fs import is flagged', () => {
    const dir = tmp('lint-fs');
    writeTool(
      dir,
      'gdd_bad.ts',
      "import { readFileSync } from 'node:fs';\n" + cleanToolBody('gdd_bad'),
    );
    const result = lintMcpToolsDir({ dir });
    const v = result.violations.find((x) => x.rule === 'forbid-fs-path');
    assert.ok(v, 'expected forbid-fs-path violation');
    assert.equal(v.file, 'gdd_bad.ts');
    assert.ok(v.line >= 1, 'violation should carry a 1-based line number');
  });

  test('27.7-03: forbid-fs-path — bare `from "path"` import is flagged', () => {
    const dir = tmp('lint-fs-bare');
    writeTool(
      dir,
      'gdd_bad2.ts',
      "import { join } from 'path';\n" + cleanToolBody('gdd_bad2'),
    );
    const result = lintMcpToolsDir({ dir });
    const v = result.violations.find((x) => x.rule === 'forbid-fs-path');
    assert.ok(v, 'bare `path` import should be flagged');
  });

  test('27.7-03: no-write-names — synthetic gdd_decision_append name is flagged', () => {
    const dir = tmp('lint-write');
    writeTool(dir, 'gdd_decision_append.ts', cleanToolBody('gdd_decision_append'));
    const result = lintMcpToolsDir({ dir });
    const v = result.violations.find((x) => x.rule === 'no-write-names');
    assert.ok(v, 'expected no-write-names violation');
    assert.match(v.message, /gdd_decision_append/);
  });

  test('27.7-03: no-write-names — _create / _update / _delete / _write / _set / _clear all flagged', () => {
    const verbs = ['create', 'update', 'delete', 'write', 'set', 'clear'];
    for (const verb of verbs) {
      const dir = tmp('lint-verb-' + verb);
      const name = 'gdd_thing_' + verb;
      writeTool(dir, name + '.ts', cleanToolBody(name));
      const result = lintMcpToolsDir({ dir });
      const v = result.violations.find((x) => x.rule === 'no-write-names');
      assert.ok(v, 'verb ' + verb + ' should be flagged');
    }
  });

  test('27.7-03: tool-count-cap — synthetic 13 tool files trigger violation', () => {
    const dir = tmp('lint-cap');
    for (let i = 0; i < 13; i++) {
      writeTool(dir, 'gdd_tool' + i + '.ts', cleanToolBody('gdd_tool' + i));
    }
    const result = lintMcpToolsDir({ dir });
    const v = result.violations.find((x) => x.rule === 'tool-count-cap');
    assert.ok(v, 'expected tool-count-cap violation');
    assert.match(v.message, /13/);
  });

  test('27.7-03: tool-count-cap — exactly 12 tools passes', () => {
    const dir = tmp('lint-cap-ok');
    for (let i = 0; i < 12; i++) {
      writeTool(dir, 'gdd_tool' + i + '.ts', cleanToolBody('gdd_tool' + i));
    }
    const result = lintMcpToolsDir({ dir });
    const v = result.violations.find((x) => x.rule === 'tool-count-cap');
    assert.equal(v, undefined, 'exactly 12 must pass');
  });

  test('27.7-03: max-loc — synthetic 31-LOC tool is flagged', () => {
    const dir = tmp('lint-loc');
    // 31 non-blank-non-comment lines. Use semicolon statements so each
    // line counts as code (no trailing braces on their own lines).
    let body = "export const name = 'gdd_fat';\n";
    body += "export const schemaPath = '../schemas/x.json';\n";
    body += "export async function handle() {\n";
    // Add 27 statement lines inside the function body.
    for (let i = 0; i < 27; i++) {
      body += '  const v' + i + ' = ' + i + ';\n';
    }
    body += '  return { success: true, data: {} };\n';
    body += '}\n';
    writeTool(dir, 'gdd_fat.ts', body);
    const result = lintMcpToolsDir({ dir });
    const v = result.violations.find((x) => x.rule === 'max-loc');
    assert.ok(v, 'expected max-loc violation');
    assert.match(v.message, /loc=/);
  });

  test('27.7-03: exemptions — index.ts with forbidden import is NOT flagged for forbid-fs-path', () => {
    const dir = tmp('lint-exempt');
    writeTool(
      dir,
      'index.ts',
      "import { readFileSync } from 'node:fs';\nexport const x = 1;\n",
    );
    writeTool(
      dir,
      'shared.ts',
      "import { join } from 'node:path';\nexport function y() { return 1; }\n",
    );
    const result = lintMcpToolsDir({ dir });
    const fsViolations = result.violations.filter(
      (v) => v.rule === 'forbid-fs-path',
    );
    assert.equal(
      fsViolations.length,
      0,
      'index.ts and shared.ts are exempt from forbid-fs-path',
    );
  });

  test('27.7-03: returns summary {files_scanned, violations_count}', () => {
    const dir = tmp('lint-summary');
    writeTool(dir, 'gdd_a.ts', cleanToolBody('gdd_a'));
    writeTool(dir, 'gdd_b.ts', cleanToolBody('gdd_b'));
    const result = lintMcpToolsDir({ dir });
    assert.equal(typeof result.summary.files_scanned, 'number');
    assert.equal(typeof result.summary.violations_count, 'number');
    assert.equal(result.summary.violations_count, result.violations.length);
    assert.equal(result.summary.files_scanned, 2);
  });
});
