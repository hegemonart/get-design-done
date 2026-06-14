'use strict';
/**
 * consent-prompt.cjs — Plan 30-04 D-03 consent gate.
 *
 * The ONE place where the user explicitly says "yes" before /hone:report-issue
 * submits anything. There is no auto-mode and no env-var bypass:
 *
 *   - Refuses (throws) if stdin is not a TTY (no piped 'y' from CI, no
 *     non-interactive shells).
 *   - Refuses (throws) if any process.env key matches /REPORT|ISSUE|AUTO_REPORT/i
 *     AND has a truthy value (runtime belt + suspenders for the static test
 *     in tests/report-issue-no-auto-submit-static.test.cjs).
 *   - Treats any answer other than literal `y`/`yes` (case-insensitive) as
 *     decline.
 *
 * After (optionally) opening the user's $EDITOR on the draft, RE-READS the
 * draft from disk and returns the re-read title + body. This is what makes
 * "edit before submit" work: the editor exit handler does not bind the
 * content; the content is freshly loaded from the file path on every entry.
 *
 * EDITOR is a POSIX-standard user env (used by git, crontab, gh itself). It
 * is intentionally NOT in the forbidden list — the static test only blocks
 * names matching /REPORT|ISSUE|AUTO_REPORT/i.
 *
 * Pure dependencies: readline, child_process.spawnSync. No `fetch`, no
 * `https`, no third-party packages.
 */

const fs = require('node:fs');
const readline = require('node:readline');
const { spawnSync } = require('node:child_process');

const { DESTINATION_REPO } = require('./destination.cjs');
const { readDraft } = require('./draft-writer.cjs');

const FORBIDDEN_ENV_RE = /(REPORT|ISSUE|AUTO_REPORT)/i;

/**
 * Scan process.env for any auto-submit bypass env var with a truthy value.
 * If found, throws — D-03 runtime gate counterpart to the static test.
 *
 * Implementation note: we iterate Object.keys(process.env) so we can match
 * substrings (REPORT, ISSUE, AUTO_REPORT). We never directly read a
 * specific named env var here — that would itself fail the static-grep
 * test in tests/report-issue-no-auto-submit-static.test.cjs (which only
 * forbids `process.env.NAME` patterns).
 *
 * Truthy means: present, non-empty, not literal "0" / "false" / "no".
 *
 * @param {NodeJS.ProcessEnv} [env] — injection point for tests
 */
function rejectBypassEnv(env) {
  const source = env || process.env;
  const offenders = [];
  for (const key of Object.keys(source)) {
    if (!FORBIDDEN_ENV_RE.test(key)) continue;
    const value = source[key];
    if (value == null) continue;
    const s = String(value).trim().toLowerCase();
    if (s === '' || s === '0' || s === 'false' || s === 'no') continue;
    offenders.push(key);
  }
  if (offenders.length > 0) {
    throw new Error(
      `refused: env var ${offenders.join(', ')} detected; /hone:report-issue has no auto-mode by design (D-03)`
    );
  }
}

/**
 * Open the user's $EDITOR on the draft file, blocking until it exits.
 *
 * @param {string} draftPath
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean} — true if an editor was spawned, false if EDITOR unset
 */
function openInEditor(draftPath, env) {
  const source = env || process.env;
  const editor = source.EDITOR;
  if (typeof editor !== 'string' || editor.trim().length === 0) {
    return false;
  }
  // Whole-string command: split on first space for editor + args.
  const parts = editor.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1).concat([draftPath]);
  spawnSync(cmd, args, { stdio: 'inherit' });
  return true;
}

/**
 * Ask the user the single y/N question via readline. EOF / empty input
 * counts as decline.
 *
 * @param {NodeJS.ReadableStream} input
 * @param {NodeJS.WritableStream} output
 * @returns {Promise<string>} — raw answer string
 */
function askYesNo(input, output) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input, output, terminal: false });
    let answered = false;
    const finish = (value) => {
      if (answered) return;
      answered = true;
      try { rl.close(); } catch { /* noop */ }
      resolve(value);
    };
    rl.question(
      `Submit this issue to ${DESTINATION_REPO}? [y/N] `,
      (answer) => finish(typeof answer === 'string' ? answer.trim() : '')
    );
    rl.on('close', () => finish(''));
  });
}

function isAffirmative(answer) {
  if (typeof answer !== 'string') return false;
  const a = answer.trim().toLowerCase();
  return a === 'y' || a === 'yes';
}

/**
 * Build the human-facing summary printed before the y/N question.
 *
 * @param {{ title: string, body: string }} draft
 * @param {string} draftPath
 * @returns {string}
 */
function buildSummary(draft, draftPath) {
  const head = String(draft.body || '').split(/\r?\n/).slice(0, 10).join('\n');
  return [
    '',
    '--- /hone:report-issue draft summary ---',
    `Destination: ${DESTINATION_REPO}`,
    `Draft path:  ${draftPath}`,
    `Title:       ${draft.title}`,
    'Body (first 10 lines):',
    head,
    '---',
    '',
  ].join('\n');
}

/**
 * The full consent flow.
 *
 *   1. Reject bypass env vars (throw).
 *   2. Reject non-TTY stdin (throw).
 *   3. (Optional) open $EDITOR on the draft and wait.
 *   4. Re-read the draft from disk → final {title, body}.
 *   5. Print summary.
 *   6. Ask y/N via readline.
 *   7. Return { consented, finalTitle, finalBody }.
 *
 * @param {{
 *   draftPath: string,
 *   openEditor?: boolean,
 *   stdin?: NodeJS.ReadableStream,
 *   stdout?: NodeJS.WritableStream,
 *   env?: NodeJS.ProcessEnv,
 *   askYesNo?: typeof askYesNo,
 *   openInEditor?: typeof openInEditor
 * }} opts
 * @returns {Promise<{ consented: boolean, finalTitle: string, finalBody: string }>}
 */
async function promptConsent(opts) {
  if (opts == null || typeof opts !== 'object') {
    throw new Error('promptConsent: opts object required');
  }
  const draftPath = opts.draftPath;
  if (typeof draftPath !== 'string' || draftPath.length === 0) {
    throw new Error('promptConsent: draftPath required');
  }

  // Step 1: runtime env-var bypass gate (D-03).
  rejectBypassEnv(opts.env);

  // Step 2: TTY gate (D-03).
  const stdin = opts.stdin || process.stdin;
  const stdout = opts.stdout || process.stdout;
  // Allow tests to bypass the TTY check by injecting a stream that sets
  // `isTTY = true` on itself (the public API contract is "interactive
  // shell"; the underlying mechanism is the isTTY flag).
  if (!stdin.isTTY) {
    throw new Error(
      'refused: /hone:report-issue requires an interactive TTY (no auto-mode by design — D-03)'
    );
  }

  // Step 3: optional editor (skipped if openEditor === false).
  const editorFn = opts.openInEditor || openInEditor;
  if (opts.openEditor !== false) {
    try {
      editorFn(draftPath, opts.env);
    } catch {
      // Editor failures are non-fatal — user can edit manually + still consent.
    }
  }

  // Step 4: re-read the (possibly edited) draft. This is the key step
  // that makes E1 + E2 pass — content is freshly loaded from disk.
  const draft = readDraft(draftPath);

  // Step 5: summary.
  try {
    stdout.write(buildSummary(draft, draftPath));
  } catch {
    // Best-effort UI; tests can inject stdout that throws.
  }

  // Step 6: ask y/N.
  const ask = opts.askYesNo || askYesNo;
  const answer = await ask(stdin, stdout);
  const consented = isAffirmative(answer);

  return {
    consented,
    finalTitle: draft.title,
    finalBody: draft.body,
  };
}

module.exports = {
  promptConsent,
  rejectBypassEnv,
  isAffirmative,
  buildSummary,
  openInEditor,
  askYesNo,
};
