'use strict';
// scripts/lib/install/mcp-register.cjs
// ---------------------------------------------------------------------------
// Plan 27.7-04 — registers `gdd-mcp` with the two harnesses that matter
// (Claude Code, Codex) and detects existing registration. Idempotent;
// graceful absent-CLI fallback (D-07).
//
// Pure library — no side effects on require. Invoked by:
//   - scripts/install.cjs --register-mcp (opt-in; default off per D-07)
//   - skills/health/SKILL.md check-mcp-registration step (read-only detect)
//
// spawnFn injection allows tests to mock child_process.spawnSync without
// touching real CLIs in CI.
//
// Threat model: scripts/install.cjs --register-mcp writes to harness user-
// level config. Command args are hardcoded in HARNESSES (no command-
// injection surface); `--` separator before MCP_NAME prevents flag
// injection (T-27.7-04-06).

const { spawnSync } = require('node:child_process');

const MCP_NAME = 'gdd-mcp';

const HARNESSES = Object.freeze({
  claude: Object.freeze({
    binary: 'claude',
    addArgs: Object.freeze(['mcp', 'add', MCP_NAME, '-s', 'user', '--', MCP_NAME]),
    listArgs: Object.freeze(['mcp', 'list']),
    listMatchPattern: /\bgdd-mcp\b/,
  }),
  codex: Object.freeze({
    binary: 'codex',
    addArgs: Object.freeze(['mcp', 'add', MCP_NAME, '--', MCP_NAME]),
    listArgs: Object.freeze(['mcp', 'list']),
    listMatchPattern: /\bgdd-mcp\b/,
  }),
});

/**
 * Build the command tuple for a given harness + mode.
 * Currently only 'register' (add) is supported in command-build; 'detect'
 * uses listArgs internally, 'unregister' is reserved for future work.
 */
function buildHarnessCommand(harness, mode = 'register') {
  const h = HARNESSES[harness];
  if (!h) throw new Error('Unknown harness: ' + harness);
  if (mode === 'register') {
    return { binary: h.binary, args: Array.from(h.addArgs) };
  }
  if (mode === 'detect') {
    return { binary: h.binary, args: Array.from(h.listArgs) };
  }
  throw new Error('Unsupported mode: ' + mode);
}

/**
 * Detect whether the harness CLI is on PATH. Runs `<binary> --version` and
 * returns true iff exit code is 0. Catches ENOENT (binary missing).
 */
function detectHarnessPresent(harness, spawnFn = spawnSync) {
  const h = HARNESSES[harness];
  if (!h) throw new Error('Unknown harness: ' + harness);
  let result;
  try {
    result = spawnFn(h.binary, ['--version'], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch (_e) {
    return false;
  }
  if (!result) return false;
  if (result.error && result.error.code === 'ENOENT') return false;
  return result.status === 0;
}

/**
 * Detect whether gdd-mcp is already registered with the given harness.
 * Runs `<binary> mcp list` and matches against listMatchPattern.
 */
function isAlreadyRegistered(harness, spawnFn = spawnSync) {
  const h = HARNESSES[harness];
  if (!h) throw new Error('Unknown harness: ' + harness);
  let result;
  try {
    result = spawnFn(h.binary, Array.from(h.listArgs), {
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch (_e) {
    return false;
  }
  if (!result || result.status !== 0) return false;
  const stdout = (result.stdout || '').toString();
  return h.listMatchPattern.test(stdout);
}

/**
 * Register gdd-mcp with the given harness.
 *
 * @param {object} opts
 * @param {'claude'|'codex'} opts.harness
 * @param {'register'|'unregister'|'detect'} [opts.mode='register']
 * @param {boolean} [opts.dryRun=false]
 * @param {Function} [opts.spawnFn]  child_process.spawnSync substitute
 * @returns {object} {harness, action, detected, command, applied,
 *                    idempotent_skip, notice?, stdout?, stderr?,
 *                    exit_code?, dry_run?}
 */
function registerMcp({ harness, mode = 'register', dryRun = false, spawnFn = spawnSync } = {}) {
  if (!HARNESSES[harness]) {
    throw new Error('Unknown harness: ' + harness + ' (expected one of: ' + Object.keys(HARNESSES).join(', ') + ')');
  }
  if (mode !== 'register' && mode !== 'detect' && mode !== 'unregister') {
    throw new Error('Unsupported mode: ' + mode);
  }

  // Step 1 — detect harness CLI on PATH
  if (!detectHarnessPresent(harness, spawnFn)) {
    return {
      harness,
      action: mode,
      detected: false,
      command: null,
      applied: false,
      idempotent_skip: false,
      notice: harness + ' CLI not on PATH — skipping ' + MCP_NAME + ' registration',
    };
  }

  // Step 2 — idempotency check: already registered?
  if (isAlreadyRegistered(harness, spawnFn)) {
    return {
      harness,
      action: mode,
      detected: true,
      command: null,
      applied: false,
      idempotent_skip: true,
    };
  }

  // Step 3 — build + dispatch add command
  const { binary, args } = buildHarnessCommand(harness, 'register');
  const commandStr = binary + ' ' + args.join(' ');

  if (dryRun) {
    return {
      harness,
      action: mode,
      detected: true,
      command: commandStr,
      applied: false,
      idempotent_skip: false,
      dry_run: true,
    };
  }

  let result;
  try {
    result = spawnFn(binary, args, { stdio: 'pipe', encoding: 'utf8' });
  } catch (e) {
    return {
      harness,
      action: mode,
      detected: true,
      command: commandStr,
      applied: false,
      idempotent_skip: false,
      stderr: (e && e.message) || String(e),
      exit_code: null,
    };
  }
  const stdout = (result && result.stdout) || '';
  const stderr = (result && result.stderr) || '';
  const exit_code = result ? result.status : null;
  return {
    harness,
    action: mode,
    detected: true,
    command: commandStr,
    applied: exit_code === 0,
    idempotent_skip: false,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
    exit_code,
  };
}

/**
 * Detect overall MCP registration state across all known harnesses.
 *
 * @param {object} [opts]
 * @param {Function} [opts.spawnFn]
 * @returns {{harnesses: Array, summary: string}}
 */
function detectMcpRegistration({ spawnFn = spawnSync } = {}) {
  const harnessIds = Object.keys(HARNESSES);
  const results = harnessIds.map((harness) => {
    const present = detectHarnessPresent(harness, spawnFn);
    let registered;
    if (present) {
      registered = isAlreadyRegistered(harness, spawnFn);
    } else {
      registered = undefined;
    }
    return { harness, present, registered };
  });

  const anyPresent = results.some((r) => r.present);
  const registeredHarnesses = results.filter((r) => r.registered === true).map((r) => r.harness);

  let summary;
  if (!anyPresent) {
    summary = 'unknown (claude/codex CLI not found)';
  } else if (registeredHarnesses.length === 0) {
    summary = 'not registered';
  } else if (registeredHarnesses.length === harnessIds.length) {
    summary = 'registered with ' + registeredHarnesses.join('+');
  } else {
    summary = 'registered with ' + registeredHarnesses.join('+');
  }

  return { harnesses: results, summary };
}

module.exports = {
  registerMcp,
  detectMcpRegistration,
  detectHarnessPresent,
  isAlreadyRegistered,
  buildHarnessCommand,
  HARNESSES,
  MCP_NAME,
};
