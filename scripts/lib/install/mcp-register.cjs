'use strict';
// scripts/lib/install/mcp-register.cjs
// ---------------------------------------------------------------------------
// Plan 27.7-04 — registers gdd's MCP servers with the two harnesses that
// matter (Claude Code, Codex) and detects existing registration. Idempotent;
// graceful absent-CLI fallback (D-07).
//
// Phase 59.1 — MCP parity: gdd ships TWO MCP servers, both registered here:
//   - gdd-mcp   (read-only project tools; launch command `gdd-mcp`)
//   - gdd-state (typed STATE mutators;   launch command `gdd-state-mcp`)
// Each server is described in MCP_SERVERS as {name, launchCommand}. The
// per-harness add-args are built per server so the registration name and the
// launch command can differ (gdd-state registers under `gdd-state` but is
// launched via the `gdd-state-mcp` bin).
//
// Pure library — no side effects on require. Invoked by:
//   - scripts/install.cjs --register-mcp (opt-in; default off per D-07)
//   - skills/health/SKILL.md check-mcp-registration step (read-only detect)
//
// spawnFn injection allows tests to mock child_process.spawnSync without
// touching real CLIs in CI.
//
// Threat model: scripts/install.cjs --register-mcp writes to harness user-
// level config. Command args are hardcoded in HARNESSES / MCP_SERVERS (no
// command-injection surface); the `--` separator before the launch command
// prevents flag injection (T-27.7-04-06).

const { spawnSync } = require('node:child_process');

// The set of MCP servers gdd registers. `name` is the registration name (and
// what appears in `<binary> mcp list`); `launchCommand` is the bin on PATH the
// harness spawns. For gdd-mcp the two coincide; for gdd-state they differ.
const MCP_SERVERS = Object.freeze([
  Object.freeze({ name: 'gdd-mcp', launchCommand: 'gdd-mcp' }),
  Object.freeze({ name: 'gdd-state', launchCommand: 'gdd-state-mcp' }),
]);

// Back-compat: the original single-server name. Retained for existing
// importers (skills/health detection, type decls, tests).
const MCP_NAME = MCP_SERVERS[0].name;

// Build the `mcp add` argv for a given harness + server. Mirrors the original
// per-harness shape exactly: claude pins user scope (`-s user`), codex does
// not. The registration name precedes `--`; the launch command follows it.
function claudeAddArgs(server) {
  return ['mcp', 'add', server.name, '-s', 'user', '--', server.launchCommand];
}
function codexAddArgs(server) {
  return ['mcp', 'add', server.name, '--', server.launchCommand];
}

const HARNESSES = Object.freeze({
  claude: Object.freeze({
    binary: 'claude',
    addArgsFor: claudeAddArgs,
    // Back-compat: addArgs for the primary (gdd-mcp) server.
    addArgs: Object.freeze(claudeAddArgs(MCP_SERVERS[0])),
    listArgs: Object.freeze(['mcp', 'list']),
    listMatchPattern: /\bgdd-mcp\b/,
  }),
  codex: Object.freeze({
    binary: 'codex',
    addArgsFor: codexAddArgs,
    addArgs: Object.freeze(codexAddArgs(MCP_SERVERS[0])),
    listArgs: Object.freeze(['mcp', 'list']),
    listMatchPattern: /\bgdd-mcp\b/,
  }),
});

// Whether a server name appears in the harness's `mcp list` stdout. Built per
// call so each server is matched on its own word-boundary-delimited name.
function makeListMatchPattern(serverName) {
  // Escape regex metacharacters in the server name (defensive; names are
  // hardcoded today but this keeps the matcher injection-safe).
  const escaped = serverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^\\w-])' + escaped + '([^\\w-]|$)');
}

/**
 * Build the command tuple for a given harness + mode (+ optional server).
 * Currently only 'register' (add) is supported in command-build; 'detect'
 * uses listArgs internally, 'unregister' is reserved for future work.
 *
 * @param {'claude'|'codex'} harness
 * @param {'register'|'detect'} [mode='register']
 * @param {{name:string,launchCommand:string}} [server=MCP_SERVERS[0]]
 */
function buildHarnessCommand(harness, mode = 'register', server = MCP_SERVERS[0]) {
  const h = HARNESSES[harness];
  if (!h) throw new Error('Unknown harness: ' + harness);
  if (mode === 'register') {
    return { binary: h.binary, args: h.addArgsFor(server) };
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
 * Detect whether a given MCP server is already registered with the harness.
 * Runs `<binary> mcp list` and matches against the server's name. When
 * `serverName` is omitted, falls back to the harness's primary (gdd-mcp)
 * pattern for back-compat with the original single-server signature.
 *
 * @param {'claude'|'codex'} harness
 * @param {Function} [spawnFn]
 * @param {string} [serverName]  server registration name to match
 */
function isAlreadyRegistered(harness, spawnFn = spawnSync, serverName) {
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
  const pattern = serverName ? makeListMatchPattern(serverName) : h.listMatchPattern;
  return pattern.test(stdout);
}

/**
 * Register a single MCP server with the given harness. Assumes the harness CLI
 * is already known to be present (caller does the PATH check once for all
 * servers). Returns the same per-server shape the original registerMcp did.
 */
function registerOneServer(harness, server, { mode, dryRun, spawnFn }) {
  // Idempotency check: this specific server already registered?
  if (isAlreadyRegistered(harness, spawnFn, server.name)) {
    return {
      server: server.name,
      harness,
      action: mode,
      detected: true,
      command: null,
      applied: false,
      idempotent_skip: true,
    };
  }

  // Build + dispatch the per-server add command.
  const { binary, args } = buildHarnessCommand(harness, 'register', server);
  const commandStr = binary + ' ' + args.join(' ');

  if (dryRun) {
    return {
      server: server.name,
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
      server: server.name,
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
    server: server.name,
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
 * Register all gdd MCP servers (MCP_SERVERS) with the given harness.
 *
 * The harness CLI presence is checked ONCE; if absent, no servers are
 * registered. Otherwise each server in MCP_SERVERS is registered (idempotent
 * per server). The return value keeps the original single-server fields at the
 * top level (mirroring the primary gdd-mcp server) for back-compat, and adds a
 * `servers` array carrying the per-server results.
 *
 * @param {object} opts
 * @param {'claude'|'codex'} opts.harness
 * @param {'register'|'unregister'|'detect'} [opts.mode='register']
 * @param {boolean} [opts.dryRun=false]
 * @param {Function} [opts.spawnFn]  child_process.spawnSync substitute
 * @returns {object} {harness, action, detected, command, applied,
 *                    idempotent_skip, notice?, stdout?, stderr?,
 *                    exit_code?, dry_run?, servers}
 */
function registerMcp({ harness, mode = 'register', dryRun = false, spawnFn = spawnSync } = {}) {
  if (!HARNESSES[harness]) {
    throw new Error('Unknown harness: ' + harness + ' (expected one of: ' + Object.keys(HARNESSES).join(', ') + ')');
  }
  if (mode !== 'register' && mode !== 'detect' && mode !== 'unregister') {
    throw new Error('Unsupported mode: ' + mode);
  }

  // Step 1 — detect harness CLI on PATH (once, for all servers).
  if (!detectHarnessPresent(harness, spawnFn)) {
    const names = MCP_SERVERS.map((s) => s.name).join(' + ');
    return {
      harness,
      action: mode,
      detected: false,
      command: null,
      applied: false,
      idempotent_skip: false,
      notice: harness + ' CLI not on PATH — skipping ' + names + ' registration',
      servers: [],
    };
  }

  // Step 2 — register each server (idempotent per server).
  const servers = MCP_SERVERS.map((server) =>
    registerOneServer(harness, server, { mode, dryRun, spawnFn }),
  );

  // Top-level fields mirror the primary (first) server for back-compat with
  // the original single-server callers; `servers` carries the full detail.
  const primary = servers[0];
  return Object.assign({}, primary, { servers });
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
  MCP_SERVERS,
};
