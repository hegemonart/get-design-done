'use strict';
// Phase 39.2 — cost-governance static contract. Verifies the contract doc (sections + registered),
// the cost-forecaster agent, both skills, the budget.schema project_cap keys, the events seed, and
// the hook's project_cap wiring. Hermetic: file reads only. Every test tagged `39.2-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('39.2-03: cost-governance.md contract has the required sections + is registered', () => {
  const body = read('reference/cost-governance.md');
  assert.ok(body.length > 1500, 'substantive contract');
  assert.match(body, /## Forecast model/m, 'forecast model section');
  assert.match(body, /## Project cap/m, 'project cap section');
  assert.match(body, /## ROI dashboard/m, 'ROI section');
  assert.match(body, /## Events/m, 'events section');
  assert.match(body, /surviv\w+ .{0,8}14/i, 'documents the 14-day shipped window');
  const reg = JSON.parse(read('reference/registry.json'));
  const e = reg.entries.find((x) => x.name === 'cost-governance');
  assert.ok(e, 'cost-governance registered');
  assert.equal(e.path, 'reference/cost-governance.md');
  assert.equal(e.phase, 39.2);
});

test('39.2-03: cost-forecaster agent — reads costs.jsonl, --scenario, report-only, uses the pure lib', () => {
  const a = read('agents/cost-forecaster.md');
  assert.match(a, /costs\.jsonl/, 'reads cost telemetry');
  assert.match(a, /--scenario/, 'supports --scenario');
  assert.match(a, /best.*typical.*worst/i, 'the three scenarios');
  assert.match(a, /scripts\/lib\/budget\/cost-forecast\.cjs/, 'delegates to the pure model');
  assert.match(a, /report-only|never (writes|spend|halt)/i, 'report-only (D-07)');
  assert.match(a, /^default-tier:\s*sonnet/m, 'sonnet tier');
});

test('39.2-03: /gdd:budget + /gdd:roi skills exist with correct frontmatter', () => {
  const budget = read('skills/budget/SKILL.md');
  assert.match(budget, /^name:\s*gdd-budget/m, 'gdd-budget name');
  assert.match(budget, /^user-invocable:\s*true/m, 'user-invocable');
  assert.match(budget, /cost-forecaster|cost-forecast/i, 'wires the forecaster');
  const roi = read('skills/roi/SKILL.md');
  assert.match(roi, /^name:\s*gdd-roi/m, 'gdd-roi name');
  assert.match(roi, /^user-invocable:\s*true/m, 'user-invocable');
  assert.match(roi, /scripts\/lib\/budget\/roi\.cjs/, 'uses the pure roi lib');
  assert.match(roi, /14|window/i, 'documents the stick window');
});

test('39.2-03: budget.schema.json gains project_cap_usd + project_cap_enforcement_mode', () => {
  const schema = JSON.parse(read('reference/schemas/budget.schema.json'));
  assert.ok(schema.properties.project_cap_usd, 'project_cap_usd defined');
  assert.equal(schema.properties.project_cap_usd.type, 'number');
  assert.equal(schema.properties.project_cap_usd.minimum, 0);
  assert.ok(schema.properties.project_cap_enforcement_mode, 'project_cap_enforcement_mode defined');
  assert.deepEqual(schema.properties.project_cap_enforcement_mode.enum, ['enforce', 'warn', 'log']);
});

test('39.2-03: events seed lists the 3 new types', () => {
  const seed = JSON.parse(read('reference/schemas/events.schema.json')).properties.type.description;
  for (const t of ['budget_forecast', 'project_cap_warning', 'project_cap_halt']) {
    assert.ok(seed.includes(t), `events seed mentions ${t}`);
  }
});

test('39.2-03: budget-enforcer hook wires the project_cap branch (additive, disabled by default)', () => {
  const hook = read('hooks/budget-enforcer.ts');
  assert.match(hook, /project-cap\.cjs/, 'imports the pure classifier');
  assert.match(hook, /currentProjectSpend/, 'reads project spend');
  assert.match(hook, /project_cap_usd > 0/, 'guarded — no-op when disabled');
  assert.match(hook, /project_cap_halt/, 'emits the halt event');
  assert.match(hook, /project_cap_usd:\s*0/, 'default disabled (BUDGET_DEFAULTS)');
});
