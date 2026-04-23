'use strict';

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const HOOK = path.resolve(__dirname, '..', 'hooks', 'first-run-nudge.sh');
const NUDGE_LINE = 'Tip: run /gdd:start to let GDD inspect this codebase and suggest one first fix.';

function runHook({ cwd, home }) {
  try {
    const out = execFileSync('bash', [HOOK], {
      cwd,
      env: { ...process.env, HOME: home, USERPROFILE: home, GDD_NUDGE_DEBUG: '0' },
      encoding: 'utf8',
      timeout: 5_000,
    });
    return { ok: true, stdout: out, code: 0 };
  } catch (err) {
    return { ok: false, stdout: err.stdout || '', stderr: err.stderr || '', code: err.status };
  }
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('hook fires in a fresh directory with no design state', () => {
  const cwd = tmpDir('gdd-nudge-fire-');
  const home = tmpDir('gdd-home-');
  try {
    const r = runHook({ cwd, home });
    assert.ok(r.ok, `hook must exit cleanly; stderr=${r.stderr || ''}`);
    assert.ok(r.stdout.includes(NUDGE_LINE), `expected nudge line in stdout, got ${JSON.stringify(r.stdout)}`);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('hook is silent when .design/config.json exists', () => {
  const cwd = tmpDir('gdd-nudge-existing-');
  const home = tmpDir('gdd-home-');
  fs.mkdirSync(path.join(cwd, '.design'));
  fs.writeFileSync(path.join(cwd, '.design', 'config.json'), '{}', 'utf8');
  try {
    const r = runHook({ cwd, home });
    assert.ok(r.ok);
    assert.strictEqual(r.stdout, '', 'nudge must be suppressed when .design/config.json exists');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('hook is silent when the dismissal flag is present', () => {
  const cwd = tmpDir('gdd-nudge-dismissed-');
  const home = tmpDir('gdd-home-');
  fs.mkdirSync(path.join(home, '.claude'));
  fs.writeFileSync(path.join(home, '.claude', 'gdd-nudge-dismissed'), '', 'utf8');
  try {
    const r = runHook({ cwd, home });
    assert.ok(r.ok);
    assert.strictEqual(r.stdout, '', 'nudge must be suppressed after dismissal');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('hook is silent when STATE.md declares an active stage', () => {
  const cwd = tmpDir('gdd-nudge-stage-');
  const home = tmpDir('gdd-home-');
  fs.mkdirSync(path.join(cwd, '.design'));
  fs.writeFileSync(
    path.join(cwd, '.design', 'STATE.md'),
    '---\nstage: plan\n---\n# State',
    'utf8'
  );
  try {
    const r = runHook({ cwd, home });
    assert.ok(r.ok);
    assert.strictEqual(r.stdout, '', 'nudge must be suppressed during active pipeline stages');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('hook is registered in hooks.json SessionStart', () => {
  const hooks = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'hooks', 'hooks.json'), 'utf8'));
  const sessionStart = hooks.hooks?.SessionStart || [];
  const registered = sessionStart.some((entry) =>
    (entry.hooks || []).some((h) => String(h.command || '').includes('first-run-nudge.sh'))
  );
  assert.ok(registered, 'first-run-nudge.sh must be registered in hooks.json SessionStart');
});

test('hook contains the locked nudge copy', () => {
  const body = fs.readFileSync(HOOK, 'utf8');
  const matches = (body.match(/Tip: run \/gdd:start/g) || []).length;
  assert.strictEqual(matches, 1, 'exactly one occurrence of the locked nudge copy');
});
