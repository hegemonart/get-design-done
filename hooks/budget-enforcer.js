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
 *
 * Hook type: PreToolUse
 * Input:  JSON on stdin { tool_name, tool_input }
 * Output: JSON on stdout { continue, suppressOutput, message, modified_tool_input? }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BUDGET_PATH = path.join(process.cwd(), '.design', 'budget.json');
const MANIFEST_PATH = path.join(process.cwd(), '.design', 'cache-manifest.json');
const TELEMETRY_PATH = path.join(process.cwd(), '.design', 'telemetry', 'costs.jsonl');
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

// ---- cumulative phase spend from telemetry (D-02 per_phase_cap_usd check) ----
function currentPhaseSpend(phase) {
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

function currentPhase() {
  // Read .design/STATE.md phase: frontmatter field (simple regex, no yaml lib)
  if (!fs.existsSync(STATE_PATH)) return 'unknown';
  const content = fs.readFileSync(STATE_PATH, 'utf8');
  const m = content.match(/^phase:\s*"?([^"\n]+)"?/m);
  return m ? m[1].trim() : 'unknown';
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

// ---- telemetry append ----
function appendTelemetry(row) {
  const dir = path.dirname(TELEMETRY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(TELEMETRY_PATH, JSON.stringify(row) + '\n', 'utf8');
}

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

  const budget = loadBudget();
  const phase = currentPhase();

  // Layer A: cache short-circuit
  if (inputHash) {
    const cached = cacheLookup(agent, inputHash);
    if (cached !== null) {
      appendTelemetry({
        ts: new Date().toISOString(), agent, tier: 'cache',
        tokens_in: 0, tokens_out: 0, cache_hit: true,
        est_cost_usd: 0, cycle: toolInput.cycle || null, phase
      });
      const response = {
        continue: false,  // block the real spawn; orchestrator reads suppressOutput.message for cached blob
        suppressOutput: false,
        message: `gdd-budget-enforcer: SkippedCached — returning cached result for ${agent}:${inputHash}`,
        cached_result: cached
      };
      process.stdout.write(JSON.stringify(response));
      return;
    }
  }

  // Layer B: cap checks (D-02)
  const estCost = Number(toolInput._est_cost_usd || 0);
  const phaseSpend = currentPhaseSpend(phase);

  if (budget.enforcement_mode === 'enforce') {
    // 100% per_task cap (hard block)
    if (estCost >= budget.per_task_cap_usd) {
      const response = {
        continue: false, suppressOutput: false,
        message: `Budget cap reached for per-task. Estimated: $${estCost.toFixed(4)}, cap: $${budget.per_task_cap_usd.toFixed(2)}. Raise cap in .design/budget.json or retry after next task.`
      };
      process.stdout.write(JSON.stringify(response));
      return;
    }
    // 100% per_phase cap (hard block)
    if (phaseSpend + estCost >= budget.per_phase_cap_usd) {
      const response = {
        continue: false, suppressOutput: false,
        message: `Budget cap reached for per-phase (${phase}). Cumulative: $${(phaseSpend + estCost).toFixed(4)}, cap: $${budget.per_phase_cap_usd.toFixed(2)}. Raise cap in .design/budget.json or retry after next phase.`
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

  // Telemetry: log the decision
  appendTelemetry({
    ts: new Date().toISOString(),
    agent,
    tier: toolInput._tier_override || toolInput._default_tier || 'sonnet',
    tokens_in: Number(toolInput._tokens_in_est || 0),
    tokens_out: Number(toolInput._tokens_out_est || 0),
    cache_hit: false,
    est_cost_usd: estCost,
    cycle: toolInput.cycle || null,
    phase,
    tier_downgraded: !!toolInput._tier_downgraded,
    enforcement_mode: budget.enforcement_mode
  });

  const response = {
    continue: true,
    suppressOutput: true,
    modified_tool_input: toolInput
  };
  process.stdout.write(JSON.stringify(response));
}

main().catch(err => { console.error('budget-enforcer hook error:', err); process.exit(0); });
