'use strict';
// Phase 35.3 — ticket-sync-agent structural test (SC#4/#5/#6, D-02/D-04/D-07). Hermetic:
// file reads only; NO live Linear/Jira MCP. Asserts the agent is MCP-based, redacts every
// outbound body, honors the kill-switch, maintains <ticket_links>, degrades-to-noop, and
// leaks no token. Tagged `35.3-01:`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const AGENT = fs.readFileSync(path.join(REPO_ROOT, 'agents', 'ticket-sync-agent.md'), 'utf8');

test('35.3-01: frontmatter + ## Record + size_budget', () => {
  const fm = AGENT.split('---')[1] || '';
  assert.match(fm, /name:\s*ticket-sync-agent/, 'name');
  assert.match(fm, /size_budget:\s*(XS|S|M|L|XL|XXL)/, 'size_budget tier');
  assert.match(AGENT, /##\s*Record/, '## Record (record-contract)');
});

test('35.3-01: MCP-based (Linear + Atlassian/Jira), no bundled SDK (D-02)', () => {
  assert.match(AGENT, /mcp__linear/, 'references the Linear MCP');
  assert.match(AGENT, /mcp__atlassian/, 'references the Atlassian (Jira) MCP');
  assert.doesNotMatch(AGENT, /require\(\s*['"]@linear|require\(\s*['"]jira-client|from\s+['"]@linear/, 'no bundled Linear/Jira SDK import');
});

test('35.3-01: redacts outbound + kill-switch + <ticket_links> + degrade (D-04)', () => {
  assert.match(AGENT, /scripts\/lib\/redact\.cjs/, 'redacts via scripts/lib/redact.cjs');
  assert.match(AGENT, /GDD_DISABLE_LINEAR/, 'Linear kill-switch');
  assert.match(AGENT, /GDD_DISABLE_JIRA/, 'Jira kill-switch');
  assert.match(AGENT, /<ticket_links>/, 'maintains the <ticket_links> STATE block');
  assert.match(AGENT, /degrade|noop/i, 'degrade-to-noop posture');
  assert.match(AGENT, /never\b[\s\S]{0,40}\b(fail|block|gate)|MUST NOT[\s\S]*cycle/i, 'never gates/fails the cycle');
});

test('35.3-01: no hardcoded token + cites the contract reference', () => {
  assert.doesNotMatch(AGENT, /lin_api_[A-Za-z0-9]{20,}|ATATT[A-Za-z0-9]{20,}/, 'no hardcoded Linear/Jira token');
  assert.match(AGENT, /reference\/ticket-sync\.md/, 'cites reference/ticket-sync.md');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'reference', 'ticket-sync.md')), 'reference/ticket-sync.md exists');
});
