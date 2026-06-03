'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { REPO_ROOT } = require('./helpers.ts');
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

// --- Regression: 4 bypass vectors in extractBashTargets ---
// Audit-flagged: match() returned only first match (chained-command bypass);
// no subshell scanning; no multi-arg coverage; no backtick scanning.

test('protected-paths: chained `&&` rm — both targets are checked', () => {
  const { parsed } = runHook({
    tool_name: 'Bash',
    tool_input: { command: 'rm safe.txt && rm reference/anti-patterns.md' },
  });
  assert.equal(parsed.continue, false, 'second segment must trip the guard');
  assert.match(parsed.stopReason, /reference\/\*\*/);
});

test('protected-paths: chained `;` rm — both targets are checked', () => {
  const { parsed } = runHook({
    tool_name: 'Bash',
    tool_input: { command: 'rm safe.txt ; rm reference/anti-patterns.md' },
  });
  assert.equal(parsed.continue, false);
});

test('protected-paths: multi-arg `rm file1 file2 file3` — every arg is checked', () => {
  const { parsed } = runHook({
    tool_name: 'Bash',
    tool_input: { command: 'rm safe1.txt safe2.txt reference/heuristics.md safe3.txt' },
  });
  assert.equal(parsed.continue, false, 'protected path mixed into the multi-arg list must trip the guard');
});

test('protected-paths: `$(...)` subshell — inner rm of protected path is blocked', () => {
  // The subshell expression itself executes: `rm reference/x.md` runs inside,
  // and its output ('') substitutes into the parent (echo ''). The audit's
  // bypass was: outer regex never scanned the subshell body, so the inner
  // rm slipped through.
  const { parsed } = runHook({
    tool_name: 'Bash',
    tool_input: { command: 'echo $(rm reference/heuristics.md)' },
  });
  assert.equal(parsed.continue, false);
});

test('protected-paths: backtick subshell — inner rm of protected path is blocked', () => {
  const { parsed } = runHook({
    tool_name: 'Bash',
    tool_input: { command: 'echo `rm reference/heuristics.md`' },
  });
  assert.equal(parsed.continue, false);
});

test('protected-paths: `sudo rm` is treated as `rm`', () => {
  const { parsed } = runHook({
    tool_name: 'Bash',
    tool_input: { command: 'sudo rm -rf reference/heuristics.md' },
  });
  assert.equal(parsed.continue, false);
});

test('protected-paths: `>` redirect into protected path is blocked', () => {
  const { parsed } = runHook({
    tool_name: 'Bash',
    tool_input: { command: 'echo poison > reference/heuristics.md' },
  });
  assert.equal(parsed.continue, false);
});

test('protected-paths: `>>` redirect into protected path is blocked', () => {
  const { parsed } = runHook({
    tool_name: 'Bash',
    tool_input: { command: 'echo poison >> reference/heuristics.md' },
  });
  assert.equal(parsed.continue, false);
});

test('protected-paths: `git restore` of protected file is blocked', () => {
  const { parsed } = runHook({
    tool_name: 'Bash',
    tool_input: { command: 'git restore reference/heuristics.md' },
  });
  assert.equal(parsed.continue, false);
});

test('protected-paths: `sed -i` modifying protected file is blocked', () => {
  const { parsed } = runHook({
    tool_name: 'Bash',
    tool_input: { command: "sed -i 's/foo/bar/' reference/heuristics.md" },
  });
  assert.equal(parsed.continue, false);
});

test('protected-paths: `sed` WITHOUT -i is allowed (read-only)', () => {
  const { parsed } = runHook({
    tool_name: 'Bash',
    tool_input: { command: "sed 's/foo/bar/' reference/heuristics.md" },
  });
  // sed without -i prints to stdout — no mutation, must pass through.
  assert.equal(parsed.continue, true);
});

test('protected-paths: quoted target `rm "reference/heuristics.md"` is detected', () => {
  const { parsed } = runHook({
    tool_name: 'Bash',
    tool_input: { command: 'rm "reference/heuristics.md"' },
  });
  assert.equal(parsed.continue, false);
});
