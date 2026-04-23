'use strict';

// Schema regression for the design-start-writer output contract.
// This test does NOT invoke the agent — it asserts that the baseline
// fixture expected-report-shape.md matches the schema documented in
// agents/design-start-writer.md, so any drift in the contract is caught.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const BASELINE_DIR = path.resolve(__dirname, '..', 'test-fixture', 'baselines', 'phase-14.7');
const REPORT = fs.readFileSync(path.join(BASELINE_DIR, 'expected-report-shape.md'), 'utf8');
const CONTEXT = JSON.parse(fs.readFileSync(path.join(BASELINE_DIR, 'context-input.json'), 'utf8'));
const AGENT = fs.readFileSync(
  path.resolve(__dirname, '..', 'agents', 'design-start-writer.md'),
  'utf8'
);

test('baseline report has the title + intro line', () => {
  assert.match(REPORT, /^# GDD First-Run Report/);
  assert.match(REPORT, /> Generated .* by `\/gdd:start`/);
});

test('baseline report has all seven H2 sections in order', () => {
  const sections = [...REPORT.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepStrictEqual(sections, [
    'What I inspected',
    'Three findings',
    'Best first proof',
    'Suggested next command',
    'Visual Proof Readiness',
    'Full pipeline path',
    'Connections / writeback optional',
  ]);
});

test('baseline report emits exactly one trailing JSON fenced block', () => {
  const blocks = [...REPORT.matchAll(/```json\n([\s\S]*?)\n```/g)];
  assert.strictEqual(blocks.length, 1, 'exactly one JSON block');
  const parsed = JSON.parse(blocks[0][1]);
  assert.strictEqual(parsed.schema_version, '1.0');
  assert.ok(Array.isArray(parsed.findings));
  assert.strictEqual(parsed.findings.length, CONTEXT.scan.findings.length);
  assert.strictEqual(parsed.best_first_proof, CONTEXT.scan.bestFirstProofId);
  assert.ok(parsed.suggested_command);
  assert.match(parsed.suggested_command.text, /^\/gdd:(fast|brief|scan)/);
  assert.ok(parsed.visual_proof_readiness);
  ['preview', 'storybook', 'figma', 'canvas'].forEach((k) => {
    assert.ok(
      ['ok', 'unconfigured', 'unavailable'].includes(parsed.visual_proof_readiness[k]),
      `visual_proof_readiness.${k} must be one of ok/unconfigured/unavailable`
    );
  });
});

test('baseline report body does not mention STATE.md', () => {
  // The agent must not write STATE.md, and should not even reference it in the report body.
  // The contract says STATE.md is explicitly excluded.
  const bodyOnly = REPORT.replace(/```json[\s\S]*?```/g, '');
  assert.strictEqual(/STATE\.md/.test(bodyOnly), false);
});

test('findings section contains one H3 per finding with evidence', () => {
  const finds = [...REPORT.matchAll(/^### (F\d) — (.+)\n\n\*\*Severity:\*\* (\w+) · \*\*Evidence:\*\* (\S+):(\d+)/gm)];
  assert.strictEqual(finds.length, CONTEXT.scan.findings.length);
  finds.forEach((m, i) => {
    assert.strictEqual(m[1], CONTEXT.scan.findings[i].id);
    assert.strictEqual(m[2], CONTEXT.scan.findings[i].title);
    assert.strictEqual(m[3], CONTEXT.scan.findings[i].severity);
    assert.strictEqual(m[4], CONTEXT.scan.findings[i].file);
    assert.strictEqual(Number(m[5]), CONTEXT.scan.findings[i].line);
  });
});

test('agent frontmatter is Haiku-tier', () => {
  assert.match(AGENT, /^default-tier:\s*haiku/m);
  assert.match(AGENT, /^model:\s*haiku/m);
});

test('agent declares the allowed-write-paths restriction', () => {
  assert.match(AGENT, /allowed-write-paths:\s*\n\s*-\s*"\.design\/START-REPORT\.md"/);
});

test('agent documents the 7 required output sections', () => {
  [
    'What I inspected',
    'Three findings',
    'Best first proof',
    'Suggested next command',
    'Visual Proof Readiness',
    'Full pipeline path',
    'Connections / writeback optional',
  ].forEach((section) => {
    assert.ok(AGENT.includes(section), `agent must document section: ${section}`);
  });
});
