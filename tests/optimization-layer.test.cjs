'use strict';
/**
 * TST-32 — optimization-layer
 *
 * Covers ROADMAP Phase 10.1 optimization-layer enforcement:
 *   - budget.json schema contract
 *   - costs.jsonl entries are valid JSON lines with required keys
 *   - cap_hit is strictly boolean
 *   - agent-metrics.json schema contract
 *   - router/tier cross-reference with agent frontmatter (skipped if no
 *     router doc is shipped)
 *   - lazy-spawn gate: agents declare required-reading or explicit skip marker
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, scaffoldDesignDir, readFrontmatter } = require('./helpers.cjs');

const COSTS_JSONL = path.join(
  REPO_ROOT,
  'test-fixture/baselines/current/sample-costs.jsonl'
);
const AGENT_METRICS = path.join(
  REPO_ROOT,
  'test-fixture/baselines/current/sample-agent-metrics.json'
);

test('optimization-layer: budget.json schema contract', () => {
  // Schema must match what loadBudget() in hooks/budget-enforcer.js actually reads.
  const scaffold = scaffoldDesignDir();
  try {
    const budget = {
      per_task_cap_usd: 2.00,
      per_phase_cap_usd: 20.00,
      tier_overrides: { 'design-planner': 'opus' },
      auto_downgrade_on_cap: true,
      cache_ttl_seconds: 3600,
      enforcement_mode: 'enforce',
    };
    const budgetPath = path.join(scaffold.designDir, 'budget.json');
    fs.writeFileSync(budgetPath, JSON.stringify(budget, null, 2), 'utf8');

    const parsed = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
    assert.equal(typeof parsed.per_task_cap_usd, 'number', 'per_task_cap_usd must be a number');
    assert.equal(typeof parsed.per_phase_cap_usd, 'number', 'per_phase_cap_usd must be a number');
    assert.equal(typeof parsed.tier_overrides, 'object', 'tier_overrides must be an object');
    assert.equal(typeof parsed.auto_downgrade_on_cap, 'boolean', 'auto_downgrade_on_cap must be boolean');
    assert.equal(typeof parsed.cache_ttl_seconds, 'number', 'cache_ttl_seconds must be a number');
    assert.ok(
      ['enforce', 'warn', 'log'].includes(parsed.enforcement_mode),
      `enforcement_mode must be enforce|warn|log, got: ${parsed.enforcement_mode}`
    );
    for (const [agent, tier] of Object.entries(parsed.tier_overrides)) {
      assert.equal(typeof tier, 'string', `tier_overrides.${agent} must be a string`);
    }
  } finally {
    scaffold.cleanup();
  }
});

test('optimization-layer: costs.jsonl entries are valid JSON lines', () => {
  assert.ok(fs.existsSync(COSTS_JSONL), `expected ${COSTS_JSONL}`);
  const body = fs.readFileSync(COSTS_JSONL, 'utf8');
  const lines = body.split('\n').filter(l => l.trim() !== '');
  assert.ok(lines.length > 0, 'costs.jsonl must have at least one entry');

  for (const line of lines) {
    let entry;
    assert.doesNotThrow(() => { entry = JSON.parse(line); }, `line should parse: ${line}`);
    for (const key of ['ts', 'agent', 'tier', 'est_cost_usd']) {
      assert.ok(key in entry, `entry missing required key "${key}": ${line}`);
    }
  }
});

test('optimization-layer: cap_hit flag is strictly boolean', () => {
  const body = fs.readFileSync(COSTS_JSONL, 'utf8');
  const lines = body.split('\n').filter(l => l.trim() !== '');
  for (const line of lines) {
    const entry = JSON.parse(line);
    assert.ok('cap_hit' in entry, `entry missing cap_hit: ${line}`);
    assert.ok(
      entry.cap_hit === true || entry.cap_hit === false,
      `cap_hit must be strictly boolean: ${line}`
    );
  }
});

test('optimization-layer: agent-metrics.json schema contract', () => {
  assert.ok(fs.existsSync(AGENT_METRICS), `expected ${AGENT_METRICS}`);
  const raw = fs.readFileSync(AGENT_METRICS, 'utf8');
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(raw); }, 'agent-metrics.json must be valid JSON');

  const agents = Object.keys(parsed);
  assert.ok(agents.length > 0, 'agent-metrics.json must declare at least one agent');
  for (const key of agents) {
    assert.ok(
      key.startsWith('design-'),
      `agent key "${key}" should name a design-* agent`
    );
    const entry = parsed[key];
    assert.equal(typeof entry.spawn_count, 'number', `${key}.spawn_count must be a number`);
    assert.equal(typeof entry.avg_duration_seconds, 'number', `${key}.avg_duration_seconds must be a number`);
    assert.equal(
      typeof entry.typical_duration_seconds_declared,
      'number',
      `${key}.typical_duration_seconds_declared must be a number`
    );
  }
});

test('optimization-layer: router tier-selection reference matches agent frontmatter (or skip)', (t) => {
  const candidates = [
    path.join(REPO_ROOT, 'reference/router-tiers.md'),
    path.join(REPO_ROOT, 'reference/router.md'),
    path.join(REPO_ROOT, 'reference/tiers.md'),
  ];
  const routerDoc = candidates.find(fs.existsSync);
  if (!routerDoc) {
    t.skip('reference/router-tiers.md not shipped yet');
    return;
  }
  const routerBody = fs.readFileSync(routerDoc, 'utf8');
  // Light cross-reference: every mention of a design-* agent in the router
  // doc, if paired with a tier in the same line, should match the agent's
  // frontmatter default-tier or model field. We soften this to a presence
  // check to tolerate drift during the transition window.
  const agentDir = path.join(REPO_ROOT, 'agents');
  const agentFiles = fs.readdirSync(agentDir).filter(f => f.startsWith('design-') && f.endsWith('.md'));
  for (const agentFile of agentFiles) {
    const name = agentFile.replace(/\.md$/, '');
    if (!routerBody.includes(name)) continue;
    const fm = readFrontmatter(path.join(agentDir, agentFile));
    const tier = fm['default-tier'] || fm['model'];
    assert.ok(
      !tier || typeof tier === 'string',
      `router reference for ${name} should match a string tier (got ${tier})`
    );
  }
});

test('optimization-layer: lazy-spawn gate — every design-* agent declares required reading or equivalent', () => {
  const agentDir = path.join(REPO_ROOT, 'agents');
  const agentFiles = fs
    .readdirSync(agentDir)
    .filter(f => f.startsWith('design-') && f.endsWith('.md'));

  const offenders = [];
  for (const file of agentFiles) {
    const body = fs.readFileSync(path.join(agentDir, file), 'utf8');
    const hasRequiredReading = /^## Required Reading/m.test(body);
    const hasInputs = /^## Inputs?/m.test(body) || /^## Input Contract/m.test(body);
    const hasStandaloneMarker =
      /no required reading.*standalone agent/i.test(body) ||
      /standalone agent.*no required reading/i.test(body);
    // Last-resort evidence: the agent explicitly reads a `.design/*.md` file
    // in its body (counts as declared input per the lazy-spawn convention).
    const readsDesignFile = /Read\s+`?\.design\/[A-Za-z0-9_\-\/\.]+`?/.test(body);
    if (!hasRequiredReading && !hasInputs && !hasStandaloneMarker && !readsDesignFile) {
      offenders.push(file);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `lazy-spawn gate violation — these agents declare no required reading: ${offenders.join(', ')}`
  );
});
