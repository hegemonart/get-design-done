'use strict';
// tests/gdd-mcp-readme-bench.test.cjs
// ---------------------------------------------------------------------------
// Plan 27.7-06 — README + priming-benchmark fixture tests.
//
// Test names are all prefixed `27.7-06:` for the tag count check.
//
// Tests:
//   1. README exists and length <= 120 lines (Phase 28.5 cap)
//   2. Benchmark JSON has required keys + valid ISO timestamp
//   3. Benchmark reduction.tokens_pct <= -30 (D-09 target, informational)
//   4. README references all 12 tool names from the registry
//   5. README markdownlint MD038 clean — proper per-line span scan
//      (the plan's original cross-line regex was greedy; the correct
//      check looks at single-line inline spans only, ignoring fenced
//      code blocks. Rule-1 fix applied during execution.)
//
// macOS symlink discipline: no tmpdirs used in this test — all reads
// target version-controlled paths under REPO_ROOT.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const README_PATH = path.join(REPO_ROOT, 'scripts', 'mcp-servers', 'gdd-mcp', 'README.md');
const BENCHMARK_PATH = path.join(
  REPO_ROOT,
  'test-fixture',
  'baselines',
  'phase-27-7',
  'priming-benchmark.json',
);

const TOOL_NAMES = [
  'gdd_status',
  'gdd_phase_current',
  'gdd_phases_list',
  'gdd_plans_list',
  'gdd_decisions_list',
  'gdd_intel_get',
  'gdd_telemetry_query',
  'gdd_cycle_recap',
  'gdd_reflections_latest',
  'gdd_learnings_digest',
  'gdd_events_tail',
  'gdd_health',
];

describe('27.7-06: README + priming benchmark', () => {
  test('27.7-06: README exists and length <= 120 lines (Phase 28.5)', () => {
    assert.ok(fs.existsSync(README_PATH), 'README missing at ' + README_PATH);
    const lines = fs.readFileSync(README_PATH, 'utf8').split('\n').length;
    assert.ok(
      lines <= 120,
      'README has ' + lines + ' lines, exceeds 120 cap (Phase 28.5)',
    );
  });

  test('27.7-06: benchmark JSON has required keys + valid ISO timestamp', () => {
    assert.ok(fs.existsSync(BENCHMARK_PATH), 'benchmark missing at ' + BENCHMARK_PATH);
    const raw = fs.readFileSync(BENCHMARK_PATH, 'utf8');
    let j;
    try {
      j = JSON.parse(raw);
    } catch (err) {
      assert.fail('benchmark JSON does not parse: ' + err.message);
    }
    const required = [
      'schema_version',
      'generated_at',
      'fixture_project',
      'mcp_path',
      'file_read_path',
      'reduction',
    ];
    for (const k of required) {
      assert.ok(k in j, 'benchmark missing top-level key: ' + k);
    }
    assert.ok(
      !Number.isNaN(Date.parse(j.generated_at)),
      'generated_at is not a valid ISO timestamp: ' + j.generated_at,
    );
    assert.equal(typeof j.mcp_path.total_tokens, 'number', 'mcp_path.total_tokens not numeric');
    assert.equal(
      typeof j.file_read_path.total_tokens,
      'number',
      'file_read_path.total_tokens not numeric',
    );
    assert.equal(typeof j.reduction.tokens_pct, 'number', 'reduction.tokens_pct not numeric');
  });

  test('27.7-06: benchmark reduction.tokens_pct <= -30 (D-09 target)', () => {
    const j = JSON.parse(fs.readFileSync(BENCHMARK_PATH, 'utf8'));
    assert.ok(
      j.reduction.tokens_pct <= -30,
      'reduction.tokens_pct is ' +
        j.reduction.tokens_pct +
        '%, must be <= -30 per D-09 (≥30% token reduction)',
    );
  });

  test('27.7-06: README references all 12 tool names', () => {
    const md = fs.readFileSync(README_PATH, 'utf8');
    for (const t of TOOL_NAMES) {
      assert.match(md, new RegExp('\\b' + t + '\\b'), 'README missing tool: ' + t);
    }
  });

  test('27.7-06: README markdownlint MD038 clean (no spaces inside inline code spans)', () => {
    // Proper MD038 scan: inspect each line outside fenced code blocks for
    // single-backtick spans whose first/last character is whitespace. The
    // plan's original regex was greedy and would match unrelated backtick
    // pairs across multiple lines; this scan is per-line and ignores
    // fenced blocks (which markdownlint MD038 also skips).
    const md = fs.readFileSync(README_PATH, 'utf8');
    const lines = md.split('\n');
    let inFence = false;
    const violations = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      // Find single-backtick spans on this line; not preceded/followed by
      // another backtick (so we don't accidentally match part of a ``` fence).
      const spanRegex = /(?<!`)`([^`\n]+)`(?!`)/g;
      let match;
      while ((match = spanRegex.exec(line)) !== null) {
        const content = match[1];
        if (
          content.length > 0 &&
          (content[0] === ' ' || content[content.length - 1] === ' ')
        ) {
          violations.push({ line: i + 1, span: match[0] });
        }
      }
    }
    assert.equal(
      violations.length,
      0,
      'MD038 violations: ' + JSON.stringify(violations, null, 2),
    );
  });
});
