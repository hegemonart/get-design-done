'use strict';
// tests/install-register-mcp.test.cjs
// ---------------------------------------------------------------------------
// Plan 27.7-04 — installer --register-mcp + mcp-register lib tests.
//
// Tests scripts/lib/install/mcp-register.cjs. Uses spawnFn injection to
// avoid touching real claude/codex CLIs in CI.
//
// All tests tagged "27.7-04:".

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

function mockSpawnFn(scenarios) {
  return (binary, args) => {
    const key = binary + ' ' + args.join(' ');
    if (key in scenarios) return scenarios[key];
    // Default: ENOENT-style failure (binary missing)
    return {
      status: -1,
      stdout: '',
      stderr: '',
      error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    };
  };
}

describe('27.7-04: install --register-mcp', () => {
  test('27.7-04: registerMcp claude detected → register command applied', () => {
    const { registerMcp } = require('../scripts/lib/install/mcp-register.cjs');
    const spawnFn = mockSpawnFn({
      'claude --version': { status: 0, stdout: '0.5.0', stderr: '' },
      'claude mcp list': { status: 0, stdout: 'other-mcp\n', stderr: '' },
      'claude mcp add gdd-mcp -s user -- gdd-mcp': {
        status: 0,
        stdout: 'added',
        stderr: '',
      },
    });
    const result = registerMcp({ harness: 'claude', spawnFn });
    assert.equal(result.detected, true);
    assert.equal(result.applied, true);
    assert.equal(result.idempotent_skip, false);
    assert.match(result.command, /claude mcp add gdd-mcp/);
  });

  test('27.7-04: registerMcp codex detected → register command applied', () => {
    const { registerMcp } = require('../scripts/lib/install/mcp-register.cjs');
    const spawnFn = mockSpawnFn({
      'codex --version': { status: 0, stdout: '0.1.0', stderr: '' },
      'codex mcp list': { status: 0, stdout: '', stderr: '' },
      'codex mcp add gdd-mcp -- gdd-mcp': {
        status: 0,
        stdout: 'added',
        stderr: '',
      },
    });
    const result = registerMcp({ harness: 'codex', spawnFn });
    assert.equal(result.detected, true);
    assert.equal(result.applied, true);
    assert.match(result.command, /codex mcp add gdd-mcp/);
  });

  test('27.7-04: registerMcp claude absent → detected:false with notice', () => {
    const { registerMcp } = require('../scripts/lib/install/mcp-register.cjs');
    const result = registerMcp({ harness: 'claude', spawnFn: mockSpawnFn({}) });
    assert.equal(result.detected, false);
    assert.equal(result.applied, false);
    assert.match(result.notice, /claude CLI not on PATH/);
  });

  test('27.7-04: idempotent re-run — applied:false when gdd-mcp already in claude mcp list', () => {
    const { registerMcp } = require('../scripts/lib/install/mcp-register.cjs');
    const spawnFn = mockSpawnFn({
      'claude --version': { status: 0, stdout: '0.5.0', stderr: '' },
      'claude mcp list': { status: 0, stdout: 'gdd-mcp\nother-mcp\n', stderr: '' },
    });
    const result = registerMcp({ harness: 'claude', spawnFn });
    assert.equal(result.detected, true);
    assert.equal(result.idempotent_skip, true);
    assert.equal(result.applied, false);
  });

  test('27.7-04: registerMcp codex absent → detected:false', () => {
    const { registerMcp } = require('../scripts/lib/install/mcp-register.cjs');
    const result = registerMcp({ harness: 'codex', spawnFn: mockSpawnFn({}) });
    assert.equal(result.detected, false);
  });

  test('27.7-04: detectMcpRegistration summary — claude+codex both present and registered', () => {
    const { detectMcpRegistration } = require('../scripts/lib/install/mcp-register.cjs');
    const spawnFn = mockSpawnFn({
      'claude --version': { status: 0, stdout: '', stderr: '' },
      'codex --version': { status: 0, stdout: '', stderr: '' },
      'claude mcp list': { status: 0, stdout: 'gdd-mcp\n', stderr: '' },
      'codex mcp list': { status: 0, stdout: 'gdd-mcp\n', stderr: '' },
    });
    const result = detectMcpRegistration({ spawnFn });
    assert.equal(result.harnesses.length, 2);
    assert.match(result.summary, /registered with claude\+codex/);
  });

  test('27.7-04: detectMcpRegistration summary — neither harness present', () => {
    const { detectMcpRegistration } = require('../scripts/lib/install/mcp-register.cjs');
    const result = detectMcpRegistration({ spawnFn: mockSpawnFn({}) });
    assert.match(result.summary, /unknown.*claude\/codex CLI not found/);
  });

  test('27.7-04: registerMcp dryRun returns command without spawning add', () => {
    const { registerMcp } = require('../scripts/lib/install/mcp-register.cjs');
    let addInvoked = false;
    const spawnFn = (binary, args) => {
      const key = binary + ' ' + args.join(' ');
      if (key === 'claude --version') return { status: 0, stdout: '0.5.0', stderr: '' };
      if (key === 'claude mcp list') return { status: 0, stdout: '', stderr: '' };
      if (key.includes('mcp add')) {
        addInvoked = true;
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: -1, stdout: '', stderr: '' };
    };
    const result = registerMcp({ harness: 'claude', dryRun: true, spawnFn });
    assert.equal(result.dry_run, true);
    assert.equal(result.applied, false);
    assert.equal(addInvoked, false, 'add command must NOT be spawned in dry-run');
    assert.match(result.command, /claude mcp add gdd-mcp -s user -- gdd-mcp/);
  });

  test('27.7-04: registerMcp throws on unknown harness', () => {
    const { registerMcp } = require('../scripts/lib/install/mcp-register.cjs');
    assert.throws(
      () => registerMcp({ harness: 'unknown-harness', spawnFn: mockSpawnFn({}) }),
      /harness|unknown/i,
    );
  });

  test('27.7-04: buildHarnessCommand returns binary + args for claude register', () => {
    const { buildHarnessCommand } = require('../scripts/lib/install/mcp-register.cjs');
    const cmd = buildHarnessCommand('claude', 'register');
    assert.equal(cmd.binary, 'claude');
    assert.deepEqual(cmd.args, ['mcp', 'add', 'gdd-mcp', '-s', 'user', '--', 'gdd-mcp']);
  });
});
