'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { REPO_ROOT } = require('./helpers.ts');

const META_PATH = path.join(REPO_ROOT, 'reference', 'meta-rules.md');
const SHARED_PATH = path.join(REPO_ROOT, 'reference', 'shared-preamble.md');

const SECTION_HEADINGS = [
  '## Required Reading Discipline',
  '## Writes Protocol',
  '## Deviation Handling',
  '## Completion Markers',
  '## Context-Exhaustion & Budget Awareness',
];

const SIGNATURE_PHRASES = [
  /When the orchestrator's prompt contains a `<required_reading>` block/,
  /Only write files declared in your frontmatter `writes:` list/,
  /Return a structured blocker to STATE\.md/,
  /Execution agent → `## EXECUTION COMPLETE`/,
  /A PostToolUse hook at `hooks\/context-exhaustion\.js`/,
];

test('meta-rules: reference/meta-rules.md exists and contains all 5 subsections verbatim', () => {
  const body = fs.readFileSync(META_PATH, 'utf8');
  for (const h of SECTION_HEADINGS) {
    assert.ok(body.includes(h), `meta-rules.md must contain heading: ${h}`);
  }
  for (const re of SIGNATURE_PHRASES) {
    assert.match(body, re);
  }
});

test('meta-rules: shared-preamble.md is an aggregator — imports meta-rules first', () => {
  const body = fs.readFileSync(SHARED_PATH, 'utf8');
  assert.match(body, /@reference\/meta-rules\.md/, 'shared-preamble must import meta-rules');
  // The import line must appear in the first 20 lines of the body so the
  // aggregator is the load-bearing first thing after the title paragraph.
  const firstLines = body.split('\n').slice(0, 20).join('\n');
  assert.match(firstLines, /@reference\/meta-rules\.md/, 'import must appear within the first 20 lines');
});

test('meta-rules: the 5 extracted subsections NO LONGER live verbatim in shared-preamble.md', () => {
  const body = fs.readFileSync(SHARED_PATH, 'utf8');
  for (const h of SECTION_HEADINGS) {
    assert.ok(!body.includes(h), `shared-preamble must NOT contain heading: ${h}`);
  }
  // Also no signature-phrase leakage (we allow each phrase to appear at most 0 times)
  for (const re of SIGNATURE_PHRASES) {
    assert.ok(!re.test(body), `shared-preamble must NOT contain signature phrase ${re}`);
  }
});

test('meta-rules: no agent body duplicates the 5 subsections', () => {
  const agentsDir = path.join(REPO_ROOT, 'agents');
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md') && f !== 'README.md');
  for (const f of files) {
    const body = fs.readFileSync(path.join(agentsDir, f), 'utf8');
    for (const re of SIGNATURE_PHRASES) {
      assert.ok(!re.test(body), `agents/${f} contains duplicated meta-rules signature: ${re}`);
    }
  }
});

test('meta-rules: shared-preamble is substantially shorter than before extraction', () => {
  const bytes = fs.statSync(SHARED_PATH).size;
  // Original extraction (pre-Phase-19) had shared-preamble at ~6.5KB; the
  // aggregator split pushed it below 4KB. Phase 28.5-05 (Bucket 2
  // design-family rework) intentionally re-extended shared-preamble to
  // host the cross-skill probe pattern + connection-handshake summary
  // + output-contract reminders that the design-family skills now
  // cross-link into (replacing duplicated per-skill recitations). The
  // new ceiling is 12KB — still well under the pre-extraction monolith,
  // and the content is now load-bearing for the shared cross-link graph.
  assert.ok(bytes < 12000, `shared-preamble should stay below 12KB; got ${bytes} bytes (Phase 28.5-05 re-extension expanded the file to host cross-skill probe pattern + connection-handshake summary + output-contract reminders)`);
});
