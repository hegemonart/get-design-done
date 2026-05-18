'use strict';
/**
 * tests/skill-authoring-contract.test.cjs
 *
 * Phase 28.5 — locks the behavior of scripts/validate-skill-length.cjs (the load-bearing
 * test contract per D-11). Every validator path covered:
 *   1. clean skill
 *   2. warn (>=100 lines)
 *   3. block (>=250 lines)
 *   4. missing name
 *   5. missing description
 *   6. description too short
 *   7. description too long
 *   8. disable-model-invocation on whitelisted skill (help) — no block
 *   9. disable-model-invocation on non-whitelisted skill — block
 *  10. --strict-description: matching regex passes
 *  11. --strict-description: non-matching regex blocks
 *  12. --json output is parseable
 *  13. --quiet output suppresses per-skill lines but prints summary
 *  14. missing skills/ directory => exit 0
 *  15. missing frontmatter => block
 *  16. module exports: constants are correct
 *
 * Each test creates an ephemeral fixture directory in os.tmpdir() via mkdtempSync, wraps
 * via fs.realpathSync() to defeat macOS /var -> /private/var symlinks (Phase 27.6 lesson),
 * and spawns the validator CLI with SKILLS_DIR pointed at the fixture.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'validate-skill-length.cjs');
const v = require(SCRIPT);

// --- helpers ---

function makeSkillsDir() {
  // realpathSync defeats macOS symlinks; on Windows it's a no-op-equivalent.
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-test-')));
}

function writeSkill(dir, name, content) {
  const sd = path.join(dir, name);
  fs.mkdirSync(sd, { recursive: true });
  fs.writeFileSync(path.join(sd, 'SKILL.md'), content);
  return path.join(sd, 'SKILL.md');
}

function makeContent({
  name = 'test-skill',
  description = 'Valid description for the test skill which is exactly the right length.',
  extraFrontmatter = '',
  body = 'short body\n',
} = {}) {
  return `---
name: ${name}
description: "${description}"
${extraFrontmatter}---

${body}`;
}

function runCLI(skillsDir, args = []) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, SKILLS_DIR: skillsDir },
    encoding: 'utf8',
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// --- tests ---

test('clean: well-formed skill exits 0', () => {
  const dir = makeSkillsDir();
  writeSkill(dir, 'clean', makeContent({ name: 'clean' }));
  const r = runCLI(dir, ['--quiet']);
  assert.equal(r.code, 0, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('warn: skill with >=100 lines exits 1', () => {
  const dir = makeSkillsDir();
  // 120 body lines + frontmatter (4 lines) -> well over 100, well under 250
  const body = 'line\n'.repeat(120);
  writeSkill(dir, 'warny', makeContent({ name: 'warny', body }));
  const r = runCLI(dir, ['--quiet']);
  assert.equal(r.code, 1, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('block-lines: skill with >=250 lines exits 2', () => {
  const dir = makeSkillsDir();
  const body = 'line\n'.repeat(260);
  writeSkill(dir, 'blocky', makeContent({ name: 'blocky', body }));
  const r = runCLI(dir, ['--quiet']);
  assert.equal(r.code, 2, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('block: missing name => exit 2', () => {
  const dir = makeSkillsDir();
  const sd = path.join(dir, 'noname');
  fs.mkdirSync(sd);
  fs.writeFileSync(
    path.join(sd, 'SKILL.md'),
    '---\ndescription: "A description that is long enough to be valid here."\n---\nbody\n'
  );
  const r = runCLI(dir, ['--quiet']);
  assert.equal(r.code, 2, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('block: missing description => exit 2', () => {
  const dir = makeSkillsDir();
  const sd = path.join(dir, 'nodesc');
  fs.mkdirSync(sd);
  fs.writeFileSync(path.join(sd, 'SKILL.md'), '---\nname: nodesc\n---\nbody\n');
  const r = runCLI(dir, ['--quiet']);
  assert.equal(r.code, 2, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('block: description too short => exit 2', () => {
  const dir = makeSkillsDir();
  writeSkill(dir, 'shortdesc', makeContent({ name: 'shortdesc', description: 'too short' }));
  const r = runCLI(dir, ['--quiet']);
  assert.equal(r.code, 2, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('block: description too long => exit 2', () => {
  const dir = makeSkillsDir();
  const longDesc = 'x'.repeat(1100);
  writeSkill(dir, 'longdesc', makeContent({ name: 'longdesc', description: longDesc }));
  const r = runCLI(dir, ['--quiet']);
  assert.equal(r.code, 2, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('whitelist: disable-model-invocation on help => no block', () => {
  const dir = makeSkillsDir();
  writeSkill(dir, 'help', makeContent({
    name: 'help',
    extraFrontmatter: 'disable-model-invocation: true\n',
  }));
  const r = runCLI(dir, ['--quiet']);
  assert.equal(r.code, 0, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('whitelist: disable-model-invocation on non-whitelisted skill => block', () => {
  const dir = makeSkillsDir();
  writeSkill(dir, 'verify', makeContent({
    name: 'verify',
    extraFrontmatter: 'disable-model-invocation: true\n',
  }));
  const r = runCLI(dir, ['--quiet']);
  assert.equal(r.code, 2, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('strict-description: matching regex passes', () => {
  const dir = makeSkillsDir();
  writeSkill(dir, 'strictpass', makeContent({
    name: 'strictpass',
    description: 'Does the thing. Use when the user runs the command.',
  }));
  const r = runCLI(dir, ['--quiet', '--strict-description']);
  assert.equal(r.code, 0, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('strict-description: non-matching regex blocks', () => {
  const dir = makeSkillsDir();
  writeSkill(dir, 'strictfail', makeContent({
    name: 'strictfail',
    description: 'Just a single sentence without the trigger form here today.',
  }));
  const r = runCLI(dir, ['--quiet', '--strict-description']);
  assert.equal(r.code, 2, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('--json: emits parseable JSON', () => {
  const dir = makeSkillsDir();
  writeSkill(dir, 'jsontest', makeContent({ name: 'jsontest' }));
  const r = runCLI(dir, ['--json']);
  // exit code may be 0/1/2 depending on content; we only assert JSON shape.
  const parsed = JSON.parse(r.stdout);
  assert.ok(parsed.summary, 'summary key present');
  assert.ok(Array.isArray(parsed.skills), 'skills is array');
  assert.equal(parsed.summary.total, 1);
  assert.equal(parsed.skills[0].name, 'jsontest');
  assert.equal(parsed.skills[0].level, 'clean');
});

test('--quiet: suppresses per-skill lines but prints summary', () => {
  const dir = makeSkillsDir();
  writeSkill(dir, 'quiettest', makeContent({ name: 'quiettest' }));
  const r = runCLI(dir, ['--quiet']);
  assert.ok(r.stdout.includes('Summary:'), `expected Summary: in stdout, got: ${r.stdout}`);
});

test('empty skills dir => exit 0', () => {
  const dir = makeSkillsDir();
  // No skills created.
  const r = runCLI(dir, ['--quiet']);
  assert.equal(r.code, 0, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('missing frontmatter => block', () => {
  const dir = makeSkillsDir();
  const sd = path.join(dir, 'nofm');
  fs.mkdirSync(sd);
  fs.writeFileSync(path.join(sd, 'SKILL.md'), 'no frontmatter at all\njust prose\n');
  const r = runCLI(dir, ['--quiet']);
  assert.equal(r.code, 2, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('module exports: constants are correct', () => {
  assert.equal(v.WARN_LINES, 100);
  assert.equal(v.BLOCK_LINES, 250);
  assert.equal(v.DESC_MIN, 20);
  assert.equal(v.DESC_MAX, 1024);
  assert.ok(v.DISABLE_INVOCATION_WHITELIST.has('help'));
  assert.ok(v.DISABLE_INVOCATION_WHITELIST.has('zoom-out'));
  assert.ok(!v.DISABLE_INVOCATION_WHITELIST.has('verify'));
  // STRICT_RE behaves
  assert.ok(v.STRICT_RE.test('Does X. Use when Y.'));
  assert.ok(!v.STRICT_RE.test('Does X.'));
});

test('STRICT_DESCRIPTION=1 env flag mirrors --strict-description', () => {
  const dir = makeSkillsDir();
  writeSkill(dir, 'envstrict', makeContent({
    name: 'envstrict',
    description: 'Just one sentence with no trigger phrase included here at all.',
  }));
  const r = spawnSync(process.execPath, [SCRIPT, '--quiet'], {
    env: { ...process.env, SKILLS_DIR: dir, STRICT_DESCRIPTION: '1' },
    encoding: 'utf8',
  });
  assert.equal(r.status, 2, `stdout=${r.stdout} stderr=${r.stderr}`);
});

test('validateSkill: pure function returns level=clean for valid input', () => {
  const dir = makeSkillsDir();
  const p = writeSkill(dir, 'pure', makeContent({ name: 'pure' }));
  const result = v.validateSkill('pure', p, { quiet: false, strict: false, json: false });
  assert.equal(result.level, 'clean');
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.ok(result.hasRequiredFields);
});

test('walkSkills: returns sorted skill list from fixture dir', () => {
  const dir = makeSkillsDir();
  writeSkill(dir, 'zebra', makeContent({ name: 'zebra' }));
  writeSkill(dir, 'alpha', makeContent({ name: 'alpha' }));
  writeSkill(dir, 'mango', makeContent({ name: 'mango' }));
  const list = v.walkSkills(dir);
  assert.deepEqual(list.map(s => s.name), ['alpha', 'mango', 'zebra']);
});
