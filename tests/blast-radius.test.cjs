'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { REPO_ROOT } = require('./helpers.ts');
const { estimate, estimateMCPCalls, loadConfig, formatDiffSummary, DEFAULTS } = require(path.join(REPO_ROOT, 'scripts', 'lib', 'blast-radius.cjs'));

function scaffoldCfg(configJson) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-br-test-'));
  const designDir = path.join(dir, '.design');
  fs.mkdirSync(designDir, { recursive: true });
  if (configJson !== undefined) {
    fs.writeFileSync(path.join(designDir, 'config.json'), JSON.stringify(configJson), 'utf8');
  }
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('blast-radius: 9 files / 390 lines — under 10/400 default is ok', () => {
  const r = estimate({
    touchedPaths: Array.from({ length: 9 }, (_, i) => `src/f${i}.ts`),
    diffStats: { insertions: 200, deletions: 190 },
    config: DEFAULTS,
  });
  assert.equal(r.exceeds, false);
  assert.equal(r.files, 9);
  assert.equal(r.lines, 390);
});

test('blast-radius: 10 files / 400 lines at exact limit is ok', () => {
  const r = estimate({
    touchedPaths: Array.from({ length: 10 }, (_, i) => `src/f${i}.ts`),
    diffStats: { insertions: 200, deletions: 200 },
    config: DEFAULTS,
  });
  assert.equal(r.exceeds, false);
});

test('blast-radius: 11 files exceeds', () => {
  const r = estimate({
    touchedPaths: Array.from({ length: 11 }, (_, i) => `src/f${i}.ts`),
    diffStats: { insertions: 10, deletions: 0 },
    config: DEFAULTS,
  });
  assert.equal(r.exceeds, true);
  assert.equal(r.overBy.files, 1);
});

test('blast-radius: 401 lines exceeds', () => {
  const r = estimate({
    touchedPaths: ['src/f.ts'],
    diffStats: { insertions: 401, deletions: 0 },
    config: DEFAULTS,
  });
  assert.equal(r.exceeds, true);
  assert.equal(r.overBy.lines, 1);
});

test('blast-radius: duplicate paths collapse to unique count', () => {
  const r = estimate({
    touchedPaths: ['a.ts', 'a.ts', 'a.ts'],
    diffStats: { insertions: 1 },
    config: DEFAULTS,
  });
  assert.equal(r.files, 1);
});

test('blast-radius: zero file limit DISABLES file check', () => {
  const r = estimate({
    touchedPaths: Array.from({ length: 100 }, (_, i) => `${i}`),
    diffStats: { insertions: 1 },
    config: { max_files_per_task: 0, max_lines_per_task: 400, max_mcp_calls_per_task: 30 },
  });
  assert.equal(r.exceeds, false);
});

test('blast-radius: MCP estimate 30/30 at limit is ok', () => {
  const r = estimateMCPCalls({ toolCalls: Array.from({ length: 30 }, (_, i) => ({ tool: 'use_figma', ts: i })), config: DEFAULTS });
  assert.equal(r.exceeds, false);
  assert.equal(r.count, 30);
});

test('blast-radius: MCP estimate 31 exceeds', () => {
  const r = estimateMCPCalls({ toolCalls: Array.from({ length: 31 }, () => ({ tool: 'use_figma' })), config: DEFAULTS });
  assert.equal(r.exceeds, true);
  assert.equal(r.overBy, 1);
});

test('blast-radius: MCP zero-limit disables check', () => {
  const r = estimateMCPCalls({ toolCalls: new Array(500).fill({ tool: 'x' }), config: { ...DEFAULTS, max_mcp_calls_per_task: 0 } });
  assert.equal(r.exceeds, false);
});

test('blast-radius: config override from .design/config.json.blast_radius takes precedence', () => {
  const { dir, cleanup } = scaffoldCfg({ blast_radius: { max_files_per_task: 5 } });
  try {
    const cfg = loadConfig(dir);
    const r = estimate({
      touchedPaths: Array.from({ length: 6 }, (_, i) => `${i}`),
      diffStats: { insertions: 1 },
      config: cfg,
    });
    assert.equal(r.exceeds, true);
    assert.equal(r.overBy.files, 1);
  } finally { cleanup(); }
});

test('blast-radius: malformed config falls back to defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-br-bad-'));
  const designDir = path.join(dir, '.design');
  fs.mkdirSync(designDir, { recursive: true });
  fs.writeFileSync(path.join(designDir, 'config.json'), 'not-json', 'utf8');
  try {
    const cfg = loadConfig(dir);
    assert.equal(cfg.max_files_per_task, DEFAULTS.max_files_per_task);
    assert.equal(cfg.max_lines_per_task, DEFAULTS.max_lines_per_task);
    assert.equal(cfg.max_mcp_calls_per_task, DEFAULTS.max_mcp_calls_per_task);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('blast-radius: formatDiffSummary produces a multi-line block with diff stats and advice', () => {
  const summary = formatDiffSummary({
    touchedPaths: ['a.ts', 'b.ts'],
    diffStats: { insertions: 500, deletions: 10 },
    result: estimate({ touchedPaths: ['a.ts', 'b.ts'], diffStats: { insertions: 500, deletions: 10 }, config: DEFAULTS }),
  });
  assert.match(summary, /Files touched: 2/);
  assert.match(summary, /Lines changed: 510/);
  assert.match(summary, /Over by: \+110 lines/);
  assert.match(summary, /split the task/);
});
