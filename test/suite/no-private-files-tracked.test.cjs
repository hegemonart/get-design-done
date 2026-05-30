// Private-file leak regression guard (Phase 31.5, Plan 02 — D-03 / HYG-01).
//
// `.gitignore` is non-retroactive: a file committed BEFORE its ignore rule landed
// stays tracked until explicitly `git rm --cached`. That leak happened once (12
// `.planning/*` files + `REVIEW.md` + a stray `tmp_support_preview.png` were
// publicly readable on GitHub) and was remediated on main (commits 8184d90,
// 7e18f0b untracked them). Per D-03 the tree is ALREADY clean, so this plan ships
// ONLY the guard — there is no `git rm --cached` step and `.gitignore` is untouched.
//
// The guard reads the COMMITTED source of truth (`git ls-files`), not the working
// tree, so a private file that is gitignored but `git add`-ed anyway would still be
// caught. Any future commit that re-tracks a matching path fails the build with the
// offending paths named.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const path = require('node:path');

// REPO_ROOT: test lives at test/suite/ (post-31-5-01 depth), so ../.. is the repo root.
// git ls-files is run with cwd = REPO_ROOT so its output is repo-relative (git emits
// forward-slash paths on every platform).
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// The D-03 pattern (do NOT broaden — avoid false positives on legitimately tracked files):
//   ^\.planning/  → the whole private planning tree
//   REVIEW\.md    → the review scratch file (anchored at a path segment boundary)
//   tmp_          → the tmp_ prefix (covers the historical tmp_support_preview.png)
const PRIVATE = /^(\.planning\/|REVIEW\.md|tmp_)/;

test('31-5-02: git ls-files has zero tracked private files (.planning/, REVIEW.md, tmp_)', () => {
  const tracked = execSync('git ls-files', { cwd: REPO_ROOT })
    .toString()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const offenders = tracked.filter((p) => PRIVATE.test(p));

  assert.equal(
    offenders.length,
    0,
    'Private files leaked into git tracking (D-03 regression). ' +
      'Run `git rm --cached <path>` for each, then confirm .gitignore covers them: ' +
      offenders.join(', '),
  );
});

test('31-5-02: guard is non-vacuous — the same filter flags a synthetic leaked list', () => {
  // Proves the matcher actually catches each private class and leaves legitimate
  // files alone, so a future REAL leak fails the build instead of passing silently.
  const synthetic = [
    'package.json',
    '.planning/STATE.md',
    'REVIEW.md',
    'tmp_support_preview.png',
    'src/x.ts',
  ];

  const offenders = synthetic.filter((p) => PRIVATE.test(p));

  assert.deepEqual(
    offenders,
    ['.planning/STATE.md', 'REVIEW.md', 'tmp_support_preview.png'],
    'The private-file matcher must flag each private class and ONLY those',
  );
});
