'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { resolveConfigDir, resolveAllConfigDirs } = require('../../scripts/lib/install/config-dir.cjs');

test('config-dir: env-var override wins over fallback', () => {
  const got = resolveConfigDir('claude', {
    env: { CLAUDE_CONFIG_DIR: '/custom/claude/dir' },
    home: '/home/user',
  });
  // path.resolve normalizes — on Windows it may resolve to a drive-prefixed
  // form, on POSIX it stays as /custom/claude/dir.
  assert.ok(
    got === '/custom/claude/dir' || got.endsWith(path.normalize('/custom/claude/dir')),
    `got ${got}`,
  );
});

test('config-dir: explicit configDir override beats env-var', () => {
  const got = resolveConfigDir('claude', {
    configDir: '/explicit/path',
    env: { CLAUDE_CONFIG_DIR: '/env/path' },
    home: '/home/user',
  });
  assert.ok(
    got === '/explicit/path' || got.endsWith(path.normalize('/explicit/path')),
    `got ${got}`,
  );
});

test('config-dir: fallback uses home + configDirFallback', () => {
  const got = resolveConfigDir('claude', {
    env: {},
    home: '/home/user',
  });
  assert.equal(got, path.resolve(path.join('/home/user', '.claude')));
});

test('config-dir: opencode fallback uses .config/opencode', () => {
  const got = resolveConfigDir('opencode', {
    env: {},
    home: '/home/user',
  });
  assert.equal(got, path.resolve(path.join('/home/user', '.config/opencode'.split('/').join(path.sep))));
});

test('config-dir: codex env var is CODEX_HOME', () => {
  const got = resolveConfigDir('codex', {
    env: { CODEX_HOME: '/codex/home' },
    home: '/home/user',
  });
  assert.ok(
    got === '/codex/home' || got.endsWith(path.normalize('/codex/home')),
    `got ${got}`,
  );
});

test('config-dir: empty env-var falls through to fallback', () => {
  const got = resolveConfigDir('claude', {
    env: { CLAUDE_CONFIG_DIR: '   ' },
    home: '/home/user',
  });
  assert.equal(got, path.resolve(path.join('/home/user', '.claude')));
});

test('config-dir: unknown runtime throws', () => {
  assert.throws(() => resolveConfigDir('does-not-exist'), /Unknown runtime/);
});

test('config-dir: resolveAllConfigDirs returns all 14 runtimes', () => {
  const map = resolveAllConfigDirs({ env: {}, home: '/home/user' });
  assert.equal(Object.keys(map).length, 14);
  for (const id of Object.keys(map)) {
    assert.equal(typeof map[id], 'string');
  }
});
