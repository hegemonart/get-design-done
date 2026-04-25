// tests/touches-analyzer.test.cjs — Plan 23-03 Touches: analyzer
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  parseTouches,
  parseTouchesFile,
  pairwiseVerdict,
  verdictMatrix,
  componentDirPrefix,
} = require('../scripts/lib/touches-analyzer/index.cjs');

test('23-03: parseTouches single line', () => {
  const md = '# Task\n\nTouches: a.ts, bar/**/*.ts, baz.md\n';
  assert.deepEqual(parseTouches(md), ['a.ts', 'bar/**/*.ts', 'baz.md']);
});

test('23-03: parseTouches concatenates multiple lines', () => {
  const md = 'Touches: a.ts, b.ts\n\nfoo\n\nTouches: c.ts\n';
  assert.deepEqual(parseTouches(md), ['a.ts', 'b.ts', 'c.ts']);
});

test('23-03: parseTouches accepts up to 4 leading spaces', () => {
  const md = '    Touches: a.ts, b.ts\n';
  assert.deepEqual(parseTouches(md), ['a.ts', 'b.ts']);
});

test('23-03: parseTouches ignores lines without colon', () => {
  const md = 'Touches a.ts\nTouches: b.ts\n';
  assert.deepEqual(parseTouches(md), ['b.ts']);
});

test('23-03: parseTouches deduplicates case-insensitively, keeps first casing', () => {
  const md = 'Touches: SRC/Foo.ts, src/foo.ts, Other.md\n';
  assert.deepEqual(parseTouches(md), ['SRC/Foo.ts', 'Other.md']);
});

test('23-03: parseTouches normalizes Windows backslashes for dedup', () => {
  const md = 'Touches: src\\foo.ts, src/foo.ts\n';
  // First entry wins; second is collapsed.
  assert.deepEqual(parseTouches(md), ['src\\foo.ts']);
});

test('23-03: parseTouches returns [] on empty input', () => {
  assert.deepEqual(parseTouches(''), []);
  assert.deepEqual(parseTouches('# heading only\n'), []);
});

test('23-03: parseTouchesFile derives taskId from filename', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-touches-file-'));
  try {
    const fp = join(dir, '23-04-PLAN.md');
    writeFileSync(fp, 'Touches: a.ts, b.ts\n');
    const r = parseTouchesFile(fp);
    assert.equal(r.taskId, '23-04-PLAN');
    assert.deepEqual(r.globs, ['a.ts', 'b.ts']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-03: pairwiseVerdict identical glob → sequential/shared-glob', () => {
  const v = pairwiseVerdict(
    { taskId: 'x', globs: ['a.ts'] },
    { taskId: 'y', globs: ['a.ts'] },
  );
  assert.equal(v.verdict, 'sequential');
  assert.equal(v.reason, 'shared-glob');
});

test('23-03: pairwiseVerdict shared src/components/* → sequential', () => {
  const v = pairwiseVerdict(
    { taskId: 'x', globs: ['src/components/Button.tsx'] },
    { taskId: 'y', globs: ['src/components/Card.tsx'] },
  );
  assert.equal(v.verdict, 'sequential');
  assert.equal(v.reason, 'shared-component-dir');
  assert.deepEqual(v.evidence, ['src/components']);
});

test('23-03: pairwiseVerdict disjoint dirs → parallel', () => {
  const v = pairwiseVerdict(
    { taskId: 'x', globs: ['src/api/foo.ts'] },
    { taskId: 'y', globs: ['src/components/Card.tsx'] },
  );
  assert.equal(v.verdict, 'parallel');
  assert.equal(v.reason, 'disjoint');
});

test('23-03: pairwiseVerdict empty globs → sequential/unknown-touches', () => {
  const v1 = pairwiseVerdict(
    { taskId: 'x', globs: [] },
    { taskId: 'y', globs: ['a.ts'] },
  );
  assert.equal(v1.reason, 'unknown-touches');
  const v2 = pairwiseVerdict({ taskId: 'x' }, { taskId: 'y', globs: ['a.ts'] });
  assert.equal(v2.reason, 'unknown-touches');
});

test('23-03: pairwiseVerdict resolved file overlap → shared-file', () => {
  const v = pairwiseVerdict(
    { taskId: 'x', globs: ['src/api/**'], resolved: ['src/api/foo.ts'] },
    { taskId: 'y', globs: ['src/components/**'], resolved: ['src/api/foo.ts'] },
  );
  assert.equal(v.verdict, 'sequential');
  assert.equal(v.reason, 'shared-file');
  assert.deepEqual(v.evidence, ['src/api/foo.ts']);
});

test('23-03: pairwiseVerdict componentDepth=5 makes shallow-shared parallel', () => {
  // src/components/Button.tsx and src/components/Card.tsx — at depth 3
  // they share src/components → sequential. At depth 5, prefix is the
  // first 4 segments. The 4-segment prefix doesn't exist for either
  // (only 3 segments), so prefix is null → no shared dir → parallel.
  const a = { taskId: 'x', globs: ['src/components/Button.tsx'] };
  const b = { taskId: 'y', globs: ['src/components/Card.tsx'] };
  const sd3 = pairwiseVerdict(a, b, { componentDepth: 3 });
  assert.equal(sd3.verdict, 'sequential');
  const sd5 = pairwiseVerdict(a, b, { componentDepth: 5 });
  assert.equal(sd5.verdict, 'parallel');
});

test('23-03: verdictMatrix produces (n choose 2) rows', () => {
  const entries = [
    { taskId: 'a', globs: ['src/api/x.ts'] },
    { taskId: 'b', globs: ['src/components/Y.tsx'] },
    { taskId: 'c', globs: ['docs/z.md'] },
  ];
  const m = verdictMatrix(entries);
  assert.equal(m.length, 3);
  for (const row of m) {
    assert.notEqual(row.a, row.b);
    assert.match(row.reason, /^[a-z][a-z-]+$/);
  }
});

test('23-03: verdictMatrix throws on non-array input', () => {
  assert.throws(() => verdictMatrix('not an array'), /array/);
});

test('23-03: componentDirPrefix returns null for ** prefix or .. paths', () => {
  assert.equal(componentDirPrefix('**/*.ts', 3), null);
  assert.equal(componentDirPrefix('../foo.ts', 3), null);
  assert.equal(componentDirPrefix('src/api/foo.ts', 3), 'src/api');
});
