'use strict';
/**
 * gh-absent-fallback.cjs — Plan 30-06.
 *
 * Closes D-10: when `gh` CLI is absent, copy the pseudonymized payload to
 * the user's clipboard and print a GitHub issue-template URL with an
 * explicit "gh CLI not found; payload copied to clipboard, paste into the
 * link below." message. Never fail silently.
 *
 * Cross-platform clipboard:
 *   - macOS  → pbcopy
 *   - Linux  → wl-copy (Wayland) preferred; xclip -selection clipboard fallback
 *   - Win32  → clip.exe (works in cmd, PowerShell, and via WSL)
 *
 * Destination repo slug is REUSED from `./destination.cjs` (Plan 30-04,
 * D-02 — single source of truth, frozen export). No env-var lookup, no
 * config override, no flag override. The same static-analysis test that
 * locks 30-04 also scans this file: see
 *   tests/report-issue-destination-static.test.cjs
 *
 * All shell-outs use argv arrays via spawn/spawnSync — never string
 * commands — to avoid quoting bugs and shell-injection surface.
 *
 * Dependency-injection design:
 *   detectGh, resolveClipboardCommand, copyToClipboard, runFallback all
 *   accept an options bag with { platform, spawnSync, spawn, stdout }
 *   overrides so tests can mock platform branches without touching
 *   process.platform or the real child_process module.
 */

const child_process = require('node:child_process');

const { DESTINATION_REPO } = require('./destination.cjs');

const ISSUE_TEMPLATE_URL = `https://github.com/${DESTINATION_REPO}/issues/new?template=bug_report.md`;
const FALLBACK_MESSAGE = 'gh CLI not found; payload copied to clipboard, paste into the link below.';

/**
 * Detect whether the `gh` CLI is available on PATH.
 *
 * On win32 uses `where gh`; elsewhere uses `which gh`. Returns true if
 * the lookup exits 0.
 *
 * @param {object} [opts]
 * @param {NodeJS.Platform} [opts.platform=process.platform]
 * @param {typeof child_process.spawnSync} [opts.spawnSync=child_process.spawnSync]
 * @returns {boolean}
 */
function detectGh(opts) {
  const o = opts || {};
  const platform = o.platform || process.platform;
  const spawnSync = o.spawnSync || child_process.spawnSync;
  const cmd = platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(cmd, ['gh'], { stdio: 'ignore' });
  return result && result.status === 0;
}

/**
 * Resolve the platform-appropriate clipboard command + argv.
 *
 * Returns null if no supported clipboard tool is found on the current
 * platform — callers should fall back to printing-only behaviour and
 * surface the path/URL to the user.
 *
 * @param {object} [opts]
 * @param {NodeJS.Platform} [opts.platform=process.platform]
 * @param {typeof child_process.spawnSync} [opts.spawnSync=child_process.spawnSync]
 * @returns {{command: string, args: string[]} | null}
 */
function resolveClipboardCommand(opts) {
  const o = opts || {};
  const platform = o.platform || process.platform;
  const spawnSync = o.spawnSync || child_process.spawnSync;

  if (platform === 'darwin') {
    return { command: 'pbcopy', args: [] };
  }
  if (platform === 'win32') {
    return { command: 'clip.exe', args: [] };
  }
  if (platform === 'linux') {
    // Wayland-first: try wl-copy.
    const wlResult = spawnSync('which', ['wl-copy'], { stdio: 'ignore' });
    if (wlResult && wlResult.status === 0) {
      return { command: 'wl-copy', args: [] };
    }
    // X11/Xorg fallback: xclip.
    const xclipResult = spawnSync('which', ['xclip'], { stdio: 'ignore' });
    if (xclipResult && xclipResult.status === 0) {
      return { command: 'xclip', args: ['-selection', 'clipboard'] };
    }
    return null;
  }
  // Unsupported platform (e.g., freebsd, openbsd, sunos, aix).
  return null;
}

/**
 * Pipe `payload` into the resolved clipboard command via stdin.
 *
 * Returns a Promise that resolves with { ok, command, code? }. Never
 * rejects on a non-zero exit — instead resolves with ok=false so the
 * caller can decide how to surface the failure (typically: still print
 * the URL so the user can file the issue manually).
 *
 * @param {string} payload
 * @param {object} [opts]
 * @param {NodeJS.Platform} [opts.platform=process.platform]
 * @param {typeof child_process.spawnSync} [opts.spawnSync=child_process.spawnSync]
 * @param {typeof child_process.spawn} [opts.spawn=child_process.spawn]
 * @returns {Promise<{ok: boolean, command: string|null, code?: number|null}>}
 */
function copyToClipboard(payload, opts) {
  const o = opts || {};
  const spawn = o.spawn || child_process.spawn;
  const resolved = resolveClipboardCommand({
    platform: o.platform,
    spawnSync: o.spawnSync,
  });
  if (resolved == null) {
    return Promise.resolve({ ok: false, command: null });
  }
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(resolved.command, resolved.args, {
        stdio: ['pipe', 'ignore', 'ignore'],
      });
    } catch (err) {
      resolve({ ok: false, command: resolved.command, code: null });
      return;
    }
    if (!child || !child.on || !child.stdin) {
      resolve({ ok: false, command: resolved.command, code: null });
      return;
    }
    child.on('error', () => {
      resolve({ ok: false, command: resolved.command, code: null });
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, command: resolved.command, code });
    });
    try {
      child.stdin.write(payload);
      child.stdin.end();
    } catch (err) {
      // stdin write may fail if child errored before writes completed.
      resolve({ ok: false, command: resolved.command, code: null });
    }
  });
}

/**
 * Build the destination issue-template URL.
 *
 * Reuses DESTINATION_REPO from `./destination.cjs` (Plan 30-04). No
 * env-var lookup, no config override — same single-source-of-truth
 * invariant as the gh-submit path. The URL is computed once at module
 * load (ISSUE_TEMPLATE_URL constant) so identical calls return identical
 * bytes regardless of subsequent env-var mutation.
 *
 * @returns {string}
 */
function buildIssueTemplateUrl() {
  return ISSUE_TEMPLATE_URL;
}

/**
 * Run the gh-absent fallback path end-to-end.
 *
 * Steps:
 *   1. Copy payload to clipboard via the platform-appropriate command.
 *   2. Write exact "gh CLI not found..." message to stdout.
 *   3. Write a blank line.
 *   4. Write the issue-template URL.
 *
 * If clipboard copy failed (no command available, or non-zero exit), the
 * message is adapted to omit the "copied to clipboard" claim — the URL
 * still prints so the user has a manual path forward.
 *
 * @param {string} payload
 * @param {object} [opts]
 * @param {NodeJS.WritableStream} [opts.stdout=process.stdout]
 * @param {NodeJS.Platform} [opts.platform]
 * @param {typeof child_process.spawnSync} [opts.spawnSync]
 * @param {typeof child_process.spawn} [opts.spawn]
 * @returns {Promise<{copied: boolean, url: string}>}
 */
async function runFallback(payload, opts) {
  const o = opts || {};
  const stdout = o.stdout || process.stdout;
  const url = buildIssueTemplateUrl();

  const result = await copyToClipboard(payload, {
    platform: o.platform,
    spawnSync: o.spawnSync,
    spawn: o.spawn,
  });

  const message = result.ok
    ? FALLBACK_MESSAGE
    : 'gh CLI not found; clipboard copy failed — visit the link below to file the issue manually.';

  stdout.write(message + '\n');
  stdout.write('\n');
  stdout.write(url + '\n');

  return { copied: result.ok, url };
}

module.exports = {
  detectGh,
  resolveClipboardCommand,
  copyToClipboard,
  buildIssueTemplateUrl,
  runFallback,
};
