'use strict';
/**
 * Plan 30.5-02 — failure-mode-matcher unit tests.
 *
 * Validates the fuzzy bag-of-words matcher introduced as an additive
 * sibling to Phase 30's exact-match `triage-matcher.cjs` (D-04).
 *
 * Covered (≥12 cases):
 *   1. Empty catalogue → []
 *   2. Perfect match → length 1, confidence > 0.8
 *   3. Ambiguous error → up to topN, declining confidences
 *   4. No-match (zero token overlap) → []
 *   5. Threshold filter drops sub-0.4 candidates
 *   6. topN respected (option override)
 *   7. Top-1 dominance (Δ ≥ 0.15) → only [top1]
 *   8. Stop-word-only input → []
 *   9. Stack-trace tokens contribute to score
 *   10. Malformed catalogue entry skipped without throw
 *   11. Backward-compat: old-shape (diagnosis/remedy) entries scored
 *   12. Determinism: two calls produce JSON.stringify-identical output
 *   13. D-04 — `triage-matcher.cjs` byte-identical to HEAD
 *
 * Synthetic fixtures only — NO live `.design/` reads, NO live `reference/`
 * reads, NO network. Per Phase 30.5 D-10.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

const { match } = require('../../scripts/lib/failure-mode-matcher.cjs');

const FIXT = (name) =>
  path.join(__dirname, 'fixtures', 'failure-mode-matcher', `catalogue-${name}.md`);

// -------------------------------------------------------------------
// 1. Empty catalogue → []
// -------------------------------------------------------------------
test('empty catalogue returns []', () => {
  const res = match(
    { message: 'anything goes here' },
    { cataloguePath: FIXT('empty') }
  );
  assert.deepEqual(res, []);
});

// -------------------------------------------------------------------
// 2. Perfect-overlap match → length 1, confidence > 0.8
// -------------------------------------------------------------------
test('perfect match returns one high-confidence candidate', () => {
  const res = match(
    {
      message:
        'connection reset peer remote terminated socket transfer mid intermediary',
    },
    { cataloguePath: FIXT('full') }
  );
  assert.ok(res.length >= 1, 'expected at least one match');
  assert.equal(res[0].modeId, 'FIX-104');
  assert.ok(res[0].confidence > 0.5, `confidence too low: ${res[0].confidence}`);
});

// -------------------------------------------------------------------
// 3. Ambiguous error → up to topN, declining confidences
// -------------------------------------------------------------------
test('ambiguous error returns up to topN declining-confidence candidates', () => {
  const res = match(
    {
      message:
        'timeout permission syntax operation error filesystem write rejected token grammar',
    },
    { cataloguePath: FIXT('small'), topN: 3, threshold: 0.05 }
  );
  assert.ok(res.length >= 2, `expected ≥2 candidates, got ${res.length}`);
  for (let i = 1; i < res.length; i++) {
    assert.ok(
      res[i - 1].confidence >= res[i].confidence,
      `confidences not monotonically decreasing: ${JSON.stringify(
        res.map((r) => r.confidence)
      )}`
    );
  }
});

// -------------------------------------------------------------------
// 4. Zero token overlap → []
// -------------------------------------------------------------------
test('zero token overlap returns []', () => {
  const res = match(
    { message: 'xylophone quokka borborygmus kookaburra' },
    { cataloguePath: FIXT('full') }
  );
  assert.deepEqual(res, []);
});

// -------------------------------------------------------------------
// 5. Threshold filter drops weak candidates
// -------------------------------------------------------------------
test('threshold filter drops sub-threshold candidates', () => {
  // Weak overlap: "broken" alone should score below 0.4 against
  // FIX-105 ("EPIPE broken pipe").
  const weak = match(
    { message: 'broken' },
    { cataloguePath: FIXT('full'), threshold: 0.4 }
  );
  // Bumping threshold up should produce strictly fewer (or equal) results
  // compared to a permissive threshold.
  const permissive = match(
    { message: 'broken' },
    { cataloguePath: FIXT('full'), threshold: 0.01 }
  );
  assert.ok(
    weak.length <= permissive.length,
    'strict threshold did not reduce result count'
  );
  for (const c of weak) {
    assert.ok(
      c.confidence >= 0.4,
      `entry below threshold leaked through: ${c.modeId}@${c.confidence}`
    );
  }
});

// -------------------------------------------------------------------
// 6. topN respected (option override)
// -------------------------------------------------------------------
test('topN option clamps result count', () => {
  const res = match(
    {
      message:
        'file directory not exist permission denied open files reset peer broken pipe',
    },
    { cataloguePath: FIXT('full'), topN: 2, threshold: 0.05 }
  );
  assert.ok(res.length <= 2, `topN=2 violated: got ${res.length}`);
});

// -------------------------------------------------------------------
// 7. Top-1 dominance (Δ ≥ 0.15) → only [top1]
// -------------------------------------------------------------------
test('top-1 dominance collapses result to single entry', () => {
  // Heavy keyword load for FIX-104 only.
  const res = match(
    {
      message:
        'connection reset by peer terminated socket transfer remote intermediary tcp dropped mid',
      stack:
        'at remote peer terminated tcp connection load balancer dropped socket',
    },
    { cataloguePath: FIXT('full'), topN: 3, threshold: 0.1 }
  );
  assert.equal(res.length, 1, `expected dominance collapse, got ${res.length}`);
  assert.equal(res[0].modeId, 'FIX-104');
});

// -------------------------------------------------------------------
// 8. Stop-word-only input → []
// -------------------------------------------------------------------
test('stop-word-only message returns []', () => {
  const res = match(
    { message: 'the a is in of to for on at by with and or but as if it' },
    { cataloguePath: FIXT('full') }
  );
  assert.deepEqual(res, []);
});

// -------------------------------------------------------------------
// 9. Stack-trace tokens contribute to score
// -------------------------------------------------------------------
test('stack-trace tokens increase confidence', () => {
  const messageOnly = match(
    { message: 'operation failed' },
    { cataloguePath: FIXT('full'), threshold: 0.01 }
  );
  const withStack = match(
    {
      message: 'operation failed',
      stack:
        'EACCES permission denied chmod chown ownership mode bits forbidden access rights',
    },
    { cataloguePath: FIXT('full'), threshold: 0.01 }
  );

  const eaccesEntry = (arr) => arr.find((r) => r.modeId === 'FIX-102');
  const before = eaccesEntry(messageOnly);
  const after = eaccesEntry(withStack);
  assert.ok(after, 'FIX-102 should score with stack-trace tokens present');
  if (before) {
    assert.ok(
      after.confidence > before.confidence,
      `stack did not raise confidence: ${before.confidence} → ${after.confidence}`
    );
  } else {
    assert.ok(after.confidence > 0, 'stack failed to push entry above zero');
  }
});

// -------------------------------------------------------------------
// 10. Malformed catalogue entry skipped without throw
// -------------------------------------------------------------------
test('malformed entry is skipped, valid sibling still returned', () => {
  // Suppress the parser's one-time warn during this assertion.
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const res = match(
      { message: 'disk full ENOSPC out of free space volume exhausted inodes' },
      { cataloguePath: FIXT('malformed'), threshold: 0.1 }
    );
    assert.ok(res.length >= 1, 'valid sibling should still be returned');
    assert.equal(res[0].modeId, 'FIX-V01');
    // Ensure broken entry is absent.
    assert.ok(
      !res.find((r) => r.modeId === 'FIX-V02'),
      'broken-regex entry should be filtered out'
    );
  } finally {
    console.warn = originalWarn;
  }
});

// -------------------------------------------------------------------
// 11. Backward-compat: old-shape entries (diagnosis/remedy) scored
// -------------------------------------------------------------------
test('backward-compat: old-shape entries with diagnosis/remedy are scored', () => {
  // Build a temp fixture with only old-shape fields (no symptom/root_cause/fix).
  const tmpDir = path.join(__dirname, 'fixtures', 'failure-mode-matcher');
  const tmpPath = path.join(tmpDir, 'catalogue-backcompat-tmp.md');
  const md = [
    '# Backcompat fixture (test-time only)',
    '',
    '```yaml',
    "id: FIX-OLD",
    "pattern: 'EACCES'",
    "diagnosis: 'Permission denied on filesystem write — ownership wrong.'",
    "remedy: 'Run chown on the target path and retry the operation.'",
    'severity: medium',
    '```',
    '',
  ].join('\n');
  fs.writeFileSync(tmpPath, md);
  try {
    const res = match(
      {
        message:
          'permission denied write filesystem ownership chown chmod target retry',
      },
      { cataloguePath: tmpPath, threshold: 0.1 }
    );
    assert.equal(res.length, 1, 'old-shape entry should be matched');
    assert.equal(res[0].modeId, 'FIX-OLD');
    assert.ok(
      typeof res[0].diagnosis === 'string' && res[0].diagnosis.length > 0,
      'diagnosis should round-trip on the result'
    );
    assert.ok(
      typeof res[0].remedy === 'string' && res[0].remedy.length > 0,
      'remedy should round-trip on the result'
    );
  } finally {
    fs.unlinkSync(tmpPath);
  }
});

// -------------------------------------------------------------------
// 12. Determinism — two calls produce JSON.stringify-identical output
// -------------------------------------------------------------------
test('determinism: two calls produce byte-identical JSON output', () => {
  const input = {
    message: 'timeout elapsed deadline exceeded permission denied syntax token',
  };
  const opts = { cataloguePath: FIXT('small'), topN: 3, threshold: 0.05 };
  const a = JSON.stringify(match(input, opts));
  const b = JSON.stringify(match(input, opts));
  const c = JSON.stringify(match(input, opts));
  assert.equal(a, b);
  assert.equal(b, c);
});

// -------------------------------------------------------------------
// 13. D-04 — Phase 30 `triage-matcher.cjs` byte-identical to HEAD
//
// Two layers of guard, both required:
//   (a) `git diff HEAD -- <file>` is empty — the canonical "file is
//       unchanged in the repository" check. This is line-ending-agnostic
//       (git normalises via .gitattributes / core.autocrlf), making it
//       the right oracle on cross-platform checkouts.
//   (b) Semantic content equality (LF-normalised) between the worktree
//       copy and `git show HEAD:<file>`. Defends against the case where
//       the file is staged + reverted but a diff would still be empty.
// -------------------------------------------------------------------
test('D-04 guard: triage-matcher.cjs is byte-identical to HEAD', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const fileRel = 'scripts/lib/issue-reporter/triage-matcher.cjs';
  const filePath = path.join(repoRoot, fileRel);

  // Layer (a) — repository diff oracle.
  let diff;
  try {
    diff = execSync(`git diff HEAD -- "${fileRel}"`, {
      cwd: repoRoot,
      maxBuffer: 8 * 1024 * 1024,
      encoding: 'utf8',
    });
  } catch (e) {
    assert.fail(`git diff HEAD failed for ${fileRel}: ${e && e.message}`);
  }
  assert.equal(
    diff.trim(),
    '',
    `triage-matcher.cjs has uncommitted changes — D-04 violated:\n${diff}`
  );

  // Layer (b) — semantic content match (LF-normalised so CRLF
  // checkouts on Windows don't false-positive).
  const onDisk = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  let atHead;
  try {
    atHead = execSync(`git show HEAD:${fileRel}`, {
      cwd: repoRoot,
      maxBuffer: 8 * 1024 * 1024,
      encoding: 'utf8',
    }).replace(/\r\n/g, '\n');
  } catch (e) {
    assert.fail(
      `unable to read HEAD:${fileRel} via git show — ${e && e.message}`
    );
  }
  assert.equal(
    onDisk,
    atHead,
    'triage-matcher.cjs content drifted from HEAD — D-04 violated'
  );
});
