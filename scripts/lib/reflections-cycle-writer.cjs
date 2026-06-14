#!/usr/bin/env node
/**
 * reflections-cycle-writer.cjs — Plan 29-03.
 *
 * Thin shim invoked by the design-reflector agent (markdown) and by
 * /hone:apply-reflections to surface capability-gap clusters in the
 * cycle markdown. The shim reads `.design/gep/events.jsonl`, calls
 * `aggregateCapabilityGaps` + `renderGapsSection` + `evaluateStageGate`
 * from `reflector-capability-gap-aggregator.cjs`, and prints the
 * resulting markdown block to stdout.
 *
 * The agent invokes this via Bash and appends stdout to the cycle
 * markdown body. Keeping the logic in a JS module (rather than inline
 * in the agent prompt) preserves test coverage in
 * `tests/reflector-capability-gap-aggregation.test.cjs`.
 *
 * Usage:
 *   node scripts/lib/reflections-cycle-writer.cjs [--chain=<p>] \
 *                                                  [--history=<path>] \
 *                                                  [--config=<path>] \
 *                                                  [--cycle=<slug>]
 *
 *   --chain=<p>     path to chain JSONL (default .design/gep/events.jsonl)
 *   --history=<p>   path to per-cycle history JSON written by prior
 *                   /hone:reflect invocations. Optional — when absent,
 *                   the gate evaluation is skipped and only the current
 *                   cycle's gaps section is emitted.
 *   --config=<p>    path to .design/config.json (default same)
 *   --cycle=<slug>  current cycle slug (used to label the entry in
 *                   history if --history is writable)
 *
 * Exit codes:
 *   0 — success (stdout is the markdown block or empty)
 *   1 — unexpected error (stderr describes)
 *
 * D-01 honored: this shim NEVER writes to .design/config.json's
 * `capability_gap_gate.stage` or `.opted_in_at`. The only timestamp it
 * may touch is `user_prompted_at` (one-time-prompt suppression), and
 * even that path is deferred to Plan 29-05 — for now this shim is
 * read-only with respect to config.
 */

'use strict';

const { readFileSync, existsSync } = require('node:fs');
const { resolve, isAbsolute } = require('node:path');

const {
  aggregateCapabilityGaps,
  renderGapsSection,
  evaluateStageGate,
  _DEFAULT_GATE_CONFIG,
} = require('./reflector-capability-gap-aggregator.cjs');

const DEFAULT_CHAIN = '.design/gep/events.jsonl';
const DEFAULT_CONFIG = '.design/config.json';

function parseArgs(argv) {
  const out = { chain: DEFAULT_CHAIN, config: DEFAULT_CONFIG, history: null, cycle: null };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--chain=')) out.chain = a.slice('--chain='.length);
    else if (a.startsWith('--history=')) out.history = a.slice('--history='.length);
    else if (a.startsWith('--config=')) out.config = a.slice('--config='.length);
    else if (a.startsWith('--cycle=')) out.cycle = a.slice('--cycle='.length);
  }
  return out;
}

function resolvePath(p, base = process.cwd()) {
  if (!p) return null;
  return isAbsolute(p) ? p : resolve(base, p);
}

function readJsonSafe(p) {
  if (!p || !existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (err) {
    process.stderr.write(`[reflections-cycle-writer] warning: malformed JSON at ${p}: ${err.message}\n`);
    return null;
  }
}

function gateConfigFromFile(configObj) {
  if (!configObj || typeof configObj !== 'object') return _DEFAULT_GATE_CONFIG;
  const gate = configObj.capability_gap_gate;
  if (!gate || typeof gate !== 'object') return _DEFAULT_GATE_CONFIG;
  return {
    K: Number.isInteger(gate.K) ? gate.K : _DEFAULT_GATE_CONFIG.K,
    M: Number.isInteger(gate.M) ? gate.M : _DEFAULT_GATE_CONFIG.M,
    stddev_threshold: typeof gate.stddev_threshold === 'number'
      ? gate.stddev_threshold : _DEFAULT_GATE_CONFIG.stddev_threshold,
  };
}

/**
 * Build the full markdown block: the current-cycle gaps section
 * (always — empty when no clusters) followed by the gate-crossed
 * prompt (only when crossed AND user has not been prompted before).
 */
function buildBlock({ clusters, gateResult, gateConfig, configObj }) {
  const parts = [];
  const gapsMd = renderGapsSection(clusters);
  if (gapsMd) parts.push(gapsMd);

  if (gateResult && gateResult.crossed) {
    const gate = (configObj && configObj.capability_gap_gate) || {};
    const alreadyPrompted = typeof gate.user_prompted_at === 'string'
      && gate.user_prompted_at.length > 0;
    if (!alreadyPrompted) {
      const idsBullets = gateResult.stable_cluster_ids
        .map((id) => `  - \`${id}\``)
        .join('\n');
      parts.push([
        '## Stage-0 → Stage-1 gate crossed — opt-in required',
        '',
        'Capability-gap detection has accumulated enough signal across recent cycles to consider enabling Stage-1 (incubator authoring of new agents / skills). The gate is informational only — **nothing has changed in the runtime**, and Stage-1 will NOT auto-enable. Per Phase 29 CONTEXT.md decision D-01, the user opts in explicitly.',
        '',
        `- Stable clusters observed: **${gateResult.stable_cluster_ids.length}** (≥K = ${gateConfig.K})`,
        `- Cycles observed: **${gateResult.cycles_observed}** (≥M = ${gateConfig.M})`,
        '- Stable cluster IDs (truncated):',
        idsBullets,
        '',
        'If you want to enable Stage-1 incubator authoring (Plans 29-04 / 29-05), opt in with the project-local command landed by Plan 29-05. You can always opt out later by deleting the timestamps from `.design/config.json` (see `reference/capability-gap-stage-gate.md` § 7).',
        '',
        '<!-- TODO: Plan 29-05 (apply-reflections extension) lands the canonical opt-in command. Until then, this prompt is informational only. -->',
        '',
      ].join('\n'));
    }
  }
  return parts.join('\n').trim();
}

function main() {
  const args = parseArgs(process.argv);
  const cwd = process.cwd();
  const chainPath = resolvePath(args.chain, cwd);
  const configPath = resolvePath(args.config, cwd);
  const historyPath = args.history ? resolvePath(args.history, cwd) : null;

  // 1. Aggregate the current cycle's capability_gap events.
  const { clusters } = aggregateCapabilityGaps(chainPath);

  // 2. Optionally evaluate the Stage-0 → Stage-1 gate against history.
  let gateResult = null;
  let gateConfig = _DEFAULT_GATE_CONFIG;
  const configObj = readJsonSafe(configPath);
  if (configObj) {
    gateConfig = gateConfigFromFile(configObj);
  }
  if (historyPath && existsSync(historyPath)) {
    const history = readJsonSafe(historyPath);
    if (Array.isArray(history)) {
      gateResult = evaluateStageGate(history, gateConfig);
    }
  }

  const block = buildBlock({ clusters, gateResult, gateConfig, configObj });
  if (block) process.stdout.write(block + '\n');
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    process.stderr.write(`[reflections-cycle-writer] fatal: ${err && err.message ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

module.exports = { parseArgs, gateConfigFromFile, buildBlock };
