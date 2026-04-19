#!/usr/bin/env node
/**
 * aggregate-agent-metrics.js — Incremental per-agent aggregator.
 *
 * Reads: .design/telemetry/costs.jsonl (append-only ledger from hooks/budget-enforcer.js)
 *        agents/{agent}.md (frontmatter source for default-tier, parallel-safe, reads-only,
 *        typical-duration-seconds)
 * Writes: .design/agent-metrics.json (atomic overwrite via tmp-file + rename)
 *
 * Invoked:
 *   1. Detached child of hooks/budget-enforcer.js after every telemetry write.
 *   2. Directly by /gdd:optimize skill as an explicit refresh step.
 *   3. Manually: `node scripts/aggregate-agent-metrics.js`
 *
 * OPT-09 contract: fields must match Phase 11 reflector's expectations
 * (see .planning/phases/11-self-improvement/11-02-PLAN.md).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CWD = process.cwd();
const TELEMETRY_PATH = path.join(CWD, '.design', 'telemetry', 'costs.jsonl');
const METRICS_PATH = path.join(CWD, '.design', 'agent-metrics.json');
const PHASE_TOTALS_PATH = path.join(CWD, '.design', 'telemetry', 'phase-totals.json');
const AGENTS_DIR = path.join(CWD, 'agents');

// ---- frontmatter reader (no YAML dep) ----
function readAgentFrontmatter(agentName) {
  const p = path.join(AGENTS_DIR, `${agentName}.md`);
  if (!fs.existsSync(p)) return {};
  try {
    const content = fs.readFileSync(p, 'utf8');
    const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fm) return {};
    const body = fm[1];
    const get = (key) => {
      const m = body.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?`, 'm'));
      return m ? m[1].trim() : null;
    };
    const defaultTier = get('default-tier');
    const parallelSafe = get('parallel-safe');
    const readsOnly = get('reads-only');
    const typicalDuration = get('typical-duration-seconds');
    return {
      default_tier: defaultTier || null,
      parallel_safe: parallelSafe === null ? null : /^(true|yes)$/i.test(parallelSafe),
      reads_only: readsOnly === null ? null : /^(true|yes)$/i.test(readsOnly),
      typical_duration_seconds: typicalDuration === null ? null : Number(typicalDuration) || null,
    };
  } catch {
    return {};
  }
}

// ---- telemetry reader ----
function readTelemetryRows() {
  if (!fs.existsSync(TELEMETRY_PATH)) return [];
  const raw = fs.readFileSync(TELEMETRY_PATH, 'utf8');
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // tolerant: skip malformed lines (partial write, truncation)
    }
  }
  return out;
}

// ---- aggregator ----
function aggregate(rows) {
  const byAgent = new Map();
  for (const r of rows) {
    const agent = r.agent || 'unknown';
    if (!byAgent.has(agent)) {
      byAgent.set(agent, {
        total_spawns: 0,
        total_cost_usd: 0,
        total_tokens_in: 0,
        total_tokens_out: 0,
        cache_hits: 0,
        lazy_skips: 0,
      });
    }
    const a = byAgent.get(agent);
    a.total_spawns += 1;
    a.total_cost_usd += Number(r.est_cost_usd || 0);
    a.total_tokens_in += Number(r.tokens_in || 0);
    a.total_tokens_out += Number(r.tokens_out || 0);
    if (r.cache_hit === true) a.cache_hits += 1;
    if (r.lazy_skipped === true) a.lazy_skips += 1;
  }

  const out = {};
  for (const [agent, a] of byAgent.entries()) {
    const fm = readAgentFrontmatter(agent);
    const spawns = a.total_spawns || 1; // guard div-by-zero
    out[agent] = {
      typical_duration_seconds: fm.typical_duration_seconds,
      default_tier: fm.default_tier,
      parallel_safe: fm.parallel_safe,
      reads_only: fm.reads_only,
      total_spawns: a.total_spawns,
      total_cost_usd: Number(a.total_cost_usd.toFixed(6)),
      total_tokens_in: a.total_tokens_in,
      total_tokens_out: a.total_tokens_out,
      cache_hit_rate: Number((a.cache_hits / spawns).toFixed(4)),
      lazy_skip_rate: Number((a.lazy_skips / spawns).toFixed(4)),
    };
  }
  return out;
}

// ---- atomic write ----
function writeAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

// ---- phase totals aggregator (WR-02: avoids full JSONL replay in budget enforcer) ----
function aggregateByPhase(rows) {
  const byPhase = {};
  for (const r of rows) {
    const phase = r.phase || 'unknown';
    byPhase[phase] = (byPhase[phase] || 0) + Number(r.est_cost_usd || 0);
  }
  // Round to 6dp to match per-agent precision
  for (const k of Object.keys(byPhase)) byPhase[k] = Number(byPhase[k].toFixed(6));
  return byPhase;
}

// ---- main ----
function main() {
  const rows = readTelemetryRows();
  const agents = aggregate(rows);
  const payload = {
    generated_at: new Date().toISOString(),
    agents,
  };
  writeAtomic(METRICS_PATH, JSON.stringify(payload, null, 2) + '\n');
  // Write lightweight phase-totals.json so budget-enforcer can read phase spend
  // in O(1) without replaying the full JSONL on every agent spawn (WR-02).
  const phaseTotals = {
    generated_at: new Date().toISOString(),
    totals: aggregateByPhase(rows),
  };
  writeAtomic(PHASE_TOTALS_PATH, JSON.stringify(phaseTotals, null, 2) + '\n');
}

try {
  main();
} catch (err) {
  // Fail open: aggregator must never block the hook or /gdd:optimize flow.
  process.stderr.write(`aggregate-agent-metrics: ${err.message}\n`);
  process.exit(0);
}
