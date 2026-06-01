'use strict';
// Phase 35.1 — pr-commenter agent structural test (SC#1/#2/#5/#6, D-02/D-05/D-08).
// Hermetic: file reads only; NO live gh / network. Asserts the agent states its
// posting contract (gh-api inline comments + gdd/design-review check-run), redacts
// every outbound body, honors the kill-switch, degrades-to-noop, and leaks no token.
// Every test tagged `35.1-01:`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const AGENT = fs.readFileSync(path.join(REPO_ROOT, 'agents', 'pr-commenter.md'), 'utf8');

test('35.1-01: pr-commenter frontmatter + ## Record + size_budget', () => {
  const fm = AGENT.split('---')[1] || '';
  assert.match(fm, /name:\s*pr-commenter/, 'name: pr-commenter');
  assert.match(fm, /size_budget:\s*(XS|S|M|L|XL|XXL)/, 'declares a size_budget tier');
  assert.match(fm, /\btools:\s*.*Bash/, 'tools include Bash (runs gh)');
  assert.match(AGENT, /##\s*Record/, 'has the ## Record section (record-contract)');
});

test('35.1-01: posts via gh api — inline comments + gdd/design-review check-run (D-02/D-03)', () => {
  assert.match(AGENT, /gh api/, 'uses gh api (no GitHub SDK)');
  assert.match(AGENT, /pulls\/\{?n(umber)?\}?\/comments|pulls\/.*\/comments/, 'posts inline review comments on the PR');
  assert.match(AGENT, /check-runs/, 'registers a check-run');
  assert.match(AGENT, /gdd\/design-review/, 'the check is named gdd/design-review');
});

test('35.1-01: redacts every outbound body (D-05)', () => {
  assert.match(AGENT, /redact/, 'references the redactor');
  assert.match(AGENT, /scripts\/lib\/redact\.cjs/, 'uses scripts/lib/redact.cjs');
});

test('35.1-01: kill-switch + degrade-to-noop (D-05/D-06)', () => {
  assert.match(AGENT, /GDD_DISABLE_PR_COMMENTER/, 'env kill-switch documented');
  assert.match(AGENT, /degrade|noop/i, 'degrade-to-noop posture stated');
  assert.match(AGENT, /never\b.*\b(fail|block).*ship|MUST NOT[\s\S]*ship/i, 'must not fail the ship success path');
});

test('35.1-01: no GitHub SDK dependency + no hardcoded token/secret', () => {
  // a prohibition MENTION of @octokit is fine; only an actual import/require is a violation
  assert.doesNotMatch(AGENT, /require\(\s*['"]@?octokit|from\s+['"]@?octokit['"]|import\s+.*@octokit/, 'no actual @octokit/GitHub SDK import');
  // no hardcoded GitHub tokens (ghp_/github_pat_) or bearer literals
  assert.doesNotMatch(AGENT, /ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/, 'no hardcoded GitHub token');
});

test('35.1-01: delegates the gh-api shapes to reference/pr-review-integration.md', () => {
  assert.match(AGENT, /reference\/pr-review-integration\.md/, 'cites the contract reference');
  assert.ok(
    fs.existsSync(path.join(REPO_ROOT, 'reference', 'pr-review-integration.md')),
    'reference/pr-review-integration.md must exist',
  );
});
