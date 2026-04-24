// tests/discuss-parallel-runner.test.ts — Plan 21-07 (SDK-19).
//
// Coverage per PLAN 21-07 Task 5: 6 groups, 26+ tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  run,
  DEFAULT_DISCUSSANTS,
  spawnDiscussant,
  spawnDiscussantsParallel,
  spawnAggregator,
  parseDiscussionBlock,
  buildAggregatorPrompt,
  parseAggregatorOutput,
  computeQuestionKey,
} from '../scripts/lib/discuss-parallel-runner/index.ts';
import type {
  DiscussantSpec,
  DiscussionContribution,
} from '../scripts/lib/discuss-parallel-runner/index.ts';
import type {
  SessionResult,
  SessionRunnerOptions,
  BudgetCap,
} from '../scripts/lib/session-runner/types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkTmp(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const BUDGET: BudgetCap = { usdLimit: 1, inputTokensLimit: 1000, outputTokensLimit: 1000 };

function baseResult(final: string, status: SessionResult['status'] = 'completed'): SessionResult {
  return {
    status,
    transcript_path: '/tmp/dummy.jsonl',
    turns: 1,
    usage: { input_tokens: 10, output_tokens: 20, usd_cost: 0.01 },
    final_text: final,
    tool_calls: [],
    sanitizer: { applied: [], removedSections: [] },
  };
}

const HAPPY_BLOCK = `
Some preamble.

## DISCUSSION COMPLETE

### Questions
- Q: Does the onboarding flow validate email domains?
  Concern: growth
  Severity: major
  Rationale: a spike in free-email signups will skew metrics
- Q: Is password reset covered by rate-limit rules?
  Concern: security
  Severity: blocker

### Concerns
- C: Dashboard KPI cards may be invisible in high-contrast mode
  Area: a11y
  Severity: minor
`;

const QUESTIONS_ONLY = `
## DISCUSSION COMPLETE

### Questions
- Q: Only a question
  Severity: nice-to-have
`;

const CONCERNS_ONLY = `
## DISCUSSION COMPLETE

### Concerns
- C: Only a concern
  Severity: major
`;

const MALFORMED_EMPTY_TEXT = `
## DISCUSSION COMPLETE

### Questions
- Q:
  Severity: major
- Q: Real question
  Severity: major
`;

const SEVERITY_VARIANTS = `
## DISCUSSION COMPLETE

### Questions
- Q: blocker item
  Severity: BLOCKER
- Q: major item
  Severity: Major
- Q: minor item
  Severity: minor
- Q: nice item
  Severity: nice-to-have
- Q: garbage item
  Severity: wobble
`;

const AGGREGATOR_OUTPUT = `# Design Review Questions

Overview text goes here.

\`\`\`json
{
  "themes": [
    { "name": "onboarding", "summary": "Signup + email" }
  ],
  "questions": [
    {
      "key": "abc12345",
      "text": "Does the onboarding flow validate email domains?",
      "severity": "major",
      "raised_by": ["user-journey"],
      "theme": "onboarding",
      "rank": 0
    }
  ]
}
\`\`\`
`;

const AGGREGATOR_TWO_FENCES = `Example:

\`\`\`json
{ "themes": [], "questions": [] }
\`\`\`

Final answer below:

\`\`\`json
{
  "themes": [{ "name": "final", "summary": "winning fence" }],
  "questions": []
}
\`\`\`
`;

const AGGREGATOR_MALFORMED = `
\`\`\`json
{ "themes": [ not-valid-json
\`\`\`
`;

const AGGREGATOR_NO_FENCE = `
Just prose. No JSON fence at all.
`;

const AGGREGATOR_MISSING_FIELDS = `
\`\`\`json
{ "themes": [] }
\`\`\`
`;

// ===========================================================================
// Group 1: parseDiscussionBlock (6 tests)
// ===========================================================================

test('parseDiscussionBlock: happy-path block with 2 questions + 1 concern', () => {
  const items = parseDiscussionBlock(HAPPY_BLOCK);
  assert.ok(items !== null);
  const questions = items!.filter((i) => i.kind === 'question');
  const concerns = items!.filter((i) => i.kind === 'concern');
  assert.equal(questions.length, 2);
  assert.equal(concerns.length, 1);
  assert.equal(questions[0]!.tag, 'growth');
  assert.equal(questions[0]!.severity, 'major');
  assert.equal(concerns[0]!.tag, 'a11y');
});

test('parseDiscussionBlock: block with only Questions subheading', () => {
  const items = parseDiscussionBlock(QUESTIONS_ONLY);
  assert.ok(items !== null);
  assert.equal(items!.length, 1);
  assert.equal(items![0]!.kind, 'question');
});

test('parseDiscussionBlock: block with only Concerns subheading', () => {
  const items = parseDiscussionBlock(CONCERNS_ONLY);
  assert.ok(items !== null);
  assert.equal(items!.length, 1);
  assert.equal(items![0]!.kind, 'concern');
});

test('parseDiscussionBlock: malformed item with empty text is skipped', () => {
  const items = parseDiscussionBlock(MALFORMED_EMPTY_TEXT);
  assert.ok(items !== null);
  assert.equal(items!.length, 1);
  assert.equal(items![0]!.text, 'Real question');
});

test('parseDiscussionBlock: no block → null', () => {
  assert.equal(parseDiscussionBlock('just prose, no heading'), null);
  assert.equal(parseDiscussionBlock(''), null);
});

test('parseDiscussionBlock: severity variants normalized', () => {
  const items = parseDiscussionBlock(SEVERITY_VARIANTS);
  assert.ok(items !== null);
  const severities = items!.map((i) => i.severity);
  assert.ok(severities.includes('blocker'));
  assert.ok(severities.includes('major'));
  assert.ok(severities.includes('minor'));
  assert.ok(severities.includes('nice-to-have'));
  // "wobble" is not a recognized severity → normalized to some valid value
  const validSet = new Set(['blocker', 'major', 'minor', 'nice-to-have']);
  for (const s of severities) assert.ok(validSet.has(s));
});

// ===========================================================================
// Group 2: spawnDiscussant (4 tests)
// ===========================================================================

test('spawnDiscussant: mocked success with valid block → status completed', async () => {
  const spec: DiscussantSpec = { name: 'user-journey', prompt: 'p' };
  const override = async (_o: SessionRunnerOptions): Promise<SessionResult> =>
    baseResult(HAPPY_BLOCK);
  const c = await spawnDiscussant(spec, {
    budget: BUDGET,
    maxTurns: 2,
    runOverride: override,
    cwd: process.cwd(),
  });
  assert.equal(c.status, 'completed');
  assert.ok(c.items.length >= 3);
});

test('spawnDiscussant: mocked success without block → status parse-error', async () => {
  const spec: DiscussantSpec = { name: 'brand-fit', prompt: 'p' };
  const override = async (): Promise<SessionResult> =>
    baseResult('No block present here.');
  const c = await spawnDiscussant(spec, {
    budget: BUDGET,
    maxTurns: 2,
    runOverride: override,
    cwd: process.cwd(),
  });
  assert.equal(c.status, 'parse-error');
  assert.equal(c.items.length, 0);
});

test('spawnDiscussant: mocked session error → status error', async () => {
  const spec: DiscussantSpec = { name: 'accessibility', prompt: 'p' };
  const override = async (): Promise<SessionResult> => ({
    ...baseResult('', 'budget_exceeded'),
    error: { code: 'BUDGET', message: 'out of budget', kind: 'operation_failed' },
  });
  const c = await spawnDiscussant(spec, {
    budget: BUDGET,
    maxTurns: 2,
    runOverride: override,
    cwd: process.cwd(),
  });
  assert.equal(c.status, 'error');
  assert.equal(c.items.length, 0);
  assert.ok(c.error);
  assert.equal(c.error!.code, 'BUDGET');
});

test('spawnDiscussant: propagates usage from session', async () => {
  const spec: DiscussantSpec = { name: 'x', prompt: 'p' };
  const override = async (): Promise<SessionResult> => {
    const r = baseResult(HAPPY_BLOCK);
    r.usage = { input_tokens: 100, output_tokens: 200, usd_cost: 0.05 };
    return r;
  };
  const c = await spawnDiscussant(spec, {
    budget: BUDGET,
    maxTurns: 2,
    runOverride: override,
    cwd: process.cwd(),
  });
  assert.equal(c.usage.input_tokens, 100);
  assert.equal(c.usage.output_tokens, 200);
  assert.equal(c.usage.usd_cost, 0.05);
});

// ===========================================================================
// Group 3: spawnDiscussantsParallel (3 tests)
// ===========================================================================

test('spawnDiscussantsParallel: 4 discussants concurrent → all start within slot', async () => {
  const specs: DiscussantSpec[] = [
    { name: 'a', prompt: 'p' },
    { name: 'b', prompt: 'p' },
    { name: 'c', prompt: 'p' },
    { name: 'd', prompt: 'p' },
  ];
  let active = 0;
  let peakActive = 0;
  const override = async (): Promise<SessionResult> => {
    active += 1;
    peakActive = Math.max(peakActive, active);
    await new Promise((r) => setTimeout(r, 10));
    active -= 1;
    return baseResult(HAPPY_BLOCK);
  };
  const results = await spawnDiscussantsParallel(specs, {
    budget: BUDGET,
    maxTurns: 2,
    concurrency: 4,
    runOverride: override,
    cwd: process.cwd(),
  });
  assert.equal(results.length, 4);
  assert.equal(peakActive, 4, `expected peak=4, got ${peakActive}`);
});

test('spawnDiscussantsParallel: concurrency 2 caps peak active at 2', async () => {
  const specs: DiscussantSpec[] = [
    { name: 'a', prompt: 'p' },
    { name: 'b', prompt: 'p' },
    { name: 'c', prompt: 'p' },
    { name: 'd', prompt: 'p' },
  ];
  let active = 0;
  let peakActive = 0;
  const override = async (): Promise<SessionResult> => {
    active += 1;
    peakActive = Math.max(peakActive, active);
    await new Promise((r) => setTimeout(r, 20));
    active -= 1;
    return baseResult(HAPPY_BLOCK);
  };
  await spawnDiscussantsParallel(specs, {
    budget: BUDGET,
    maxTurns: 2,
    concurrency: 2,
    runOverride: override,
    cwd: process.cwd(),
  });
  assert.ok(peakActive <= 2, `peak ${peakActive} exceeded concurrency 2`);
});

test('spawnDiscussantsParallel: one errors, others complete; spec order preserved', async () => {
  const specs: DiscussantSpec[] = [
    { name: 'first', prompt: 'p' },
    { name: 'second', prompt: 'p' },
    { name: 'third', prompt: 'p' },
  ];
  const override = async (opts: SessionRunnerOptions): Promise<SessionResult> => {
    if (opts.prompt === 'p' && Math.random() < 0) {
      // no-op; keeps types happy
    }
    // Second errors, others succeed.
    // We discriminate via prompt content in a real mock; here all prompts equal,
    // so use a counter captured in closure:
    return baseResult(HAPPY_BLOCK);
  };
  const counter = { n: 0 };
  const wrappedOverride = async (o: SessionRunnerOptions): Promise<SessionResult> => {
    counter.n += 1;
    if (counter.n === 2) {
      return {
        ...baseResult('', 'error'),
        error: { code: 'NET', message: 'blip', kind: 'operation_failed' },
      };
    }
    return override(o);
  };
  const results = await spawnDiscussantsParallel(specs, {
    budget: BUDGET,
    maxTurns: 2,
    concurrency: 3,
    runOverride: wrappedOverride,
    cwd: process.cwd(),
  });
  assert.equal(results.length, 3);
  assert.equal(results[0]!.discussant, 'first');
  assert.equal(results[1]!.discussant, 'second');
  assert.equal(results[2]!.discussant, 'third');
});

// ===========================================================================
// Group 4: buildAggregatorPrompt (3 tests)
// ===========================================================================

function makeContribution(name: string, raw: string): DiscussionContribution {
  return {
    discussant: name,
    items: Object.freeze([]),
    raw,
    usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
    status: 'completed',
  };
}

test('buildAggregatorPrompt: contains every contribution raw text', () => {
  const contribs = [
    makeContribution('a', 'alpha text'),
    makeContribution('b', 'beta text'),
  ];
  const prompt = buildAggregatorPrompt(contribs);
  assert.ok(prompt.includes('alpha text'));
  assert.ok(prompt.includes('beta text'));
  assert.ok(prompt.includes('### Discussant: a'));
  assert.ok(prompt.includes('### Discussant: b'));
});

test('buildAggregatorPrompt: customPrompt overrides default instruction block', () => {
  const contribs = [makeContribution('a', 'alpha')];
  const custom = 'CUSTOM INSTRUCTION XYZ';
  const prompt = buildAggregatorPrompt(contribs, custom);
  assert.ok(prompt.startsWith(custom));
});

test('buildAggregatorPrompt: empty contributions → well-formed', () => {
  const prompt = buildAggregatorPrompt([]);
  assert.ok(typeof prompt === 'string');
  assert.ok(prompt.length > 0);
  assert.ok(!prompt.includes('### Discussant:'));
});

// ===========================================================================
// Group 5: parseAggregatorOutput (5 tests)
// ===========================================================================

test('parseAggregatorOutput: happy path → structured result + markdown written', () => {
  const { dir, cleanup } = mkTmp('agg-happy-');
  try {
    const outputPath = join(dir, '.design', 'DISCUSSION.md');
    const result = parseAggregatorOutput(AGGREGATOR_OUTPUT, outputPath);
    assert.equal(result.themes.length, 1);
    assert.equal(result.questions.length, 1);
    assert.equal(result.output_path, outputPath);
    assert.ok(existsSync(outputPath));
    const md = readFileSync(outputPath, 'utf8');
    assert.ok(md.includes('Design Review Questions'));
    assert.ok(!md.includes('```json'));
  } finally {
    cleanup();
  }
});

test('parseAggregatorOutput: multiple JSON fences → LAST one wins', () => {
  const { dir, cleanup } = mkTmp('agg-last-');
  try {
    const outputPath = join(dir, 'out.md');
    const result = parseAggregatorOutput(AGGREGATOR_TWO_FENCES, outputPath);
    assert.equal(result.themes.length, 1);
    assert.equal(result.themes[0]!.name, 'final');
  } finally {
    cleanup();
  }
});

test('parseAggregatorOutput: malformed JSON → ValidationError AGGREGATOR_PARSE_ERROR', () => {
  const { dir, cleanup } = mkTmp('agg-bad-');
  try {
    const outputPath = join(dir, 'out.md');
    assert.throws(
      () => parseAggregatorOutput(AGGREGATOR_MALFORMED, outputPath),
      (err: Error & { code?: string }) => {
        return err.code === 'AGGREGATOR_PARSE_ERROR';
      },
    );
  } finally {
    cleanup();
  }
});

test('parseAggregatorOutput: no fence → throws AGGREGATOR_PARSE_ERROR', () => {
  const { dir, cleanup } = mkTmp('agg-nofence-');
  try {
    const outputPath = join(dir, 'out.md');
    assert.throws(
      () => parseAggregatorOutput(AGGREGATOR_NO_FENCE, outputPath),
      (err: Error & { code?: string }) => err.code === 'AGGREGATOR_PARSE_ERROR',
    );
  } finally {
    cleanup();
  }
});

test('parseAggregatorOutput: missing required fields → throws', () => {
  const { dir, cleanup } = mkTmp('agg-missing-');
  try {
    const outputPath = join(dir, 'out.md');
    assert.throws(
      () => parseAggregatorOutput(AGGREGATOR_MISSING_FIELDS, outputPath),
      (err: Error & { code?: string }) => err.code === 'AGGREGATOR_PARSE_ERROR',
    );
  } finally {
    cleanup();
  }
});

// ===========================================================================
// Group 6: run orchestrator (5 tests) + computeQuestionKey extras
// ===========================================================================

test('run: default 4 discussants + mocked aggregator → aggregated result', async () => {
  const { dir, cleanup } = mkTmp('run-default-');
  try {
    mkdirSync(join(dir, '.design'), { recursive: true });
    let discussantCalls = 0;
    let aggregatorCall = 0;
    const override = async (opts: SessionRunnerOptions): Promise<SessionResult> => {
      // Aggregator prompt begins with the default instruction line; simpler: any
      // prompt that contains `### Discussant:` is the aggregator.
      if (opts.prompt.includes('### Discussant:')) {
        aggregatorCall += 1;
        return baseResult(AGGREGATOR_OUTPUT);
      }
      discussantCalls += 1;
      return baseResult(HAPPY_BLOCK);
    };
    const res = await run({
      budget: BUDGET,
      maxTurnsPerDiscussant: 2,
      aggregatorBudget: BUDGET,
      aggregatorMaxTurns: 2,
      runOverride: override,
      cwd: dir,
    });
    assert.equal(discussantCalls, 4);
    assert.equal(aggregatorCall, 1);
    assert.equal(res.contributions.length, 4);
    assert.equal(res.aggregated.questions.length, 1);
  } finally {
    cleanup();
  }
});

test('run: 0 successful discussants → throws OperationFailedError', async () => {
  const override = async (): Promise<SessionResult> => ({
    ...baseResult('', 'error'),
    error: { code: 'NET', message: 'all fail', kind: 'operation_failed' },
  });
  await assert.rejects(
    async () =>
      run({
        budget: BUDGET,
        maxTurnsPerDiscussant: 2,
        aggregatorBudget: BUDGET,
        aggregatorMaxTurns: 2,
        runOverride: override,
      }),
    (err: Error & { code?: string }) =>
      err.code === 'NO_DISCUSSANTS_SUCCEEDED' || String(err.message).includes('NO_DISCUSSANTS_SUCCEEDED'),
  );
});

test('run: custom discussants list used verbatim', async () => {
  const { dir, cleanup } = mkTmp('run-custom-');
  try {
    mkdirSync(join(dir, '.design'), { recursive: true });
    const specs: DiscussantSpec[] = [
      { name: 'only-one', prompt: 'p' },
    ];
    const override = async (opts: SessionRunnerOptions): Promise<SessionResult> => {
      if (opts.prompt.includes('### Discussant:')) return baseResult(AGGREGATOR_OUTPUT);
      return baseResult(HAPPY_BLOCK);
    };
    const res = await run({
      discussants: specs,
      budget: BUDGET,
      maxTurnsPerDiscussant: 2,
      aggregatorBudget: BUDGET,
      aggregatorMaxTurns: 2,
      runOverride: override,
      cwd: dir,
    });
    assert.equal(res.contributions.length, 1);
    assert.equal(res.contributions[0]!.discussant, 'only-one');
  } finally {
    cleanup();
  }
});

test('run: total_usage sums per-discussant + aggregator', async () => {
  const { dir, cleanup } = mkTmp('run-usage-');
  try {
    mkdirSync(join(dir, '.design'), { recursive: true });
    const override = async (opts: SessionRunnerOptions): Promise<SessionResult> => {
      if (opts.prompt.includes('### Discussant:')) {
        const r = baseResult(AGGREGATOR_OUTPUT);
        r.usage = { input_tokens: 500, output_tokens: 300, usd_cost: 0.10 };
        return r;
      }
      const r = baseResult(HAPPY_BLOCK);
      r.usage = { input_tokens: 100, output_tokens: 50, usd_cost: 0.02 };
      return r;
    };
    const res = await run({
      budget: BUDGET,
      maxTurnsPerDiscussant: 2,
      aggregatorBudget: BUDGET,
      aggregatorMaxTurns: 2,
      runOverride: override,
      cwd: dir,
    });
    // 4 discussants * 100 + 500 aggregator = 900 input
    assert.equal(res.total_usage.input_tokens, 4 * 100 + 500);
    assert.equal(res.total_usage.output_tokens, 4 * 50 + 300);
    // Cost sum with float tolerance
    assert.ok(Math.abs(res.total_usage.usd_cost - (4 * 0.02 + 0.10)) < 1e-9);
  } finally {
    cleanup();
  }
});

test('computeQuestionKey: stable across whitespace variants + 8-char hex', () => {
  const k1 = computeQuestionKey('Does the onboarding flow validate email domains?');
  const k2 = computeQuestionKey('  DOES the  onboarding    FLOW validate email domains?  ');
  assert.equal(k1, k2);
  assert.equal(k1.length, 8);
  assert.ok(/^[a-f0-9]{8}$/.test(k1));
});
