'use strict';
// test/suite/phase-49-worktree.test.cjs — Phase 49 (Quick Anti-Slop Floor).
//
// Proves scripts/lib/worktree-resolve.cjs redirects `.design`/`.planning`
// artifact writes to the MAIN repo root when GDD runs inside a git worktree:
//
//   (a) isWorktree() is true when git-dir !== git-common-dir, false when equal;
//   (b) resolveRepoRoot() returns the common-dir PARENT in worktree mode and the
//       toplevel in main-checkout mode;
//   (c) resolveDesignRoot()/resolvePlanningRoot() compose `<root>/.design` and
//       `<root>/.planning` correctly off resolveRepoRoot;
//   (d) graceful fallback to cwd when the injected exec throws (git unavailable);
//   (e) noticeOnce() emits exactly once per process.
//
// All unit tests inject a fake `exec` (cmd, args) => stdout, so no real worktree
// is needed and the suite is hermetic + order-independent. A final OPTIONAL
// integration test creates a real temp worktree under os.tmpdir() and asserts
// resolveRepoRoot points at the main checkout; it self-skips when git is absent.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const wt = require('../../scripts/lib/worktree-resolve.cjs');

// Cross-platform absolute roots for the fakes (avoids hard-coding "/" on win32).
const MAIN = path.resolve(path.join(os.tmpdir(), 'gdd-main-repo'));
const WORKTREE_CWD = path.join(MAIN, '..', 'gdd-wt', 'feature');

/**
 * Build a fake `exec` whose `git rev-parse` answers are driven by a table.
 * Matches the injectable contract: `(cmd, args) => string`. Any arg vector not
 * in the table throws, modeling a git that cannot answer (-> treated as null).
 */
function fakeGit(answers) {
  return (cmd, args) => {
    assert.equal(cmd, 'git', 'resolver must shell out to git');
    const key = args.join(' ');
    if (key in answers) return answers[key];
    throw new Error(`fakeGit: unmapped args "${key}"`);
  };
}

// A worktree: git-dir is <main>/.git/worktrees/<name>, common-dir is <main>/.git.
const WORKTREE_ANSWERS = {
  'rev-parse --git-dir': path.join(MAIN, '.git', 'worktrees', 'feature'),
  'rev-parse --git-common-dir': path.join(MAIN, '.git'),
  'rev-parse --show-toplevel': WORKTREE_CWD,
};

// Main checkout: git-dir === common-dir === <main>/.git; toplevel is <main>.
const MAIN_ANSWERS = {
  'rev-parse --git-dir': path.join(MAIN, '.git'),
  'rev-parse --git-common-dir': path.join(MAIN, '.git'),
  'rev-parse --show-toplevel': MAIN,
};

test('49-worktree: isWorktree true when git-dir != common-dir', () => {
  assert.equal(isTrue(), true);
  function isTrue() {
    return wt.isWorktree(WORKTREE_CWD, fakeGit(WORKTREE_ANSWERS));
  }
});

test('49-worktree: isWorktree false when git-dir == common-dir (main checkout)', () => {
  assert.equal(wt.isWorktree(MAIN, fakeGit(MAIN_ANSWERS)), false);
});

test('49-worktree: resolveRepoRoot returns common-dir parent in worktree mode', () => {
  const root = wt.resolveRepoRoot(WORKTREE_CWD, fakeGit(WORKTREE_ANSWERS));
  assert.equal(root, MAIN, 'worktree root must be the parent of <main>/.git');
});

test('49-worktree: resolveRepoRoot returns toplevel in main-checkout mode', () => {
  const root = wt.resolveRepoRoot(MAIN, fakeGit(MAIN_ANSWERS));
  assert.equal(root, MAIN);
});

test('49-worktree: resolveDesignRoot / resolvePlanningRoot compose off the main root', () => {
  const design = wt.resolveDesignRoot(WORKTREE_CWD, fakeGit(WORKTREE_ANSWERS));
  const planning = wt.resolvePlanningRoot(WORKTREE_CWD, fakeGit(WORKTREE_ANSWERS));
  assert.equal(design, path.join(MAIN, '.design'));
  assert.equal(planning, path.join(MAIN, '.planning'));
});

test('49-worktree: graceful fallback to cwd when exec throws (git unavailable)', () => {
  const boom = () => {
    throw new Error('git: command not found');
  };
  // isWorktree degrades to false; root degrades to resolve(cwd); composites follow.
  assert.equal(wt.isWorktree(WORKTREE_CWD, boom), false);
  assert.equal(wt.resolveRepoRoot(WORKTREE_CWD, boom), path.resolve(WORKTREE_CWD));
  assert.equal(
    wt.resolveDesignRoot(WORKTREE_CWD, boom),
    path.join(path.resolve(WORKTREE_CWD), '.design'),
  );
  assert.equal(
    wt.resolvePlanningRoot(WORKTREE_CWD, boom),
    path.join(path.resolve(WORKTREE_CWD), '.planning'),
  );
});

test('49-worktree: graceful fallback when exec returns null (not a repo)', () => {
  const nullExec = () => null;
  assert.equal(wt.isWorktree(WORKTREE_CWD, nullExec), false);
  assert.equal(wt.resolveRepoRoot(WORKTREE_CWD, nullExec), path.resolve(WORKTREE_CWD));
});

test('49-worktree: noticeOnce emits exactly once per process', () => {
  wt._resetNoticeForTests();
  const lines = [];
  const sink = (l) => lines.push(l);

  const first = wt.noticeOnce(MAIN, sink);
  const second = wt.noticeOnce(MAIN, sink);
  const third = wt.noticeOnce(MAIN, sink);

  assert.equal(first, true, 'first call emits');
  assert.equal(second, false, 'second call is a no-op');
  assert.equal(third, false, 'third call is a no-op');
  assert.equal(lines.length, 1, 'exactly one line written');
  assert.match(lines[0], /worktree detected -> \.design\/\.planning redirected to/);
  assert.ok(lines[0].includes(MAIN), 'notice names the target main root');
  // Reset so a real worktree run later in this process is unaffected.
  wt._resetNoticeForTests();
});

// ---------------------------------------------------------------------------
// OPTIONAL integration test: real temp worktree. Self-skips if git is missing
// or worktree creation fails (sandboxed CI). Uses the DEFAULT exec (real git).
// ---------------------------------------------------------------------------
function gitAvailable() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('49-worktree: [integration] real worktree resolves to the main checkout', { skip: !gitAvailable() }, () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-wt-it-'));
  // The paths do not exist yet — realpath canonicalization (macOS /var ->
  // /private/var) is applied AFTER creation, just before the assertions.
  const mainRepo = path.join(base, 'main');
  const wtDir = path.join(base, 'wt');

  const run = (args, cwd) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

  try {
    fs.mkdirSync(mainRepo, { recursive: true });
    run(['init', '-q'], mainRepo);
    run(['config', 'user.email', 'gdd@test.local'], mainRepo);
    run(['config', 'user.name', 'gdd-test'], mainRepo);
    run(['config', 'commit.gpgsign', 'false'], mainRepo);
    fs.writeFileSync(path.join(mainRepo, 'seed.txt'), 'seed\n', 'utf8');
    run(['add', 'seed.txt'], mainRepo);
    run(['commit', '-q', '-m', 'seed'], mainRepo);
    // Create a linked worktree on a new branch.
    run(['worktree', 'add', '-q', '-b', 'gdd-feature', wtDir], mainRepo);
  } catch {
    // Environment cannot create worktrees — treat as skip rather than fail.
    fs.rmSync(base, { recursive: true, force: true });
    return;
  }

  try {
    const realMain = fs.realpathSync(mainRepo);
    const realWt = fs.realpathSync(wtDir);

    assert.equal(wt.isWorktree(realWt), true, 'real worktree is detected');
    assert.equal(wt.isWorktree(realMain), false, 'main checkout is not a worktree');

    assert.equal(
      fs.realpathSync(wt.resolveRepoRoot(realWt)),
      realMain,
      'resolveRepoRoot from the worktree points at the main checkout',
    );
    // resolveDesignRoot only composes a path string (the dir need not exist);
    // realpath the resolved REPO ROOT, then compose `.design` for comparison.
    const designRoot = wt.resolveDesignRoot(realWt);
    assert.equal(path.basename(designRoot), '.design', 'design root ends in .design');
    assert.equal(
      fs.realpathSync(path.dirname(designRoot)),
      realMain,
      'resolveDesignRoot is rooted at the main checkout',
    );
  } finally {
    // Clean up the worktree registration before removing the tree.
    try {
      execFileSync('git', ['worktree', 'remove', '--force', wtDir], { cwd: mainRepo, stdio: 'ignore' });
    } catch {
      /* best-effort */
    }
    fs.rmSync(base, { recursive: true, force: true });
  }
});
