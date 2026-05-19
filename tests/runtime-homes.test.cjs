'use strict';

// tests/runtime-homes.test.cjs — Phase 28.7 (Plan 28.7-01).
//
// Coverage for scripts/lib/install/runtime-homes.cjs:
//   - All 14 GDD runtimes resolve to non-empty absolute paths.
//   - Env-var override wins over the home-relative default.
//   - Tilde-prefixed env values expand to os.homedir().
//   - XDG_CONFIG_HOME is honored for opencode + kilo (only when each
//     runtime's own env var is unset).
//   - Antigravity nests under ~/.gemini/antigravity.
//   - Windsurf nests under ~/.codeium/windsurf.
//   - getGlobalSkillsBase('cline') returns null (D-09).
//   - getGlobalSkillsBase('claude') returns <home>/.claude/skills.
//   - Unknown runtime throws RangeError (D-03 + D-10 — hermes is unknown).
//   - getGlobalSkillDisplayPath replaces home prefix with `~`.
//
// Env discipline: every test snapshots + scrubs the 14 runtime env vars and
// XDG_CONFIG_HOME beforeEach, then restores afterEach. No leaked mutations.

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

const {
  expandTilde,
  getGlobalConfigDir,
  getGlobalSkillsBase,
  getGlobalSkillDir,
  getGlobalSkillDisplayPath,
} = require('../scripts/lib/install/runtime-homes.cjs');

const ALL_RUNTIMES = [
  'claude',
  'opencode',
  'gemini',
  'kilo',
  'codex',
  'copilot',
  'cursor',
  'windsurf',
  'antigravity',
  'augment',
  'trae',
  'qwen',
  'codebuddy',
  'cline',
];

const ENV_KEYS = [
  'CLAUDE_CONFIG_DIR',
  'OPENCODE_CONFIG_DIR',
  'GEMINI_CONFIG_DIR',
  'KILO_CONFIG_DIR',
  'CODEX_HOME',
  'COPILOT_CONFIG_DIR',
  'CURSOR_CONFIG_DIR',
  'WINDSURF_CONFIG_DIR',
  'ANTIGRAVITY_CONFIG_DIR',
  'AUGMENT_CONFIG_DIR',
  'TRAE_CONFIG_DIR',
  'QWEN_CONFIG_DIR',
  'CODEBUDDY_CONFIG_DIR',
  'CLINE_CONFIG_DIR',
  'XDG_CONFIG_HOME',
];

function snapshotEnv() {
  const snap = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function scrubEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

function restoreEnv(snap) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('runtime-homes: all 14 runtimes resolve to non-empty absolute paths (defaults)', () => {
  const snap = snapshotEnv();
  scrubEnv();
  try {
    for (const r of ALL_RUNTIMES) {
      const d = getGlobalConfigDir(r);
      assert.equal(typeof d, 'string', `${r} returned non-string`);
      assert.ok(d.length > 0, `${r} returned empty path`);
      assert.ok(path.isAbsolute(d), `${r} returned non-absolute path: ${d}`);
    }
  } finally {
    restoreEnv(snap);
  }
});

test('runtime-homes: defaults match expected home-relative paths for all 14 runtimes', () => {
  const snap = snapshotEnv();
  scrubEnv();
  try {
    const home = os.homedir();
    const expected = {
      claude: path.join(home, '.claude'),
      opencode: path.join(home, '.config', 'opencode'),
      gemini: path.join(home, '.gemini'),
      kilo: path.join(home, '.config', 'kilo'),
      codex: path.join(home, '.codex'),
      copilot: path.join(home, '.copilot'),
      cursor: path.join(home, '.cursor'),
      windsurf: path.join(home, '.codeium', 'windsurf'),
      antigravity: path.join(home, '.gemini', 'antigravity'),
      augment: path.join(home, '.augment'),
      trae: path.join(home, '.trae'),
      qwen: path.join(home, '.qwen'),
      codebuddy: path.join(home, '.codebuddy'),
      cline: path.join(home, '.cline'),
    };
    for (const r of ALL_RUNTIMES) {
      assert.equal(getGlobalConfigDir(r), expected[r], `${r} default mismatch`);
    }
  } finally {
    restoreEnv(snap);
  }
});

test('runtime-homes: env-var override wins over default (claude, codex, cursor)', () => {
  const snap = snapshotEnv();
  scrubEnv();
  try {
    const overridePath = path.join(os.tmpdir(), 'gdd-test-claude-home');
    process.env.CLAUDE_CONFIG_DIR = overridePath;
    assert.equal(getGlobalConfigDir('claude'), overridePath);

    const codexOverride = path.join(os.tmpdir(), 'gdd-test-codex-home');
    process.env.CODEX_HOME = codexOverride;
    assert.equal(getGlobalConfigDir('codex'), codexOverride);

    const cursorOverride = path.join(os.tmpdir(), 'gdd-test-cursor-home');
    process.env.CURSOR_CONFIG_DIR = cursorOverride;
    assert.equal(getGlobalConfigDir('cursor'), cursorOverride);
  } finally {
    restoreEnv(snap);
  }
});

test('runtime-homes: env-var with leading tilde expands to os.homedir()', () => {
  const snap = snapshotEnv();
  scrubEnv();
  try {
    process.env.CLAUDE_CONFIG_DIR = '~/custom-claude';
    assert.equal(
      getGlobalConfigDir('claude'),
      path.join(os.homedir(), 'custom-claude')
    );
    process.env.OPENCODE_CONFIG_DIR = '~/oc';
    assert.equal(
      getGlobalConfigDir('opencode'),
      path.join(os.homedir(), 'oc')
    );
  } finally {
    restoreEnv(snap);
  }
});

test('runtime-homes: XDG_CONFIG_HOME honored for opencode + kilo when their own env unset', () => {
  const snap = snapshotEnv();
  scrubEnv();
  try {
    const xdg = path.join(os.tmpdir(), 'gdd-xdg-home');
    process.env.XDG_CONFIG_HOME = xdg;
    assert.equal(getGlobalConfigDir('opencode'), path.join(xdg, 'opencode'));
    assert.equal(getGlobalConfigDir('kilo'), path.join(xdg, 'kilo'));
  } finally {
    restoreEnv(snap);
  }
});

test('runtime-homes: own env var beats XDG_CONFIG_HOME for opencode + kilo', () => {
  const snap = snapshotEnv();
  scrubEnv();
  try {
    process.env.XDG_CONFIG_HOME = path.join(os.tmpdir(), 'should-not-win');
    const ocOverride = path.join(os.tmpdir(), 'gdd-test-oc');
    const kiloOverride = path.join(os.tmpdir(), 'gdd-test-kilo');
    process.env.OPENCODE_CONFIG_DIR = ocOverride;
    process.env.KILO_CONFIG_DIR = kiloOverride;
    assert.equal(getGlobalConfigDir('opencode'), ocOverride);
    assert.equal(getGlobalConfigDir('kilo'), kiloOverride);
  } finally {
    restoreEnv(snap);
  }
});

test('runtime-homes: antigravity default nests under ~/.gemini/antigravity', () => {
  const snap = snapshotEnv();
  scrubEnv();
  try {
    assert.equal(
      getGlobalConfigDir('antigravity'),
      path.join(os.homedir(), '.gemini', 'antigravity')
    );
  } finally {
    restoreEnv(snap);
  }
});

test('runtime-homes: windsurf default nests under ~/.codeium/windsurf', () => {
  const snap = snapshotEnv();
  scrubEnv();
  try {
    assert.equal(
      getGlobalConfigDir('windsurf'),
      path.join(os.homedir(), '.codeium', 'windsurf')
    );
  } finally {
    restoreEnv(snap);
  }
});

test('runtime-homes: getGlobalSkillsBase(cline) returns null (D-09 rules-based)', () => {
  assert.equal(getGlobalSkillsBase('cline'), null);
  assert.equal(getGlobalSkillDir('cline', 'gdd-foo'), null);
});

test('runtime-homes: getGlobalSkillsBase(claude) returns <home>/.claude/skills', () => {
  const snap = snapshotEnv();
  scrubEnv();
  try {
    assert.equal(
      getGlobalSkillsBase('claude'),
      path.join(os.homedir(), '.claude', 'skills')
    );
    assert.equal(
      getGlobalSkillDir('claude', 'gdd-executor'),
      path.join(os.homedir(), '.claude', 'skills', 'gdd-executor')
    );
  } finally {
    restoreEnv(snap);
  }
});

test('runtime-homes: unknown runtime throws RangeError (hermes is unknown per D-10)', () => {
  assert.throws(() => getGlobalConfigDir('hermes'), RangeError);
  assert.throws(() => getGlobalConfigDir('grok'), RangeError);
  assert.throws(() => getGlobalConfigDir('bogus'), RangeError);
  assert.throws(() => getGlobalConfigDir(''), RangeError);
});

test('runtime-homes: getGlobalSkillDisplayPath replaces home prefix with ~', () => {
  const snap = snapshotEnv();
  scrubEnv();
  try {
    const display = getGlobalSkillDisplayPath('claude', 'gdd-foo');
    assert.ok(display.startsWith('~'), `expected leading ~, got: ${display}`);
    assert.ok(display.includes('gdd-foo'), `expected skill name in path: ${display}`);
    // cline → no skills dir → friendly message
    const clineMsg = getGlobalSkillDisplayPath('cline', 'gdd-foo');
    assert.ok(/cline.*does not use a skills directory/i.test(clineMsg), clineMsg);
  } finally {
    restoreEnv(snap);
  }
});

test('runtime-homes: expandTilde standalone helper', () => {
  assert.equal(expandTilde('~/foo'), path.join(os.homedir(), 'foo'));
  assert.equal(expandTilde('~'), os.homedir());
  assert.equal(expandTilde('/abs/path'), '/abs/path');
  assert.equal(expandTilde('relative'), 'relative');
  assert.equal(expandTilde(''), '');
  assert.equal(expandTilde(null), null);
  assert.equal(expandTilde(undefined), undefined);
});
