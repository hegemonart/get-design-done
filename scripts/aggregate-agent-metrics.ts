#!/usr/bin/env node
/**
 * aggregate-agent-metrics.ts — Incremental per-agent aggregator.
 *
 * Reads: .design/telemetry/costs.jsonl (append-only ledger from
 *        hooks/budget-enforcer.js)
 *        agents/{agent}.md (frontmatter source for default-tier, parallel-safe,
 *        reads-only, typical-duration-seconds)
 * Writes: .design/agent-metrics.json (atomic overwrite via tmp-file + rename)
 *         .design/telemetry/phase-totals.json (same, WR-02)
 *
 * Invoked:
 *   1. Detached child of hooks/budget-enforcer.js after every telemetry write.
 *   2. Directly by /gdd:optimize skill as an explicit refresh step.
 *   3. Manually: `node --experimental-strip-types scripts/aggregate-agent-metrics.ts`
 *   4. With `--help` to print usage (used by the Plan 20-00 smoke check).
 *
 * OPT-09 contract: fields must match Phase 11 reflector's expectations.
 *
 * Converted from scripts/aggregate-agent-metrics.js in Plan 20-00 (Tier-1).
 * Behavior preserved verbatim.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';

// Generated-type import (unused at runtime, erased by strip-types) to satisfy
// Plan 20-00's requirement that every Tier-1 TS file participates in the
// codegen graph. We pick AuthoritySnapshotSchema as a stable anchor and
// re-export for downstream callers.
import type { AuthoritySnapshotSchema } from '../reference/schemas/generated.js';
export type { AuthoritySnapshotSchema };

const CWD: string = process.cwd();
const TELEMETRY_PATH: string = join(CWD, '.design', 'telemetry', 'costs.jsonl');
const METRICS_PATH: string = join(CWD, '.design', 'agent-metrics.json');
const PHASE_TOTALS_PATH: string = join(CWD, '.design', 'telemetry', 'phase-totals.json');
const AGENTS_DIR: string = join(CWD, 'agents');

/**
 * Subset of the agent-markdown frontmatter we care about. `null` means the
 * field is absent or unparseable (aggregator is tolerant — degraded mode
 * preferred over hard-fail per OPT-09).
 */
interface AgentFrontmatter {
  default_tier: string | null;
  parallel_safe: boolean | null;
  reads_only: boolean | null;
  typical_duration_seconds: number | null;
}

/** ---- frontmatter reader (no YAML dep) ---- */
function readAgentFrontmatter(agentName: string): Partial<AgentFrontmatter> {
  const p: string = join(AGENTS_DIR, `${agentName}.md`);
  if (!existsSync(p)) return {};
  try {
    const content: string = readFileSync(p, 'utf8');
    const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fm) return {};
    const body: string = fm[1] ?? '';
    const get = (key: string): string | null => {
      const m = body.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?`, 'm'));
      return m && m[1] !== undefined ? m[1].trim() : null;
    };
    const defaultTier: string | null = get('default-tier');
    const parallelSafe: string | null = get('parallel-safe');
    const readsOnly: string | null = get('reads-only');
    const typicalDuration: string | null = get('typical-duration-seconds');
    return {
      default_tier: defaultTier ?? null,
      parallel_safe: parallelSafe === null ? null : /^(true|yes)$/i.test(parallelSafe),
      reads_only: readsOnly === null ? null : /^(true|yes)$/i.test(readsOnly),
      typical_duration_seconds:
        typicalDuration === null ? null : Number(typicalDuration) || null,
    };
  } catch {
    return {};
  }
}

/**
 * Shape of a single row in .design/telemetry/costs.jsonl. Mirrors the OPT-09
 * schema: nine mandatory fields + four optional diagnostic fields. Unknown
 * keys are tolerated (Phase 11 reflector ignores them).
 */
export interface CostRow {
  ts?: string;
  agent?: string;
  tier?: string;
  tokens_in?: number | string;
  tokens_out?: number | string;
  cache_hit?: boolean;
  est_cost_usd?: number | string;
  cycle?: string;
  phase?: string;
  // Optional / diagnostic
  tier_downgraded?: boolean;
  enforcement_mode?: string;
  lazy_skipped?: boolean;
  block_reason?: string;
}

/** ---- telemetry reader ---- */
function readTelemetryRows(): CostRow[] {
  if (!existsSync(TELEMETRY_PATH)) return [];
  const raw: string = readFileSync(TELEMETRY_PATH, 'utf8');
  const out: CostRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as CostRow);
    } catch {
      // tolerant: skip malformed lines (partial write, truncation)
    }
  }
  return out;
}

/** Per-agent roll-up accumulator. */
interface AgentAccumulator {
  total_spawns: number;
  total_cost_usd: number;
  total_tokens_in: number;
  total_tokens_out: number;
  cache_hits: number;
  lazy_skips: number;
}

/** Final per-agent shape written to .design/agent-metrics.json. */
export interface AgentMetrics {
  typical_duration_seconds: number | null | undefined;
  default_tier: string | null | undefined;
  parallel_safe: boolean | null | undefined;
  reads_only: boolean | null | undefined;
  total_spawns: number;
  total_cost_usd: number;
  total_tokens_in: number;
  total_tokens_out: number;
  cache_hit_rate: number;
  lazy_skip_rate: number;
}

/** ---- aggregator ---- */
function aggregate(rows: readonly CostRow[]): Record<string, AgentMetrics> {
  const byAgent = new Map<string, AgentAccumulator>();
  for (const r of rows) {
    // Blocked rows represent a spawn that was denied at the hook — the agent
    // never actually ran, so it must not contribute to spawn counts, cost, or
    // token totals. Skip them here (mirror of the filter in aggregateByPhase).
    if (r.block_reason) continue;
    const agent: string = r.agent ?? 'unknown';
    let a = byAgent.get(agent);
    if (!a) {
      a = {
        total_spawns: 0,
        total_cost_usd: 0,
        total_tokens_in: 0,
        total_tokens_out: 0,
        cache_hits: 0,
        lazy_skips: 0,
      };
      byAgent.set(agent, a);
    }
    a.total_spawns += 1;
    a.total_cost_usd += Number(r.est_cost_usd ?? 0);
    a.total_tokens_in += Number(r.tokens_in ?? 0);
    a.total_tokens_out += Number(r.tokens_out ?? 0);
    if (r.cache_hit === true) a.cache_hits += 1;
    if (r.lazy_skipped === true) a.lazy_skips += 1;
  }

  const out: Record<string, AgentMetrics> = {};
  for (const [agent, a] of byAgent.entries()) {
    const fm = readAgentFrontmatter(agent);
    const spawns: number = a.total_spawns || 1; // guard div-by-zero
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

/** ---- atomic write ---- */
function writeAtomic(filePath: string, content: string): void {
  const dir: string = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp: string = join(
    dir,
    `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}

/** ---- phase totals aggregator (WR-02: avoids full JSONL replay in budget enforcer) ---- */
function aggregateByPhase(rows: readonly CostRow[]): Record<string, number> {
  const byPhase: Record<string, number> = {};
  for (const r of rows) {
    // Blocked rows represent spawns that were denied by the hook — the agent
    // never ran, so their est_cost_usd must not inflate cumulative phase spend.
    // Counting them would make future hard-block and soft-threshold checks
    // stricter than intended on every repeat cap hit.
    if (r.block_reason) continue;
    const phase: string = r.phase ?? 'unknown';
    byPhase[phase] = (byPhase[phase] ?? 0) + Number(r.est_cost_usd ?? 0);
  }
  // Round to 6dp to match per-agent precision
  for (const k of Object.keys(byPhase)) {
    const v: number = byPhase[k] ?? 0;
    byPhase[k] = Number(v.toFixed(6));
  }
  return byPhase;
}

/** ---- usage / --help ---- */
function printHelp(): void {
  console.log(
    `aggregate-agent-metrics.ts — Aggregate per-agent telemetry from .design/telemetry/costs.jsonl.\n` +
      `\n` +
      `Usage:\n` +
      `  node --experimental-strip-types scripts/aggregate-agent-metrics.ts\n` +
      `  node --experimental-strip-types scripts/aggregate-agent-metrics.ts --help\n` +
      `\n` +
      `Reads:  .design/telemetry/costs.jsonl\n` +
      `        agents/<agent>.md (frontmatter)\n` +
      `Writes: .design/agent-metrics.json\n` +
      `        .design/telemetry/phase-totals.json\n` +
      `\n` +
      `Invoked:\n` +
      `  - Detached child of hooks/budget-enforcer.js after every telemetry row.\n` +
      `  - Directly by /gdd:optimize as an explicit refresh step.\n` +
      `  - Manually, on demand.\n`,
  );
}

/** ---- main ---- */
function main(): void {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const rows: CostRow[] = readTelemetryRows();
  const agents = aggregate(rows);
  const payload = {
    generated_at: new Date().toISOString(),
    agents,
  };
  writeAtomic(METRICS_PATH, JSON.stringify(payload, null, 2) + '\n');
  // Write lightweight phase-totals.json so budget-enforcer can read phase
  // spend in O(1) without replaying the full JSONL on every agent spawn
  // (WR-02).
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
  const msg: string = err instanceof Error ? err.message : String(err);
  process.stderr.write(`aggregate-agent-metrics: ${msg}\n`);
  process.exit(0);
}
