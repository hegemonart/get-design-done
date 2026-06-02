'use strict';
/**
 * scripts/lib/worktree-resolve.cjs — Phase 49 (Quick Anti-Slop Floor).
 *
 * Redirect `.design/` and `.planning/` writes to the MAIN repo root when GDD
 * runs inside a git WORKTREE. A worktree has its own ephemeral checkout dir; a
 * naive `process.cwd()`-relative `.design/STATE.md` write would land inside the
 * throwaway worktree and get lost (or leak) when the worktree is removed. We
 * detect the worktree, resolve the main repo root, and point artifact writes
 * there so state survives across worktree lifecycles.
 *
 * Detection: `git rev-parse --git-dir` and `--git-common-dir` DIFFER inside a
 * linked worktree (git-dir is `<main>/.git/worktrees/<name>`, common-dir is
 * `<main>/.git`); in the main checkout they are EQUAL. The main repo root is the
 * PARENT of the common git dir.
 *
 * Pure + dependency-free except for spawning `git`, and the `git` call is fully
 * injectable via an `exec` parameter so tests run without a real worktree. NEVER
 * throws: when git is unavailable (no repo, git not on PATH) every resolver
 * degrades gracefully to the caller's `cwd`, so non-git consumers are unaffected.
 *
 * No top-level `Date.now()` / `Math.random()` — the only module-level mutable
 * state is the one-shot `noticeOnce` flag, intentionally per-process.
 *
 * CommonJS so it ships in the npm package and loads from `.cjs` callers and the
 * dual-mode `.ts`/`.js` MCP servers alike.
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

/**
 * Default `exec`: synchronously run `git <args...>` in `cwd` and return its
 * trimmed stdout. Returns null on ANY failure (git missing, non-zero exit,
 * not a repo) so callers can treat "no git" as "not a worktree".
 *
 * @param {string[]} args git arguments, e.g. ['rev-parse', '--git-dir']
 * @param {string} cwd working directory to run git in
 * @returns {string | null} trimmed stdout, or null on failure
 */
function defaultExec(args, cwd) {
  try {
    const res = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (!res || res.status !== 0 || typeof res.stdout !== 'string') return null;
    const out = res.stdout.trim();
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/**
 * Normalize an injectable `exec` into a uniform `(args, cwd) => string|null`.
 *
 * The injectable form callers/tests pass is `(cmd, args) => string` where `cmd`
 * is the literal `'git'` and `args` is the argv array (matching the prompt
 * contract). We adapt it here and swallow throws into null so a test exec that
 * throws models "git unavailable" exactly like the real one returning null.
 *
 * @param {undefined | ((cmd: string, args: string[]) => string)} exec
 * @param {string} cwd
 * @returns {(args: string[]) => string | null}
 */
function makeRunner(exec, cwd) {
  if (typeof exec === 'function') {
    return (args) => {
      try {
        const out = exec('git', args);
        if (typeof out !== 'string') return null;
        const trimmed = out.trim();
        return trimmed.length ? trimmed : null;
      } catch {
        return null;
      }
    };
  }
  return (args) => defaultExec(args, cwd);
}

/**
 * Resolve the absolute git-dir and git-common-dir for `cwd`.
 *
 * `git rev-parse` prints these relative to `cwd` in some setups and absolute in
 * others; we resolve both against `cwd` so comparison and parent-of logic is
 * always done on absolute, normalized paths.
 *
 * @returns {{ gitDir: string, commonDir: string } | null} null when not a repo
 */
function gitDirs(run, cwd) {
  const gitDirRaw = run(['rev-parse', '--git-dir']);
  if (gitDirRaw == null) return null;
  const commonDirRaw = run(['rev-parse', '--git-common-dir']);
  if (commonDirRaw == null) return null;
  const gitDir = path.resolve(cwd, gitDirRaw);
  const commonDir = path.resolve(cwd, commonDirRaw);
  return { gitDir, commonDir };
}

/**
 * True when `cwd` sits inside a linked git WORKTREE (git-dir !== git-common-dir).
 * False in the main checkout, and false (degrade gracefully) when git is
 * unavailable or `cwd` is not inside any repo.
 *
 * @param {string} [cwd=process.cwd()]
 * @param {(cmd: string, args: string[]) => string} [exec] injectable git runner
 * @returns {boolean}
 */
function isWorktree(cwd = process.cwd(), exec) {
  const run = makeRunner(exec, cwd);
  const dirs = gitDirs(run, cwd);
  if (dirs == null) return false;
  return dirs.gitDir !== dirs.commonDir;
}

/**
 * Resolve the MAIN repo root for `cwd`.
 *
 *   - In a worktree: the parent of the git-common-dir (`<main>/.git` -> `<main>`).
 *   - In the main checkout: the toplevel (`git rev-parse --show-toplevel`).
 *   - git unavailable / not a repo: falls back to `path.resolve(cwd)`.
 *
 * Never throws.
 *
 * @param {string} [cwd=process.cwd()]
 * @param {(cmd: string, args: string[]) => string} [exec] injectable git runner
 * @returns {string} absolute main repo root
 */
function resolveRepoRoot(cwd = process.cwd(), exec) {
  const run = makeRunner(exec, cwd);
  const dirs = gitDirs(run, cwd);
  if (dirs == null) {
    // Not a repo / git unavailable — degrade to cwd.
    return path.resolve(cwd);
  }
  if (dirs.gitDir !== dirs.commonDir) {
    // Worktree: the main repo root is the parent of the common `.git` dir.
    // common-dir is typically `<main>/.git`; its dirname is `<main>`. Guard the
    // (unusual) bare-repo case where common-dir has no `.git` basename by only
    // climbing when the basename looks like a git dir.
    const base = path.basename(dirs.commonDir);
    if (base === '.git' || base.endsWith('.git')) {
      return path.dirname(dirs.commonDir);
    }
    // Bare/relocated git dir: best effort — fall through to toplevel below.
  }
  // Main checkout (or odd common-dir shape): prefer the toplevel.
  const top = run(['rev-parse', '--show-toplevel']);
  if (top != null) return path.resolve(cwd, top);
  // Last resort: parent of the git dir, else cwd.
  const base = path.basename(dirs.commonDir);
  if (base === '.git' || base.endsWith('.git')) return path.dirname(dirs.commonDir);
  return path.resolve(cwd);
}

/**
 * Absolute `.design` root in the MAIN repo (worktree-safe).
 *
 * @param {string} [cwd=process.cwd()]
 * @param {(cmd: string, args: string[]) => string} [exec]
 * @returns {string}
 */
function resolveDesignRoot(cwd = process.cwd(), exec) {
  return path.join(resolveRepoRoot(cwd, exec), '.design');
}

/**
 * Absolute `.planning` root in the MAIN repo (worktree-safe).
 *
 * @param {string} [cwd=process.cwd()]
 * @param {(cmd: string, args: string[]) => string} [exec]
 * @returns {string}
 */
function resolvePlanningRoot(cwd = process.cwd(), exec) {
  return path.join(resolveRepoRoot(cwd, exec), '.planning');
}

/** One-shot guard so the redirect notice prints at most once per process. */
let NOTICE_EMITTED = false;

/**
 * Emit a single one-line stderr notice — exactly once per process — announcing
 * that worktree redirection is in effect. Subsequent calls are no-ops, so a
 * caller can invoke this freely on every redirect without spamming stderr.
 *
 * @param {string} targetRoot the resolved MAIN repo root writes are redirected to
 * @param {(line: string) => void} [write] injectable sink (default process.stderr)
 * @returns {boolean} true if THIS call emitted the notice, false if already emitted
 */
function noticeOnce(targetRoot, write) {
  if (NOTICE_EMITTED) return false;
  NOTICE_EMITTED = true;
  const line = `worktree detected -> .design/.planning redirected to ${targetRoot}\n`;
  try {
    if (typeof write === 'function') {
      write(line);
    } else {
      process.stderr.write(line);
    }
  } catch {
    /* never let a logging failure break a write path */
  }
  return true;
}

/** Test-only: reset the one-shot notice flag. Not part of the public contract. */
function _resetNoticeForTests() {
  NOTICE_EMITTED = false;
}

module.exports = {
  isWorktree,
  resolveRepoRoot,
  resolveDesignRoot,
  resolvePlanningRoot,
  noticeOnce,
  _resetNoticeForTests,
};
