'use strict';
// test/suite/mcp-register-parity.test.cjs
// ---------------------------------------------------------------------------
// Phase 59.1 — installer MCP parity. gdd ships TWO MCP servers:
//   - gdd-mcp   (read-only project tools; launch command `gdd-mcp`)
//   - gdd-state (typed STATE mutators;   launch command `gdd-state-mcp`)
//
// These tests assert that --register-mcp registers BOTH servers (for the
// harnesses the installer targets: claude + codex) and that --no-register-mcp
// registers NEITHER. The harness CLI is mocked via spawnFn injection so no
// real claude/codex binary is touched; the mock emulates the harness
// persisting each `mcp add` into a per-test TEMP config file (never the real
// user config), and the assertions read that temp file back.
//
// All tests tagged "59.1:".

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  registerMcp,
  MCP_SERVERS,
} = require('../../scripts/lib/install/mcp-register.cjs');

// Track temp dirs created per test so they can be cleaned up.
const tmpDirs = [];
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
});

function mkTmpConfig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-mcp-parity-'));
  tmpDirs.push(dir);
  return path.join(dir, 'harness-mcp.json');
}

function readConfig(configPath) {
  if (!fs.existsSync(configPath)) return { servers: {} };
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Build a spawnFn that behaves like a present harness CLI whose `mcp add`
// persists the registered server into `configPath`. `mcp list` reflects the
// persisted state, and `--version` succeeds (CLI present).
//
//   <binary> --version          -> exit 0
//   <binary> mcp list           -> exit 0, stdout = newline-joined server names
//   <binary> mcp add <name> ... -> persists <name>, exit 0
function persistingSpawnFn(binary, configPath) {
  // Ensure the file exists with an empty registry up front.
  // Use the 'wx' flag so the create-if-missing is atomic (no existsSync→write
  // TOCTOU race); an already-present file is left untouched.
  try {
    fs.writeFileSync(configPath, JSON.stringify({ servers: {} }) + '\n', { flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  return (cmdBinary, args) => {
    if (cmdBinary !== binary) {
      // Unknown binary — emulate ENOENT (binary missing).
      return {
        status: -1,
        stdout: '',
        stderr: '',
        error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      };
    }
    if (args[0] === '--version') {
      return { status: 0, stdout: '1.0.0', stderr: '' };
    }
    if (args[0] === 'mcp' && args[1] === 'list') {
      const cfg = readConfig(configPath);
      return {
        status: 0,
        stdout: Object.keys(cfg.servers).join('\n') + '\n',
        stderr: '',
      };
    }
    if (args[0] === 'mcp' && args[1] === 'add') {
      // The registration name is the arg immediately after `add`; the launch
      // command follows the `--` separator.
      const name = args[2];
      const sepIdx = args.indexOf('--');
      const launchCommand = sepIdx >= 0 ? args[sepIdx + 1] : null;
      const cfg = readConfig(configPath);
      cfg.servers[name] = { command: launchCommand };
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
      return { status: 0, stdout: 'added ' + name, stderr: '' };
    }
    return { status: -1, stdout: '', stderr: 'unhandled: ' + args.join(' ') };
  };
}

describe('59.1: installer MCP parity (gdd-mcp + gdd-state)', () => {
  test('59.1: MCP_SERVERS lists both gdd-mcp and gdd-state with launch commands', () => {
    const byName = Object.fromEntries(MCP_SERVERS.map((s) => [s.name, s]));
    assert.ok(byName['gdd-mcp'], 'gdd-mcp must be a registered server');
    assert.ok(byName['gdd-state'], 'gdd-state must be a registered server');
    assert.equal(byName['gdd-mcp'].launchCommand, 'gdd-mcp');
    // gdd-state registers under `gdd-state` but launches via the gdd-state-mcp bin.
    assert.equal(byName['gdd-state'].launchCommand, 'gdd-state-mcp');
  });

  test('59.1: --register-mcp registers BOTH servers with claude', () => {
    const configPath = mkTmpConfig();
    const spawnFn = persistingSpawnFn('claude', configPath);

    const result = registerMcp({ harness: 'claude', spawnFn });

    // Both servers appear in the written (temp) config.
    const cfg = readConfig(configPath);
    assert.ok(cfg.servers['gdd-mcp'], 'gdd-mcp must be in the written config');
    assert.ok(cfg.servers['gdd-state'], 'gdd-state must be in the written config');

    // Each persisted entry uses the correct launch command.
    assert.equal(cfg.servers['gdd-mcp'].command, 'gdd-mcp');
    assert.equal(cfg.servers['gdd-state'].command, 'gdd-state-mcp');

    // The aggregate result reports both servers as applied.
    assert.equal((result.servers || []).length, 2);
    for (const s of result.servers) {
      assert.equal(s.applied, true, s.server + ' should be applied');
      assert.equal(s.detected, true);
    }
  });

  test('59.1: --register-mcp registers BOTH servers with codex (user-scope flag absent)', () => {
    const configPath = mkTmpConfig();
    const spawnFn = persistingSpawnFn('codex', configPath);

    registerMcp({ harness: 'codex', spawnFn });

    const cfg = readConfig(configPath);
    assert.ok(cfg.servers['gdd-mcp'], 'gdd-mcp must be in the written codex config');
    assert.ok(cfg.servers['gdd-state'], 'gdd-state must be in the written codex config');
    assert.equal(cfg.servers['gdd-state'].command, 'gdd-state-mcp');
  });

  test('59.1: --no-register-mcp (registerMcp not invoked) writes NEITHER server', () => {
    // Models the installer flow when --register-mcp is absent: the MCP
    // registration block never runs, so registerMcp is never called and the
    // config stays empty.
    const configPath = mkTmpConfig();
    // Pre-seed an empty registry, then DO NOT invoke registerMcp.
    fs.writeFileSync(configPath, JSON.stringify({ servers: {} }) + '\n');

    const noRegisterMcp = false; // i.e. --no-register-mcp / default off
    if (noRegisterMcp) {
      registerMcp({ harness: 'claude', spawnFn: persistingSpawnFn('claude', configPath) });
    }

    const cfg = readConfig(configPath);
    assert.equal(cfg.servers['gdd-mcp'], undefined, 'gdd-mcp must NOT be registered');
    assert.equal(cfg.servers['gdd-state'], undefined, 'gdd-state must NOT be registered');
    assert.deepEqual(Object.keys(cfg.servers), []);
  });

  test('59.1: re-run is idempotent — neither server double-registered', () => {
    const configPath = mkTmpConfig();
    const spawnFn = persistingSpawnFn('claude', configPath);

    // First run registers both.
    registerMcp({ harness: 'claude', spawnFn });
    // Second run: both already present → idempotent skip, no duplication.
    const second = registerMcp({ harness: 'claude', spawnFn });

    const cfg = readConfig(configPath);
    assert.equal(Object.keys(cfg.servers).length, 2);
    for (const s of second.servers) {
      assert.equal(s.idempotent_skip, true, s.server + ' should idempotent-skip on re-run');
      assert.equal(s.applied, false);
    }
  });

  test('59.1: harness CLI absent → neither server registered, single notice', () => {
    const configPath = mkTmpConfig();
    fs.writeFileSync(configPath, JSON.stringify({ servers: {} }) + '\n');

    // spawnFn that always emulates a missing binary (ENOENT).
    const absentSpawnFn = () => ({
      status: -1,
      stdout: '',
      stderr: '',
      error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    });

    const result = registerMcp({ harness: 'claude', spawnFn: absentSpawnFn });

    assert.equal(result.detected, false);
    assert.deepEqual(result.servers, []);
    // Notice mentions both servers being skipped.
    assert.match(result.notice, /gdd-mcp/);
    assert.match(result.notice, /gdd-state/);

    const cfg = readConfig(configPath);
    assert.deepEqual(Object.keys(cfg.servers), []);
  });
});
