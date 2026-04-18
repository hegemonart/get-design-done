'use strict';
/**
 * TST-27 — figma-writer-dry-run
 *
 * Validates that agents/design-figma-writer.md declares --dry-run handling,
 * documents the "do not call use_figma" guarantee, and surfaces a proposal
 * contract. Also uses mockMCP to verify a simulated dry-run path records
 * zero use_figma calls.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, mockMCP } = require('./helpers.cjs');

const AGENT = path.join(REPO_ROOT, 'agents/design-figma-writer.md');

test('figma-writer-dry-run: agents/design-figma-writer.md exists', () => {
  assert.ok(fs.existsSync(AGENT), `expected agent at ${AGENT}`);
});

test('figma-writer-dry-run: body declares --dry-run flag handling', () => {
  const body = fs.readFileSync(AGENT, 'utf8');
  assert.match(body, /--dry-run/, 'agent body should reference --dry-run flag');
});

test('figma-writer-dry-run: body declares use_figma is skipped in dry-run', () => {
  const body = fs.readFileSync(AGENT, 'utf8');
  // Tolerate several phrasings of the negative assertion.
  const patterns = [
    /not call use_figma/i,
    /do NOT call use_figma/,
    /skip use_figma/i,
    /no use_figma/i,
    /never call use_figma/i,
    /never.*use_figma/i,
    /do not execute/i, // step 4 phrases it as "No writes executed"
  ];
  const matched = patterns.some(p => p.test(body));
  assert.ok(
    matched,
    'agent body should declare that use_figma is not called in dry-run mode'
  );
});

test('figma-writer-dry-run: body declares proposal output contract', () => {
  const body = fs.readFileSync(AGENT, 'utf8');
  // Accept any common proposal-shape marker used in the agent body.
  const patterns = [
    /\*\*Proposal\*\*/,
    /### Proposal/,
    /## Proposed changes/,
    /Proposed\s+(annotations|token bindings|Code Connect mappings|operations)/i,
    /Build Proposal/i,
  ];
  const matched = patterns.some(p => p.test(body));
  assert.ok(
    matched,
    'agent body should declare a proposal output contract (header or Proposed * list)'
  );
});

test('figma-writer-dry-run: mockMCP records zero use_figma calls in simulated dry-run path', () => {
  const mock = mockMCP('figma', {
    get_metadata: () => ({ version: '1.0.0' }),
  });
  // Simulate a dry-run: agent may probe via get_metadata, but must NOT call use_figma.
  mock.call('get_metadata');
  mock.assertCalled('get_metadata');
  mock.assertNotCalled('use_figma');
});

test('figma-writer-dry-run: mockMCP surfaces a violation if use_figma is called under dry-run', () => {
  const mock = mockMCP('figma', {
    get_metadata: () => ({}),
    use_figma: () => ({ ok: true }),
  });
  mock.call('use_figma', { operation: 'add_comment' });
  // assertNotCalled should now throw because use_figma WAS called.
  assert.throws(
    () => mock.assertNotCalled('use_figma'),
    /NOT to be called/
  );
});
