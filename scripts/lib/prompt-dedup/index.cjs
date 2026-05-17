/**
 * scripts/lib/prompt-dedup/index.cjs — Plan 27.6-06
 *
 * Phase 27.6 D-11 prompt-deduplication analyzer. Detects cases where
 * >= 3 distinct agents in the same cycle read the same reference/*.md
 * file. Produces a preamble injection that gets prepended to the
 * Phase 14.5 retrieval-contract preamble during cycle execution.
 *
 * v1.27.6 ships the analyzer + injection text builder. The event-
 * emission side-effect is wired here for downstream consumers. The
 * actual `reference.read` event emission from agent-read paths is
 * deferred to a follow-up phase (this library is ready to consume
 * those events when they exist).
 *
 * No external deps. Pure analyzer + lazy event-stream require.
 */
'use strict';

const DEFAULT_THRESHOLD = 3;  // D-11 — '>= 3 agents'

/**
 * Lazy require for the event-stream appendEvent helper. Returns a
 * no-op if event-stream is unavailable so emitDedupInjection can be
 * called in tests / Codex no-PreCompact paths without throwing.
 *
 * @returns {(ev: object) => void}
 */
function getAppendEvent() {
  try {
    const m = require('../event-stream');
    if (m && typeof m.appendEvent === 'function') return m.appendEvent;
  } catch { /* swallow — event-stream not on path */ }
  return function noopAppend(_ev) {};
}

/**
 * Detect reference/*.md files that have been read by >= threshold
 * distinct agents in the same cycle. The detection is pure — it
 * consumes an in-memory events array and returns a structured result.
 *
 * @param {object} [opts]
 * @param {Array<object>} [opts.events]   Event-stream entries (any shape)
 * @param {number} [opts.threshold]       Override DEFAULT_THRESHOLD (3)
 * @param {string} [opts.cycle]           Filter — only consider events
 *                                        whose event.cycle === this value
 * @returns {{duplicates: Array<{ref_path: string, agents: string[], hash?: string, cycle?: string}>}}
 */
function detectDuplicateReferenceReads({ events, threshold, cycle } = {}) {
  const list = Array.isArray(events) ? events : [];
  const N = typeof threshold === 'number' && threshold >= 1
    ? Math.floor(threshold)
    : DEFAULT_THRESHOLD;
  const cycleFilter = typeof cycle === 'string' && cycle.length > 0 ? cycle : null;

  // Group by (cycle, ref_path) → Set<agent>
  const groups = new Map();
  for (const ev of list) {
    if (!ev || ev.type !== 'reference.read') continue;
    if (!ev.payload || typeof ev.payload.ref_path !== 'string' || typeof ev.payload.agent !== 'string') continue;
    const evCycle = typeof ev.cycle === 'string'
      ? ev.cycle
      : (typeof ev.payload.cycle === 'string' ? ev.payload.cycle : '');
    if (cycleFilter !== null && evCycle !== cycleFilter) continue;
    const key = evCycle + ' ' + ev.payload.ref_path;
    let group = groups.get(key);
    if (!group) {
      group = { cycle: evCycle, ref_path: ev.payload.ref_path, agents: new Set(), hash: undefined };
      groups.set(key, group);
    }
    group.agents.add(ev.payload.agent);
    if (typeof ev.payload.content_hash === 'string' && !group.hash) {
      group.hash = ev.payload.content_hash;
    }
  }

  const duplicates = [];
  for (const group of groups.values()) {
    if (group.agents.size >= N) {
      duplicates.push({
        ref_path: group.ref_path,
        agents: [...group.agents].sort(),
        hash: group.hash,
        cycle: group.cycle || undefined,
      });
    }
  }
  duplicates.sort((a, b) => a.ref_path.localeCompare(b.ref_path));
  return { duplicates };
}

/**
 * Build the markdown preamble injection text that gets prepended to
 * the Phase 14.5 retrieval-contract preamble during cycle execution.
 * Returns an empty string when duplicates is empty (no injection).
 *
 * @param {object} [opts]
 * @param {Array<object>} [opts.duplicates]  From detectDuplicateReferenceReads
 * @param {string}        [opts.sessionId]   Optional breadcrumb
 * @returns {string}
 */
function buildPreambleInjection({ duplicates, sessionId } = {}) {
  const list = Array.isArray(duplicates) ? duplicates : [];
  if (list.length === 0) return '';
  const lines = [
    '## Shared Context (Phase 27.6 dedup)',
    '',
    'The following reference files have been read by >= 3 agents in this cycle and are now loaded ONCE as shared context. Subsequent agents see a content-hash reference instead of the full file body:',
    '',
  ];
  for (const d of list) {
    const hashSuffix = d.hash ? ` [hash: ${d.hash}]` : '';
    lines.push(`- \`${d.ref_path}\` (read by: ${d.agents.join(', ')})${hashSuffix}`);
  }
  lines.push('');
  lines.push('To opt out of dedup for a specific read, set `GDD_DEDUP_OPT_OUT=1` in the agent\'s environment.');
  lines.push('');
  // sessionId is consumed as a breadcrumb hint; not embedded in the
  // preamble text by default to keep the markdown minimal.
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    lines.push(`<!-- dedup-session: ${sessionId} -->`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Emit one `dedup.injection` event per duplicate via the event-stream
 * appendEvent helper. Lazy-required; safe when event-stream is
 * unavailable (no-op fallback). Returns void.
 *
 * @param {object} [opts]
 * @param {Array<object>} [opts.duplicates]
 * @param {string}        [opts.sessionId]
 * @returns {void}
 */
function emitDedupInjection({ duplicates, sessionId } = {}) {
  const list = Array.isArray(duplicates) ? duplicates : [];
  if (list.length === 0) return;
  const append = getAppendEvent();
  for (const d of list) {
    append({
      type: 'dedup.injection',
      timestamp: new Date().toISOString(),
      sessionId: typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : 'prompt-dedup',
      payload: {
        ref_path: d.ref_path,
        agents: d.agents,
        agent_count: d.agents.length,
        content_hash: d.hash,
        cycle: d.cycle,
      },
    });
  }
}

module.exports = {
  detectDuplicateReferenceReads,
  buildPreambleInjection,
  emitDedupInjection,
  DEFAULT_THRESHOLD,
};
