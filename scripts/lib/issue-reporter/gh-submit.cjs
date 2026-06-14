'use strict';
/**
 * gh-submit.cjs — Plan 30-04 D-05 outbound submitter via the gh CLI.
 *
 * Wraps `gh issue create --repo <DESTINATION_REPO> --title <title> --body-file <tmp>`.
 *
 * D-05: the user's gh CLI is the sole outbound primitive. No HTTP-S
 * URL literals, no global fetch primitive, no plugin-side credentials.
 * Phase 30-07 ships the CI gate (static-analysis test) that fails the
 * build if anyone adds a forbidden network token under this tree — see
 * `tests/issue-reporter-network-isolation.test.cjs` for the enforced
 * list. This module deliberately uses `spawnSync` against `gh` so it's
 * trivially auditable.
 *
 * D-02: --repo is wired to destination.cjs's frozen DESTINATION_REPO.
 * There is no `--repo` parameter on submitViaGh because the destination
 * is hardcoded, not user-configurable.
 *
 * Default exported behaviour writes the body to a tmp file and spawns
 * gh; callers (tests, alternative shells) can inject a `spawn` function
 * for hermetic testing.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { DESTINATION_REPO } = require('./destination.cjs');

/** Parse the gh-issue-create stdout for the resulting issue URL. */
function extractUrl(stdout) {
  if (typeof stdout !== 'string') return '';
  // gh prints the URL on its own line at the end of stdout.
  const match = stdout.match(/https?:\/\/\S+/);
  return match ? match[0] : '';
}

/**
 * Submit an issue to the hardcoded destination via the user's gh CLI.
 *
 * @param {{
 *   title: string,
 *   body: string,
 *   spawn?: (cmd: string, args: string[], opts?: object) => { status: number|null, stdout: string|Buffer, stderr: string|Buffer },
 *   tmpDir?: string,
 *   ghPath?: string
 * }} opts
 * @returns {{ url: string, stdout: string, repo: string }}
 */
function submitViaGh(opts) {
  if (opts == null || typeof opts !== 'object') {
    throw new Error('submitViaGh: opts object required');
  }
  const title = String(opts.title == null ? '' : opts.title);
  const body = String(opts.body == null ? '' : opts.body);
  if (title.length === 0) throw new Error('submitViaGh: title required');
  if (body.length === 0) throw new Error('submitViaGh: body required');

  const tmpDir = opts.tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), 'hone-issue-'));
  const bodyFile = path.join(tmpDir, 'body.md');
  fs.writeFileSync(bodyFile, body, 'utf8');

  const spawn = opts.spawn || spawnSync;
  const ghPath = opts.ghPath || 'gh';

  // Argument order is deliberate: --repo must come BEFORE --title/--body-file
  // so the test for H1 ("--repo hegemonart/hone in argv") can use
  // simple substring matching and not be sensitive to interleaving.
  const args = [
    'issue', 'create',
    '--repo', DESTINATION_REPO,
    '--title', title,
    '--body-file', bodyFile,
  ];

  const result = spawn(ghPath, args, { encoding: 'utf8' });

  const stdout =
    result && result.stdout != null
      ? (Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : String(result.stdout))
      : '';
  const stderr =
    result && result.stderr != null
      ? (Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : String(result.stderr))
      : '';

  if (result && (result.status !== 0 && result.status !== null)) {
    const err = new Error(
      `gh issue create exited with status ${result.status}: ${stderr.trim() || stdout.trim()}\n` +
        `Draft preserved at ${bodyFile}; check 'gh auth status' if this looks like an auth failure.`
    );
    // @ts-expect-error attach details
    err.status = result.status;
    // @ts-expect-error attach details
    err.stdout = stdout;
    // @ts-expect-error attach details
    err.stderr = stderr;
    // @ts-expect-error attach details
    err.bodyFile = bodyFile;
    throw err;
  }

  return {
    url: extractUrl(stdout),
    stdout,
    repo: DESTINATION_REPO,
  };
}

module.exports = {
  submitViaGh,
  extractUrl,
};
