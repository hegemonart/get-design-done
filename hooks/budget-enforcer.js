#!/usr/bin/env node
/**
 * budget-enforcer.js — PreToolUse hook (matcher: Agent)
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
 * Every telemetry write fires a detached child aggregator (scripts/aggregate-agent-metrics.js)
 * that rebuilds .design/agent-metrics.json incrementally.
 *
 * Hook type: PreToolUse
 * Input:  JSON on stdin { tool_name, tool_input }
 * Output: JSON on stdout { continue, suppressOutput, message, modified_tool_input? }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const BUDGET_PATH = path.join(process.cwd(), '.design', 'budget.json');
const MANIFEST_PATH = path.join(process.cwd(), '.design', 'cache-manifest.json');
const TELEMETRY_PATH = path.join(process.cwd(), '.design', 'telemetry', 'costs.jsonl');
const PHASE_TOTALS_PATH = path.join(process.cwd(), '.design', 'telemetry', 'phase-totals.json');
const STATE_PATH = path.join(process.cwd(), '.design', 'STATE.md');

// ---- budget.json loader with defaults per D-12 ----
function loadBudget() {
  const defaults = {
    per_task_cap_usd: 2.00,
    per_phase_cap_usd: 20.00,
    tier_overrides: {},
    auto_downgrade_on_cap: true,
    cache_ttl_seconds: 3600,
    enforcement_mode: 'enforce'
  };
  if (!fs.existsSync(BUDGET_PATH)) return defaults;
  try { return { ...defaults, ...JSON.parse(fs.readFileSync(BUDGET_PATH, 'utf8')) }; }
  catch { return defaults; }
}

// ---- cumulative phase spend (WR-02) ----
// Reads from the lightweight phase-totals.json written by aggregate-agent-metrics.js
// instead of replaying the full costs.jsonl on every hook invocation.
// Falls back to 0 when the file doesn't exist yet (early in a session).
function currentPhaseSpend(phase) {
  if (fs.existsSync(PHASE_TOTALS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(PHASE_TOTALS_PATH, 'utf8'));
      return Number(data.totals?.[phase] || 0);
    } catch { /* fall through */ }
  }
  // Fallback: replay JSONL when phase-totals.json not yet written (first spawn of session).
  if (!fs.existsSync(TELEMETRY_PATH)) return 0;
  const lines = fs.readFileSync(TELEMETRY_PATH, 'utf8').split(/\r?\n/).filter(Boolean);
  let sum = 0;
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (row.phase === phase) sum += Number(row.est_cost_usd || 0);
    } catch { /* tolerant */ }
  }
  return sum;
}

// ---- cycle + phase reader (STATE.md frontmatter) ----
function readCycleAndPhase() {
  const defaults = { cycle: 'unknown', phase: 'unknown' };
  if (!fs.existsSync(STATE_PATH)) return defaults;
  try {
    const content = fs.readFileSync(STATE_PATH, 'utf8');
    // Match the first frontmatter block: between opening '---' and next '---'
    const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
    const body = fm ? fm[1] : content;
    const cycleMatch = body.match(/^cycle:\s*"?([^"\n]+)"?/m);
    const phaseMatch = body.match(/^phase:\s*"?([^"\n]+)"?/m);
    return {
      cycle: cycleMatch ? cycleMatch[1].trim() : 'unknown',
      phase: phaseMatch ? phaseMatch[1].trim() : 'unknown',
    };
  } catch {
    return defaults;
  }
}

// Deprecated alias for plan 01 callers (and any other hook/script that imports this).
// Returns only the phase string; prefer readCycleAndPhase() for new code.
function currentPhase() {
  return readCycleAndPhase().phase;
}

// ---- cache short-circuit (D-05) ----
function cacheLookup(agent, inputHash) {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const entry = manifest.entries?.[`${agent}:${inputHash}`];
    if (!entry) return null;
    const age = Date.now() / 1000 - entry.ts_unix;
    if (age > (manifest.ttl_seconds || 3600)) return null;
    return entry.result;  // cached blob
  } catch { return null; }
}

// ---- tier resolution (D-04) ----
function resolveTier(agent, agentDefaultTier, overrides) {
  return overrides?.[agent] || agentDefaultTier || 'sonnet';
}

// ---- detached aggregator invocation ----
// Fire-and-forget: do not block the hook. The aggregator reads costs.jsonl tail
// and rewrites .design/agent-metrics.json atomically.
function spawnAggregator() {
  try {
    const aggregatorPath = path.join(process.cwd(), 'scripts', 'aggregate-agent-metrics.js');
    if (!fs.existsSync(aggregatorPath)) return; // script not installed — fail open
    const child = spawn('node', [aggregatorPath], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      env: { PATH: process.env.PATH },  // IN-02: minimal env; aggregator needs no secrets
    });
    child.unref();
  } catch {
    // Aggregator failures are non-fatal to the hook.
  }
}

// ---- locked-schema row builder (OPT-09) ----
function buildTelemetryRow(partial) {
  const { cycle, phase } = partial._cyclePhase || readCycleAndPhase();
  // The nine mandatory fields per OPT-09, always in this order.
  const row = {
    ts: partial.ts || new Date().toISOString(),
    agent: String(partial.agent || 'unknown'),
    tier: String(partial.tier || 'unknown'),
    tokens_in: Number(partial.tokens_in || 0),
    tokens_out: Number(partial.tokens_out || 0),
    cache_hit: Boolean(partial.cache_hit),
    est_cost_usd: Number(partial.est_cost_usd || 0),
    cycle: partial.cycle || cycle,
    phase: partial.phase || phase,
  };
  // Optional diagnostic fields (Phase 11 reflector ignores unknown fields gracefully).
  if (partial.tier_downgraded !== undefined) row.tier_downgraded = Boolean(partial.tier_downgraded);
  if (partial.enforcement_mode !== undefined) row.enforcement_mode = String(partial.enforcement_mode);
  if (partial.lazy_skipped !== undefined) row.lazy_skipped = Boolean(partial.lazy_skipped);
  if (partial.block_reason !== undefined) row.block_reason = String(partial.block_reason);
  return row;
}

// ---- telemetry writer: append one JSON row to costs.jsonl ----
function writeTelemetry(partial) {
  const dir = path.dirname(TELEMETRY_PATH);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const row = buildTelemetryRow(partial);
    fs.appendFileSync(TELEMETRY_PATH, JSON.stringify(row) + '\n', 'utf8');
    // Fire-and-forget aggregator — rebuilds .design/agent-metrics.json incrementally.
    spawnAggregator();
  } catch {
    // Fail open: telemetry must never block the hook.
  }
}

// Backward-compat alias (plan 01 called it appendTelemetry; keep it working).
const appendTelemetry = writeTelemetry;

// ---- main ----
async function main() {
  const rl = readline.createInterface({ input: process.stdin });
  let inputData = '';
  for await (const line of rl) inputData += line + '\n';

  let parsed;
  try { parsed = JSON.parse(inputData); } catch { process.exit(0); }

  if (parsed.tool_name !== 'Agent') process.exit(0);  // only guard Agent spawns

  const toolInput = parsed.tool_input || {};
  const agent = toolInput.subagent_type || toolInput.agent || 'unknown';
  const inputHash = toolInput._input_hash || null;  // supplied by orchestrator if cache-manager pre-computed it

  // Resolve cycle + phase once so every branch can stamp consistent values.
  const { cycle, phase } = readCycleAndPhase();
  const cyclePhase = { cycle, phase };

  // Branch A: lazy-gate signal from plan 10.1-04 agents (design-verifier-gate, etc.).
  // Gate agents set tool_input.lazy_skipped === true when the heuristic declines
  // to spawn the full checker. We log a zero-cost row and pass through.
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
    const response = { continue: true, suppressOutput: true };
    process.stdout.write(JSON.stringify(response));
    return;
  }

  const budget = loadBudget();

  // Branch B: cache short-circuit (D-05)
  if (inputHash) {
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
      const response = {
        continue: false,  // block the real spawn; orchestrator reads suppressOutput.message for cached blob
        suppressOutput: false,
        message: `gdd-budget-enforcer: SkippedCached — returning cached result for ${agent}:${inputHash}`,
        cached_result: cached,
      };
      process.stdout.write(JSON.stringify(response));
      return;
    }
  }

  // Layer B: cap checks (D-02)
  const estCost = Number(toolInput._est_cost_usd || 0);
  const phaseSpend = currentPhaseSpend(phase);

  if (budget.enforcement_mode === 'enforce') {
    // Branch C: 100% per_task cap (hard block)
    if (estCost >= budget.per_task_cap_usd) {
      writeTelemetry({
        agent,
        tier: toolInput._tier_override || toolInput._default_tier || 'sonnet',
        tokens_in: Number(toolInput._tokens_in_est || 0),
        tokens_out: Number(toolInput._tokens_out_est || 0),
        cache_hit: false,
        est_cost_usd: estCost,
        enforcement_mode: budget.enforcement_mode,
        block_reason: 'per_task_cap',
        _cyclePhase: cyclePhase,
      });
      const response = {
        continue: false,
        suppressOutput: false,
        message: `Budget cap reached for per-task. Estimated: $${estCost.toFixed(4)}, cap: $${budget.per_task_cap_usd.toFixed(2)}. Raise cap in .design/budget.json or retry after next task.`,
      };
      process.stdout.write(JSON.stringify(response));
      return;
    }
    // Branch D: 100% per_phase cap (hard block)
    if (phaseSpend + estCost >= budget.per_phase_cap_usd) {
      writeTelemetry({
        agent,
        tier: toolInput._tier_override || toolInput._default_tier || 'sonnet',
        tokens_in: Number(toolInput._tokens_in_est || 0),
        tokens_out: Number(toolInput._tokens_out_est || 0),
        cache_hit: false,
        est_cost_usd: estCost,
        enforcement_mode: budget.enforcement_mode,
        block_reason: 'per_phase_cap',
        _cyclePhase: cyclePhase,
      });
      const response = {
        continue: false,
        suppressOutput: false,
        message: `Budget cap reached for per-phase (${phase}). Cumulative: $${(phaseSpend + estCost).toFixed(4)}, cap: $${budget.per_phase_cap_usd.toFixed(2)}. Raise cap in .design/budget.json or retry after next phase.`,
      };
      process.stdout.write(JSON.stringify(response));
      return;
    }
    // 80% soft-threshold downgrade (D-03)
    if (budget.auto_downgrade_on_cap && (phaseSpend + estCost) >= (0.80 * budget.per_task_cap_usd)) {
      toolInput._tier_override = 'haiku';
      toolInput._tier_downgraded = true;
    }
  } else if (budget.enforcement_mode === 'warn') {
    if (estCost >= budget.per_task_cap_usd) {
      process.stderr.write(`gdd-budget-enforcer WARN: per-task cap will be exceeded ($${estCost.toFixed(4)} >= $${budget.per_task_cap_usd})\n`);
    }
  }
  // enforcement_mode === 'log': no blocking, just telemetry

  // D-04: tier_overrides rewrite
  if (budget.tier_overrides[agent]) {
    toolInput._tier_override = budget.tier_overrides[agent];
  }

  // Branch E: standard spawn-allowed (includes tier-downgraded path D-03)
  writeTelemetry({
    agent,
    tier: toolInput._tier_override || toolInput._default_tier || 'sonnet',
    tokens_in: Number(toolInput._tokens_in_est || 0),
    tokens_out: Number(toolInput._tokens_out_est || 0),
    cache_hit: false,
    est_cost_usd: estCost,
    tier_downgraded: !!toolInput._tier_downgraded,
    enforcement_mode: budget.enforcement_mode,
    _cyclePhase: cyclePhase,
  });

  const response = {
    continue: true,
    suppressOutput: true,
    modified_tool_input: toolInput
  };
  process.stdout.write(JSON.stringify(response));
}

main().catch(err => { console.error('budget-enforcer hook error:', err); process.exit(0); });
