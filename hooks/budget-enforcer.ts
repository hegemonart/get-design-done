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
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';

import { appendEvent } from '../scripts/lib/event-stream/index.ts';
import type { HookFiredEvent } from '../scripts/lib/event-stream/index.ts';
// Consume the generated BudgetSchema so this hook participates in the
// Plan 20-00 codegen graph. We treat parsed JSON as BudgetSchema after
// the structural merge with defaults — the schema permits every field
// to be optional so defaults-merged objects are always valid.
import type { BudgetSchema } from '../reference/schemas/generated.js';

// Plan 20-14 resilience primitives. These are `.cjs` modules so that
// `.cjs`-only call sites (future CLIs) can consume them without
// --experimental-strip-types. From this file — which runs as an ES
// module under strip-types — we reach them via `createRequire`
// anchored on an absolute filesystem path derived from `process.argv[1]`
// (identical pattern to `hooks/gdd-read-injection-scanner.ts`'s
// loadPatterns). We deliberately avoid `import.meta.url` so this
// module stays compatible with the `Node16` tsconfig module setting
// without forcing `"type":"module"` in package.json (which would
// break the Tier-2 .cjs tests per Plan 20-00).
function resolveHookPath(): string {
  const a1 = process.argv[1];
  if (typeof a1 === 'string' && a1.length > 0) {
    return isAbsolute(a1) ? a1 : resolve(a1);
  }
  return resolve('hooks/budget-enforcer.ts');
}
const nodeRequire = createRequire(resolveHookPath());
const rateGuard = nodeRequire('../scripts/lib/rate-guard.cjs') as typeof import('../scripts/lib/rate-guard.cjs');
const iterationBudget = nodeRequire('../scripts/lib/iteration-budget.cjs') as typeof import('../scripts/lib/iteration-budget.cjs');
// Plan 26-05: shared cost-computation backend for the resolved_models
// consumer path. Pure module — takes (model_id, runtime, token_counts) →
// cost_usd by reading per-runtime price tables under reference/prices/.
// See scripts/lib/budget-enforcer.cjs for the lookup chain.
interface BudgetEnforcerBackend {
  computeCost(args: {
    model_id?: string | null;
    tier?: string | null;
    runtime: string;
    tokens_in: number;
    tokens_out: number;
    cache_hit?: boolean;
  }): {
    cost_usd: number | null;
    model: string | null;
    tier: string | null;
    runtime_used: string | null;
    fallback: boolean;
    reason: string | null;
  };
  modelFromResolved(resolved: unknown, agent: string): string | null;
}
const budgetBackend = nodeRequire('../scripts/lib/budget-enforcer.cjs') as BudgetEnforcerBackend;
// Plan 26-05: runtime detection for the cost-event runtime tag. Returns
// 'claude' for the CC hook context (CLAUDE_CONFIG_DIR is set when CC is
// the host), null when running outside any of the 14 runtime envs (e.g.
// CI matrix). The hook defaults the null case to 'claude' since the .ts
// hook only runs inside CC anyway.
interface RuntimeDetectModule {
  detect(): string | null;
}
const runtimeDetect = nodeRequire('../scripts/lib/runtime-detect.cjs') as RuntimeDetectModule;

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * PreToolUse stdin envelope. Claude Code injects tool_name + tool_input
 * for every hook invocation. The tool_input shape is tool-specific;
 * this hook only consumes Agent-shaped tool_input so we narrow here.
 */
/** Phase 25 / D-04, D-05: router complexity-class enum. */
export type ComplexityClass = 'S' | 'M' | 'L' | 'XL';

/**
 * Phase 25 / D-05: router decision payload as surfaced on
 * tool_input.context.router_decision. Only the fields this hook reads
 * are typed; the router emits more (model_tier_overrides,
 * estimated_cost_usd, cache_hits) but they are not consumed here.
 */
interface RouterDecision {
  path?: 'fast' | 'quick' | 'full';
  complexity_class?: ComplexityClass;
  /**
   * Phase 26 / D-07: per-agent concrete model name resolved by the
   * router via `scripts/lib/tier-resolver.cjs`. Strict superset of
   * `model_tier_overrides` — existing consumers still read tier names
   * from `model_tier_overrides`; new consumers read `resolved_models`
   * for runtime-correct cost lookup.
   */
  resolved_models?: Record<string, string>;
  /**
   * Phase 26 / D-08: runtime ID the router computed `resolved_models`
   * against. Optional; the hook falls back to `runtime-detect.cjs`
   * when absent.
   */
  runtime?: string;
  /**
   * Phase 25 back-compat: tier-name overrides per agent. Phase 26 keeps
   * this as the legacy fallback path when `resolved_models` is absent.
   */
  model_tier_overrides?: Record<string, string>;
  [key: string]: unknown;
}

interface ToolInputContext {
  router_decision?: RouterDecision;
  [key: string]: unknown;
}

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
  context?: ToolInputContext;
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

/**
 * The hook's terminal decision — also the event payload `decision` field.
 * `'rate-limited'` was added in Plan 20-14 to signal that rate-guard
 * saw an upstream provider hit its limit and the hook short-circuited
 * before the budget cap check.
 */
export type HookDecision =
  | 'lazy'
  | 'cache'
  | 'rate-limited'
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
 * Phase 25 / D-05: optional per-class cap map on .design/budget.json.
 * Documented in reference/config-schema.md as `class_caps_usd?: { S?: number; M?: number; L?: number; XL?: number }`.
 * Read through the BudgetSchema index signature so we don't have to
 * regenerate the schema for an additive optional field.
 */
type ClassCapsUsd = Partial<Record<ComplexityClass, number>>;

function readClassCaps(budget: BudgetSchema): ClassCapsUsd | undefined {
  const raw = (budget as { class_caps_usd?: unknown }).class_caps_usd;
  if (raw === undefined || raw === null || typeof raw !== 'object') {
    return undefined;
  }
  const out: ClassCapsUsd = {};
  for (const k of ['S', 'M', 'L', 'XL'] as const) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Phase 25 / D-05: resolve the per-spawn cap. If the router decision
 * payload contains a `complexity_class` AND `.design/budget.json#class_caps_usd[class]`
 * is defined, use that. Otherwise fall back to `per_task_cap_usd`.
 */
function resolvePerSpawnCap(
  budget: ResolvedBudget,
  complexityClass: ComplexityClass | undefined,
): number {
  if (complexityClass !== undefined) {
    const caps = readClassCaps(budget);
    const classCap = caps?.[complexityClass];
    if (classCap !== undefined) return classCap;
  }
  return budget.per_task_cap_usd;
}

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

/**
 * Plan 26-05 / D-08: emit a `cost_recorded` event with runtime tag,
 * concrete model, tier, token counts, and computed cost. Cost-aggregator
 * downstream rolls these up per-runtime AND per-tier so reflector class-
 * specific cost analysis (Phase 26-06) can compare apples-to-apples
 * across runtimes.
 *
 * The event uses the BaseEvent envelope shape (free-form `type` per
 * Phase 22 events.jsonl contract). Fail-open like every other emit in
 * this hook — never block the spawn on a telemetry failure.
 */
function emitCostRecorded(
  payload: {
    runtime: string;
    agent: string;
    model_id: string | null;
    tier: string | null;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number | null;
  },
  cycle?: string,
): void {
  const ev = {
    type: 'cost_recorded',
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
    ...(cycle !== undefined && cycle !== 'unknown' ? { cycle } : {}),
    payload: {
      runtime: payload.runtime,
      agent: payload.agent,
      model_id: payload.model_id,
      tier: payload.tier,
      tokens_in: payload.tokens_in,
      tokens_out: payload.tokens_out,
      cost_usd: payload.cost_usd,
    },
  };
  try {
    // BaseEvent shape; cost_recorded is a free-form subtype (the
    // Phase 22 events stream is structurally validated, not enum-locked).
    appendEvent(ev as unknown as HookFiredEvent);
  } catch {
    // Fail open.
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

  // Phase 25 / D-05: extract complexity_class from router decision.
  // Absent payload → legacy per_task_cap behavior (no regression).
  // Present payload with class === 'S' → skip enforcement entirely
  // (defensive: the typical S path is upstream short-circuit where
  // router never ran and this hook still applies legacy caps; an
  // explicit S signal here means a caller bypassed the upstream skip
  // and is asking us to honor the class).
  const routerDecision: RouterDecision | undefined =
    toolInput.context?.router_decision !== undefined &&
    typeof toolInput.context.router_decision === 'object' &&
    toolInput.context.router_decision !== null
      ? toolInput.context.router_decision
      : undefined;
  const complexityClass: ComplexityClass | undefined =
    routerDecision?.complexity_class !== undefined &&
    (['S', 'M', 'L', 'XL'] as const).includes(
      routerDecision.complexity_class as ComplexityClass,
    )
      ? (routerDecision.complexity_class as ComplexityClass)
      : undefined;

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

  // Phase 25 / D-05: explicit S-class short-circuit. The typical S path
  // skips the router entirely and this hook never runs at all (the
  // command's SKILL.md does the deterministic skip upstream). When we
  // DO see complexity_class === 'S' in the payload it means a caller
  // routed an S-class command through the hook anyway — honor the
  // class by skipping enforcement (no cap check, no downgrade) but
  // still write a zero-cost telemetry row + emit an 'allow' event so
  // observability stays consistent.
  if (complexityClass === 'S') {
    writeTelemetry({
      agent,
      tier:
        toolInput._tier_override ??
        toolInput._default_tier ??
        'haiku',
      tokens_in: Number(toolInput._tokens_in_est ?? 0),
      tokens_out: Number(toolInput._tokens_out_est ?? 0),
      cache_hit: false,
      est_cost_usd: Number(toolInput._est_cost_usd ?? 0),
      enforcement_mode: budget.enforcement_mode,
      _cyclePhase: cyclePhase,
    });
    emitHookFired('allow', cycle);
    const response: ToolOutput = {
      continue: true,
      suppressOutput: true,
      modified_tool_input: toolInput,
    };
    process.stdout.write(JSON.stringify(response));
    return;
  }

  // Branch B: cache short-circuit (D-05).
  if (inputHash !== null) {
    const cached = cacheLookup(agent, inputHash);
    if (cached !== null) {
      // Plan 20-14: refund one iteration-budget unit — cached answers did
      // no real work and shouldn't count against the fix-loop ceiling.
      // The refund call is fire-and-forget; failures are swallowed so
      // telemetry/iteration-budget errors never block the hook. We also
      // silence the auto-init path (refund on a fresh state file is a
      // no-op at full budget, which is what we want).
      try {
        void iterationBudget.refund(1).catch(() => { /* fail open */ });
      } catch {
        // fail open
      }
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

  // Plan 20-14: rate-guard short-circuit. Inserted AFTER the cache
  // check (cached answers bypass every network call so rate-limits are
  // irrelevant for them) and BEFORE the budget cap so a rate-limited
  // provider surfaces a clean "wait N seconds" message instead of a
  // "cap reached" one. rate-guard state is per-provider — we key on
  // 'anthropic' because every Agent spawn in this project goes through
  // the Anthropic API; future multi-provider routing would branch here
  // on toolInput._provider.
  const rateState = rateGuard.remaining('anthropic');
  if (rateState !== null && rateState.remaining <= 0) {
    const waitSeconds = Math.max(
      0,
      Math.ceil((Date.parse(rateState.resetAt) - Date.now()) / 1000),
    );
    writeTelemetry({
      agent,
      tier:
        toolInput._tier_override ??
        toolInput._default_tier ??
        'sonnet',
      tokens_in: Number(toolInput._tokens_in_est ?? 0),
      tokens_out: Number(toolInput._tokens_out_est ?? 0),
      cache_hit: false,
      est_cost_usd: Number(toolInput._est_cost_usd ?? 0),
      block_reason: 'rate_limited',
      _cyclePhase: cyclePhase,
    });
    emitHookFired('rate-limited', cycle);
    const response: ToolOutput = {
      continue: false,
      suppressOutput: false,
      message: `gdd-budget-enforcer: rate-limited on anthropic, retry in ${waitSeconds}s (resetAt=${rateState.resetAt})`,
    };
    process.stdout.write(JSON.stringify(response));
    return;
  }

  const estCost = Number(toolInput._est_cost_usd ?? 0);
  const phaseSpend = currentPhaseSpend(phase);

  // Phase 25 / D-05: per-spawn cap is class-specific when
  // complexity_class is present and class_caps_usd[class] is defined.
  // Falls back to per_task_cap_usd for backwards compatibility — when
  // no router decision is supplied, behavior is identical to pre-25.
  const perSpawnCap = resolvePerSpawnCap(budget, complexityClass);

  if (budget.enforcement_mode === 'enforce') {
    // Branch C: 100% per-spawn cap hard block (class-specific or per_task).
    if (estCost >= perSpawnCap) {
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
      const capLabel =
        complexityClass !== undefined && perSpawnCap !== budget.per_task_cap_usd
          ? `class_caps_usd.${complexityClass}`
          : 'per-task';
      const response: ToolOutput = {
        continue: false,
        suppressOutput: false,
        message: `Budget cap reached for ${capLabel}. Estimated: $${estCost.toFixed(4)}, cap: $${perSpawnCap.toFixed(2)}. Raise cap in .design/budget.json or retry after next task.`,
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
    // 80% soft-threshold downgrade (D-03): task-scoped, against the
    // resolved per-spawn cap so class-specific caps participate.
    if (
      budget.auto_downgrade_on_cap &&
      estCost >= 0.8 * perSpawnCap
    ) {
      toolInput._tier_override = 'haiku';
      toolInput._tier_downgraded = true;
    }
  } else if (budget.enforcement_mode === 'warn') {
    if (estCost >= perSpawnCap) {
      process.stderr.write(
        `gdd-budget-enforcer WARN: per-spawn cap will be exceeded ($${estCost.toFixed(4)} >= $${perSpawnCap})\n`,
      );
    }
  }
  // enforcement_mode === 'log': telemetry only.

  // D-04: tier_overrides rewrite.
  if (budget.tier_overrides[agent] !== undefined) {
    toolInput._tier_override = budget.tier_overrides[agent];
  }

  // Plan 26-05 / D-07 + D-08: resolved_models consumer path. When the
  // router decision payload carries a concrete model ID for this agent
  // under `resolved_models`, look up the cost in the per-runtime price
  // table by model ID. Otherwise fall back to the legacy tier-name
  // lookup (which still resolves through claude.md as the default
  // runtime — back-compat with v1.25.x callers).
  const resolvedModelId = budgetBackend.modelFromResolved(
    routerDecision?.resolved_models,
    agent,
  );
  const resolvedTier =
    toolInput._tier_override ?? toolInput._default_tier ?? 'sonnet';
  // Runtime tag: prefer the router's explicit `runtime` (D-08) field;
  // fall back to env-var detection; default to 'claude' since the .ts
  // hook itself only runs inside Claude Code.
  const runtimeId =
    (typeof routerDecision?.runtime === 'string' && routerDecision.runtime.length > 0
      ? routerDecision.runtime
      : runtimeDetect.detect()) ?? 'claude';

  // Compute runtime-aware cost via the shared backend. Failures return
  // null cost; we emit the event regardless so the cost-aggregator sees
  // the lookup attempt (Phase 22 events.jsonl tagging).
  const costLookup = budgetBackend.computeCost({
    model_id: resolvedModelId,
    tier: resolvedTier,
    runtime: runtimeId,
    tokens_in: Number(toolInput._tokens_in_est ?? 0),
    tokens_out: Number(toolInput._tokens_out_est ?? 0),
    cache_hit: false,
  });
  emitCostRecorded(
    {
      runtime: runtimeId,
      agent,
      model_id: resolvedModelId ?? costLookup.model,
      tier: costLookup.tier ?? resolvedTier,
      tokens_in: Number(toolInput._tokens_in_est ?? 0),
      tokens_out: Number(toolInput._tokens_out_est ?? 0),
      cost_usd: costLookup.cost_usd,
    },
    cycle,
  );

  // Branch E: standard spawn-allowed (includes tier-downgraded path).
  writeTelemetry({
    agent,
    tier: resolvedTier,
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
