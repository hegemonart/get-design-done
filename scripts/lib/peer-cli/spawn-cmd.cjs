// scripts/lib/peer-cli/spawn-cmd.cjs
//
// Plan 27-03 — cross-platform child-process spawn for peer-CLI binaries.
//
// ============================================================================
// THE WINDOWS .cmd EINVAL PROBLEM — DO NOT "CLEAN UP" THIS WORKAROUND
// ============================================================================
//
// Node's `child_process.spawn(absolutePath, args)` on Windows fails with EINVAL
// when `absolutePath` ends in `.cmd` and `shell` is not set. This is a
// long-standing, well-documented Node behavior tied to how Windows resolves
// `.cmd` shim launchers (npm, yarn, claude, gemini, codex, cursor, copilot,
// qwen all ship `.cmd` shims on Windows). Without the `shell: true` form,
// every Windows user sees:
//
//     Error: spawn EINVAL
//         at ChildProcess.spawn (node:internal/child_process:421:11)
//
// The fix, per cc-multi-cli's `transport-decisions.md` (Apache-2.0), is to
// invoke the .cmd through `cmd.exe` by passing a single shell-quoted command
// string with `shell: true`. We forward-slash the path so Windows shell
// resolves it correctly even when the path contains backslashes:
//
//     // BROKEN on Windows for .cmd shims:
//     spawn('C:\\Users\\me\\AppData\\Local\\codex.cmd', ['app-server'])
//
//     // WORKS everywhere (.cmd via cmd.exe; non-.cmd via direct exec):
//     const fwd = absPath.replace(/\\/g, '/');
//     spawn(`"${fwd}" ${args.join(' ')}`, [], { shell: true })
//
// Why we don't `shell: true` unconditionally: shell mode adds ~30ms per spawn
// on Linux/macOS, mangles argument quoting in surprising ways for binaries
// that DO support direct exec (the entire POSIX peer-CLI fleet), and exposes
// a shell-injection surface we don't need outside the .cmd workaround. So
// we shell ONLY when the workaround actually applies.
//
// References:
//   - cc-multi-cli `transport-decisions.md` (Apache 2.0; ported with NOTICE
//     attribution per Plan 27 D-02 / D-14).
//   - Phase 27 CONTEXT.md decision D-04.
//   - Node child_process EINVAL on Windows .cmd: see Node issue tracker for
//     the long-standing CVE-2024-27980-driven hardening that made this
//     fully unworkable without `shell: true` on modern Node.
//
// ============================================================================
// CONTRACT
// ============================================================================
//
//     const cp = spawnCmd('/path/to/gemini', ['acp'], { cwd: '/repo' });
//     // cp is a normal ChildProcess; works the same on POSIX + Windows .cmd
//
// On non-.cmd paths or non-Windows platforms we delegate to the plain
// `spawn(path, args, opts)` form. On Windows .cmd we apply the fix above.
//
// This module is `.cjs` (matching the rest of `scripts/lib/peer-cli/`) so it
// can be `require()`d from both the broker subprocess host and the
// adapter/registry layer without `--experimental-strip-types`.

'use strict';

const child_process = require('node:child_process');

/**
 * Per-call platform/path overrides for testing. Most callers omit this
 * entirely; tests inject a fake platform string + custom spawn function so
 * we can exercise the Windows shell branch on macOS/Linux CI.
 *
 * @typedef {object} SpawnCmdInternals
 * @property {NodeJS.Platform} [platform]  override for `process.platform`
 * @property {(cmd: string, args: string[], opts: object) => any} [spawn]
 *   override for the underlying spawn implementation; receives the EXACT
 *   arguments we would pass to `child_process.spawn`. Useful for asserting
 *   that the .cmd branch produced the right shell-mode invocation.
 */

/**
 * Spawn a child process for a peer-CLI binary, transparently applying the
 * Windows `.cmd` EINVAL workaround when needed.
 *
 * @param {string} command  absolute path to the executable. May be `.cmd` /
 *   `.bat` on Windows. Do NOT pass a bare command name like `"gemini"`;
 *   resolve it to an absolute path first (the registry's job).
 * @param {readonly string[]} [args]  argv tail. Defaults to `[]`.
 * @param {object} [options]  forwarded to `child_process.spawn`. We add
 *   `shell: true` automatically on the Windows .cmd path; callers should NOT
 *   pre-set it unless they really know what they're doing.
 * @param {SpawnCmdInternals} [internals]  test-only injection point. Real
 *   callers omit this.
 * @returns {import('node:child_process').ChildProcess}
 *
 * @throws {TypeError} if `command` is not a non-empty string.
 */
function spawnCmd(command, args, options, internals) {
  if (typeof command !== 'string' || command.length === 0) {
    throw new TypeError(
      'spawnCmd: command must be a non-empty absolute path string',
    );
  }
  const safeArgs = Array.isArray(args) ? args : [];
  const safeOpts = options && typeof options === 'object' ? options : {};
  const platform = (internals && internals.platform) || process.platform;
  const spawnImpl = (internals && internals.spawn) || child_process.spawn;

  const isWindows = platform === 'win32';
  const lower = command.toLowerCase();
  const isCmdShim = lower.endsWith('.cmd') || lower.endsWith('.bat');

  if (isWindows && isCmdShim) {
    // Forward-slash the path so the shell resolves it consistently even when
    // the absolute path contains backslashes. The double-quote wrapper handles
    // paths with spaces ("C:/Program Files/...").
    const fwd = command.replace(/\\/g, '/');
    const quoted = safeArgs.map(quoteShellArg).join(' ');
    const line = quoted.length > 0 ? `"${fwd}" ${quoted}` : `"${fwd}"`;

    // shell: true is the whole point of this branch — DO NOT remove it.
    return spawnImpl(line, [], { ...safeOpts, shell: true });
  }

  // POSIX / non-.cmd Windows: direct exec. Faster, cleaner, no shell quoting
  // surprises.
  return spawnImpl(command, safeArgs, safeOpts);
}

/**
 * Conservative shell quoting for the Windows .cmd shell-mode branch. We're
 * targeting cmd.exe (not bash), so the rules are different from POSIX:
 *
 *   - Empty arg → `""`
 *   - Arg with no whitespace and no shell metachars → leave untouched
 *   - Otherwise → wrap in `"..."` with embedded `"` doubled to `""`
 *
 * cmd.exe does not interpret backslashes the way POSIX shells do, so we
 * leave them alone. Forward slashes pass through unchanged.
 *
 * @param {string} arg
 * @returns {string}
 */
function quoteShellArg(arg) {
  const s = String(arg);
  if (s.length === 0) return '""';
  // Bail to quoted form if anything that cmd.exe parses specially is present.
  if (/[\s"&|<>^()%!]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

module.exports = { spawnCmd, quoteShellArg };
