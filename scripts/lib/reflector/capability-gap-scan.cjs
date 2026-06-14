/**
 * capability-gap-scan.cjs — reflector pattern-detection capability-gap scan
 * (Phase 29 Plan 02).
 *
 * Purpose
 * -------
 * Scans three signal sources for recurring patterns that lack a dedicated
 * executable owner (agent or skill) and emits one `capability_gap` event
 * per qualifying cluster with `source: "reflector_pattern"`:
 *
 *   1. `.design/intel/*.md` — slice files with `Touches:` clusters
 *      that recur across files without a dedicated agent owner.
 *   2. `.design/telemetry/posterior.json` — Phase 23.5 bandit posterior
 *      arms whose `count` exceeds the threshold but whose `agent` is a
 *      generic fallback rather than a specialized one.
 *   3. `.design/gep/events.jsonl` — Phase 22 typed-causal event chain
 *      slices: repeated decision sequences with no specialized owner.
 *
 * Architecture
 * ------------
 * This module is SEPARATE from the 29-01 `fast` / `router` emitter
 * surfaces. It owns the `reflector_pattern` source ONLY. The schema is
 * shipped by 29-01 in `reference/schemas/events.schema.json` (D-02
 * 7-field shape). The real emitter API is `appendChainEvent` from
 * `scripts/lib/event-chain.cjs` — 29-01 did NOT ship a separate helper
 * file (`scripts/lib/capability-gap-event.cjs` was the plan's assumed
 * path; in practice, the 29-01 emitter sections in fast/router SKILL.md
 * call `appendChainEvent` directly). This module mirrors that pattern.
 *
 * D-07: `evidence_refs[]` carry POINTERS to source slices, never
 * duplicated content. The internal `Finding.evidence_refs` shape is
 * line-based (`{path, lineStart, lineEnd, sha256}`) — ergonomic for
 * scan-side mutation detection. At emit time these are translated into
 * the schema's `TrajectoryRef` shape
 * (`{trajectory_path, byte_start, byte_end, content_hash: "sha256:..."}`).
 *
 * D-08: MCP-probe connection failures DO NOT contribute to any of the
 * three scans. The trajectory scan filters by three exclusion shapes
 * (liberal exclusion):
 *   - `outcome === 'connection-error'`
 *   - `agent === 'mcp-probe'`
 *   - `mcp_probe: true`
 *
 * D-11: Tests live at `tests/reflector-capability-gap.test.cjs` and use
 * synthetic in-tmpdir fixtures only. No live event-chain or telemetry
 * writes in CI.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

// ---------------------------------------------------------------------------
// Module constants

const DEFAULT_THRESHOLD = 3;

const GENERIC_AGENT_FALLBACKS = Object.freeze(new Set([
  'general-purpose',
  'default-executor',
  'fallback',
  'generic',
]));

const TRAJECTORY_LOOKBACK_DAYS_DEFAULT = 30;

// MCP-probe exclusion predicate (D-08).
function isMcpProbeRow(ev) {
  if (!ev || typeof ev !== 'object') return false;
  if (ev.outcome === 'connection-error') return true;
  if (ev.agent === 'mcp-probe') return true;
  if (ev.mcp_probe === true) return true;
  return false;
}

// ---------------------------------------------------------------------------
// computeContextHash — pure deterministic hash for cluster identity

/**
 * sha256 hex of JSON.stringify({touches: sorted(touches), agent_type}).
 *
 * Order-invariant on `touches`. Same input → same output across runs.
 *
 * @param {{touches: string[], agent_type: string}} signal
 * @returns {string} sha256 hex (64 chars)
 */
function computeContextHash(signal) {
  if (
    !signal ||
    typeof signal !== 'object' ||
    !Array.isArray(signal.touches) ||
    typeof signal.agent_type !== 'string'
  ) {
    throw new TypeError(
      'computeContextHash: signal must be { touches: string[], agent_type: string }',
    );
  }
  for (const t of signal.touches) {
    if (typeof t !== 'string') {
      throw new TypeError('computeContextHash: every touches entry must be a string');
    }
  }
  const normalized = {
    touches: [...signal.touches].sort((a, b) => a.localeCompare(b, 'en')),
    agent_type: signal.agent_type,
  };
  return createHash('sha256').update(JSON.stringify(normalized), 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Internal helpers: line/byte-based evidence_refs

/**
 * Build a line-based evidence_ref (the internal Finding-shape).
 *
 * sha256 algorithm: read lines [lineStart..lineEnd] (1-based inclusive),
 * join with `'\n'` (no trailing newline — stable across OSes), and sha256
 * the UTF-8 bytes.
 *
 * @param {string} absPath
 * @param {number} lineStart  1-based inclusive
 * @param {number} lineEnd    1-based inclusive
 * @param {string} repoBase   absolute base for `path.relative`
 * @returns {{path: string, lineStart: number, lineEnd: number, sha256: string}}
 */
function buildEvidenceRef(absPath, lineStart, lineEnd, repoBase) {
  const raw = fs.readFileSync(absPath, 'utf8');
  const lines = raw.split('\n');
  const sliceLines = lines.slice(lineStart - 1, lineEnd);
  const sliceText = sliceLines.join('\n');
  const sha256 = createHash('sha256').update(sliceText, 'utf8').digest('hex');
  return {
    path: path.relative(repoBase, absPath).split(path.sep).join('/'),
    lineStart,
    lineEnd,
    sha256,
  };
}

/**
 * Translate an internal line-based evidence_ref into the schema's
 * TrajectoryRef shape for emit. Byte offsets are computed by re-reading
 * the file and summing UTF-8 byte-lengths of the lines before `lineStart`
 * (inclusive offset) and through `lineEnd` (exclusive offset).
 *
 * @param {{path: string, lineStart: number, lineEnd: number, sha256: string}} ref
 * @param {string} repoBase absolute base to resolve `ref.path`
 * @returns {{trajectory_path: string, byte_start: number, byte_end: number, content_hash: string}}
 */
function lineRefToTrajectoryRef(ref, repoBase) {
  const absPath = path.resolve(repoBase, ref.path);
  let byteStart = 0;
  let byteEnd = 0;
  try {
    const raw = fs.readFileSync(absPath, 'utf8');
    const lines = raw.split('\n');
    const prefix = lines.slice(0, ref.lineStart - 1).join('\n');
    // If there is any prefix, account for the trailing newline that separates
    // it from the first slice line; if lineStart === 1, byteStart === 0.
    byteStart =
      Buffer.byteLength(prefix, 'utf8') +
      (ref.lineStart > 1 ? Buffer.byteLength('\n', 'utf8') : 0);
    const sliceText = lines.slice(ref.lineStart - 1, ref.lineEnd).join('\n');
    byteEnd = byteStart + Buffer.byteLength(sliceText, 'utf8');
  } catch {
    // Pointer survives even if the file becomes unreadable; consumers
    // re-read at validation time and detect mutation via content_hash.
    byteStart = 0;
    byteEnd = 0;
  }
  return {
    trajectory_path: ref.path,
    byte_start: byteStart,
    byte_end: byteEnd,
    content_hash: `sha256:${ref.sha256}`,
  };
}

// ---------------------------------------------------------------------------
// suggested_kind inference

/**
 * Deterministic inference rule:
 *   - >1 distinct decision-class across the matched occurrences → 'agent'
 *   - 1 decision-class repeated across occurrences              → 'skill'
 *   - tie-break: 'skill' (smaller surface, lower authoring risk)
 *
 * @param {{ distinctDecisionClasses?: number }} ctx
 * @returns {'agent' | 'skill'}
 */
function inferSuggestedKind(ctx) {
  const n = ctx && typeof ctx.distinctDecisionClasses === 'number'
    ? ctx.distinctDecisionClasses
    : 1;
  return n > 1 ? 'agent' : 'skill';
}

// ---------------------------------------------------------------------------
// scanIntelTouchesClusters

/**
 * Read every `*.md` file in `intelDir` (non-recursive), extract `Touches:`
 * clusters, group by normalized signal, and emit one Finding per cluster
 * whose occurrence count >= threshold AND whose touches set is not already
 * owned by an existing agent.
 *
 * @param {Object} input
 * @param {string} input.intelDir         Absolute path to `.design/intel/`.
 * @param {string[]} input.existingAgents Slugs of existing agents.
 * @param {number} input.threshold        Min recurrence count to flag.
 * @param {string} [input.baseDir]        Repo base for `evidence_refs.path`.
 * @returns {Finding[]}
 */
function scanIntelTouchesClusters(input) {
  const { intelDir, existingAgents = [], threshold = DEFAULT_THRESHOLD } = input || {};
  const baseDir = input.baseDir || path.dirname(path.dirname(intelDir || ''));

  if (!intelDir || !fs.existsSync(intelDir)) return [];

  const stat = fs.statSync(intelDir);
  if (!stat.isDirectory()) return [];

  // Build a lowercase token set from existing agent slugs for the
  // soft-ownership heuristic. Conservative: when in doubt, KEEP the
  // group as a candidate; the /hone:apply-reflections user gate is the
  // safety net.
  const agentTokens = new Set();
  for (const slug of existingAgents) {
    if (typeof slug !== 'string') continue;
    for (const tok of slug.toLowerCase().split(/[-_/]/)) {
      if (tok.length >= 4) agentTokens.add(tok);
    }
  }

  /** @type {Map<string, {signal: {touches: string[], agent_type: string}, occurrences: Array<{file: string, lineStart: number, lineEnd: number, decisionClass: string}>}>} */
  const groups = new Map();

  const entries = fs.readdirSync(intelDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
    const filePath = path.join(intelDir, ent.name);
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split('\n');

    let touchesLineIdx = -1;
    let touchesValue = null;
    let agentType = '';
    let decisionClass = ent.name; // default classifier
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const mTouches = /^Touches:\s*(.+)$/i.exec(line);
      if (mTouches && touchesLineIdx === -1) {
        touchesLineIdx = i;
        touchesValue = mTouches[1].trim();
      }
      const mAgent = /^Agent-Type:\s*(.+)$/i.exec(line);
      if (mAgent) {
        agentType = mAgent[1].trim();
      }
      const mDecision = /^Decision-Class:\s*(.+)$/i.exec(line);
      if (mDecision) {
        decisionClass = mDecision[1].trim();
      }
    }
    if (touchesLineIdx === -1 || !touchesValue) continue;

    const touches = touchesValue
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (touches.length === 0) continue;

    const sortedTouches = [...touches].sort((a, b) => a.localeCompare(b, 'en'));
    const signal = { touches: sortedTouches, agent_type: agentType };
    const key = computeContextHash(signal);

    if (!groups.has(key)) {
      groups.set(key, { signal, occurrences: [] });
    }
    const lineStart = touchesLineIdx + 1; // 1-based
    const lineEnd = lineStart; // single-line Touches: block
    groups.get(key).occurrences.push({
      file: filePath,
      lineStart,
      lineEnd,
      decisionClass,
    });
  }

  /** @type {Finding[]} */
  const findings = [];
  for (const [hash, group] of groups.entries()) {
    if (group.occurrences.length < threshold) continue;

    // Soft-ownership filter: if any agent slug's tokens overlap >=2 with
    // the touches tokens, drop the cluster. Otherwise keep.
    let owned = false;
    if (agentTokens.size > 0) {
      const touchTokens = new Set();
      for (const t of group.signal.touches) {
        for (const tok of t.toLowerCase().split(/[\W_]+/)) {
          if (tok.length >= 4) touchTokens.add(tok);
        }
      }
      let overlap = 0;
      for (const tok of touchTokens) {
        if (agentTokens.has(tok)) overlap += 1;
      }
      if (overlap >= 2) owned = true;
    }
    if (owned) continue;

    const evidence_refs = group.occurrences.map((occ) =>
      buildEvidenceRef(occ.file, occ.lineStart, occ.lineEnd, baseDir),
    );
    const distinctDecisionClasses = new Set(
      group.occurrences.map((o) => o.decisionClass),
    ).size;
    const suggested_kind = inferSuggestedKind({ distinctDecisionClasses });
    const top3 = group.signal.touches.slice(0, 3).join(', ');
    const intent_summary = `Recurring touches cluster: ${top3} (N=${group.occurrences.length}, no dedicated owner)`.slice(
      0,
      256,
    );

    findings.push({
      signal: group.signal,
      context_hash: hash,
      intent_summary,
      suggested_kind,
      evidence_refs,
      source_origin: 'intel',
      occurrences: group.occurrences.length,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// scanPosteriorArms

/**
 * Read `.design/telemetry/posterior.json` and flag arms where `count >=
 * threshold` AND `agent` is in `GENERIC_AGENT_FALLBACKS` (or NOT in
 * `specializedAgents` if that set is provided).
 *
 * @param {Object} input
 * @param {string} input.posteriorPath          Absolute path.
 * @param {Set<string>} [input.specializedAgents]
 * @param {number} input.threshold              Min `count` field to flag.
 * @param {string} [input.baseDir]              Repo base for evidence_refs.path.
 * @returns {Finding[]}
 */
function scanPosteriorArms(input) {
  const { posteriorPath, specializedAgents, threshold = DEFAULT_THRESHOLD } = input || {};
  const baseDir = input.baseDir || path.dirname(path.dirname(posteriorPath || ''));
  if (!posteriorPath || !fs.existsSync(posteriorPath)) return [];

  let posterior;
  try {
    posterior = JSON.parse(fs.readFileSync(posteriorPath, 'utf8'));
  } catch {
    return [];
  }
  if (!posterior || !Array.isArray(posterior.arms)) return [];

  const raw = fs.readFileSync(posteriorPath, 'utf8');
  const lineCount = raw.split('\n').length;

  /** @type {Finding[]} */
  const findings = [];
  for (const arm of posterior.arms) {
    if (!arm || typeof arm !== 'object') continue;
    if (typeof arm.count !== 'number' || arm.count < threshold) continue;

    // Generic fallback test: explicit set OR default GENERIC_AGENT_FALLBACKS.
    const isGeneric = specializedAgents
      ? !specializedAgents.has(arm.agent)
      : GENERIC_AGENT_FALLBACKS.has(arm.agent);
    if (!isGeneric) continue;

    const signal = {
      touches: [`bin:${arm.bin}`],
      agent_type: String(arm.agent || ''),
    };
    const context_hash = computeContextHash(signal);
    const intent_summary =
      `High-usage bandit arm: agent=${arm.agent}, bin=${arm.bin}, count=${arm.count} (no specialized agent)`.slice(
        0,
        256,
      );

    // evidence_refs: a single pointer covering the whole posterior file
    // (acceptable approximation per plan — 29-03 clusters by context_hash).
    const evidence_refs = [
      buildEvidenceRef(posteriorPath, 1, Math.max(1, lineCount), baseDir),
    ];

    findings.push({
      signal,
      context_hash,
      intent_summary,
      suggested_kind: 'agent', // posterior signals are multi-step orchestration
      evidence_refs,
      source_origin: 'posterior',
      occurrences: arm.count,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// scanTrajectorySlices

/**
 * Scan `.design/gep/events.jsonl` for repeated decision sequences with no
 * specialized owner. Applies D-08 MCP-probe exclusion. Filters by
 * `windowDays` lookback.
 *
 * @param {Object} input
 * @param {string} input.chainPath        Path to `.design/gep/events.jsonl`.
 * @param {number} [input.windowDays]     Lookback (default 30).
 * @param {number} input.threshold        Min repetition count.
 * @param {Set<string>} [input.specializedAgents]
 * @param {string} [input.baseDir]
 * @returns {Finding[]}
 */
function scanTrajectorySlices(input) {
  const {
    chainPath,
    windowDays = TRAJECTORY_LOOKBACK_DAYS_DEFAULT,
    threshold = DEFAULT_THRESHOLD,
    specializedAgents,
  } = input || {};
  const baseDir = input.baseDir || path.dirname(path.dirname(chainPath || ''));
  if (!chainPath || !fs.existsSync(chainPath)) return [];

  const raw = fs.readFileSync(chainPath, 'utf8');
  const lines = raw.split('\n');
  const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  /** @type {Array<{ev: Record<string,unknown>, lineNum: number}>} */
  const eligible = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    // D-08: MCP-probe exclusion (liberal).
    if (isMcpProbeRow(ev)) continue;
    // Window filter (skip if ts missing or invalid → treat as in-window).
    if (typeof ev.ts === 'string') {
      const t = Date.parse(ev.ts);
      if (!Number.isNaN(t) && t < cutoffMs) continue;
    }
    eligible.push({ ev, lineNum: i + 1 });
  }

  // Group by a sequence-signature: concatenated decision_refs + agent.
  // Each row is treated as a "sequence" for the purposes of this scan —
  // a more sophisticated parent-chain walk is out of scope for Stage-0
  // telemetry (the deterministic hash is the join key for 29-03).
  /** @type {Map<string, {signal: {touches: string[], agent_type: string}, occurrences: Array<{lineNum: number, decisionClass: string}>}>} */
  const groups = new Map();
  for (const { ev, lineNum } of eligible) {
    const decision_refs = Array.isArray(ev.decision_refs)
      ? ev.decision_refs.filter((d) => typeof d === 'string')
      : [];
    if (decision_refs.length === 0) continue;
    const agent = typeof ev.agent === 'string' ? ev.agent : '';

    // Skip if specializedAgents set is provided and this agent is in it.
    if (specializedAgents && specializedAgents.has(agent)) continue;
    // Also: if specializedAgents not provided, only skip when agent is
    // clearly a known specialized one (cheap heuristic = non-generic and
    // not the all-blank slot). Since we don't have the list, keep all.

    const signal = {
      touches: [...decision_refs].sort((a, b) => a.localeCompare(b, 'en')),
      agent_type: agent,
    };
    const key = computeContextHash(signal);
    if (!groups.has(key)) {
      groups.set(key, { signal, occurrences: [] });
    }
    groups.get(key).occurrences.push({
      lineNum,
      decisionClass: decision_refs[0],
    });
  }

  /** @type {Finding[]} */
  const findings = [];
  for (const [hash, group] of groups.entries()) {
    if (group.occurrences.length < threshold) continue;

    const evidence_refs = group.occurrences.map((occ) =>
      buildEvidenceRef(chainPath, occ.lineNum, occ.lineNum, baseDir),
    );
    const distinctDecisionClasses = new Set(
      group.occurrences.map((o) => o.decisionClass),
    ).size;
    const suggested_kind = inferSuggestedKind({ distinctDecisionClasses });
    const first = group.signal.touches[0];
    const last = group.signal.touches[group.signal.touches.length - 1];
    const middleIndicator = group.signal.touches.length > 2 ? ' → … → ' : ' → ';
    const intent_summary =
      `Repeated decision sequence: ${first}${middleIndicator}${last} (N=${group.occurrences.length})`.slice(
        0,
        256,
      );

    findings.push({
      signal: group.signal,
      context_hash: hash,
      intent_summary,
      suggested_kind,
      evidence_refs,
      source_origin: 'trajectory',
      occurrences: group.occurrences.length,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Default emitter — late-bound via opts.emit so tests inject a spy

/**
 * Default emitter that calls `appendChainEvent` from
 * `scripts/lib/event-chain.cjs` with the schema-compliant envelope shape
 * (matches the pattern used by 29-01's fast / router SKILL.md emitter
 * sections). Returns the assigned `event_id`.
 *
 * The emitter accepts the SCAN-shape input (with internal `evidence_refs`
 * line-based refs) and translates them into the schema's `TrajectoryRef`
 * shape before persisting.
 *
 * @param {Object} input
 * @param {'fast'|'router'|'reflector_pattern'} input.source
 * @param {string} input.context_hash
 * @param {string} input.intent_summary
 * @param {'agent'|'skill'} input.suggested_kind
 * @param {Array<{path:string,lineStart:number,lineEnd:number,sha256:string}>} input.evidence_refs
 * @param {string|null} [input.parent_event_id]
 * @param {string} [input.baseDir]
 * @param {string} [input.chainPath]
 * @returns {string} event_id
 */
function defaultEmitCapabilityGapEvent(input) {
  const { appendChainEvent } = require('../event-chain.cjs');
  const baseDir = input.baseDir || process.cwd();

  const trajectoryRefs = (input.evidence_refs || []).map((ref) =>
    lineRefToTrajectoryRef(ref, baseDir),
  );

  const event_id = randomUUID();
  const payload = {
    event_id,
    parent_event_id: input.parent_event_id ?? null,
    source: input.source,
    context_hash: input.context_hash,
    intent_summary: input.intent_summary,
    suggested_kind: input.suggested_kind,
    evidence_refs: trajectoryRefs,
  };

  appendChainEvent({
    path: input.chainPath,
    baseDir,
    agent: 'design-reflector',
    outcome: 'capability_gap',
    type: 'capability_gap',
    timestamp: new Date().toISOString(),
    sessionId: process.env.GDD_SESSION_ID || `reflector-${event_id.slice(0, 8)}`,
    payload,
  });

  return event_id;
}

// ---------------------------------------------------------------------------
// runCapabilityGapScan — orchestrator

/**
 * Orchestrator. Runs the three scans, concatenates findings, and emits
 * one capability_gap event per finding via the provided (or default)
 * emitter.
 *
 * Threshold resolution:
 *   1. opts.threshold (test-injection / CLI override)
 *   2. `.design/config.json` → `reflector.capability_gap_threshold`
 *   3. DEFAULT_THRESHOLD (= 3)
 *
 * Throws if the resolved threshold is non-integer or < 1.
 *
 * @param {Object} [opts]
 * @param {string} [opts.baseDir]
 * @param {number} [opts.threshold]
 * @param {Function} [opts.emit]
 * @param {string} [opts.chainPath]
 * @returns {{findings: Finding[], emittedEventIds: string[], skippedBelowThreshold: number}}
 */
function runCapabilityGapScan(opts = {}) {
  const baseDir = opts.baseDir || process.cwd();

  let configThreshold;
  const configPath = path.join(baseDir, '.design', 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (
        cfg &&
        cfg.reflector &&
        Object.prototype.hasOwnProperty.call(cfg.reflector, 'capability_gap_threshold')
      ) {
        configThreshold = cfg.reflector.capability_gap_threshold;
      }
    } catch {
      // Ignore malformed config; fall through to default.
    }
  }

  const resolvedThreshold = opts.threshold !== undefined
    ? opts.threshold
    : configThreshold !== undefined
      ? configThreshold
      : DEFAULT_THRESHOLD;

  if (!Number.isInteger(resolvedThreshold) || resolvedThreshold < 1) {
    throw new TypeError(
      `runCapabilityGapScan: threshold must be an integer >= 1, got ${JSON.stringify(resolvedThreshold)}`,
    );
  }

  // Build existingAgents set by reading agents/*.md frontmatter `name` fields.
  const existingAgents = [];
  const agentsDir = path.join(baseDir, 'agents');
  if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
    for (const ent of fs.readdirSync(agentsDir, { withFileTypes: true })) {
      if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
      try {
        const raw = fs.readFileSync(path.join(agentsDir, ent.name), 'utf8');
        const m = /^name:\s*(.+)$/m.exec(raw);
        if (m) existingAgents.push(m[1].trim());
      } catch {
        /* skip unreadable */
      }
    }
  }
  const specializedAgents = new Set(
    existingAgents.filter((slug) => !GENERIC_AGENT_FALLBACKS.has(slug)),
  );

  const intelDir = path.join(baseDir, '.design', 'intel');
  const posteriorPath = path.join(baseDir, '.design', 'telemetry', 'posterior.json');
  const chainPath = opts.chainPath || path.join(baseDir, '.design', 'gep', 'events.jsonl');

  const intelFindings = scanIntelTouchesClusters({
    intelDir,
    existingAgents,
    threshold: resolvedThreshold,
    baseDir,
  });

  const posteriorFindings = scanPosteriorArms({
    posteriorPath,
    specializedAgents,
    threshold: resolvedThreshold,
    baseDir,
  });

  const trajectoryFindings = scanTrajectorySlices({
    chainPath,
    windowDays: TRAJECTORY_LOOKBACK_DAYS_DEFAULT,
    threshold: resolvedThreshold,
    specializedAgents,
    baseDir,
  });

  const findings = [...intelFindings, ...posteriorFindings, ...trajectoryFindings];

  // Late-bind emitter — tests inject; production omits.
  const emit = opts.emit || defaultEmitCapabilityGapEvent;
  const emittedEventIds = [];
  for (const f of findings) {
    const id = emit({
      source: 'reflector_pattern',
      context_hash: f.context_hash,
      intent_summary: f.intent_summary,
      suggested_kind: f.suggested_kind,
      evidence_refs: f.evidence_refs,
      baseDir,
      chainPath: opts.chainPath,
    });
    if (typeof id === 'string') emittedEventIds.push(id);
  }

  // skippedBelowThreshold is best-effort — the individual scanners filter
  // internally; surface 0 here (the gate is exposed to operators via the
  // threshold knob; per-cluster skip counts are not currently surfaced).
  return { findings, emittedEventIds, skippedBelowThreshold: 0 };
}

// ---------------------------------------------------------------------------
// CLI dry-run

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const result = runCapabilityGapScan({
    emit: dryRun ? () => 'DRY-RUN-NOT-EMITTED' : undefined,
  });
  if (dryRun) {
    process.stdout.write(
      JSON.stringify({ findings: result.findings, mode: 'dry-run' }, null, 2) + '\n',
    );
  } else {
    process.stdout.write(
      `emitted ${result.emittedEventIds.length} capability_gap event(s); ` +
        `skipped ${result.skippedBelowThreshold} below threshold\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// Exports

module.exports = {
  DEFAULT_THRESHOLD,
  GENERIC_AGENT_FALLBACKS,
  TRAJECTORY_LOOKBACK_DAYS_DEFAULT,
  computeContextHash,
  scanIntelTouchesClusters,
  scanPosteriorArms,
  scanTrajectorySlices,
  runCapabilityGapScan,
  // Internal helpers exported for whitebox testing.
  lineRefToTrajectoryRef,
  isMcpProbeRow,
  inferSuggestedKind,
  defaultEmitCapabilityGapEvent,
};
