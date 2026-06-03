'use strict';

// Phase 53 (Semantic Mapper Engine) — graph-reviewer agent (REV-01).
// STATIC / prose assertions only (no agent execution, no LLM call): the two new agents
// (design-context-reviewer + design-context-reviewer-gate) must exist, parse a delimited
// frontmatter block, carry the required frontmatter keys with em-dash-free descriptions,
// and stay within their size_budget tier. The reviewer must document all 9 checks and cite
// the deterministic validator (validate-design-context.cjs) that backs checks 1/2/3/5. The
// gate must document the {spawn, rationale} contract and the <5% change suppression.
//
// Soft-warns surface via scripts/lib/health-mirror#getHealthChecks (status:'warn'); the
// reviewer references that contract (the wiring itself is read-only/advisory, out of scope here).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { readFrontmatter, countLines } = require('./helpers.ts');

const REPO_ROOT = path.resolve(__dirname, '../..');
const AGENTS_DIR = path.join(REPO_ROOT, 'agents');

const REVIEWER = 'design-context-reviewer';
const GATE = 'design-context-reviewer-gate';

// Mirror of TIER_LIMITS in agent-size-budget.test.cjs (kept in sync deliberately so a budget
// regression on a "design-"-prefixed agent is caught here too).
const TIER_LIMITS = {
  XXL: 700,
  XL: 500,
  LARGE: 350,
  M: 300,
  DEFAULT: 250,
  S: 150,
};

// Em-dash (U+2014), em-dash surrogate (double hyphen), and en-dash (U+2013): all banned in
// the project's own user-facing prose (lint-prose.cjs / prose-denylist.json).
const EM_DASH = '—';
const EN_DASH = '–';

function agentPath(name) {
  return path.join(AGENTS_DIR, `${name}.md`);
}

function readAgent(name) {
  return fs.readFileSync(agentPath(name), 'utf8');
}

// --- Existence + parse -------------------------------------------------------

for (const name of [REVIEWER, GATE]) {
  test(`53-06: ${name}.md exists`, () => {
    assert.ok(
      fs.existsSync(agentPath(name)),
      `agents/${name}.md must exist`
    );
  });

  test(`53-06: ${name}.md has a delimited frontmatter block`, () => {
    const body = readAgent(name);
    assert.match(
      body,
      /^---\n[\s\S]*?\n---/,
      `agents/${name}.md: frontmatter must be delimited by --- ... ---`
    );
  });

  test(`53-06: ${name}.md frontmatter parses with required keys`, () => {
    const fm = readFrontmatter(agentPath(name));
    // The repo's frontmatter contract (validate-frontmatter.ts REQUIRED_FIELDS) plus the
    // name/description the prompt calls out explicitly.
    for (const key of [
      'name',
      'description',
      'tools',
      'color',
      'parallel-safe',
      'typical-duration-seconds',
      'reads-only',
      'writes',
    ]) {
      assert.ok(
        key in fm && fm[key] !== '' && fm[key] !== undefined,
        `agents/${name}.md: frontmatter missing required key "${key}"`
      );
    }
  });

  test(`53-06: ${name}.md name field matches the file`, () => {
    const fm = readFrontmatter(agentPath(name));
    assert.equal(
      fm.name,
      name,
      `agents/${name}.md: frontmatter name must equal "${name}" (got "${fm.name}")`
    );
  });

  test(`53-06: ${name}.md description is em-dash-free`, () => {
    const fm = readFrontmatter(agentPath(name));
    const desc = String(fm.description || '');
    assert.ok(desc.length > 0, `agents/${name}.md: description must be non-empty`);
    assert.ok(
      !desc.includes(EM_DASH),
      `agents/${name}.md: description contains an em-dash (banned by lint:prose)`
    );
    assert.ok(
      !desc.includes(EN_DASH),
      `agents/${name}.md: description contains an en-dash (banned by lint:prose)`
    );
    assert.ok(
      !/(?<!-)--(?!-)/.test(desc),
      `agents/${name}.md: description contains a double-hyphen (banned by lint:prose)`
    );
  });

  test(`53-06: ${name}.md whole-file prose is em-dash-free`, () => {
    const body = readAgent(name);
    assert.ok(
      !body.includes(EM_DASH),
      `agents/${name}.md: file contains an em-dash (banned by lint:prose)`
    );
    assert.ok(
      !body.includes(EN_DASH),
      `agents/${name}.md: file contains an en-dash (banned by lint:prose)`
    );
  });

  test(`53-06: ${name}.md is a Haiku-tier agent`, () => {
    const fm = readFrontmatter(agentPath(name));
    // The mapper/checker model-profile convention: model: inherit + default-tier names the tier.
    assert.equal(
      fm['default-tier'],
      'haiku',
      `agents/${name}.md: default-tier must be "haiku" (got "${fm['default-tier']}")`
    );
  });

  test(`53-06: ${name}.md stays within its size_budget tier`, () => {
    const fm = readFrontmatter(agentPath(name));
    const tier = String(fm.size_budget || 'DEFAULT').toUpperCase();
    const limit = TIER_LIMITS[tier];
    assert.ok(
      limit !== undefined,
      `agents/${name}.md: unknown size_budget tier "${tier}"`
    );
    const lineCount = countLines(agentPath(name));
    assert.ok(
      lineCount <= limit,
      `agents/${name}.md: ${lineCount} lines exceeds ${tier} budget of ${limit}`
    );
  });

  test(`53-06: ${name}.md is declared read-only (writes: [])`, () => {
    const fm = readFrontmatter(agentPath(name));
    const writes = fm.writes;
    const isEmptyArray = Array.isArray(writes) && writes.length === 0;
    assert.ok(
      isEmptyArray,
      `agents/${name}.md: a review/gate agent must declare writes: [] (got ${JSON.stringify(writes)})`
    );
  });
}

// --- Reviewer: the 9 checks --------------------------------------------------

// Each entry is a keyword that MUST appear in the reviewer body so all 9 checks are documented.
// Keyed by the check number for clear failure messages.
const NINE_CHECKS = {
  1: 'schema validity',
  2: 'referential integrity',
  3: 'completeness',
  4: 'layer coverage',
  5: 'id uniqueness',
  6: 'summary quality',
  7: 'edge-expectation',
  8: 'type-prefix',
  9: 'coverage-vs',
};

test('53-06: reviewer documents all 9 checks', () => {
  const body = readAgent(REVIEWER).toLowerCase();
  for (const [num, keyword] of Object.entries(NINE_CHECKS)) {
    assert.ok(
      body.includes(keyword),
      `agents/${REVIEWER}.md: missing documentation for check ${num} (keyword "${keyword}")`
    );
  }
});

test('53-06: reviewer numbers checks 1 through 9', () => {
  const body = readAgent(REVIEWER);
  for (let n = 1; n <= 9; n++) {
    assert.match(
      body,
      new RegExp(`Check\\s+${n}\\b`),
      `agents/${REVIEWER}.md: must label "Check ${n}" explicitly`
    );
  }
});

test('53-06: reviewer covers the four taxonomy layers (check 4)', () => {
  const body = readAgent(REVIEWER).toLowerCase();
  for (const layer of ['atomic', 'molecular', 'organism', 'template']) {
    assert.ok(
      body.includes(layer),
      `agents/${REVIEWER}.md: layer-coverage check must name the ${layer} layer`
    );
  }
});

test('53-06: reviewer cites the deterministic validator (validate-design-context.cjs)', () => {
  const body = readAgent(REVIEWER);
  assert.ok(
    body.includes('scripts/validate-design-context.cjs'),
    `agents/${REVIEWER}.md: must cite scripts/validate-design-context.cjs as the deterministic backing for checks 1/2/3/5`
  );
});

test('53-06: reviewer distinguishes hard-reject from soft-warn', () => {
  const body = readAgent(REVIEWER).toLowerCase();
  assert.ok(
    body.includes('hard-reject') || body.includes('hard reject'),
    `agents/${REVIEWER}.md: must document a hard-reject path for critical breakage`
  );
  assert.ok(
    body.includes('soft-warn') || body.includes('soft warn'),
    `agents/${REVIEWER}.md: must document a soft-warn (advisory) path`
  );
});

test('53-06: reviewer states soft-warns surface via health-mirror getHealthChecks', () => {
  const body = readAgent(REVIEWER);
  assert.ok(
    body.includes('health-mirror'),
    `agents/${REVIEWER}.md: must reference the health-mirror surface`
  );
  assert.ok(
    body.includes('getHealthChecks'),
    `agents/${REVIEWER}.md: must cite the getHealthChecks contract`
  );
  assert.ok(
    /status:\s*'?warn'?/i.test(body) || body.includes("status: 'warn'"),
    `agents/${REVIEWER}.md: must state soft-warns map to status:'warn'`
  );
});

test('53-06: reviewer reviews the assembled/post-merge graph', () => {
  const body = readAgent(REVIEWER);
  assert.ok(
    body.includes('.design/context-graph.json'),
    `agents/${REVIEWER}.md: must name the assembled graph .design/context-graph.json`
  );
});

// --- Gate: the {spawn, rationale} contract + <5% suppression -----------------

test('53-06: gate documents the {spawn, rationale} contract', () => {
  const body = readAgent(GATE);
  assert.ok(
    body.includes('spawn') && body.includes('rationale'),
    `agents/${GATE}.md: must document the {spawn, rationale} output contract`
  );
  // The contract is documented as a JSON object literal with both keys.
  assert.match(
    body,
    /"spawn"\s*:\s*(true|false)/,
    `agents/${GATE}.md: must show a "spawn": <boolean> JSON shape`
  );
  assert.match(
    body,
    /"rationale"\s*:/,
    `agents/${GATE}.md: must show a "rationale": <string> field in the JSON shape`
  );
});

test('53-06: gate suppresses on <5% change (fingerprint classifier change %)', () => {
  const body = readAgent(GATE);
  assert.match(
    body,
    /5\s*(%|percent)/i,
    `agents/${GATE}.md: must name the 5 percent change threshold`
  );
  const lower = body.toLowerCase();
  assert.ok(
    lower.includes('change_pct') || lower.includes('change %') || lower.includes('change percent'),
    `agents/${GATE}.md: must cite the classifier change percentage signal`
  );
  assert.ok(
    lower.includes('classif'),
    `agents/${GATE}.md: must cite the fingerprint change classifier`
  );
});

test('53-06: gate emits a single-line JSON decision and a completion marker', () => {
  const body = readAgent(GATE);
  assert.match(
    body,
    /##\s+GATE COMPLETE/,
    `agents/${GATE}.md: must define the "## GATE COMPLETE" completion marker`
  );
});
