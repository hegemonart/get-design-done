'use strict';
/**
 * tests/phase-28.5-health-skill-report.test.cjs — Phase 28.5-11 Task 2.
 *
 * Asserts skills/health/SKILL.md has been extended with a skill-length
 * report subsection (per D-11) and remains compliant with the skill-authoring
 * contract (≤99 lines; name: gdd-health; disable-model-invocation: true).
 *
 * Behavior covered (per plan 28.5-11 Task 2):
 *   1. Health SKILL.md has a section/subsection mentioning skill-length.
 *   2. The subsection references the validator (`validate-skill-length`).
 *   3. Length stays ≤99 (preserve D-01 / Wave B compliance).
 *   4. name: gdd-health unchanged.
 *   5. disable-model-invocation: true preserved (from 28.5-06 / D-09).
 *   6. Health skill still passes the validator (0 errors, 0 warnings).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const HEALTH_PATH = path.join(REPO_ROOT, 'skills', 'health', 'SKILL.md');
const VALIDATOR = path.join(REPO_ROOT, 'scripts', 'validate-skill-length.cjs');

function readHealth() {
  return fs.readFileSync(HEALTH_PATH, 'utf8');
}

function countLines(text) {
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

test('28.5-11 health: SKILL.md mentions skill-length', () => {
  const text = readHealth();
  assert.match(text, /skill-length/i, 'health SKILL.md does not mention skill-length');
});

test('28.5-11 health: SKILL.md references the validator script', () => {
  const text = readHealth();
  assert.match(text, /validate-skill-length/, 'health SKILL.md does not reference validate-skill-length');
});

test('28.5-11 health: SKILL.md is ≤99 lines (D-01 / Wave B)', () => {
  const text = readHealth();
  const n = countLines(text);
  assert.ok(n <= 99, `health SKILL.md is ${n} lines; threshold ≤99`);
});

test('28.5-11 health: name: gdd-health is preserved', () => {
  const text = readHealth();
  assert.match(text, /^name:\s*gdd-health\s*$/m, 'name: gdd-health not present in frontmatter');
});

test('28.5-11 health: disable-model-invocation: true is preserved (D-09)', () => {
  const text = readHealth();
  assert.match(
    text,
    /^disable-model-invocation:\s*true\s*$/m,
    'disable-model-invocation: true not present in frontmatter'
  );
});

test('28.5-11 health: validator reports health as clean (0 errors, 0 warnings)', () => {
  const r = spawnSync(process.execPath, [VALIDATOR, '--quiet', '--json'], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  assert.equal(r.status, 0, `validator exit ${r.status}; stderr: ${r.stderr}`);
  const out = JSON.parse(r.stdout);
  const h = out.skills.find(s => s.name === 'health');
  assert.ok(h, 'no health entry in validator output');
  assert.equal(h.errors.length, 0, `health has ${h.errors.length} validator errors`);
  assert.equal(h.warnings.length, 0, `health has ${h.warnings.length} validator warnings`);
});
