// tests/pipeline-runner.test.ts — Plan 21-05 (SDK-17) coverage.
//
// Exercises the pipeline-runner's state machine + driver loop with a
// MOCKED session-runner (no real Agent SDK invocation). Structure matches
// the Task 6 test groups enumerated in the plan:
//
//   1. State machine              (6 tests)
//   2. invokeStage happy path     (3 tests)
//   3. Retry-once at stage level  (3 tests)
//   4. Human-gate                 (4 tests)
//   5. Transition gates           (3 tests)
//   6. Full pipeline              (5 tests)
//   7. Usage aggregation          (2 tests)
//   8. Logger integration         (2 tests)
//   9. Extras (marker extraction / validator edges)  (6 tests)
//
// Total: 34 tests.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve as _resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  run,
  STAGE_ORDER,
  nextStage,
  stageIndex,
  resolveStageOrder,
  invokeStage,
  extractGateMarker,
  dispatchHumanGate,
  type PipelineConfig,
  type Stage,
  type StageOutcome,
  type HumanGateInfo,
  type HumanGateDecision,
  type PipelineResult,
  type TransitionResult,
} from '../scripts/lib/pipeline-runner/index.ts';
import type { SessionResult, SessionRunnerOptions } from '../scripts/lib/session-runner/types.ts';
import type { ContextBundle } from '../scripts/lib/context-engine/types.ts';
import { ValidationError } from '../scripts/lib/gdd-errors/index.ts';
import {
  reset as resetEventStream,
  subscribeAll,
} from '../scripts/lib/event-stream/index.ts';
import type { BaseEvent } from '../scripts/lib/event-stream/index.ts';
import {
  createLogger,
  setLogger,
  resetLogger,
  type LogEntry,
  type Sink,
} from '../scripts/lib/logger/index.ts';

// ==========================================================================
// Test helpers
// ==========================================================================

let sandbox: string = '';

/** Capture-all sink for logger assertions. */
class CaptureSink implements Sink {
  public entries: LogEntry[] = [];
  write(entry: LogEntry): void {
    this.entries.push(entry);
  }
  close(): void {
    // no-op — entries stay in memory for test assertions
  }
}

function buildConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  const prompts: Record<Stage, string> = {
    brief: 'brief prompt',
    explore: 'explore prompt',
    plan: 'plan prompt',
    design: 'design prompt',
    verify: 'verify prompt',
  };
  return {
    prompts,
    budget: {
      usdLimit: 1.0,
      inputTokensLimit: 100_000,
      outputTokensLimit: 50_000,
      perStage: true,
    },
    maxTurnsPerStage: 5,
    stageRetries: 1,
    ...overrides,
  };
}

function mockBundle(stage: Stage): ContextBundle {
  return {
    stage,
    files: [],
    total_bytes: 0,
    built_at: new Date().toISOString(),
  };
}

function makeCompletedSession(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    status: 'completed',
    transcript_path: '',
    turns: 1,
    usage: { input_tokens: 100, output_tokens: 200, usd_cost: 0.003 },
    final_text: 'done',
    tool_calls: [],
    sanitizer: { applied: [], removedSections: [] },
    ...overrides,
  };
}

function makeErrorSession(
  code: string,
  kind: 'state_conflict' | 'validation' | 'operation_failed' = 'state_conflict',
  message: string = 'mock error',
): SessionResult {
  return {
    status: 'error',
    transcript_path: '',
    turns: 0,
    usage: { input_tokens: 0, output_tokens: 0, usd_cost: 0 },
    tool_calls: [],
    sanitizer: { applied: [], removedSections: [] },
    error: { code, message, kind, context: {} },
  };
}

function makeGatedSession(gateName: string = 'approve-plan'): SessionResult {
  return makeCompletedSession({
    final_text: `Results so far:\n\n<!-- AWAIT_USER_GATE: name="${gateName}" -->\n\nPlease approve.`,
  });
}

/**
 * Build a run override whose responses are keyed by stage. Each
 * stage's entry is a list of SessionResults consumed in order —
 * supports retry scenarios.
 */
function makeRunOverride(
  responses: Partial<Record<Stage, readonly SessionResult[]>>,
): {
  run: (opts: SessionRunnerOptions) => Promise<SessionResult>;
  calls: Array<{ stage: string; prompt: string; allowedTools: readonly string[] }>;
} {
  const calls: Array<{ stage: string; prompt: string; allowedTools: readonly string[] }> = [];
  const cursors: Partial<Record<Stage, number>> = {};
  const runImpl = async (opts: SessionRunnerOptions): Promise<SessionResult> => {
    calls.push({
      stage: opts.stage,
      prompt: opts.prompt,
      allowedTools: opts.allowedTools ?? [],
    });
    const stage = opts.stage as Stage;
    const queue = responses[stage];
    if (queue === undefined || queue.length === 0) {
      return makeCompletedSession();
    }
    const idx = cursors[stage] ?? 0;
    cursors[stage] = idx + 1;
    const r = queue[idx] ?? queue[queue.length - 1];
    if (r === undefined) return makeCompletedSession();
    return r;
  };
  return { run: runImpl, calls };
}

const allowOnly: (stage: Stage, _agent?: string) => readonly string[] = () =>
  Object.freeze(['Read', 'Grep']);

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'gdd-pipeline-runner-'));
  mkdirSync(join(sandbox, '.design'), { recursive: true });
  writeFileSync(
    join(sandbox, '.design/telemetry.jsonl'),
    '',
    'utf8',
  );
  process.env['GDD_SESSION_DIR'] = join(sandbox, '.design/sessions');
  process.env['GDD_EVENTS_PATH'] = join(sandbox, '.design/telemetry/events.jsonl');
  process.env['GDD_HEADLESS'] = '1';
  mkdirSync(join(sandbox, '.design/telemetry'), { recursive: true });
  mkdirSync(join(sandbox, '.design/sessions'), { recursive: true });
  resetEventStream();
  resetLogger();
});

afterEach(() => {
  if (sandbox !== '') {
    try {
      rmSync(sandbox, { recursive: true, force: true });
    } catch {
      // best-effort cleanup.
    }
    sandbox = '';
  }
  delete process.env['GDD_SESSION_DIR'];
  delete process.env['GDD_EVENTS_PATH'];
  delete process.env['GDD_HEADLESS'];
  resetEventStream();
  resetLogger();
});

// ==========================================================================
// 1. State machine (6 tests)
// ==========================================================================

test('state machine: STAGE_ORDER frozen + length 5', () => {
  assert.strictEqual(STAGE_ORDER.length, 5);
  assert.ok(Object.isFrozen(STAGE_ORDER));
  assert.deepStrictEqual(
    [...STAGE_ORDER],
    ['brief', 'explore', 'plan', 'design', 'verify'],
  );
});

test('state machine: nextStage advances + returns null at verify', () => {
  assert.strictEqual(nextStage('brief'), 'explore');
  assert.strictEqual(nextStage('explore'), 'plan');
  assert.strictEqual(nextStage('plan'), 'design');
  assert.strictEqual(nextStage('design'), 'verify');
  assert.strictEqual(nextStage('verify'), null);
});

test('state machine: resolveStageOrder() default returns full order', () => {
  const order = resolveStageOrder();
  assert.deepStrictEqual([...order], [...STAGE_ORDER]);
  assert.ok(Object.isFrozen(order));
});

test('state machine: resolveStageOrder({skipStages: ["explore"]}) yields 4 stages', () => {
  const order = resolveStageOrder({ skipStages: ['explore'] });
  assert.deepStrictEqual([...order], ['brief', 'plan', 'design', 'verify']);
});

test('state machine: resolveStageOrder with resumeFrom + stopAfter window', () => {
  const order = resolveStageOrder({ resumeFrom: 'plan', stopAfter: 'design' });
  assert.deepStrictEqual([...order], ['plan', 'design']);
});

test('state machine: out-of-order user stages throws ValidationError', () => {
  assert.throws(
    () => resolveStageOrder({ stages: ['verify', 'brief'] }),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError);
      assert.strictEqual((err as ValidationError).code, 'INVALID_STAGE_ORDER');
      return true;
    },
  );
});

// ==========================================================================
// 2. invokeStage happy path (3 tests)
// ==========================================================================

test('invokeStage: completed session → outcome.status completed', async () => {
  const { run: mockRun } = makeRunOverride({ brief: [makeCompletedSession()] });
  const outcome: StageOutcome = await invokeStage({
    stage: 'brief',
    config: buildConfig(),
    retries: 1,
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(outcome.status, 'completed');
  assert.strictEqual(outcome.retries, 0);
  assert.ok(outcome.started_at !== undefined);
  assert.ok(outcome.ended_at !== undefined);
  assert.ok(outcome.session !== undefined);
});

test('invokeStage: budget_exceeded → halted-budget', async () => {
  const budgetSession: SessionResult = {
    ...makeCompletedSession(),
    status: 'budget_exceeded',
  };
  const { run: mockRun } = makeRunOverride({ brief: [budgetSession] });
  const outcome = await invokeStage({
    stage: 'brief',
    config: buildConfig(),
    retries: 1,
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(outcome.status, 'halted-budget');
});

test('invokeStage: turn_cap_exceeded → halted-turn-cap', async () => {
  const turnCapSession: SessionResult = {
    ...makeCompletedSession(),
    status: 'turn_cap_exceeded',
  };
  const { run: mockRun } = makeRunOverride({ brief: [turnCapSession] });
  const outcome = await invokeStage({
    stage: 'brief',
    config: buildConfig(),
    retries: 1,
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(outcome.status, 'halted-turn-cap');
});

// ==========================================================================
// 3. Retry-once at stage level (3 tests)
// ==========================================================================

test('retry-once: retryable error then success → completed with retries=1', async () => {
  const { run: mockRun, calls } = makeRunOverride({
    brief: [
      makeErrorSession('RATE_LIMITED', 'state_conflict'),
      makeCompletedSession(),
    ],
  });
  const outcome = await invokeStage({
    stage: 'brief',
    config: buildConfig(),
    retries: 1,
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(outcome.status, 'completed');
  assert.strictEqual(outcome.retries, 1);
  assert.strictEqual(calls.length, 2);
});

test('retry-once: retryable error twice → halted-error, retries=1', async () => {
  const { run: mockRun, calls } = makeRunOverride({
    brief: [
      makeErrorSession('RATE_LIMITED', 'state_conflict'),
      makeErrorSession('RATE_LIMITED', 'state_conflict'),
    ],
  });
  const outcome = await invokeStage({
    stage: 'brief',
    config: buildConfig(),
    retries: 1,
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(outcome.status, 'halted-error');
  assert.strictEqual(outcome.retries, 1);
  assert.strictEqual(calls.length, 2);
});

test('retry-once: non-retryable error → halted-error immediately, retries=0', async () => {
  const { run: mockRun, calls } = makeRunOverride({
    brief: [makeErrorSession('AUTH_ERROR', 'validation')],
  });
  const outcome = await invokeStage({
    stage: 'brief',
    config: buildConfig(),
    retries: 1,
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(outcome.status, 'halted-error');
  assert.strictEqual(outcome.retries, 0);
  assert.strictEqual(calls.length, 1);
});

// ==========================================================================
// 4. Human-gate (4 tests)
// ==========================================================================

test('human-gate: AWAIT_USER_GATE marker → halted-human-gate outcome', async () => {
  const { run: mockRun } = makeRunOverride({
    brief: [makeGatedSession('approve-plan')],
  });
  const outcome = await invokeStage({
    stage: 'brief',
    config: buildConfig(),
    retries: 1,
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(outcome.status, 'halted-human-gate');
  assert.strictEqual(outcome.gate?.gateName, 'approve-plan');
  assert.strictEqual(outcome.gate?.stage, 'brief');
});

test('human-gate: callback returns resume → re-invokes stage, replaces outcome', async () => {
  const { run: mockRun, calls } = makeRunOverride({
    brief: [makeGatedSession('approve-plan'), makeCompletedSession()],
  });
  let gateSeen: HumanGateInfo | null = null;
  const config = buildConfig({
    onHumanGate: async (info): Promise<HumanGateDecision> => {
      gateSeen = info;
      return { decision: 'resume', payload: 'operator approved' };
    },
  });
  const result: PipelineResult = await run(config, {
    transitionStageOverride: async () => ({ ok: true }),
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
    // Stop after brief so the test only exercises that one stage.
  });
  // The run spans all 5 stages; just assert that brief completed via
  // the resume, not halted-human-gate.
  const briefOutcome = result.outcomes.find((o) => o.stage === 'brief');
  assert.ok(briefOutcome !== undefined);
  assert.strictEqual(briefOutcome.status, 'completed');
  assert.ok(gateSeen !== null);
  // The resume must have been invoked with the payload suffix — calls[1]
  // is the second brief-stage invocation and its prompt should carry
  // the payload text.
  const briefCalls = calls.filter((c) => c.stage === 'brief');
  assert.strictEqual(briefCalls.length, 2);
  assert.ok(
    briefCalls[1]?.prompt.includes('operator approved'),
    'resumed prompt includes payload suffix',
  );
});

test('human-gate: callback returns stop → pipeline awaiting-gate, gate populated', async () => {
  const { run: mockRun } = makeRunOverride({
    brief: [makeGatedSession('approve-plan')],
  });
  const config = buildConfig({
    onHumanGate: async (): Promise<HumanGateDecision> => ({ decision: 'stop' }),
  });
  const result = await run(config, {
    transitionStageOverride: async () => ({ ok: true }),
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(result.status, 'awaiting-gate');
  assert.ok(result.gate !== undefined);
  assert.strictEqual(result.gate?.gateName, 'approve-plan');
});

test('human-gate: no callback → default stop, awaiting-gate status', async () => {
  const { run: mockRun } = makeRunOverride({
    brief: [makeGatedSession('approve-plan')],
  });
  const config = buildConfig();
  const result = await run(config, {
    transitionStageOverride: async () => ({ ok: true }),
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(result.status, 'awaiting-gate');
  assert.ok(result.gate !== undefined);
});

// ==========================================================================
// 5. Transition gates (3 tests)
// ==========================================================================

test('transition gate: pass → stage runs', async () => {
  const { run: mockRun } = makeRunOverride({
    brief: [makeCompletedSession()],
  });
  const seenTransitions: Stage[] = [];
  const result = await run(buildConfig({ stopAfter: 'brief' }), {
    transitionStageOverride: async (to): Promise<TransitionResult> => {
      seenTransitions.push(to);
      return { ok: true };
    },
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(result.outcomes.length, 1);
  assert.strictEqual(result.outcomes[0]?.status, 'completed');
  assert.deepStrictEqual(seenTransitions, ['brief']);
});

test('transition gate: veto → halted-gate-veto with blockers', async () => {
  const result = await run(buildConfig(), {
    transitionStageOverride: async (): Promise<TransitionResult> => ({
      ok: false,
      blockers: ['need cycle_start set', 'missing prior stage'],
    }),
    runOverride: async (): Promise<SessionResult> => makeCompletedSession(),
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(result.status, 'halted');
  assert.strictEqual(result.halted_at, 'brief');
  assert.strictEqual(result.outcomes.length, 1);
  assert.strictEqual(result.outcomes[0]?.status, 'halted-gate-veto');
  assert.deepStrictEqual(
    [...(result.outcomes[0]?.blockers ?? [])],
    ['need cycle_start set', 'missing prior stage'],
  );
});

test('transition gate override: called with correct {to: stage}', async () => {
  const { run: mockRun } = makeRunOverride({
    brief: [makeCompletedSession()],
    explore: [makeCompletedSession()],
  });
  const seen: Stage[] = [];
  await run(buildConfig({ stopAfter: 'explore' }), {
    transitionStageOverride: async (to): Promise<TransitionResult> => {
      seen.push(to);
      return { ok: true };
    },
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.deepStrictEqual(seen, ['brief', 'explore']);
});

// ==========================================================================
// 6. Full pipeline (5 tests)
// ==========================================================================

test('full pipeline: all 5 stages pass → completed, 5 outcomes', async () => {
  const { run: mockRun } = makeRunOverride({
    brief: [makeCompletedSession()],
    explore: [makeCompletedSession()],
    plan: [makeCompletedSession()],
    design: [makeCompletedSession()],
    verify: [makeCompletedSession()],
  });
  const result = await run(buildConfig(), {
    transitionStageOverride: async () => ({ ok: true }),
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.outcomes.length, 5);
  assert.strictEqual(result.halted_at, undefined);
  assert.deepStrictEqual(
    result.outcomes.map((o) => o.stage),
    ['brief', 'explore', 'plan', 'design', 'verify'],
  );
});

test('full pipeline: stopAfter=plan → stopped-after, 3 outcomes', async () => {
  const { run: mockRun } = makeRunOverride({
    brief: [makeCompletedSession()],
    explore: [makeCompletedSession()],
    plan: [makeCompletedSession()],
  });
  const result = await run(buildConfig({ stopAfter: 'plan' }), {
    transitionStageOverride: async () => ({ ok: true }),
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(result.status, 'stopped-after');
  assert.strictEqual(result.outcomes.length, 3);
  assert.deepStrictEqual(
    result.outcomes.map((o) => o.stage),
    ['brief', 'explore', 'plan'],
  );
});

test('full pipeline: skipStages=[design] → 4 outcomes, design absent', async () => {
  const { run: mockRun, calls } = makeRunOverride({
    brief: [makeCompletedSession()],
    explore: [makeCompletedSession()],
    plan: [makeCompletedSession()],
    verify: [makeCompletedSession()],
  });
  const result = await run(buildConfig({ skipStages: ['design'] }), {
    transitionStageOverride: async () => ({ ok: true }),
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.outcomes.length, 4);
  assert.ok(!result.outcomes.some((o) => o.stage === 'design'));
  assert.ok(!calls.some((c) => c.stage === 'design'));
});

test('full pipeline: halt at design → 4 outcomes, halted_at=design', async () => {
  const { run: mockRun } = makeRunOverride({
    brief: [makeCompletedSession()],
    explore: [makeCompletedSession()],
    plan: [makeCompletedSession()],
    design: [{
      ...makeCompletedSession(),
      status: 'budget_exceeded',
    }],
  });
  const result = await run(buildConfig(), {
    transitionStageOverride: async () => ({ ok: true }),
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(result.status, 'halted');
  assert.strictEqual(result.halted_at, 'design');
  assert.strictEqual(result.outcomes.length, 4);
  assert.strictEqual(result.outcomes[3]?.status, 'halted-budget');
});

test('full pipeline: resumeFrom=verify → 1 outcome', async () => {
  const { run: mockRun, calls } = makeRunOverride({
    verify: [makeCompletedSession()],
  });
  const result = await run(buildConfig({ resumeFrom: 'verify' }), {
    transitionStageOverride: async () => ({ ok: true }),
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.outcomes.length, 1);
  assert.strictEqual(result.outcomes[0]?.stage, 'verify');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0]?.stage, 'verify');
});

// ==========================================================================
// 7. Usage aggregation (2 tests)
// ==========================================================================

test('usage aggregation: total = sum of per-stage usages', async () => {
  const mkSession = (inp: number, out: number, cost: number): SessionResult =>
    makeCompletedSession({
      usage: { input_tokens: inp, output_tokens: out, usd_cost: cost },
    });
  const { run: mockRun } = makeRunOverride({
    brief: [mkSession(100, 200, 0.01)],
    explore: [mkSession(200, 400, 0.02)],
    plan: [mkSession(300, 600, 0.03)],
    design: [mkSession(400, 800, 0.04)],
    verify: [mkSession(500, 1000, 0.05)],
  });
  const result = await run(buildConfig(), {
    transitionStageOverride: async () => ({ ok: true }),
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(result.total_usage.input_tokens, 1500);
  assert.strictEqual(result.total_usage.output_tokens, 3000);
  // Use Math.abs for float tolerance across the additions.
  assert.ok(Math.abs(result.total_usage.usd_cost - 0.15) < 1e-9);
});

test('usage aggregation: skipped stages contribute zero', async () => {
  const { run: mockRun } = makeRunOverride({
    brief: [makeCompletedSession({ usage: { input_tokens: 100, output_tokens: 200, usd_cost: 0.01 } })],
    explore: [makeCompletedSession({ usage: { input_tokens: 100, output_tokens: 200, usd_cost: 0.01 } })],
    plan: [makeCompletedSession({ usage: { input_tokens: 100, output_tokens: 200, usd_cost: 0.01 } })],
    verify: [makeCompletedSession({ usage: { input_tokens: 100, output_tokens: 200, usd_cost: 0.01 } })],
  });
  const result = await run(buildConfig({ skipStages: ['design'] }), {
    transitionStageOverride: async () => ({ ok: true }),
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  // 4 stages x 100 input each.
  assert.strictEqual(result.total_usage.input_tokens, 400);
  assert.strictEqual(result.total_usage.output_tokens, 800);
});

// ==========================================================================
// 8. Logger integration (2 tests)
// ==========================================================================

test('logger: emits pipeline.started + pipeline.completed info entries', async () => {
  const cap = new CaptureSink();
  setLogger(
    createLogger({
      level: 'debug',
      emitEventsOverride: false,
    } as unknown as Parameters<typeof createLogger>[0]),
  );
  // Swap sink after construction.
  setLogger({
    debug: () => {},
    info: (msg, fields) => cap.write({ ts: '', level: 'info', msg, pid: 0, ...(fields ?? {}) }),
    warn: (msg, fields) => cap.write({ ts: '', level: 'warn', msg, pid: 0, ...(fields ?? {}) }),
    error: (msg, fields) => cap.write({ ts: '', level: 'error', msg, pid: 0, ...(fields ?? {}) }),
    child: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => ({} as never), flush: () => {} }),
    flush: () => {},
  });
  const { run: mockRun } = makeRunOverride({
    brief: [makeCompletedSession()],
  });
  await run(buildConfig({ stopAfter: 'brief' }), {
    transitionStageOverride: async () => ({ ok: true }),
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  const started = cap.entries.find((e) => e.msg === 'pipeline.started');
  const completed = cap.entries.find((e) => e.msg === 'pipeline.completed');
  assert.ok(started !== undefined, 'pipeline.started logged');
  assert.ok(completed !== undefined, 'pipeline.completed logged');
});

test('logger: halt emits warn-level entry with stage + status', async () => {
  const cap = new CaptureSink();
  setLogger({
    debug: () => {},
    info: () => {},
    warn: (msg, fields) => cap.write({ ts: '', level: 'warn', msg, pid: 0, ...(fields ?? {}) }),
    error: () => {},
    child: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => ({} as never), flush: () => {} }),
    flush: () => {},
  });
  const { run: mockRun } = makeRunOverride({
    brief: [{
      ...makeCompletedSession(),
      status: 'turn_cap_exceeded',
    }],
  });
  await run(buildConfig(), {
    transitionStageOverride: async () => ({ ok: true }),
    runOverride: mockRun,
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  const haltEntry = cap.entries.find((e) => e.msg === 'pipeline.halted');
  assert.ok(haltEntry !== undefined);
  assert.strictEqual(haltEntry.level, 'warn');
  assert.strictEqual((haltEntry as unknown as { stage?: string }).stage, 'brief');
  assert.strictEqual(
    (haltEntry as unknown as { status?: string }).status,
    'halted-turn-cap',
  );
});

// ==========================================================================
// 9. Extras — marker extraction, validator edges, event emissions
// ==========================================================================

test('extractGateMarker: valid marker → {name}', () => {
  const m = extractGateMarker('prefix\n<!-- AWAIT_USER_GATE: name="approve-plan" -->\nsuffix');
  assert.deepStrictEqual(m, { name: 'approve-plan' });
});

test('extractGateMarker: no marker → null', () => {
  assert.strictEqual(extractGateMarker('just text'), null);
  assert.strictEqual(extractGateMarker(''), null);
  // Discussing the token in docs text is NOT a trigger.
  assert.strictEqual(
    extractGateMarker('the AWAIT_USER_GATE token pauses execution'),
    null,
  );
});

test('dispatchHumanGate: callback throws → default stop', async () => {
  const info: HumanGateInfo = { stage: 'plan', gateName: 'approve', stdoutTail: '' };
  const config = buildConfig({
    onHumanGate: async (): Promise<HumanGateDecision> => {
      throw new Error('callback failure');
    },
  });
  const decision = await dispatchHumanGate(info, config);
  assert.deepStrictEqual(decision, { decision: 'stop' });
});

test('run: emits stage.entered + stage.exited events per stage', async () => {
  const events: BaseEvent[] = [];
  const unsubscribe = subscribeAll((ev) => events.push(ev));
  try {
    const { run: mockRun } = makeRunOverride({
      brief: [makeCompletedSession()],
      explore: [makeCompletedSession()],
    });
    await run(buildConfig({ stopAfter: 'explore' }), {
      transitionStageOverride: async () => ({ ok: true }),
      runOverride: mockRun,
      bundleOverride: mockBundle,
      scopeOverride: allowOnly,
    });
    const entered = events.filter((e) => e.type === 'stage.entered');
    const exited = events.filter((e) => e.type === 'stage.exited');
    assert.strictEqual(entered.length, 2);
    assert.strictEqual(exited.length, 2);
    const enteredStages = entered.map((e) => (e.payload as { stage: string }).stage);
    assert.deepStrictEqual(enteredStages, ['brief', 'explore']);
  } finally {
    unsubscribe();
  }
});

test('stageIndex: unknown stage throws ValidationError', () => {
  assert.throws(
    () => stageIndex('bogus' as Stage),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError);
      return (err as ValidationError).code === 'INVALID_STAGE';
    },
  );
});

test('run: invalid config (missing prompt) returns halted with empty outcomes', async () => {
  // Build a config with a missing prompt for one stage.
  const badPrompts = {
    brief: 'brief',
    explore: 'explore',
    plan: 'plan',
    design: 'design',
    // verify: intentionally missing
  } as unknown as Record<Stage, string>;
  const config: PipelineConfig = {
    prompts: badPrompts,
    budget: {
      usdLimit: 1.0,
      inputTokensLimit: 1000,
      outputTokensLimit: 1000,
      perStage: true,
    },
    maxTurnsPerStage: 5,
  };
  const result = await run(config, {
    transitionStageOverride: async () => ({ ok: true }),
    runOverride: async () => makeCompletedSession(),
    bundleOverride: mockBundle,
    scopeOverride: allowOnly,
  });
  assert.strictEqual(result.status, 'halted');
  assert.strictEqual(result.outcomes.length, 0);
});
