'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REPO_ROOT } = require('./helpers.cjs');

const INSTALL_SCRIPT = path.join(REPO_ROOT, 'scripts', 'install.cjs');

function runInstall(env, args = []) {
  return spawnSync(process.execPath, [INSTALL_SCRIPT, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function mktmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-install-test-'));
}

test('install.cjs exists and is declared as the npm bin', () => {
  assert.ok(fs.existsSync(INSTALL_SCRIPT), 'scripts/install.cjs must exist');

  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
  );
  assert.equal(pkg.bin['get-design-done'], './scripts/install.cjs');
  assert.ok(pkg.files.includes('scripts/'), 'scripts/ must be in package files');
});

test('install.cjs --help exits 0 with usage text', () => {
  const result = runInstall({}, ['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /npx @hegemonart\/get-design-done/);
  assert.match(result.stdout, /--dry-run/);
  assert.match(result.stdout, /CLAUDE_CONFIG_DIR/);
});

test('install.cjs fresh install writes marketplace + enabledPlugins entries', () => {
  const tmp = mktmp();
  try {
    const result = runInstall({ CLAUDE_CONFIG_DIR: tmp });
    assert.equal(result.status, 0, result.stderr);

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmp, 'settings.json'), 'utf8'),
    );
    assert.deepEqual(settings.extraKnownMarketplaces['get-design-done'], {
      source: { source: 'github', repo: 'hegemonart/get-design-done' },
    });
    assert.equal(
      settings.enabledPlugins['get-design-done@get-design-done'],
      true,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('install.cjs is idempotent on repeat invocation', () => {
  const tmp = mktmp();
  try {
    runInstall({ CLAUDE_CONFIG_DIR: tmp });
    const result = runInstall({ CLAUDE_CONFIG_DIR: tmp });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /already registered/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('install.cjs preserves unrelated settings keys', () => {
  const tmp = mktmp();
  try {
    fs.writeFileSync(
      path.join(tmp, 'settings.json'),
      JSON.stringify({
        theme: 'dark',
        extraKnownMarketplaces: {
          other: { source: { source: 'github', repo: 'foo/bar' } },
        },
      }),
    );
    const result = runInstall({ CLAUDE_CONFIG_DIR: tmp });
    assert.equal(result.status, 0);

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmp, 'settings.json'), 'utf8'),
    );
    assert.equal(settings.theme, 'dark');
    assert.deepEqual(settings.extraKnownMarketplaces.other, {
      source: { source: 'github', repo: 'foo/bar' },
    });
    assert.ok(settings.extraKnownMarketplaces['get-design-done']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('install.cjs --dry-run does not write settings.json', () => {
  const tmp = mktmp();
  try {
    const result = runInstall({ CLAUDE_CONFIG_DIR: tmp }, ['--dry-run']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /\[dry-run\]/);
    assert.ok(
      !fs.existsSync(path.join(tmp, 'settings.json')),
      'settings.json must not exist after dry-run',
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('install.cjs exits 1 on malformed settings.json', () => {
  const tmp = mktmp();
  try {
    fs.writeFileSync(path.join(tmp, 'settings.json'), '{ not valid json');
    const result = runInstall({ CLAUDE_CONFIG_DIR: tmp });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot parse/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
