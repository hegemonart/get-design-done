'use strict';
/**
 * scripts/lib/issue-reporter/dedup.cjs — Plan 30-05 pre-submit dedup module.
 *
 * Runs BETWEEN payload assembly (30-02) and the consent prompt (30-04).
 * Searches the destination repo (read-only) for an existing issue carrying
 * the same fingerprint. When matches exist, offers two non-spawning actions:
 *
 *   +1       → `gh api -X POST /repos/<dest>/issues/<n>/reactions -f content=+1`
 *   me-too   → `gh issue comment <n> --repo <dest> --body <body>`
 *
 * (The caller — skills/report-issue/SKILL.md — also offers `new` which
 * falls through to 30-04's consent prompt with the prepared draft.)
 *
 * ============================================================================
 * DECISIONS HONORED HERE
 * ============================================================================
 *
 * D-02 — Hardcoded destination URL. `destination` is a function parameter
 *        only. This module MUST NOT read env vars or config files for it.
 *        The caller (report-flow.cjs) sources it from destination.cjs.
 *
 * D-05 — Outbound = `gh` CLI only. No outbound HTTP-S URL literals, no
 *        global fetch primitive, no third-party HTTP client libraries.
 *        See `tests/issue-reporter-network-isolation.test.cjs` (Plan
 *        30-07) for the enforced forbidden-token list. Module imports
 *        limited to: `child_process`, `path`, `fs`.
 *
 * D-06 — Pre-submit dedup is mandatory. `+1` and `me-too` NEVER spawn
 *        a duplicate issue. me-too body contains EXACTLY 3 fields
 *        (last error line + runtime + plugin version) — nothing else.
 *
 * D-13 — Tests use synthetic fixtures + tmpdir. No live `gh` calls in CI.
 *        Every export accepts an injectable `spawn` to support hermetic
 *        tests; production uses `child_process.spawnSync`.
 *
 * D-01 — Pseudonymization-not-anonymization. `me-too` bodies use the
 *        ALREADY-pseudonymized `errorContext.lastErrorLine` produced by
 *        30-02's payload pipeline. dedup.cjs does NOT re-derive raw
 *        stderr; it only forwards what the caller hands it.
 *
 * ============================================================================
 * WINDOWS .cmd SHIM (per Phase 27-03 transport-decisions.md)
 * ============================================================================
 *
 * `gh` ships as `gh.cmd` on Windows. `child_process.spawnSync(absPath, args)`
 * fails with EINVAL when absPath ends in `.cmd` and shell:true is not set.
 * We mirror the pattern in scripts/lib/peer-cli/spawn-cmd.cjs — switching to
 * `shell:true` only when the binary is a Windows .cmd, so POSIX paths keep
 * the faster direct-exec form.
 *
 * Default spawn assumes `gh` is on PATH (matches 30-04 gh-submit.cjs). The
 * Windows `.cmd` case is handled by Windows' own PATHEXT resolution under
 * shell:true — we don't try to find an absolute path here.
 */

const child_process = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 10_000;

// -------------------------------------------------------------------------
// Defensive guards
// -------------------------------------------------------------------------

/** @param {unknown} s @returns {boolean} */
function isNonEmptyString(s) {
  return typeof s === 'string' && s.length > 0;
}

/** @param {unknown} n @returns {boolean} */
function isPositiveInt(n) {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

/**
 * Throw TypeError if destination is missing/empty. Used as the D-02 boundary
 * guard for the public API surface.
 * @param {unknown} destination
 */
function requireDestination(destination) {
  if (!isNonEmptyString(destination)) {
    throw new TypeError(
      'dedup: destination (string, owner-slash-repo form) is required. ' +
      'Pass the constant from scripts/lib/issue-reporter/destination.cjs.'
    );
  }
}

/**
 * Throw TypeError if fingerprint is missing/empty.
 * @param {unknown} fingerprint
 */
function requireFingerprint(fingerprint) {
  if (!isNonEmptyString(fingerprint)) {
    throw new TypeError('dedup: fingerprint (non-empty string) is required.');
  }
}

/**
 * Throw TypeError if issueNumber is not a positive integer.
 * @param {unknown} issueNumber
 */
function requireIssueNumber(issueNumber) {
  if (!isPositiveInt(issueNumber)) {
    throw new TypeError('dedup: issueNumber must be a positive integer.');
  }
}

// -------------------------------------------------------------------------
// Default spawn — Windows `.cmd` aware. (See module header for context.)
// -------------------------------------------------------------------------

/**
 * Wrapper around child_process.spawnSync that handles the Windows `.cmd`
 * shim case for `gh` (`gh.cmd` on Windows). Mirrors the pattern from
 * scripts/lib/peer-cli/spawn-cmd.cjs.
 *
 * Real callers omit the third argument; tests inject a custom spawn.
 *
 * @param {string} cmd  command name (typically 'gh')
 * @param {readonly string[]} args
 * @param {{timeout?: number, encoding?: BufferEncoding}} [opts]
 * @returns {{status: number|null, stdout: string, stderr: string}}
 */
function defaultSpawn(cmd, args, opts) {
  const safeOpts = opts && typeof opts === 'object' ? opts : {};
  const safeArgs = Array.isArray(args) ? args : [];

  const isWindows = process.platform === 'win32';
  // For Windows, `gh` resolves to `gh.cmd` via PATHEXT. Use shell:true so
  // cmd.exe can perform that resolution; without it, Node refuses to spawn
  // a .cmd shim directly (the historical EINVAL behavior — see Phase 27-03).
  if (isWindows) {
    return child_process.spawnSync(cmd, safeArgs, {
      timeout: safeOpts.timeout || DEFAULT_TIMEOUT_MS,
      encoding: 'utf8',
      shell: true,
    });
  }

  return child_process.spawnSync(cmd, safeArgs, {
    timeout: safeOpts.timeout || DEFAULT_TIMEOUT_MS,
    encoding: 'utf8',
  });
}

// -------------------------------------------------------------------------
// Failure classification — stderr substring → short reason tag.
// -------------------------------------------------------------------------

/**
 * Map a gh failure (status !== 0) to a short reason string.
 * Caller uses these to route degraded:true cases and to annotate
 * rejected promises so the consent UI can show actionable hints.
 *
 * @param {{status:number|null, stdout:string, stderr:string}} result
 * @returns {'auth'|'rate'|'network'|'not-found'|'gh-missing'|'unknown'}
 */
function classifyFailure(result) {
  const stderr = (result && typeof result.stderr === 'string' ? result.stderr : '').toLowerCase();
  const stdout = (result && typeof result.stdout === 'string' ? result.stdout : '').toLowerCase();
  const blob = stderr + '\n' + stdout;

  if (/\b(401|unauthorized|bad credentials|auth)\b/.test(blob)) return 'auth';
  if (/rate limit|abuse detection/.test(blob)) return 'rate';
  if (/could not resolve host|enotfound|econnrefused|network|getaddrinfo/.test(blob)) return 'network';
  if (/\b(404|not found|no issues match)\b/.test(blob)) return 'not-found';
  if (/command not found|enoent|is not recognized/.test(blob)) return 'gh-missing';
  return 'unknown';
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/**
 * Run a read-only fingerprint search against the destination repo.
 *
 * Never throws on gh failure — resolves with `{matches:[], degraded:true,
 * reason}` so the caller can surface a one-line warning and fall through
 * to the new-issue path (per D-06: dedup is gate, not blocker).
 *
 * @param {string} fingerprint  hex string from 30-02's computeFingerprint()
 * @param {{
 *   destination: string,
 *   spawn?: typeof defaultSpawn,
 *   timeoutMs?: number,
 * }} options
 * @returns {Promise<{
 *   matches: Array<{number: number, title: string, url: string}>,
 *   degraded?: true,
 *   reason?: 'auth'|'rate'|'network'|'not-found'|'gh-missing'|'parse-error'|'unknown',
 * }>}
 */
async function searchByFingerprint(fingerprint, options) {
  if (options == null || typeof options !== 'object') {
    throw new TypeError('dedup.searchByFingerprint: options object required.');
  }
  requireFingerprint(fingerprint);
  requireDestination(options.destination);

  const spawn = typeof options.spawn === 'function' ? options.spawn : defaultSpawn;
  const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_TIMEOUT_MS;

  // Build argv. Mirrors the canonical `gh issue list --search "fingerprint:<hash>"` call.
  // D-02: destination is the caller-supplied parameter — never read from env/config here.
  const args = [
    'issue', 'list',
    '--search', `fingerprint:${fingerprint}`,
    '--json', 'number,title,url',
    '--repo', options.destination,
  ];

  let result;
  try {
    result = spawn('gh', args, { timeout: timeoutMs, encoding: 'utf8' });
  } catch (e) {
    // spawn itself blew up (rare: e.g. EACCES). Treat as gh-missing.
    return { matches: [], degraded: true, reason: 'gh-missing' };
  }

  if (!result || typeof result !== 'object') {
    return { matches: [], degraded: true, reason: 'unknown' };
  }
  if (result.status !== 0) {
    return { matches: [], degraded: true, reason: classifyFailure(result) };
  }

  // Status 0 — parse stdout JSON.
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  let parsed;
  try {
    parsed = JSON.parse(stdout || '[]');
  } catch {
    return { matches: [], degraded: true, reason: 'parse-error' };
  }
  if (!Array.isArray(parsed)) {
    return { matches: [], degraded: true, reason: 'parse-error' };
  }

  // Normalize: keep only {number, title, url} from each entry. Drop anything
  // that doesn't have those fields — gh may add fields in future versions
  // and we don't want to leak them to the dedup UI.
  const matches = parsed
    .map((m) => ({
      number: typeof m.number === 'number' ? m.number : Number(m.number),
      title: typeof m.title === 'string' ? m.title : '',
      url: typeof m.url === 'string' ? m.url : '',
    }))
    .filter((m) => Number.isInteger(m.number) && m.number > 0 && m.title.length > 0);

  return { matches };
}

/**
 * Add a `+1` reaction to an existing issue via `gh api`.
 *
 * Resolves `{ok:true, reactionId?}` on success. Rejects with an Error
 * annotated `.reason` (auth|rate|network|not-found|gh-missing|unknown)
 * and `.stderr` so the consent UI can route to retry/cancel without
 * parsing the error string.
 *
 * @param {number} issueNumber
 * @param {{
 *   destination: string,
 *   spawn?: typeof defaultSpawn,
 *   timeoutMs?: number,
 * }} options
 * @returns {Promise<{ok: true, reactionId?: number}>}
 */
async function react(issueNumber, options) {
  if (options == null || typeof options !== 'object') {
    throw new TypeError('dedup.react: options object required.');
  }
  requireIssueNumber(issueNumber);
  requireDestination(options.destination);

  const spawn = typeof options.spawn === 'function' ? options.spawn : defaultSpawn;
  const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_TIMEOUT_MS;

  const args = [
    'api',
    '-X', 'POST',
    `/repos/${options.destination}/issues/${issueNumber}/reactions`,
    '-f', 'content=+1',
  ];

  let result;
  try {
    result = spawn('gh', args, { timeout: timeoutMs, encoding: 'utf8' });
  } catch (e) {
    const err = new Error(`gh api spawn failed: ${e && e.message ? e.message : 'unknown'}`);
    err.reason = 'gh-missing';
    err.stderr = '';
    throw err;
  }

  if (!result || typeof result !== 'object' || result.status !== 0) {
    const reason = classifyFailure(result || { status: null, stdout: '', stderr: '' });
    const stderr = result && typeof result.stderr === 'string' ? result.stderr : '';
    const err = new Error(`gh api -X POST .../reactions failed (${reason}): ${stderr.trim() || '(no stderr)'}`);
    err.reason = reason;
    err.stderr = stderr;
    throw err;
  }

  // Try to extract reactionId from stdout JSON. Optional.
  let reactionId;
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  try {
    const parsed = JSON.parse(stdout);
    if (parsed && typeof parsed.id === 'number') reactionId = parsed.id;
  } catch {
    // Ignore — reaction succeeded even if stdout isn't JSON.
  }

  return reactionId != null ? { ok: true, reactionId } : { ok: true };
}

/**
 * Build the me-too comment body. EXACTLY three labeled sections:
 *
 *   Last error: <lastErrorLine>
 *   Runtime: <runtime>
 *   Plugin version: <pluginVersion>
 *
 * No stack frames, no file paths, no env dump, no command-line, nothing
 * else. Pure function — exported so test 5 can assert the verbatim string
 * without spawning anything.
 *
 * Caller must pass the ALREADY-pseudonymized `lastErrorLine` from 30-02's
 * pipeline (D-01).
 *
 * @param {{lastErrorLine: string, runtime: string, pluginVersion: string}} parts
 * @returns {string}
 */
function buildMeTooBody(parts) {
  if (parts == null || typeof parts !== 'object') {
    throw new TypeError('buildMeTooBody: {lastErrorLine, runtime, pluginVersion} required.');
  }
  if (!isNonEmptyString(parts.lastErrorLine)) {
    throw new TypeError('buildMeTooBody: lastErrorLine (non-empty string) required.');
  }
  if (!isNonEmptyString(parts.runtime)) {
    throw new TypeError('buildMeTooBody: runtime (non-empty string) required.');
  }
  if (!isNonEmptyString(parts.pluginVersion)) {
    throw new TypeError('buildMeTooBody: pluginVersion (non-empty string) required.');
  }

  // Truncate lastErrorLine to a single line (collapse newlines) and ≤200 chars,
  // matching the contract in must_haves.truths. We do NOT modify content beyond
  // truncation — the lastErrorLine is already pseudonymized upstream.
  const single = String(parts.lastErrorLine).replace(/\r?\n/g, ' ').trim();
  const truncated = single.length > 200 ? single.slice(0, 200) : single;

  return (
    `Last error: ${truncated}\n` +
    `Runtime: ${parts.runtime}\n` +
    `Plugin version: ${parts.pluginVersion}`
  );
}

/**
 * Add a `me-too` comment to an existing issue via `gh issue comment`.
 *
 * Resolves `{ok:true, commentUrl?}` on success. Rejects with annotated
 * Error on non-zero exit (same annotation contract as `react`).
 *
 * Body is built by `buildMeTooBody` — exactly 3 fields, nothing else.
 * `errorContext.lastErrorLine` MUST already be pseudonymized by 30-02
 * upstream (D-01); this function does NOT re-derive it.
 *
 * @param {number} issueNumber
 * @param {{
 *   destination: string,
 *   errorContext: {lastErrorLine: string},
 *   runtime: string,
 *   pluginVersion: string,
 *   spawn?: typeof defaultSpawn,
 *   timeoutMs?: number,
 * }} options
 * @returns {Promise<{ok: true, commentUrl?: string}>}
 */
async function commentMeToo(issueNumber, options) {
  if (options == null || typeof options !== 'object') {
    throw new TypeError('dedup.commentMeToo: options object required.');
  }
  requireIssueNumber(issueNumber);
  requireDestination(options.destination);

  if (options.errorContext == null || typeof options.errorContext !== 'object') {
    throw new TypeError('dedup.commentMeToo: errorContext object required.');
  }
  if (!isNonEmptyString(options.errorContext.lastErrorLine)) {
    throw new TypeError('dedup.commentMeToo: errorContext.lastErrorLine required.');
  }
  if (!isNonEmptyString(options.runtime)) {
    throw new TypeError('dedup.commentMeToo: runtime required.');
  }
  if (!isNonEmptyString(options.pluginVersion)) {
    throw new TypeError('dedup.commentMeToo: pluginVersion required.');
  }

  const spawn = typeof options.spawn === 'function' ? options.spawn : defaultSpawn;
  const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_TIMEOUT_MS;

  const body = buildMeTooBody({
    lastErrorLine: options.errorContext.lastErrorLine,
    runtime: options.runtime,
    pluginVersion: options.pluginVersion,
  });

  const args = [
    'issue', 'comment', String(issueNumber),
    '--repo', options.destination,
    '--body', body,
  ];

  let result;
  try {
    result = spawn('gh', args, { timeout: timeoutMs, encoding: 'utf8' });
  } catch (e) {
    const err = new Error(`gh issue comment spawn failed: ${e && e.message ? e.message : 'unknown'}`);
    err.reason = 'gh-missing';
    err.stderr = '';
    throw err;
  }

  if (!result || typeof result !== 'object' || result.status !== 0) {
    const reason = classifyFailure(result || { status: null, stdout: '', stderr: '' });
    const stderr = result && typeof result.stderr === 'string' ? result.stderr : '';
    const err = new Error(`gh issue comment failed (${reason}): ${stderr.trim() || '(no stderr)'}`);
    err.reason = reason;
    err.stderr = stderr;
    throw err;
  }

  // gh issue comment prints the comment URL on stdout on success.
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const urlMatch = stdout.match(/https?:\/\/\S+/);
  const commentUrl = urlMatch ? urlMatch[0] : undefined;

  return commentUrl ? { ok: true, commentUrl } : { ok: true };
}

module.exports = {
  searchByFingerprint,
  react,
  commentMeToo,
  buildMeTooBody,
};
