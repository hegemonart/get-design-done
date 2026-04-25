// tests/audit-aggregator.test.cjs — Plan 23-04 audit aggregator
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  aggregate,
  score,
  normalizePath,
  dedupKey,
  defaultMerge,
} = require('../scripts/lib/audit-aggregator/index.cjs');

const F = (over) => ({
  file: 'src/x.ts',
  line: 1,
  rule_id: 'NNG-01',
  severity: 'P1',
  summary: 'demo',
  ...over,
});

test('23-04: aggregate basic — 3 distinct findings, total=3, duplicates=0', () => {
  const r = aggregate([
    F({ rule_id: 'A', summary: 'one' }),
    F({ rule_id: 'B', summary: 'two', file: 'src/y.ts' }),
    F({ rule_id: 'C', summary: 'three', line: 5 }),
  ]);
  assert.equal(r.total, 3);
  assert.equal(r.duplicates, 0);
  assert.equal(r.findings.length, 3);
});

test('23-04: dedup collapses same {file,line,rule_id}', () => {
  const r = aggregate([
    F({ agent: 'audit-a', confidence: 0.6 }),
    F({ agent: 'audit-b', confidence: 0.9 }),
  ]);
  assert.equal(r.total, 1);
  assert.equal(r.duplicates, 1);
  assert.equal(r.findings[0].agent, 'audit-b'); // higher confidence wins
  assert.deepEqual(r.findings[0].merged_from, ['audit-a']);
});

test('23-04: severity sort — P0 first regardless of weighted score', () => {
  const r = aggregate([
    F({ rule_id: 'a', severity: 'P3', confidence: 1, file: 'a.ts' }),
    F({ rule_id: 'b', severity: 'P0', confidence: 0.6, file: 'b.ts' }),
    F({ rule_id: 'c', severity: 'P1', confidence: 1, file: 'c.ts' }),
  ]);
  assert.equal(r.findings[0].severity, 'P0');
  assert.equal(r.findings[1].severity, 'P1');
  assert.equal(r.findings[2].severity, 'P3');
});

test('23-04: topN truncates findings', () => {
  const r = aggregate(
    [
      F({ rule_id: 'a', file: 'a.ts' }),
      F({ rule_id: 'b', file: 'b.ts' }),
      F({ rule_id: 'c', file: 'c.ts' }),
    ],
    { topN: 2 },
  );
  assert.equal(r.findings.length, 2);
  assert.equal(r.total, 2);
});

test('23-04: bad input — missing rule_id throws TypeError with index', () => {
  assert.throws(
    () => aggregate([{ file: 'a.ts', severity: 'P1', summary: 's' }]),
    /input\[0\]\.rule_id/,
  );
});

test('23-04: bad input — missing file throws TypeError', () => {
  assert.throws(
    () => aggregate([{ rule_id: 'X', severity: 'P1', summary: 's' }]),
    /input\[0\]\.file/,
  );
});

test('23-04: bad severity throws TypeError', () => {
  assert.throws(
    () => aggregate([F({ severity: 'CRITICAL' })]),
    /severity must be P0\|P1\|P2\|P3/,
  );
});

test('23-04: confidence > 1 clamped + emits warning', () => {
  const warnings = [];
  const handler = (w) => {
    if (w.name === 'AuditAggregator') warnings.push(w.message);
  };
  process.on('warning', handler);
  try {
    const r = aggregate([F({ confidence: 5 })]);
    // Warnings are async; force a microtask flush.
    return new Promise((resolve) => {
      setImmediate(() => {
        process.off('warning', handler);
        assert.ok(warnings.some((m) => /clamped/.test(m)), `no clamp warning: ${JSON.stringify(warnings)}`);
        // Score uses weight*1 (clamped) — for P1: 4*1 = 4.
        assert.equal(r.findings.length, 1);
        resolve();
      });
    });
  } catch (err) {
    process.off('warning', handler);
    throw err;
  }
});

test('23-04: cross-platform normalization — backslash and slash collide', () => {
  const r = aggregate([
    F({ file: 'src\\foo.ts' }),
    F({ file: 'src/foo.ts' }),
  ]);
  assert.equal(r.total, 1);
  assert.equal(r.duplicates, 1);
});

test('23-04: byRule + bySeverity + byFile tallies match findings', () => {
  const r = aggregate([
    F({ rule_id: 'A', severity: 'P0', file: 'a.ts' }),
    F({ rule_id: 'A', severity: 'P0', file: 'b.ts' }),
    F({ rule_id: 'B', severity: 'P1', file: 'a.ts' }),
  ]);
  assert.equal(r.byRule['A'], 2);
  assert.equal(r.byRule['B'], 1);
  assert.equal(r.bySeverity['P0'], 2);
  assert.equal(r.bySeverity['P1'], 1);
  assert.equal(r.byFile['a.ts'], 2);
  assert.equal(r.byFile['b.ts'], 1);
});

test('23-04: merge override callable from opts', () => {
  let mergeCalls = 0;
  const r = aggregate(
    [
      F({ agent: 'a', confidence: 0.6 }),
      F({ agent: 'b', confidence: 0.9 }),
    ],
    { merge: (a, _b) => { mergeCalls += 1; return a; } },
  );
  assert.equal(r.findings[0].agent, 'a');
  assert.equal(mergeCalls, 1);
});

test('23-04: severity weight overrides honored', () => {
  const r = aggregate(
    [
      F({ rule_id: 'a', severity: 'P3', file: 'a.ts' }),
      F({ rule_id: 'b', severity: 'P0', file: 'b.ts' }),
    ],
    { severityWeights: { P0: 1, P3: 100 } },
  );
  // With overrides, P3 outscores P0 by raw weight; but secondary sort is
  // severity rank — P0 still wins in case of score tie. Here the scores
  // differ (100 vs 1), so the higher-weighted P3 wins on score.
  assert.equal(r.findings[0].severity, 'P3');
  assert.equal(r.findings[1].severity, 'P0');
});

test('23-04: dedupKey + normalizePath helpers exposed', () => {
  assert.equal(normalizePath('Src\\Foo.TS'), 'src/foo.ts');
  assert.match(dedupKey({ file: 'a.ts', line: 3, rule_id: 'X' }), /a\.ts::3::X/);
});

test('23-04: defaultMerge picks higher confidence; tie picks higher severity', () => {
  const a = F({ confidence: 0.5, severity: 'P2', agent: 'agent-a' });
  const b = F({ confidence: 0.9, severity: 'P3', agent: 'agent-b' });
  // higher confidence (b) wins
  assert.equal(defaultMerge(a, b), b);
  const c = F({ confidence: 0.5, severity: 'P0', agent: 'agent-c' });
  // tie on confidence; higher severity (c) wins
  assert.equal(defaultMerge(a, c), c);
});

test('23-04: score reflects weight * confidence', () => {
  assert.equal(score({ severity: 'P0', confidence: 1 }, { P0: 8 }), 8);
  assert.equal(score({ severity: 'P1', confidence: 0.5 }, { P1: 4 }), 2);
});
