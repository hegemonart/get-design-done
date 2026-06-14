'use strict';
/**
 * test/suite/catalog-integrity.test.cjs — Phase 60 regression guard for the catalog
 * integrity validator (scripts/validate-catalog-integrity.cjs).
 *
 * (1) the REAL catalog passes (runChecks() against the repo returns 0 findings);
 * (2) a synthetic injected exact-dupe (two files with identical bodies) is detected;
 * (3) a synthetic orphan (manifest entry with no template) is detected.
 *
 * The validator exports pure checkers, so these tests call them directly on synthetic
 * inputs — no shelling out, no temp-file scaffolding.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const v = require('../../scripts/validate-catalog-integrity.cjs');

test('real catalog passes with zero findings', () => {
  const { findings, counts } = v.runChecks();
  assert.deepEqual(
    findings,
    [],
    `expected a clean catalog but got findings:\n${findings.map((f) => `  [${f.kind}] ${f.message}`).join('\n')}`,
  );
  // Sanity: the bijection set is non-trivial (guards against an empty-input false pass).
  assert.ok(counts.skills > 50, `expected >50 skills, got ${counts.skills}`);
  assert.ok(counts.agents > 30, `expected >30 agents, got ${counts.agents}`);
  assert.equal(counts.mcpServers, 2);
  assert.equal(counts.mcpTools, 13);
});

test('synthetic exact-dupe (identical bodies) is detected', () => {
  const frontA = '---\nname: alpha\n---\n';
  const frontB = '---\nname: beta\n---\n';
  const sharedBody = '# Heading\n\nIdentical copy-pasted body content here.\n';
  const files = [
    { path: 'scripts/skill-templates/alpha/SKILL.md', text: frontA + sharedBody },
    { path: 'scripts/skill-templates/beta/SKILL.md', text: frontB + sharedBody },
    { path: 'agents/gamma.md', text: '---\nname: gamma\n---\n# Distinct\n\nUnique body.\n' },
  ];
  const findings = v.checkExactDupes(files);
  assert.equal(findings.length, 1, 'exactly one dupe cluster expected');
  assert.equal(findings[0].kind, 'exact-dupe');
  assert.match(findings[0].message, /alpha/);
  assert.match(findings[0].message, /beta/);
  // The distinct agent must NOT be flagged.
  assert.doesNotMatch(findings[0].message, /gamma/);
});

test('synthetic orphan (manifest entry with no template) is detected', () => {
  const findings = v.checkBijection({
    manifest: ['audit', 'ghost'], // "ghost" has no template and no generated dir
    templates: ['audit'],
    generated: ['audit'],
  });
  const ghostFindings = findings.filter((f) => /ghost/.test(f.message));
  assert.ok(ghostFindings.length >= 1, 'expected the orphan "ghost" to be flagged');
  assert.ok(ghostFindings.every((f) => f.kind === 'orphan'));
  assert.match(ghostFindings[0].message, /missing from/);
});

test('synthetic reverse-orphan (template with no manifest entry) is detected', () => {
  const findings = v.checkBijection({
    manifest: ['audit'],
    templates: ['audit', 'stray'], // "stray" template has no manifest row
    generated: ['audit'],
  });
  const stray = findings.filter((f) => /stray/.test(f.message));
  assert.ok(stray.length >= 1, 'expected reverse-orphan "stray" flagged');
  assert.equal(stray[0].kind, 'orphan');
});

test('near-dup detection flags a synthetic near-clone above threshold', () => {
  const desc = 'Run a design audit by spawning the auditor and printing a score summary.';
  const skills = [
    { name: 'audit', description: desc },
    { name: 'audit-clone', description: desc + ' Extra.' }, // ~near-identical
    { name: 'other', description: 'Completely unrelated text about typography spacing.' },
  ];
  const findings = v.checkNearDupDescriptions(skills, v.NEAR_DUP_THRESHOLD);
  assert.ok(findings.length >= 1, 'expected the near-clone pair flagged');
  assert.equal(findings[0].kind, 'near-dup-description');
  assert.match(findings[0].message, /audit/);
});

test('description sanity flags empty and out-of-contract lengths', () => {
  const skills = [
    { name: 'ok', description: 'A perfectly fine description well within the contract bounds.' },
    { name: 'empty', description: '' },
    { name: 'tooShort', description: 'short' },
    { name: 'tooLong', description: 'x'.repeat(v.DESC_MAX + 1) },
  ];
  const findings = v.checkDescriptionSanity(skills);
  const names = findings.map((f) => f.message);
  assert.ok(names.some((m) => /empty/.test(m)));
  assert.ok(names.some((m) => /tooShort/.test(m)));
  assert.ok(names.some((m) => /tooLong/.test(m)));
  assert.ok(!names.some((m) => /"ok"/.test(m)), 'the valid description must not be flagged');
});

test('capability honesty flags a missing server.ts and a mis-stated tool count', () => {
  const findings = v.checkCapabilityHonesty({
    declaredServers: ['hone-mcp', 'phantom'],
    serverExists: (name) => name === 'hone-mcp',
    actualToolCount: 13,
    claimedToolCounts: [13, 99], // 99 is a lie
  });
  assert.ok(findings.some((f) => /phantom/.test(f.message)), 'missing server.ts should be flagged');
  assert.ok(findings.some((f) => /99/.test(f.message)), 'wrong tool count should be flagged');
  // The honest claim (13) and the present server must not produce a finding.
  assert.ok(!findings.some((f) => /hone-mcp.*no sdk/.test(f.message)));
});
