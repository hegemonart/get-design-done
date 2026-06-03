'use strict';
/**
 * scripts/lib/state/render-markdown.cjs - Phase 57 (SQL-03).
 *
 * renderStateMarkdown(db, cycle_id, sdk) -> string   [SYNCHRONOUS]
 *
 * Reconstructs the exact ParseResult that parse(originalStateMd) would yield,
 * from SQLite rows, then delegates to sdk.serialize(state, fidelity).
 * This makes byte-equality with SDK canonical form guaranteed by construction.
 *
 * sdk = { serialize, parse } -- INJECTED, no internal dynamic import.
 * All callers (state-store, tests) load the SDK asynchronously before calling
 * this function, then pass it in. Nothing async inside this function or the
 * transaction it is called from.
 *
 * Structured blocks (position/decisions/must_haves/blockers): reconstructed
 * from their structured tables with raw_line fidelity (reparse-compare logic
 * mirrors mutator.ts).
 *
 * Unstructured blocks (connections/timestamps/parallelism_decision/todos/
 * prototyping/quality_gate): round-tripped verbatim from _block_meta.raw_body.
 * If raw_body is stored, the block is emitted with its raw body verbatim.
 * If not stored and no structured data, the block is omitted.
 *
 * Contract:
 *   - renderStateMarkdown(null, ...) throws TypeError.
 *   - renderStateMarkdown(undefined, ...) throws TypeError.
 *   - renderStateMarkdown(db, cycle_id, null) or missing sdk: throws TypeError.
 *   - Missing cycle_id row: throws Error.
 *
 * Optional additive views (derived markdown, not round-trip-critical):
 *   renderDecisionLog(db, cycle_id) -> string  [returns Promise for compat]
 *   renderBlockers(db, cycle_id)    -> string  [returns Promise for compat]
 */

const path = require('node:path');
const fs = require('node:fs');

// ---------------------------------------------------------------------------
// BLOCK_ORDER (mirrored from parser.ts - canonical serialization order).
// ---------------------------------------------------------------------------
const BLOCK_ORDER = [
  'position',
  'decisions',
  'must_haves',
  'prototyping',
  'quality_gate',
  'connections',
  'blockers',
  'parallelism_decision',
  'todos',
  'timestamps',
];

// ---------------------------------------------------------------------------
// Canonical emitters (fallback when raw_line is absent or re-parse drifted).
// These mirror mutator.ts canonical forms exactly.
// ---------------------------------------------------------------------------

/** @param {string} v */
function quoteIfEmpty(v) {
  return v === '' ? '""' : v;
}

/**
 * Canonical position block body.
 * @param {{stage:string, wave:number|string, task_progress:string, status:string,
 *          handoff_source:string, handoff_path:string, skipped_stages:string}} pos
 */
function canonicalPosition(pos) {
  return [
    `stage: ${pos.stage}`,
    `wave: ${pos.wave}`,
    `task_progress: ${pos.task_progress}`,
    `status: ${pos.status}`,
    `handoff_source: ${quoteIfEmpty(pos.handoff_source || '')}`,
    `handoff_path: ${quoteIfEmpty(pos.handoff_path || '')}`,
    `skipped_stages: ${quoteIfEmpty(pos.skipped_stages || '')}`,
  ].join('\n');
}

/**
 * Canonical single decision line.
 * @param {{id:string, text:string, status:string}} d
 */
function canonicalDecision(d) {
  return `${d.id}: ${d.text} (${d.status})`;
}

/**
 * Canonical single must_have line.
 * @param {{id:string, text:string, status:string}} m
 */
function canonicalMustHave(m) {
  return `${m.id}: ${m.text} | status: ${m.status}`;
}

/**
 * Canonical single blocker line.
 * @param {{stage:string, date:string, text:string}} b
 */
function canonicalBlocker(b) {
  return `[${b.stage}] [${b.date}]: ${b.text}`;
}

// ---------------------------------------------------------------------------
// tryReparse* helpers (mirror mutator.ts semantic-compare logic).
// Return the typed value if raw_line parses cleanly, else null.
// ---------------------------------------------------------------------------

/**
 * Re-parse a single position raw_body string.
 * Returns a Position-like object or null.
 * @param {string} raw
 */
function tryReparsePosition(raw) {
  try {
    const fields = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('<!--')) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      fields[key] = value;
    }
    const waveNum = Number(fields['wave'] ?? '1');
    if (!Number.isFinite(waveNum)) return null;
    return {
      stage: fields['stage'] ?? '',
      wave: waveNum,
      task_progress: fields['task_progress'] ?? '0/0',
      status: fields['status'] ?? 'initialized',
      handoff_source: fields['handoff_source'] ?? '',
      handoff_path: fields['handoff_path'] ?? '',
      skipped_stages: fields['skipped_stages'] ?? '',
    };
  } catch {
    return null;
  }
}

/**
 * Re-parse a single decision raw_line.
 * Returns {id,text,status} or null.
 * @param {string} raw
 */
function tryReparseDecisionLine(raw) {
  try {
    const re = /^(D-\d+):\s*(.*?)\s*\((locked|tentative)\)\s*$/;
    const t = raw.trim();
    if (!t || t.startsWith('<!--')) return null;
    const m = t.match(re);
    if (!m) return null;
    return { id: m[1] ?? '', text: m[2] ?? '', status: m[3] ?? '' };
  } catch {
    return null;
  }
}

/**
 * Re-parse a single must_have raw_line.
 * Returns {id,text,status} or null.
 * @param {string} raw
 */
function tryReparseMustHaveLine(raw) {
  try {
    const re = /^(M-\d+):\s*(.*?)\s*\|\s*status:\s*(pending|pass|fail)\s*$/;
    const t = raw.trim();
    if (!t || t.startsWith('<!--')) return null;
    const m = t.match(re);
    if (!m) return null;
    return { id: m[1] ?? '', text: m[2] ?? '', status: m[3] ?? '' };
  } catch {
    return null;
  }
}

/**
 * Re-parse a single blocker raw_line.
 * Returns {stage,date,text} or null.
 * @param {string} raw
 */
function tryReparseBlockerLine(raw) {
  try {
    const re = /^\[([^\]]+)\]\s*\[([^\]]+)\]:\s*(.*)$/;
    const t = raw.trim();
    if (!t || t.startsWith('<!--')) return null;
    const m = t.match(re);
    if (!m) return null;
    return { stage: m[1] ?? '', date: m[2] ?? '', text: m[3] ?? '' };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Semantic equality helpers (mirroring mutator.ts).
// ---------------------------------------------------------------------------

function positionEqual(a, b) {
  return (
    a.stage === b.stage &&
    String(a.wave) === String(b.wave) &&
    a.task_progress === b.task_progress &&
    a.status === b.status &&
    a.handoff_source === b.handoff_source &&
    a.handoff_path === b.handoff_path &&
    a.skipped_stages === b.skipped_stages
  );
}

function decisionEqual(a, b) {
  return a.id === b.id && a.text === b.text && a.status === b.status;
}

function mustHaveEqual(a, b) {
  return a.id === b.id && a.text === b.text && a.status === b.status;
}

function blockerEqual(a, b) {
  return a.stage === b.stage && a.date === b.date && a.text === b.text;
}

// ---------------------------------------------------------------------------
// Main: renderStateMarkdown(db, cycle_id, sdk) -> string   [SYNCHRONOUS]
//
// sdk = { serialize, parse } — injected by callers (state-store or tests).
// No internal dynamic import. Safe to call from inside a better-sqlite3
// db.transaction() callback.
// ---------------------------------------------------------------------------

/**
 * Render STATE.md text from SQLite rows for the given cycle_id.
 * Delegates to sdk.serialize() for guaranteed canonical-form round-trip.
 *
 * SYNCHRONOUS — no await, no dynamic import inside. sdk is injected.
 *
 * @param {any} db - better-sqlite3 Database instance (must be non-null)
 * @param {string} cycle_id
 * @param {{ serialize: Function, parse: Function }} sdk - injected SDK
 * @returns {string}
 * @throws {TypeError} if db is null/undefined or sdk is missing
 * @throws {Error} if no state_position row exists for cycle_id
 */
function renderStateMarkdown(db, cycle_id, sdk) {
  if (db === null || db === undefined) {
    throw new TypeError(
      'renderStateMarkdown: db must be a better-sqlite3 Database instance, got ' +
      (db === null ? 'null' : 'undefined'),
    );
  }
  if (!sdk || typeof sdk.serialize !== 'function' || typeof sdk.parse !== 'function') {
    throw new TypeError(
      'renderStateMarkdown: sdk must be { serialize, parse } — inject the SDK before calling',
    );
  }

  // --- 1. Fetch state_position row ---
  const posRow = db.prepare(
    'SELECT * FROM state_position WHERE cycle_id = ?'
  ).get(cycle_id);

  if (!posRow) {
    throw new Error(
      `renderStateMarkdown: no state_position row found for cycle_id "${cycle_id}"`,
    );
  }

  // --- 2. Fetch ordered rows for structured blocks ---
  const decisionRows = db.prepare(
    'SELECT * FROM decisions WHERE cycle_id = ? ORDER BY ordinal ASC'
  ).all(cycle_id);

  const blockerRows = db.prepare(
    'SELECT * FROM blockers WHERE cycle_id = ? ORDER BY ordinal ASC'
  ).all(cycle_id);

  const mustHaveRows = db.prepare(
    'SELECT * FROM must_haves WHERE cycle_id = ? ORDER BY ordinal ASC'
  ).all(cycle_id);

  // --- 3. Fetch _block_meta (gaps + raw_body per block) ---
  const blockMetaRows = db.prepare(
    'SELECT block, gap, raw_body FROM _block_meta WHERE cycle_id = ?'
  ).all(cycle_id);

  /** @type {Record<string, string>} */
  const blockGaps = {};
  /** @type {Record<string, string|null>} */
  const blockRawBodies = {};

  for (const row of blockMetaRows) {
    if (row.gap !== undefined && row.gap !== null) {
      blockGaps[row.block] = row.gap;
    }
    if (row.raw_body !== undefined) {
      blockRawBodies[row.block] = row.raw_body;
    }
  }

  // --- 4. Reconstruct raw_bodies for SDK fidelity ---
  // For structured blocks: re-derive the raw_body by emitting each row
  // with fidelity (raw_line verbatim when it matches structured fields,
  // canonical form otherwise). This is EXACTLY what the SDK's serialize()
  // does when it compares raw vs typed.
  //
  // For unstructured blocks: use verbatim raw_body from _block_meta.

  /** @type {Record<string, string|null>} */
  const raw_bodies = {
    position: null,
    decisions: null,
    must_haves: null,
    prototyping: null,
    quality_gate: null,
    connections: null,
    blockers: null,
    parallelism_decision: null,
    todos: null,
    timestamps: null,
  };

  // --- position raw_body ---
  // Use stored raw_body from _block_meta if present; otherwise null (forces canonical).
  const posRawBody = blockRawBodies['position'] !== undefined ? blockRawBodies['position'] : (posRow.raw_body || null);
  raw_bodies.position = posRawBody;

  // --- decisions raw_body ---
  // Re-derive from row data with raw_line fidelity.
  if (decisionRows.length > 0) {
    const lines = decisionRows.map((row) => {
      const structured = { id: row.id, text: row.body_md || '', status: row.status };
      if (row.raw_line) {
        const reparsed = tryReparseDecisionLine(row.raw_line);
        if (reparsed !== null && decisionEqual(reparsed, structured)) {
          return row.raw_line;
        }
      }
      return canonicalDecision(structured);
    });
    raw_bodies.decisions = lines.join('\n');
  } else if ('decisions' in blockGaps) {
    // Block was present with no rows - preserve empty block.
    raw_bodies.decisions = blockRawBodies['decisions'] !== undefined
      ? blockRawBodies['decisions']
      : '';
  } else if (blockRawBodies['decisions'] !== undefined) {
    raw_bodies.decisions = blockRawBodies['decisions'];
  }

  // --- must_haves raw_body ---
  if (mustHaveRows.length > 0) {
    const lines = mustHaveRows.map((row) => {
      const structured = { id: row.id, text: row.body_md || '', status: row.status };
      if (row.raw_line) {
        const reparsed = tryReparseMustHaveLine(row.raw_line);
        if (reparsed !== null && mustHaveEqual(reparsed, structured)) {
          return row.raw_line;
        }
      }
      return canonicalMustHave(structured);
    });
    raw_bodies.must_haves = lines.join('\n');
  } else if ('must_haves' in blockGaps) {
    raw_bodies.must_haves = blockRawBodies['must_haves'] !== undefined
      ? blockRawBodies['must_haves']
      : '';
  } else if (blockRawBodies['must_haves'] !== undefined) {
    raw_bodies.must_haves = blockRawBodies['must_haves'];
  }

  // --- blockers raw_body ---
  // activeBlockers is used both for raw_bodies reconstruction and the blockers state array below.
  const activeBlockers = blockerRows.filter((r) => !r.resolved_at);

  // BUG-09: when _block_meta stores a non-null raw_body for 'blockers', emit it
  // verbatim (like unstructured blocks). This preserves comment lines inside
  // <blockers> that would otherwise be silently dropped when rebuilding from rows.
  //
  // Fall through to row-reconstruction only when raw_body is absent (null), which
  // happens after an appendBlocker() call that doesn't update _block_meta.raw_body.
  const blockersRawBody = blockRawBodies['blockers'];
  if (blockersRawBody !== undefined && blockersRawBody !== null) {
    // Verbatim round-trip: emit stored raw_body (preserves comments).
    raw_bodies.blockers = blockersRawBody;
  } else {
    // Reconstruct from rows (no stored raw_body).
    // Only unresolved blockers go in the STATE.md <blockers> block.
    if (activeBlockers.length > 0) {
      const lines = activeBlockers.map((row) => {
        // ALWAYS prefer raw_line for blockers (date-format hazard).
        if (row.raw_line) return row.raw_line;
        return canonicalBlocker({ stage: row.stage || '', date: row.date || '', text: row.body_md || '' });
      });
      raw_bodies.blockers = lines.join('\n');
    } else if ('blockers' in blockGaps) {
      raw_bodies.blockers = '';
    }
    // If no blockGaps entry for blockers, raw_bodies.blockers stays null (block omitted).
  }

  // --- unstructured blocks: verbatim from _block_meta.raw_body ---
  for (const blockName of ['prototyping', 'quality_gate', 'connections', 'parallelism_decision', 'todos', 'timestamps']) {
    if (blockRawBodies[blockName] !== undefined) {
      raw_bodies[blockName] = blockRawBodies[blockName];
    }
  }

  // --- 5. Reconstruct ParsedState from SQLite rows ---
  // Parse the position raw_body to get structured Position fields.
  let position;
  if (posRawBody !== null) {
    const reparsed = tryReparsePosition(posRawBody);
    if (reparsed !== null) {
      position = reparsed;
    }
  }
  if (!position) {
    position = {
      stage: posRow.stage || '',
      wave: posRow.wave != null ? Number(posRow.wave) : 1,
      task_progress: posRow.task_progress || '0/0',
      status: posRow.status || 'initialized',
      handoff_source: posRow.handoff_source || '',
      handoff_path: posRow.handoff_path || '',
      skipped_stages: posRow.skipped_stages || '',
    };
  }

  // Reconstruct decisions array.
  const decisions = decisionRows.map((row) => ({
    id: row.id,
    text: row.body_md || '',
    status: row.status || 'tentative',
  }));

  // Reconstruct must_haves array.
  const must_haves = mustHaveRows.map((row) => ({
    id: row.id,
    text: row.body_md || '',
    status: row.status || 'pending',
  }));

  // Reconstruct blockers array (unresolved only - these go in STATE.md).
  const blockers = activeBlockers.map((row) => ({
    stage: row.stage || '',
    date: row.date || '',
    text: row.body_md || '',
  }));

  // For unstructured blocks: parse from raw_body if available.
  // Use sdk.parse to extract structured typed values.
  let connections = {};
  let timestamps = {};
  let parallelism_decision = null;
  let todos = null;
  let prototyping = null;
  let quality_gate = null;

  // Parse connections from raw_body.
  if (raw_bodies.connections !== null && raw_bodies.connections !== undefined) {
    try {
      const tempMd = `---\npipeline_state_version: 1.0\nstage: x\ncycle: x\nwave: 1\nstarted_at: \nlast_checkpoint: \n---\n\n<position>\nstage: x\nwave: 1\ntask_progress: 0/0\nstatus: initialized\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""\n</position>\n\n<connections>\n${raw_bodies.connections}\n</connections>\n`;
      const parsed = sdk.parse(tempMd);
      connections = parsed.state.connections;
    } catch {
      connections = {};
    }
  }

  // Parse timestamps from raw_body.
  if (raw_bodies.timestamps !== null && raw_bodies.timestamps !== undefined) {
    try {
      const tempMd = `---\npipeline_state_version: 1.0\nstage: x\ncycle: x\nwave: 1\nstarted_at: \nlast_checkpoint: \n---\n\n<position>\nstage: x\nwave: 1\ntask_progress: 0/0\nstatus: initialized\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""\n</position>\n\n<timestamps>\n${raw_bodies.timestamps}\n</timestamps>\n`;
      const parsed = sdk.parse(tempMd);
      timestamps = parsed.state.timestamps;
    } catch {
      timestamps = {};
    }
  }

  // parallelism_decision is free-text.
  if (raw_bodies.parallelism_decision !== null && raw_bodies.parallelism_decision !== undefined) {
    parallelism_decision = raw_bodies.parallelism_decision;
  }

  // todos is free-text.
  if (raw_bodies.todos !== null && raw_bodies.todos !== undefined) {
    todos = raw_bodies.todos;
  }

  // prototyping: parse from raw_body.
  if (raw_bodies.prototyping !== null && raw_bodies.prototyping !== undefined) {
    try {
      const tempMd = `---\npipeline_state_version: 1.0\nstage: x\ncycle: x\nwave: 1\nstarted_at: \nlast_checkpoint: \n---\n\n<position>\nstage: x\nwave: 1\ntask_progress: 0/0\nstatus: initialized\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""\n</position>\n\n<prototyping>\n${raw_bodies.prototyping}\n</prototyping>\n`;
      const parsed = sdk.parse(tempMd);
      prototyping = parsed.state.prototyping;
    } catch {
      prototyping = null;
    }
  }

  // quality_gate: parse from raw_body.
  if (raw_bodies.quality_gate !== null && raw_bodies.quality_gate !== undefined) {
    try {
      const tempMd = `---\npipeline_state_version: 1.0\nstage: x\ncycle: x\nwave: 1\nstarted_at: \nlast_checkpoint: \n---\n\n<position>\nstage: x\nwave: 1\ntask_progress: 0/0\nstatus: initialized\nhandoff_source: ""\nhandoff_path: ""\nskipped_stages: ""\n</position>\n\n<quality_gate>\n${raw_bodies.quality_gate}\n</quality_gate>\n`;
      const parsed = sdk.parse(tempMd);
      quality_gate = parsed.state.quality_gate;
    } catch {
      quality_gate = null;
    }
  }

  // --- 6. Reconstruct ParsedState ---
  const state = {
    frontmatter: _parseFrontmatter(posRow.raw_frontmatter || '', cycle_id, posRow),
    position,
    decisions,
    must_haves,
    connections,
    blockers,
    parallelism_decision,
    todos,
    prototyping,
    quality_gate,
    timestamps,
    body_preamble: posRow.body_preamble || '',
    body_trailer: posRow.body_trailer || '',
  };

  // --- 7. Build block_gaps from _block_meta ---
  /** @type {Record<string, string>} */
  const block_gaps = {
    position: '',
    decisions: '',
    must_haves: '',
    prototyping: '',
    quality_gate: '',
    connections: '',
    blockers: '',
    parallelism_decision: '',
    todos: '',
    timestamps: '',
  };
  for (const [k, v] of Object.entries(blockGaps)) {
    if (k in block_gaps) block_gaps[k] = v;
  }

  // --- 8. Delegate to sdk.serialize ---
  return sdk.serialize(state, {
    raw_frontmatter: posRow.raw_frontmatter || null,
    raw_bodies,
    block_gaps,
    line_ending: posRow.line_ending || '\n',
  });
}

/**
 * Parse frontmatter text into a Frontmatter object.
 * Minimal inline parser (mirrors parseFrontmatter in parser.ts).
 * Falls back to sensible defaults when raw_frontmatter is absent.
 * @param {string} rawFm - verbatim frontmatter body (between --- fences)
 * @param {string} cycleId
 * @param {object} posRow - state_position row (fallback fields)
 * @returns {object}
 */
function _parseFrontmatter(rawFm, cycleId, posRow) {
  const out = {};
  for (const line of rawFm.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === 'wave') {
      const n = Number(value);
      out[key] = Number.isFinite(n) ? n : value;
    } else {
      out[key] = value;
    }
  }
  const fm = {
    pipeline_state_version: String(out['pipeline_state_version'] ?? '1.0'),
    stage: String(out['stage'] ?? posRow.stage ?? ''),
    cycle: String(out['cycle'] ?? cycleId ?? ''),
    wave: typeof out['wave'] === 'number' ? out['wave'] : (posRow.wave != null ? Number(posRow.wave) : 1),
    started_at: String(out['started_at'] ?? ''),
    last_checkpoint: String(out['last_checkpoint'] ?? ''),
  };
  for (const [k, v] of Object.entries(out)) {
    if (!(k in fm)) fm[k] = v;
  }
  return fm;
}

// ---------------------------------------------------------------------------
// Optional additive views (derived markdown; NOT round-trip-critical).
// Return Promises for compatibility with callers that await them.
// ---------------------------------------------------------------------------

/**
 * Render a markdown decision log for the given cycle_id.
 * Additive view - not round-trip-critical.
 *
 * @param {any} db - better-sqlite3 Database instance
 * @param {string} [cycle_id] - if omitted, renders all decisions
 * @returns {Promise<string>}
 */
async function renderDecisionLog(db, cycle_id) {
  if (db === null || db === undefined) {
    throw new TypeError('renderDecisionLog: db must be a better-sqlite3 Database instance');
  }

  let rows;
  if (cycle_id) {
    rows = db.prepare(
      'SELECT * FROM decisions WHERE cycle_id = ? ORDER BY ordinal ASC'
    ).all(cycle_id);
  } else {
    rows = db.prepare(
      'SELECT * FROM decisions ORDER BY cycle_id, ordinal ASC'
    ).all();
  }

  if (!rows || rows.length === 0) {
    return `# Decision Log\n\n_No decisions recorded._\n`;
  }

  const lines = [
    '# Decision Log',
    '',
  ];

  let lastCycle = null;
  for (const row of rows) {
    if (row.cycle_id !== lastCycle) {
      if (lastCycle !== null) lines.push('');
      lines.push(`## Cycle: ${row.cycle_id}`);
      lines.push('');
      lastCycle = row.cycle_id;
    }
    const status = row.status === 'locked' ? 'locked' : 'tentative';
    const tags = row.tags ? ` [${row.tags}]` : '';
    lines.push(`- **${row.id}** (${status})${tags}: ${row.body_md || ''}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Render a markdown blockers report for the given cycle_id.
 * Additive view - not round-trip-critical.
 *
 * @param {any} db - better-sqlite3 Database instance
 * @param {string} [cycle_id] - if omitted, renders all active blockers
 * @returns {Promise<string>}
 */
async function renderBlockers(db, cycle_id) {
  if (db === null || db === undefined) {
    throw new TypeError('renderBlockers: db must be a better-sqlite3 Database instance');
  }

  let rows;
  if (cycle_id) {
    rows = db.prepare(
      'SELECT * FROM blockers WHERE cycle_id = ? AND resolved_at IS NULL ORDER BY ordinal ASC'
    ).all(cycle_id);
  } else {
    rows = db.prepare(
      'SELECT * FROM blockers WHERE resolved_at IS NULL ORDER BY cycle_id, ordinal ASC'
    ).all();
  }

  if (!rows || rows.length === 0) {
    return `# Active Blockers\n\n_No active blockers._\n`;
  }

  const lines = [
    '# Active Blockers',
    '',
  ];

  let lastCycle = null;
  for (const row of rows) {
    if (row.cycle_id !== lastCycle) {
      if (lastCycle !== null) lines.push('');
      lines.push(`## Cycle: ${row.cycle_id}`);
      lines.push('');
      lastCycle = row.cycle_id;
    }
    const severity = row.severity ? ` [${row.severity}]` : '';
    lines.push(`- **[${row.stage}] [${row.date}]**${severity}: ${row.body_md || ''}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  renderStateMarkdown,
  renderDecisionLog,
  renderBlockers,
  // Export for tests
  _BLOCK_ORDER: BLOCK_ORDER,
  _tryReparseDecisionLine: tryReparseDecisionLine,
  _tryReparseMustHaveLine: tryReparseMustHaveLine,
  _tryReparseBlockerLine: tryReparseBlockerLine,
  _tryReparsePosition: tryReparsePosition,
  _canonicalPosition: canonicalPosition,
  _canonicalDecision: canonicalDecision,
  _canonicalMustHave: canonicalMustHave,
  _canonicalBlocker: canonicalBlocker,
};
