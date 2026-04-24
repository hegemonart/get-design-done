#!/usr/bin/env node
/**
 * budget-enforcer.ts — PreToolUse hook (matcher: Agent)
 *
 * Phase 20 Plan 20-13 rewrite: the original budget-enforcer.js is ported
 * to TypeScript verbatim in behavior and additionally wires up the event
 * stream as a hook.fired emitter. No policy changes; the enforcement
 * branches (enforce / warn / log) and telemetry row shape (OPT-09) are
 * preserved byte-for-byte against the .js source.
 *
 * Intercepts every Agent tool spawn. Consults:
 *   (a) router decision (from tool_input.context.router_decision if supplied)
 *   (b) .design/cache-manifest.json for short-circuit cached answers (D-05)
 *   (c) .design/budget.json for tier_overrides + caps (D-01, D-04, D-10)
 *
 * Enforcement (D-02, D-03, D-11):
 *   - enforcement_mode: "enforce" + 100% cap → block with actionable error
 *   - enforcement_mode: "enforce" + 80% soft-threshold + auto_downgrade_on_cap → rewrite tier to haiku
 *   - enforcement_mode: "warn" → log warning, allow spawn
 *   - enforcement_mode: "log" → advisory only
 *
 * Logs every decision to .design/telemetry/costs.jsonl (OPT-09 schema).
 * Every telemetry write fires a detached child aggregator
 * (scripts/aggregate-agent-metrics.ts) that rebuilds
 * .design/agent-metrics.json incrementally.
 *
 * Every decision also fires a hook.fired event to
 * .design/telemetry/events.jsonl via appendEvent() (Plan 20-06). The
 * event payload uses the pre-registered HookFiredEvent shape with
 * hook="budget-enforcer" and decision in {block|downgrade|warn|log|cache|allow|lazy}.
 *
 * Plan 20-14 note: Plan 20-14 will patch this hook with a rate-guard
 * check before spawn. The current file exposes a `main()` entrypoint
 * and keeps policy pure-ish so that insertion is an additive change.
 *
 * Hook type: PreToolUse
 * Input:  JSON on stdin { tool_name, tool_input }
 * Output: JSON on stdout { continue, suppressOutput, message, modified_tool_input? }
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import { appendEvent } from '../scripts/lib/event-stream/index.ts';
import type { HookFiredEvent } from '../scripts/lib/event-stream/index.ts';
// Consume the generated BudgetSchema so this hook participates in the
// Plan 20-00 codegen graph. We treat parsed JSON as BudgetSchema after
// the structural merge with defaults — the schema permits every field
// to be optional so defaults-merged objects are always valid.
import type { BudgetSchema } from '../reference/schemas/generated.js';

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * PreToolUse stdin envelope. Claude Code injects tool_name + tool_input
 * for every hook invocation. The tool_input shape is tool-specific;
 * this hook only consumes Agent-shaped tool_input so we narrow here.
 */
interface ToolInput {
  subagent_type?: string;
  agent?: string;
  _input_hash?: string;
  _est_cost_usd?: number;
  _tokens_in_est?: number;
  _tokens_out_est?: number;
  _tier_override?: string;
  _default_tier?: string;
  _tier_downgraded?: boolean;
  lazy_skipped?: boolean;
  [key: string]: unknown;
}

interface HookStdin {
  tool_name?: string;
  tool_input?: ToolInput;
  [key: string]: unknown;
}

/**
 * PostToolUse stdout envelope. The `continue` field is the primary
 * dispatch knob; `modified_tool_input` is how we inject tier overrides.
 */
interface ToolOutput {
  continue: boolean;
  suppressOutput?: boolean;
  message?: string;
  modified_tool_input?: ToolInput;
  cached_result?: unknown;
}

/** Shape of .design/cache-manifest.json — D-05 cache short-circuit. */
interface CacheManifestEntry {
  ts_unix: number;
  result: unknown;
}
interface CacheManifest {
  ttl_seconds?: number;
  entries?: Record<string, CacheManifestEntry>;
}

/** Shape of .design/telemetry/phase-totals.json — WR-02 fast path. */
interface PhaseTotals {
  totals?: Record<string, number>;
}

/** OPT-09 telemetry row (partial — aggregator enforces required fields). */
interface TelemetryRowPartial {
  ts?: string;
  agent?: string;
  tier?: string;
  tokens_in?: number;
  tokens_out?: number;
  cache_hit?: boolean;
  est_cost_usd?: number;
  cycle?: string;
  phase?: string;
  tier_downgraded?: boolean;
  enforcement_mode?: string;
  lazy_skipped?: boolean;
  block_reason?: string;
  _cyclePhase?: { cycle: string; phase: string };
}

/** The hook's terminal decision — also the event payload `decision` field. */
export type HookDecision =
  | 'lazy'
  | 'cache'
  | 'block'
  | 'downgrade'
  | 'warn'
  | 'log'
  | 'allow';

// ── Constants ───────────────────────────────────────────────────────────────

const BUDGET_PATH = join(process.cwd(), '.design', 'budget.json');
const MANIFEST_PATH = join(process.cwd(), '.design', 'cache-manifest.json');
const TELEMETRY_PATH = join(
  process.cwd(),
  '.design',
  'telemetry',
  'costs.jsonl',
);
const PHASE_TOTALS_PATH = join(
  process.cwd(),
  '.design',
  'telemetry',
  'phase-totals.json',
);
const STATE_PATH = join(process.cwd(), '.design', 'STATE.md');

/** Defaults per D-12 — mirror scripts/bootstrap.sh budget.json bootstrap. */
const BUDGET_DEFAULTS: Required<
  Pick<
    BudgetSchema,
    | 'per_task_cap_usd'
    | 'per_phase_cap_usd'
    | 'tier_overrides'
    | 'auto_downgrade_on_cap'
    | 'cache_ttl_seconds'
    | 'enforcement_mode'
  >
> = {
  per_task_cap_usd: 2.0,
  per_phase_cap_usd: 20.0,
  tier_overrides: {},
  auto_downgrade_on_cap: true,
  cache_ttl_seconds: 3600,
  enforcement_mode: 'enforce',
};

/**
 * Concrete budget shape after defaults-merge. Every field becomes
 * non-optional so downstream branches don't have to null-guard. Defined
 * as an intersection of BudgetSchema (to keep the generated-type graph
 * edge alive) and the required fields.
 */
type ResolvedBudget = BudgetSchema & typeof BUDGET_DEFAULTS;

// ── budget.json loader ──────────────────────────────────────────────────────

/**
 * Load .design/budget.json with defaults-merge. Returns the defaults
 * when the file is missing or unparseable — fail-open is the documented
 * D-12 behavior so a missing budget file never blocks agent spawns.
 */
export function loadBudget(): ResolvedBudget {
  if (!existsSync(BUDGET_PATH)) {
    return { ...BUDGET_DEFAULTS };
  }
  try {
    const parsed = JSON.parse(readFileSync(BUDGET_PATH, 'utf8')) as Partial<BudgetSchema>;
    return { ...BUDGET_DEFAULTS, ...parsed };
  } catch {
    return { ...BUDGET_DEFAULTS };
  }
}

// ── cumulative phase spend (WR-02) ──────────────────────────────────────────

/**
 * Fast path: read phase-totals.json (written by
 * scripts/aggregate-agent-metrics.ts). Falls back to costs.jsonl replay
 * only on the very first spawn of a session. Returns 0 on any error.
 */
export function currentPhaseSpend(phase: string): number {
  if (existsSync(PHASE_TOTALS_PATH)) {
    try {
      const data = JSON.parse(
        readFileSync(PHASE_TOTALS_PATH, 'utf8'),
      ) as PhaseTotals;
      const total = data.totals?.[phase];
      return Number(total ?? 0);
    } catch {
      // fall through to replay
    }
  }
  if (!existsSync(TELEMETRY_PATH)) return 0;
  const lines = readFileSync(TELEMETRY_PATH, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean);
  let sum = 0;
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as { phase?: string; est_cost_usd?: number };
      if (row.phase === phase) sum += Number(row.est_cost_usd ?? 0);
    } catch {
      // tolerant — skip malformed lines
    }
  }
  return sum;
}

// ── cycle + phase reader (STATE.md frontmatter) ─────────────────────────────

/**
 * Parse `cycle:` and `phase:` from the STATE.md leading frontmatter
 * block. Regex-based rather than YAML-parsed — STATE.md frontmatter is
 * always flat `key: value` per reference/STATE-TEMPLATE.md.
 */
export function readCycleAndPhase(): { cycle: string; phase: string } {
  const defaults = { cycle: 'unknown', phase: 'unknown' };
  if (!existsSync(STATE_PATH)) return defaults;
  try {
    const content = readFileSync(STATE_PATH, 'utf8');
    const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
    const body = fm?.[1] ?? content;
    const cycleMatch = body.match(/^cycle:\s*"?([^"\n]+)"?/m);
    const phaseMatch = body.match(/^phase:\s*"?([^"\n]+)"?/m);
    return {
      cycle: cycleMatch?.[1]?.trim() ?? 'unknown',
      phase: phaseMatch?.[1]?.trim() ?? 'unknown',
    };
  } catch {
    return defaults;
  }
}

/**
 * Deprecated alias kept for plan-01 callers that imported the
 * phase-only function from the .js source.
 */
export function currentPhase(): string {
  return readCycleAndPhase().phase;
}

// ── cache short-circuit (D-05) ──────────────────────────────────────────────

/**
 * Look up a cached result for `agent:inputHash`. Returns null on miss,
 * stale (past TTL), or any read/parse error.
 */
export function cacheLookup(agent: string, inputHash: string): unknown {
  if (!existsSync(MANIFEST_PATH)) return null;
  try {
    const manifest = JSON.parse(
      readFileSync(MANIFEST_PATH, 'utf8'),
    ) as CacheManifest;
    const entry = manifest.entries?.[`${agent}:${inputHash}`];
    if (entry === undefined) return null;
    const age = Date.now() / 1000 - entry.ts_unix;
    if (age > (manifest.ttl_seconds ?? 3600)) return null;
    return entry.result;
  } catch {
    return null;
  }
}

// ── tier resolution (D-04) ──────────────────────────────────────────────────

export function resolveTier(
  agent: string,
  agentDefaultTier: string | undefined,
  overrides: Record<string, string> | undefined,
): string {
  return overrides?.[agent] ?? agentDefaultTier ?? 'sonnet';
}

// ── detached aggregator ─────────────────────────────────────────────────────

/**
 * Fire-and-forget: spawn the aggregator as a detached child. Failures
 * here MUST NOT break the hook — silently swallow everything. Uses the
 * .ts entrypoint via --experimental-strip-types since Plan 20-00.
 */
function spawnAggregator(): void {
  try {
    const aggregatorPath = join(
      process.cwd(),
      'scripts',
      'aggregate-agent-metrics.ts',
    );
    if (!existsSync(aggregatorPath)) return;
    // IN-02: minimal env; aggregator reads only filesystem artifacts.
    const childEnv: NodeJS.ProcessEnv = {};
    if (typeof process.env['PATH'] === 'string') {
      childEnv['PATH'] = process.env['PATH'];
    }
    const child = spawn(
      'node',
      ['--experimental-strip-types', aggregatorPath],
      {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
        env: childEnv,
      },
    );
    child.unref();
  } catch {
    // Aggregator failures are non-fatal.
  }
}

// ── OPT-09 locked-schema telemetry row builder ──────────────────────────────

interface TelemetryRow {
  ts: string;
  agent: string;
  tier: string;
  tokens_in: number;
  tokens_out: number;
  cache_hit: boolean;
  est_cost_usd: number;
  cycle: string;
  phase: string;
  tier_downgraded?: boolean;
  enforcement_mode?: string;
  lazy_skipped?: boolean;
  block_reason?: string;
}

function buildTelemetryRow(partial: TelemetryRowPartial): TelemetryRow {
  const { cycle, phase } = partial._cyclePhase ?? readCycleAndPhase();
  const row: TelemetryRow = {
    ts: partial.ts ?? new Date().toISOString(),
    agent: String(partial.agent ?? 'unknown'),
    tier: String(partial.tier ?? 'unknown'),
    tokens_in: Number(partial.tokens_in ?? 0),
    tokens_out: Number(partial.tokens_out ?? 0),
    cache_hit: Boolean(partial.cache_hit),
    est_cost_usd: Number(partial.est_cost_usd ?? 0),
    cycle: partial.cycle ?? cycle,
    phase: partial.phase ?? phase,
  };
  if (partial.tier_downgraded !== undefined) {
    row.tier_downgraded = Boolean(partial.tier_downgraded);
  }
  if (partial.enforcement_mode !== undefined) {
    row.enforcement_mode = String(partial.enforcement_mode);
  }
  if (partial.lazy_skipped !== undefined) {
    row.lazy_skipped = Boolean(partial.lazy_skipped);
  }
  if (partial.block_reason !== undefined) {
    row.block_reason = String(partial.block_reason);
  }
  return row;
}

/**
 * Append one OPT-09 row to costs.jsonl. Directory is created if
 * missing. Every write fires a detached aggregator child so the
 * per-agent + per-phase rollups stay current. Fail-open — telemetry
 * write errors MUST NEVER block the hook.
 */
export function writeTelemetry(partial: TelemetryRowPartial): void {
  const dir = dirname(TELEMETRY_PATH);
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const row = buildTelemetryRow(partial);
    appendFileSync(TELEMETRY_PATH, JSON.stringify(row) + '\n', 'utf8');
    spawnAggregator();
  } catch {
    // Fail open.
  }
}

// ── event-stream decision emitter ───────────────────────────────────────────

/**
 * Emit one hook.fired event per hook decision. Uses the pre-registered
 * HookFiredEvent subtype from scripts/lib/event-stream/types.ts and
 * stamps sessionId from the process PID + boot time — same scheme as
 * scripts/mcp-servers/gdd-state/tools/shared.ts but inlined here so the
 * hook stays dependency-light.
 */
let CACHED_SESSION_ID: string | null = null;
function getSessionId(): string {
  if (CACHED_SESSION_ID === null) {
    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    CACHED_SESSION_ID = `gdd-hook-${iso}-${process.pid}`;
  }
  return CACHED_SESSION_ID;
}

function emitHookFired(decision: HookDecision, cycle?: string): void {
  const ev: HookFiredEvent = {
    type: 'hook.fired',
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
    ...(cycle !== undefined && cycle !== 'unknown' ? { cycle } : {}),
    payload: { hook: 'budget-enforcer', decision },
  };
  try {
    appendEvent(ev);
  } catch {
    // Fail open — event-stream errors must never block the hook.
  }
}

// ── main ────────────────────────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  const rl = createInterface({ input: process.stdin });
  let data = '';
  for await (const line of rl) data += line + '\n';
  return data;
}

export async function main(): Promise<void> {
  const inputData = await readStdin();

  let parsed: HookStdin;
  try {
    parsed = JSON.parse(inputData) as HookStdin;
  } catch {
    process.exit(0);
  }

  if (parsed.tool_name !== 'Agent') process.exit(0);

  const toolInput: ToolInput = parsed.tool_input ?? {};
  const agent =
    typeof toolInput.subagent_type === 'string' && toolInput.subagent_type.length > 0
      ? toolInput.subagent_type
      : typeof toolInput.agent === 'string' && toolInput.agent.length > 0
        ? toolInput.agent
        : 'unknown';
  const inputHash =
    typeof toolInput._input_hash === 'string' ? toolInput._input_hash : null;

  const { cycle, phase } = readCycleAndPhase();
  const cyclePhase = { cycle, phase };

  // Branch A: lazy-gate passthrough.
  if (toolInput.lazy_skipped === true) {
    writeTelemetry({
      agent,
      tier: 'gate',
      tokens_in: 0,
      tokens_out: 0,
      cache_hit: false,
      est_cost_usd: 0,
      lazy_skipped: true,
      _cyclePhase: cyclePhase,
    });
    emitHookFired('lazy', cycle);
    const response: ToolOutput = { continue: true, suppressOutput: true };
    process.stdout.write(JSON.stringify(response));
    return;
  }

  const budget = loadBudget();

  // Branch B: cache short-circuit (D-05).
  if (inputHash !== null) {
    const cached = cacheLookup(agent, inputHash);
    if (cached !== null) {
      writeTelemetry({
        agent,
        tier: 'cache',
        tokens_in: 0,
        tokens_out: 0,
        cache_hit: true,
        est_cost_usd: 0,
        _cyclePhase: cyclePhase,
      });
      emitHookFired('cache', cycle);
      const response: ToolOutput = {
        continue: false,
        suppressOutput: false,
        message: `gdd-budget-enforcer: SkippedCached — returning cached result for ${agent}:${inputHash}`,
        cached_result: cached,
      };
      process.stdout.write(JSON.stringify(response));
      return;
    }
  }

  const estCost = Number(toolInput._est_cost_usd ?? 0);
  const phaseSpend = currentPhaseSpend(phase);

  if (budget.enforcement_mode === 'enforce') {
    // Branch C: 100% per_task cap hard block.
    if (estCost >= budget.per_task_cap_usd) {
      writeTelemetry({
        agent,
        tier:
          toolInput._tier_override ??
          toolInput._default_tier ??
          'sonnet',
        tokens_in: Number(toolInput._tokens_in_est ?? 0),
        tokens_out: Number(toolInput._tokens_out_est ?? 0),
        cache_hit: false,
        est_cost_usd: estCost,
        enforcement_mode: budget.enforcement_mode,
        block_reason: 'per_task_cap',
        _cyclePhase: cyclePhase,
      });
      emitHookFired('block', cycle);
      const response: ToolOutput = {
        continue: false,
        suppressOutput: false,
        message: `Budget cap reached for per-task. Estimated: $${estCost.toFixed(4)}, cap: $${budget.per_task_cap_usd.toFixed(2)}. Raise cap in .design/budget.json or retry after next task.`,
      };
      process.stdout.write(JSON.stringify(response));
      return;
    }
    // Branch D: 100% per_phase cap hard block.
    if (phaseSpend + estCost >= budget.per_phase_cap_usd) {
      writeTelemetry({
        agent,
        tier:
          toolInput._tier_override ??
          toolInput._default_tier ??
          'sonnet',
        tokens_in: Number(toolInput._tokens_in_est ?? 0),
        tokens_out: Number(toolInput._tokens_out_est ?? 0),
        cache_hit: false,
        est_cost_usd: estCost,
        enforcement_mode: budget.enforcement_mode,
        block_reason: 'per_phase_cap',
        _cyclePhase: cyclePhase,
      });
      emitHookFired('block', cycle);
      const response: ToolOutput = {
        continue: false,
        suppressOutput: false,
        message: `Budget cap reached for per-phase (${phase}). Cumulative: $${(phaseSpend + estCost).toFixed(4)}, cap: $${budget.per_phase_cap_usd.toFixed(2)}. Raise cap in .design/budget.json or retry after next phase.`,
      };
      process.stdout.write(JSON.stringify(response));
      return;
    }
    // 80% soft-threshold downgrade (D-03): task-scoped.
    if (
      budget.auto_downgrade_on_cap &&
      estCost >= 0.8 * budget.per_task_cap_usd
    ) {
      toolInput._tier_override = 'haiku';
      toolInput._tier_downgraded = true;
    }
  } else if (budget.enforcement_mode === 'warn') {
    if (estCost >= budget.per_task_cap_usd) {
      process.stderr.write(
        `gdd-budget-enforcer WARN: per-task cap will be exceeded ($${estCost.toFixed(4)} >= $${budget.per_task_cap_usd})\n`,
      );
    }
  }
  // enforcement_mode === 'log': telemetry only.

  // D-04: tier_overrides rewrite.
  if (budget.tier_overrides[agent] !== undefined) {
    toolInput._tier_override = budget.tier_overrides[agent];
  }

  // Branch E: standard spawn-allowed (includes tier-downgraded path).
  writeTelemetry({
    agent,
    tier:
      toolInput._tier_override ??
      toolInput._default_tier ??
      'sonnet',
    tokens_in: Number(toolInput._tokens_in_est ?? 0),
    tokens_out: Number(toolInput._tokens_out_est ?? 0),
    cache_hit: false,
    est_cost_usd: estCost,
    tier_downgraded: Boolean(toolInput._tier_downgraded),
    enforcement_mode: budget.enforcement_mode,
    _cyclePhase: cyclePhase,
  });

  // Decision tag for the event stream. downgrade takes precedence over
  // allow/warn/log since it's a user-visible rewrite.
  let decision: HookDecision;
  if (toolInput._tier_downgraded === true) {
    decision = 'downgrade';
  } else if (budget.enforcement_mode === 'warn') {
    decision = 'warn';
  } else if (budget.enforcement_mode === 'log') {
    decision = 'log';
  } else {
    decision = 'allow';
  }
  emitHookFired(decision, cycle);

  const response: ToolOutput = {
    continue: true,
    suppressOutput: true,
    modified_tool_input: toolInput,
  };
  process.stdout.write(JSON.stringify(response));
}

// Run only when invoked as the hook entrypoint. Guards against test
// files that may import from this module (e.g. to call loadBudget()
// directly).
const isDirectInvocation =
  process.argv[1] !== undefined &&
  /budget-enforcer\.ts$/.test(process.argv[1]);

if (isDirectInvocation) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`budget-enforcer hook error: ${msg}\n`);
    process.exit(0);
  });
}
