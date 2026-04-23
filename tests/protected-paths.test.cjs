'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { REPO_ROOT } = require('./helpers.cjs');
const HOOK = path.join(REPO_ROOT, 'hooks', 'gdd-protected-paths.js');
const { matches, globToRegex } = require(path.join(REPO_ROOT, 'scripts', 'lib', 'glob-match.cjs'));

function runHook(payload, cwd) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: cwd || REPO_ROOT,
  });
  return { stdout: r.stdout, parsed: safeParse(r.stdout) };
}
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

function scaffoldConfig(paths) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-pp-test-'));
  const designDir = path.join(dir, '.design');
  fs.mkdirSync(designDir, { recursive: true });
  if (paths !== undefined) {
    fs.writeFileSync(path.join(designDir, 'config.json'), JSON.stringify({ protected_paths: paths }), 'utf8');
  }
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('protected-paths: default JSON is valid and contains expected entries', () => {
  const defaults = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'reference', 'protected-paths.default.json'), 'utf8'));
  assert.equal(defaults.version, 1);
  const list = defaults.protected_paths;
  for (const required of ['reference/**', 'skills/**', 'commands/**', 'hooks/**', '.git/**', '.design/archive/**']) {
    assert.ok(list.includes(required), `default list must contain ${required}`);
  }
});

test('protected-paths: 10 blocked Edit/Write/Bash paths are refused', () => {
  const blocked = [
    ['Edit',  { file_path: 'reference/heuristics.md' }],
    ['Write', { file_path: 'skills/plan/SKILL.md' }],
    ['Edit',  { file_path: 'hooks/gdd-bash-guard.js' }],
    ['Write', { file_path: '.design/config.json' }],
    ['Bash',  { command: 'rm reference/anti-patterns.md' }],
    ['Bash',  { command: 'mv hooks/x.js /tmp' }],
    ['Bash',  { command: "sed -i '' commands/progress.md" }],
    ['Write', { file_path: '.git/HEAD' }],
    ['Write', { file_path: '.design/archive/cycle-1/STATE.md' }],
    ['Write', { file_path: '.claude-plugin/plugin.json' }],
  ];
  for (const [tool, input] of blocked) {
    const { parsed } = runHook({ tool_name: tool, tool_input: input });
    assert.equal(parsed.continue, false, `expected block for ${tool} ${JSON.stringify(input)}`);
  }
});

test('protected-paths: 10 allowed paths pass through', () => {
  const allowed = [
    ['Edit',  { file_path: 'src/foo.ts' }],
    ['Write', { file_path: 'README.md' }],
    ['Write', { file_path: '.design/STATE.md' }],
    ['Write', { file_path: '.design/sketches/x.html' }],
    ['Write', { file_path: 'tests/new.test.cjs' }],
    ['Bash',  { command: 'ls hooks' }],
    ['Bash',  { command: 'git status' }],
    ['Bash',  { command: 'node scripts/foo.cjs' }],
    ['Write', { file_path: '.design/DESIGN.md' }],
    ['Write', { file_path: 'CHANGELOG.md' }],
  ];
  for (const [tool, input] of allowed) {
    const { parsed } = runHook({ tool_name: tool, tool_input: input });
    assert.equal(parsed.continue, true, `expected pass for ${tool} ${JSON.stringify(input)}`);
  }
});

test('protected-paths: glob matcher handles ** correctly', () => {
  assert.ok(globToRegex('reference/**').test('reference/heuristics.md'));
  assert.ok(globToRegex('reference/**').test('reference/schemas/intel.schema.json'));
  assert.ok(!globToRegex('reference/*').test('reference/schemas/intel.schema.json'));
  assert.ok(globToRegex('.git/**').test('.git/HEAD'));
  assert.ok(!globToRegex('.git/**').test('.github/workflows/ci.yml'));
});

test('protected-paths: user config ADDS to defaults (merge, not replace)', () => {
  const { dir, cleanup } = scaffoldConfig(['custom/**']);
  try {
    // User-added custom/** blocks
    let { parsed } = runHook({ tool_name: 'Edit', tool_input: { file_path: 'custom/foo.ts' } }, dir);
    assert.equal(parsed.continue, false);
    // Defaults still apply even though user listed only custom/**
    ({ parsed } = runHook({ tool_name: 'Edit', tool_input: { file_path: 'reference/heuristics.md' } }, dir));
    assert.equal(parsed.continue, false, 'defaults must still apply when user adds their own paths');
  } finally { cleanup(); }
});

test('protected-paths: user cannot REDUCE defaults by shipping empty list', () => {
  const { dir, cleanup } = scaffoldConfig([]);
  try {
    const { parsed } = runHook({ tool_name: 'Edit', tool_input: { file_path: 'reference/heuristics.md' } }, dir);
    assert.equal(parsed.continue, false, 'an empty user list must NOT unlock the default-protected paths');
  } finally { cleanup(); }
});

test('protected-paths: non-Edit/Write/Bash tools pass through', () => {
  const { parsed } = runHook({ tool_name: 'Read', tool_input: { file_path: 'reference/heuristics.md' } });
  assert.equal(parsed.continue, true);
});

test('protected-paths: stopReason names the matching pattern', () => {
  const { parsed } = runHook({ tool_name: 'Edit', tool_input: { file_path: 'reference/heuristics.md' } });
  assert.equal(parsed.continue, false);
  assert.match(parsed.stopReason, /reference\/\*\*/);
});
