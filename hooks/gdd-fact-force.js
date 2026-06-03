#!/usr/bin/env node
'use strict';
/**
 * hooks/gdd-fact-force.js — PreToolUse:Edit|Write|MultiEdit fact-forcing gate.
 *
 * Forces an agent to establish the FACTS before the FIRST mutation of a file in
 * a session: the file's importers/consumers (from the Phase 52 DesignContext
 * graph) must have been Read, and any decisions/blockers tagged with the file
 * must have been surfaced. Until those prerequisites are met, the first write
 * is SOFT-blocked (`{continue:false, stopReason}` listing the missing facts);
 * the agent can satisfy them (Read the importers) or escape via
 * `/gdd:override factforce <path>` which sets `checked[path]`.
 *
 * Tiering (CONTEXT.md shared contract):
 *   - prerequisites met OR checked[path] set      -> { continue:true }
 *   - prerequisites UNMET, computeRisk != block    -> SOFT block (continue:false)
 *   - prerequisites UNMET, computeRisk == block     -> HARD block (continue:false);
 *       only escape is /gdd:override (same JSON shape, stronger stopReason)
 *   - graph ABSENT/unbuilt                          -> importer prereq SOFTENS to a
 *       warning, never a hard block (do not over-block greenfield)
 *
 * Session-state (worktree-safe, CONTEXT.md R5):
 *   <cwd>/.design/locks/factforce-<sanitized session_id>.json
 *   { reads: { <normPath>: <ISO> }, first_mutation_seen: { <normPath>: <ISO> },
 *     checked: { <normPath>: true } }
 *   Atomic tmp+rename. session_id from payload.session_id ?? GDD_SESSION_ID ?? 'hook'.
 *
 * Contract (PreToolUse): stdin { tool_name, tool_input:{file_path}, cwd, session_id? }
 *   stdout: { continue:true } | { continue:false, stopReason }
 *   exit  : always 0. NEVER throws (fail-open { continue:true }).
 */

const fs = require('fs');
const path = require('path');

const GATED_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

// ---------------------------------------------------------------------------
// Package-root walk-up (Phase 53/54 lesson) for robust sibling resolution.
// ---------------------------------------------------------------------------
function findPackageRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    try {
      const pkg = require(path.join(dir, 'package.json'));
      if (pkg && pkg.name === '@hegemonart/get-design-done') return dir;
    } catch { /* not this level */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Lazily resolve a sibling lib module by name, trying the adjacent path first
 * then the package-root walk-up. Returns null when unresolvable (the gate then
 * SOFTENS rather than crashing).
 */
function requireSibling(relFromLib, validate) {
  const candidates = [path.join(__dirname, '..', 'scripts', 'lib', relFromLib)];
  const root = findPackageRoot(__dirname);
  if (root) candidates.push(path.join(root, 'scripts', 'lib', relFromLib));
  for (const c of candidates) {
    try {
      const m = require(c);
      if (!validate || validate(m)) return m;
    } catch { /* try next */ }
  }
  return null;
}

const _risk = requireSibling('risk/compute-risk.cjs', (m) => m && typeof m.computeRisk === 'function');
const _consumers = requireSibling('risk/consumers.cjs', (m) => m && typeof m.consumersOfFile === 'function');

// ---------------------------------------------------------------------------
// Path normalization
// ---------------------------------------------------------------------------
function normPath(p, cwd) {
  if (!p) return '';
  let s = String(p);
  // Make absolute paths relative to cwd so reads[] keys match across the
  // (absolute file_path the agent passes) and (relative paths we derive).
  if (s.startsWith('/') || /^[A-Za-z]:[\\/]/.test(s)) {
    try { s = path.relative(cwd || process.cwd(), s); } catch { /* keep s */ }
  }
  return s.replace(/\\/g, '/').replace(/^\.\//, '');
}

function leafSlug(p) {
  const base = path.basename(String(p || ''));
  return base.replace(/\.[a-z0-9.]+$/i, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Session-state (atomic tmp+rename; mirrors bandit-router's write pattern)
// ---------------------------------------------------------------------------
function sessionIdFrom(payload) {
  const raw = (payload && (payload.session_id || payload.sessionId))
    || process.env.GDD_SESSION_ID
    || 'hook';
  // Sanitize for a filename: keep alnum/dash/underscore, collapse the rest.
  return String(raw).replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 120) || 'hook';
}

function stateFileFor(cwd, sessionId) {
  return path.join(cwd || process.cwd(), '.design', 'locks', `factforce-${sessionId}.json`);
}

function loadState(stateFile) {
  const empty = { reads: {}, first_mutation_seen: {}, checked: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return {
      reads: (parsed && typeof parsed.reads === 'object' && parsed.reads) || {},
      first_mutation_seen: (parsed && typeof parsed.first_mutation_seen === 'object' && parsed.first_mutation_seen) || {},
      checked: (parsed && typeof parsed.checked === 'object' && parsed.checked) || {},
    };
  } catch {
    return empty;
  }
}

function saveState(stateFile, state) {
  try {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    const tmp = `${stateFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, stateFile);
  } catch { /* best-effort: a state-write failure must not break the gate */ }
}

// ---------------------------------------------------------------------------
// Decisions/blockers grep (reuses the decision-injector idiom: scan the small
// canonical design docs for lines mentioning the file's basename/relPath).
// ---------------------------------------------------------------------------
function decisionSources(cwd) {
  const roots = [];
  for (const rel of [
    ['.design', 'STATE.md'],
    ['.design', 'CYCLES.md'],
    ['.design', 'learnings', 'LEARNINGS.md'],
  ]) {
    const p = path.join(cwd, ...rel);
    try { if (fs.statSync(p).isFile()) roots.push(p); } catch { /* skip */ }
  }
  return roots;
}

/**
 * Lazy-require state-store.cjs (Phase 57 dual-backend layer).
 * Returns null if not yet available (degrade to grep).
 */
function _requireStateStore() {
  try {
    const candidates = [
      path.join(__dirname, '..', 'scripts', 'lib', 'state', 'state-store.cjs'),
    ];
    const root = findPackageRoot(__dirname);
    if (root) candidates.push(path.join(root, 'scripts', 'lib', 'state', 'state-store.cjs'));
    for (const c of candidates) {
      try {
        const m = require(c);
        if (m && typeof m.queryDecisions === 'function') return m;
      } catch { /* try next */ }
    }
  } catch { /* never throw */ }
  return null;
}

/**
 * Lazy-require state-backend.cjs to check if migration is active.
 * Migration is active when BACKEND==='sqlite' AND the sibling .design/state.sqlite exists.
 */
function _isMigrationActive(cwd) {
  try {
    const candidates = [
      path.join(__dirname, '..', 'scripts', 'lib', 'state', 'state-backend.cjs'),
    ];
    const root = findPackageRoot(__dirname);
    if (root) candidates.push(path.join(root, 'scripts', 'lib', 'state', 'state-backend.cjs'));
    let backend = null;
    for (const c of candidates) {
      try {
        const m = require(c);
        if (m && typeof m.BACKEND === 'string' && typeof m.sqlitePath === 'function') {
          backend = m;
          break;
        }
      } catch { /* try next */ }
    }
    if (!backend || backend.BACKEND !== 'sqlite') return false;
    // Verify that the sibling .design/state.sqlite actually exists (migration-active gate).
    const dbPath = backend.sqlitePath(cwd);
    return fs.existsSync(dbPath);
  } catch {
    return false;
  }
}

/**
 * Does any decision/blocker line mention this file?
 *
 * When migration is active (BACKEND==='sqlite' AND .design/state.sqlite exists):
 *   - Tier-0: query state-store.cjs queryDecisions(term) for each search term.
 *     Falls back to grep if the store query throws.
 * When migration is NOT active (default, un-migrated):
 *   - Substring grep over STATE.md/CYCLES.md/LEARNINGS.md (UNCHANGED).
 *
 * Returns { found:boolean, where:string|null }.
 * The return shape and the soften-if-absent behavior are UNCHANGED.
 */
function decisionMentions(cwd, relPath) {
  const basename = path.basename(relPath);
  const terms = Array.from(new Set([basename, relPath].filter(Boolean)));

  // Tier-0: FTS5 path (migration-active only).
  if (_isMigrationActive(cwd)) {
    const store = _requireStateStore();
    if (store) {
      try {
        for (const t of terms) {
          if (!t) continue;
          const rows = store.queryDecisions(t, { projectRoot: cwd, limit: 1 });
          if (Array.isArray(rows) && rows.length > 0) {
            return { found: true, where: 'state.sqlite' };
          }
        }
        // FTS5 returned no matches; check blockers via getBlockers substring.
        const blockers = store.getBlockers ? store.getBlockers({ projectRoot: cwd }) : [];
        if (Array.isArray(blockers) && blockers.length > 0) {
          for (const b of blockers) {
            const body = (b.body_md || b.raw_line || '');
            for (const t of terms) {
              if (t && body.includes(t)) return { found: true, where: 'state.sqlite' };
            }
          }
        }
        return { found: false, where: null };
      } catch {
        // FTS5 query failed: fall through to grep.
      }
    }
  }

  // Tier-1 (always-on fallback): substring grep over canonical docs.
  for (const src of decisionSources(cwd)) {
    let content;
    try { content = fs.readFileSync(src, 'utf8'); } catch { continue; }
    for (const t of terms) {
      if (t && content.includes(t)) return { found: true, where: path.basename(src) };
    }
  }
  return { found: false, where: null };
}

// ---------------------------------------------------------------------------
// Importer prerequisite: were the file's consumers Read this session?
// SOFTENS when the graph is absent (available:false).
// ---------------------------------------------------------------------------
function readSlugs(state, cwd) {
  // Index the session reads by their leaf slug for token matching against
  // consumer node names.
  const slugs = new Set();
  for (const k of Object.keys(state.reads || {})) {
    const s = leafSlug(k);
    if (s) slugs.add(s);
  }
  return slugs;
}

/**
 * @returns {{ softened:boolean, unread:string[] }}
 *   softened — true when the graph is unavailable (importer check downgraded
 *              to a non-blocking warning).
 *   unread   — importer slugs that were NOT found in this session's reads.
 */
function importerPrereq(filePath, cwd, state) {
  if (!_consumers) return { softened: true, unread: [] };
  let res;
  try {
    res = _consumers.consumersOfFile(filePath, { root: cwd });
  } catch {
    return { softened: true, unread: [] };
  }
  if (!res || res.available !== true) {
    // Graph absent / unbuilt / file unmapped-with-no-graph -> SOFTEN.
    return { softened: true, unread: [] };
  }
  const importers = Array.isArray(res.importers) ? res.importers : [];
  if (importers.length === 0) return { softened: false, unread: [] };
  const reads = readSlugs(state, cwd);
  const unread = importers.filter((imp) => !reads.has(String(imp).toLowerCase()));
  return { softened: false, unread };
}

// ---------------------------------------------------------------------------
// Risk tier (imports A's compute-risk; SOFTENS to non-block when unavailable)
// ---------------------------------------------------------------------------
function riskIsBlock(tool, input, cwd) {
  if (!_risk) return false;
  try {
    const cfg = typeof _risk.loadRiskConfig === 'function' ? _risk.loadRiskConfig(cwd) : null;
    const thresholds = cfg && cfg.thresholds ? cfg.thresholds : undefined;
    const r = _risk.computeRisk(tool, input, thresholds);
    return !!(r && r.suggested_action === 'block');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  let buf = '';
  for await (const chunk of process.stdin) buf += chunk;

  let payload;
  try { payload = JSON.parse(buf || '{}'); } catch {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const tool = (payload && payload.tool_name) || '';
  if (!GATED_TOOLS.has(tool)) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const cwd = (payload && payload.cwd) || process.cwd();
  const rawPath = payload && payload.tool_input && payload.tool_input.file_path;
  if (!rawPath) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }
  const relPath = normPath(rawPath, cwd);

  const sessionId = sessionIdFrom(payload);
  const stateFile = stateFileFor(cwd, sessionId);
  const state = loadState(stateFile);

  // (1) Already overridden for this path -> always pass (and record the seen).
  if (state.checked && state.checked[relPath]) {
    if (!state.first_mutation_seen[relPath]) {
      state.first_mutation_seen[relPath] = new Date().toISOString();
      saveState(stateFile, state);
    }
    emit('allow', { reason: 'checked', path: relPath });
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  // (2) Not the FIRST mutation of this file this session -> not re-gated.
  if (state.first_mutation_seen && state.first_mutation_seen[relPath]) {
    emit('allow', { reason: 'already-mutated', path: relPath });
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  // (3) First mutation: evaluate prerequisites.
  const missing = [];

  const imp = importerPrereq(rawPath, cwd, state);
  if (!imp.softened && imp.unread.length > 0) {
    missing.push(`unread importers: ${imp.unread.join(', ')} (Read the file(s) that consume '${relPath}')`);
  }

  const dec = decisionMentions(cwd, relPath);
  // A decision/blocker is "tagged with X" when a canonical doc mentions the
  // file. If one exists, it must have been surfaced (Read) this session — we
  // approximate "surfaced" by the doc itself being in reads[], else flag it.
  if (dec.found) {
    const docReadKnown = Object.keys(state.reads || {}).some((k) => {
      const b = path.basename(k);
      return b === dec.where || b === 'STATE.md' || b === 'CYCLES.md' || b === 'LEARNINGS.md';
    });
    if (!docReadKnown) {
      missing.push(`unreviewed decisions/blockers tagged '${path.basename(relPath)}' in ${dec.where} (Read it first)`);
    }
  }

  // Record that we have now SEEN the first mutation attempt for this file (so a
  // subsequent retry after the agent satisfies prereqs flows through gate (2)
  // only AFTER a pass; we set the marker on the allow path below to avoid
  // permanently disarming on a blocked attempt).
  if (missing.length === 0) {
    state.first_mutation_seen[relPath] = new Date().toISOString();
    saveState(stateFile, state);
    emit('allow', { reason: 'prereqs-met', path: relPath, softened: imp.softened });
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  // Prerequisites unmet -> block. SOFT unless risk == block (then HARD).
  const hard = riskIsBlock(tool, payload.tool_input, cwd);
  const factsList = missing.join('; ');
  const stopReason = hard
    ? `gdd-fact-force (HARD — risk=block): cannot mutate '${relPath}' until facts are established — ${factsList}. The only escape is \`/gdd:override factforce ${relPath} --approver <who>\`.`
    : `gdd-fact-force: establish the facts before the first edit to '${relPath}' — ${factsList}. Read them, or run \`/gdd:override factforce ${relPath}\` to mark checked.`;

  emit(hard ? 'block-hard' : 'block-soft', { path: relPath, missing: missing.length });
  process.stdout.write(JSON.stringify({ continue: false, stopReason }));
}

// Best-effort telemetry — never throws, swallowed if the emitter is absent.
function emit(decision, detail) {
  try {
    require('./_hook-emit.js').emitHookFired('gdd-fact-force', decision, detail || {});
  } catch { /* swallow */ }
}

// Auto-run when invoked directly (hooks.json runs `node hooks/gdd-fact-force.js`).
// Guarded so tests can require() the module to unit-test the pure helpers.
if (require.main === module) {
  main().catch(() => {
    process.stdout.write(JSON.stringify({ continue: true }));
  });
}

module.exports = {
  // pure-ish helpers exported for tests; main() owns the I/O + contract.
  normPath,
  leafSlug,
  sessionIdFrom,
  stateFileFor,
  loadState,
  saveState,
  decisionMentions,
  importerPrereq,
  riskIsBlock,
  findPackageRoot,
  main,
};
