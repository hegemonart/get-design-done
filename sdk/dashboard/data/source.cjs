'use strict';
/**
 * sdk/dashboard/data/source.cjs — Phase 55 (GDD Dashboard, dep-free).
 *
 * THE data plane. `loadDashboardModel({root?})` assembles the full read-only
 * model the TUI + web layers render, by calling the SHARED LIBS in-process
 * (R1) — the same read surface the gdd-mcp tools expose — with a `.design/*`
 * file-scrape fallback per section (R1: "file-scrape fallback" = read
 * STATE.md / events.jsonl / context-graph.json directly when a lib is
 * unavailable).
 *
 * Hard contract (CONTEXT.md "Shared contracts"):
 *   loadDashboardModel({root?}) -> {
 *     status, phase, cycle,
 *     decisions[], blockers[], plans[],
 *     events[], costs, graph, health,
 *     runtimes[], worktrees[], sessions[],
 *     degraded[]
 *   }
 *
 * Invariants:
 *   - NEVER throws. Every section is wrapped in try/catch; on failure the
 *     section degrades to null/[] AND a human-readable note is pushed to
 *     `degraded[]` (so gsd-health + the TUI can surface what is missing).
 *   - Absent .design entirely -> every data section null/[] + degraded
 *     populated, still no throw.
 *   - Root resolution: opts.root || GDD_PROJECT_ROOT || package-root walk-up
 *     || cwd. (Package-root walk-up resolves the GDD repo root, where
 *     .design/.planning live.)
 *   - The .ts libs (sdk/state, sdk/event-stream) cannot be static-require()d
 *     from a .cjs — they are loaded via dynamic import(pathToFileURL),
 *     memoized once per process. The .cjs libs are require()d directly via the
 *     package-root walk-up.
 *   - Determinism is best-effort: ordering follows the shared libs; this layer
 *     adds no Date.now()/Math.random() to the model.
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { packageRoot, resolveFromPackageRoot, requireFromPackageRoot } = require('./_pkg-root.cjs');
const { readCosts, aggregateCosts } = require('./cost-aggregator.cjs');
const { discoverRuntimes, discoverWorktrees, discoverSessions } = require('./discovery.cjs');

// ---------------------------------------------------------------------------
// .cjs shared libs — require() directly via package-root walk-up.
// ---------------------------------------------------------------------------
// Wrapped so a missing lib (unusual layout) degrades rather than crashing
// module load. Each may be null; callers null-check before use.
function tryRequire(relPath) {
  try {
    return requireFromPackageRoot(relPath);
  } catch {
    return null;
  }
}
const designContextQuery = tryRequire('scripts/lib/design-context-query.cjs');
const eventChain = tryRequire('scripts/lib/event-chain.cjs');
const healthMirror = tryRequire('scripts/lib/health-mirror/index.cjs');
// Phase 57 (Round 3-E): state-store provides backendName() so the dashboard
// model can surface whether it read from SQLite or markdown. Soft-loaded so
// a missing module degrades without crashing. Never throws.
const stateStore = tryRequire('scripts/lib/state/state-store.cjs');

// ---------------------------------------------------------------------------
// .ts shared libs — dynamic import(pathToFileURL), memoized.
// ---------------------------------------------------------------------------
/** @type {Promise<any> | null} */
let _statePromise = null;
/** @type {Promise<any> | null} */
let _eventStreamPromise = null;

/**
 * Lazily import sdk/state (a .ts module) once. Returns null if the import
 * fails (e.g. running outside a --experimental-strip-types-capable runtime).
 * @returns {Promise<any|null>}
 */
function importState() {
  if (_statePromise === null) {
    const url = pathToFileURL(resolveFromPackageRoot('sdk/state/index.ts')).href;
    _statePromise = import(url).catch(() => null);
  }
  return _statePromise;
}

/**
 * Lazily import sdk/event-stream/reader (a .ts module) once. Returns null on
 * failure.
 * @returns {Promise<any|null>}
 */
function importEventStream() {
  if (_eventStreamPromise === null) {
    const url = pathToFileURL(resolveFromPackageRoot('sdk/event-stream/reader.ts')).href;
    _eventStreamPromise = import(url).catch(() => null);
  }
  return _eventStreamPromise;
}

// ---------------------------------------------------------------------------
// Root resolution
// ---------------------------------------------------------------------------
/**
 * Resolve the project root the dashboard reads from:
 *   opts.root || GDD_PROJECT_ROOT (env) || package-root walk-up || cwd.
 * @param {{root?: string}} [opts]
 * @returns {string}
 */
function resolveRoot(opts = {}) {
  if (opts.root) return path.resolve(opts.root);
  if (process.env.GDD_PROJECT_ROOT) return path.resolve(process.env.GDD_PROJECT_ROOT);
  try {
    return packageRoot();
  } catch {
    return process.cwd();
  }
}

// ---------------------------------------------------------------------------
// Small FS helpers (graceful)
// ---------------------------------------------------------------------------
function readFileOrNull(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Minimal STATE.md file-scrape fallback used when the typed `sdk/state`
 * read() is unavailable or throws (e.g. malformed STATE.md the strict parser
 * rejects). Extracts the few fields the dashboard surfaces without enforcing
 * the full grammar — tolerant by design.
 *
 * @param {string} statePath
 * @returns {{status:string|null, stage:string|null, cycle:string|null,
 *            decisions:Array<{id:string,text:string,status:string}>,
 *            blockers:Array<{stage:string,date:string,text:string}>} | null}
 */
function scrapeStateFile(statePath) {
  const raw = readFileOrNull(statePath);
  if (raw == null) return null;
  const text = raw.replace(/\r\n/g, '\n');

  const fmStage = text.match(/^stage:\s*(.+)$/m);
  const fmCycle = text.match(/^cycle:\s*(.+)$/m);

  // <position> status: ... (preferred for status); fall back to frontmatter.
  let status = null;
  const posBlock = text.match(/<position>([\s\S]*?)<\/position>/);
  if (posBlock) {
    const st = posBlock[1].match(/status:\s*(.+)/);
    if (st) status = st[1].trim();
  }

  // Decisions: "D-NN: text (locked|tentative)" inside <decisions>.
  const decisions = [];
  const decBlock = text.match(/<decisions>([\s\S]*?)<\/decisions>/);
  if (decBlock) {
    const re = /^(D-\d+):\s*(.*?)\s*\((locked|tentative)\)\s*$/gm;
    let m;
    while ((m = re.exec(decBlock[1])) !== null) {
      decisions.push({ id: m[1], text: m[2], status: m[3] });
    }
  }

  // Blockers: "[stage] [date]: text" inside <blockers>.
  const blockers = [];
  const blkBlock = text.match(/<blockers>([\s\S]*?)<\/blockers>/);
  if (blkBlock) {
    const re = /^\[([^\]]+)\]\s*\[([^\]]+)\]:\s*(.*)$/gm;
    let m;
    while ((m = re.exec(blkBlock[1])) !== null) {
      blockers.push({ stage: m[1], date: m[2], text: m[3] });
    }
  }

  return {
    status,
    stage: fmStage ? fmStage[1].trim() : (posBlock && posBlock[1].match(/stage:\s*(.+)/) ? posBlock[1].match(/stage:\s*(.+)/)[1].trim() : null),
    cycle: fmCycle ? fmCycle[1].trim() : null,
    decisions,
    blockers,
  };
}

/**
 * File-scrape fallback for the telemetry events stream: read
 * `.design/telemetry/events.jsonl` directly, tolerant of malformed lines.
 * @param {string} eventsPath
 * @returns {Array<Record<string, unknown>>}
 */
function scrapeEventsFile(eventsPath) {
  const raw = readFileOrNull(eventsPath);
  if (raw == null) return [];
  const out = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (t === '') continue;
    try {
      const ev = JSON.parse(t);
      if (ev && typeof ev === 'object') out.push(ev);
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-section loaders. Each returns its value and, on degradation, pushes a
// note to `degraded`. None throw.
// ---------------------------------------------------------------------------

/**
 * Load STATE.md-derived fields: status, phase(stage), cycle, decisions[],
 * blockers[], backend. Tries the typed sdk/state read() first (which is
 * already migration-active-aware for Phase 57: when BACKEND==='sqlite' and
 * a sibling state.sqlite exists, the dual-write path ensures STATE.md is
 * byte-equal with SQLite so read() returns the canonical view), then the
 * file-scrape fallback. Never throws.
 *
 * The `backend` field reflects the active state-store backend:
 *   'sqlite'   — better-sqlite3 + FTS5 available and migration active
 *   'markdown' — markdown floor (the universal default and CI surface)
 *
 * @param {string} root
 * @param {string[]} degraded
 * @returns {Promise<{status:string|null, phase:string|null, cycle:string|null,
 *           decisions:Array, blockers:Array, backend:'sqlite'|'markdown'}>}
 */
async function loadState(root, degraded) {
  const statePath = path.join(root, '.design', 'STATE.md');
  const empty = {
    status: null, phase: null, cycle: null,
    decisions: [], blockers: [],
    backend: /** @type {'sqlite'|'markdown'} */ ('markdown'),
  };

  // Determine the active backend for this specific state path (Phase 57 R3-E).
  // The migration-active gate is:
  //   BACKEND==='sqlite' AND existsSync(<statePath-sibling>/state.sqlite)
  //
  // We use state-store.backendName() to check the global probe result, then
  // confirm by checking whether a sibling state.sqlite exists next to STATE.md.
  // This mirrors the migrationActive() logic in sdk/state/index.ts exactly.
  const globalBackend =
    (stateStore && typeof stateStore.backendName === 'function')
      ? /** @type {'sqlite'|'markdown'} */ (stateStore.backendName())
      : 'markdown';
  const sqliteSibling = path.join(root, '.design', 'state.sqlite');
  const activeBackend = /** @type {'sqlite'|'markdown'} */ (
    globalBackend === 'sqlite' && fs.existsSync(sqliteSibling) ? 'sqlite' : 'markdown'
  );

  if (!fs.existsSync(statePath)) {
    degraded.push('state: .design/STATE.md not found');
    return { ...empty, backend: activeBackend };
  }

  // 1) Typed lib read() — the in-process shared surface (R1).
  // Phase 57: sdk/state read() is already migration-active-aware; when
  // BACKEND==='sqlite' and state.sqlite sibling exists, STATE.md is kept
  // byte-equal by the dual-write path, so no separate SQLite read needed.
  try {
    const stateMod = await importState();
    if (stateMod && typeof stateMod.read === 'function') {
      const parsed = await stateMod.read(statePath);
      return {
        status: (parsed.position && parsed.position.status) || null,
        phase: (parsed.position && parsed.position.stage) ||
          (parsed.frontmatter && parsed.frontmatter.stage) || null,
        cycle: (parsed.frontmatter && parsed.frontmatter.cycle) || null,
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        blockers: Array.isArray(parsed.blockers) ? parsed.blockers : [],
        backend: activeBackend,
      };
    }
    degraded.push('state: sdk/state import unavailable — using file scrape');
  } catch (err) {
    degraded.push(`state: typed read failed (${errMsg(err)}) — using file scrape`);
  }

  // 2) File-scrape fallback (ultimate fallback; never throws).
  const scraped = scrapeStateFile(statePath);
  if (scraped) {
    return {
      status: scraped.status,
      phase: scraped.stage,
      cycle: scraped.cycle,
      decisions: scraped.decisions,
      blockers: scraped.blockers,
      backend: 'markdown',
    };
  }
  degraded.push('state: scrape fallback failed');
  return empty;
}

/**
 * Load plan/summary references from `.planning/phases/**` (best-effort).
 * The dashboard surfaces a lightweight list of {phase, plan, file, kind}.
 * This is purely a directory scrape — no shared lib is needed.
 *
 * @param {string} root
 * @param {string[]} degraded
 * @returns {Array<{phase:string, plan:string|null, kind:string, file:string}>}
 */
function loadPlans(root, degraded) {
  const phasesDir = path.join(root, '.planning', 'phases');
  let phaseDirs;
  try {
    phaseDirs = fs.readdirSync(phasesDir, { withFileTypes: true });
  } catch {
    degraded.push('plans: .planning/phases not found');
    return [];
  }
  const out = [];
  for (const pd of phaseDirs) {
    if (!pd.isDirectory()) continue;
    let files;
    try {
      files = fs.readdirSync(path.join(phasesDir, pd.name));
    } catch {
      continue;
    }
    for (const f of files) {
      const isPlan = /-PLAN\.md$/i.test(f);
      const isSummary = /-SUMMARY\.md$/i.test(f);
      if (!isPlan && !isSummary) continue;
      const planMatch = f.match(/^(\d+)-(\d+)-/);
      out.push({
        phase: pd.name,
        plan: planMatch ? `${planMatch[1]}-${planMatch[2]}` : null,
        kind: isPlan ? 'plan' : 'summary',
        file: path.join(phasesDir, pd.name, f),
      });
    }
  }
  // Stable order by file path.
  out.sort((a, b) => a.file.localeCompare(b.file));
  return out;
}

/**
 * Load the telemetry event stream. Tries the typed reader (readEvents) first,
 * then the file scrape. Returns a materialized array (dashboard renders a
 * bounded tail; callers slice as needed).
 *
 * @param {string} root
 * @param {string[]} degraded
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function loadEvents(root, degraded) {
  const eventsPath = path.join(root, '.design', 'telemetry', 'events.jsonl');

  // 1) Typed reader — async iterable (R1 in-process surface).
  try {
    const esMod = await importEventStream();
    if (esMod && typeof esMod.readEvents === 'function') {
      const out = [];
      for await (const ev of esMod.readEvents({ path: eventsPath })) out.push(ev);
      return out;
    }
    degraded.push('events: sdk/event-stream import unavailable — using file scrape');
  } catch (err) {
    degraded.push(`events: typed read failed (${errMsg(err)}) — using file scrape`);
  }

  // 2) File-scrape fallback.
  const scraped = scrapeEventsFile(eventsPath);
  if (scraped.length === 0 && !fs.existsSync(eventsPath)) {
    degraded.push('events: .design/telemetry/events.jsonl not found');
  }
  return scraped;
}

/**
 * Load the causal event chain (.design/gep/events.jsonl) via event-chain.cjs.
 * Returns [] gracefully when absent. Surfaced separately from telemetry events
 * because it is a causal overlay (R2).
 *
 * @param {string} root
 * @param {string[]} degraded
 * @returns {Array<Record<string, unknown>>}
 */
function loadChain(root, degraded) {
  if (!eventChain || typeof eventChain.readChain !== 'function') {
    degraded.push('chain: event-chain lib unavailable');
    return [];
  }
  try {
    const out = [];
    for (const ev of eventChain.readChain({ baseDir: root })) out.push(ev);
    return out;
  } catch (err) {
    degraded.push(`chain: read failed (${errMsg(err)})`);
    return [];
  }
}

/**
 * Load + aggregate costs from `.design/telemetry/costs.jsonl`.
 *
 * @param {string} root
 * @param {string[]} degraded
 * @returns {{rows:Array, byRuntime:Object, cumulative:Object, byCycle:Object} | null}
 */
function loadCosts(root, degraded) {
  try {
    const rows = readCosts({ root });
    const agg = aggregateCosts(rows);
    if (rows.length === 0) {
      degraded.push('costs: .design/telemetry/costs.jsonl empty or not found');
    }
    return { rows, byRuntime: agg.byRuntime, cumulative: agg.cumulative, byCycle: agg.byCycle };
  } catch (err) {
    degraded.push(`costs: load failed (${errMsg(err)})`);
    return null;
  }
}

/**
 * Load the design-context graph via design-context-query.cjs load(), enriching
 * with the lib's pure derivations (unreachable + coverage). File-scrape
 * fallback reads `.design/context-graph.json` directly when the lib is absent.
 *
 * @param {string} root
 * @param {string[]} degraded
 * @returns {{graph:Object, unreachable:string[], coverage:Object} | null}
 */
function loadGraph(root, degraded) {
  const graphPath = path.join(root, '.design', 'context-graph.json');

  if (designContextQuery && typeof designContextQuery.load === 'function') {
    try {
      const graph = designContextQuery.load(graphPath);
      let unreachableIds = [];
      let cov = null;
      try { unreachableIds = designContextQuery.unreachable(graph); } catch { /* tolerate */ }
      try { cov = designContextQuery.coverage(graph); } catch { /* tolerate */ }
      return { graph, unreachable: unreachableIds, coverage: cov };
    } catch (err) {
      // load() throws on missing file / invalid JSON — fall through to scrape.
      degraded.push(`graph: lib load failed (${errMsg(err)}) — using file scrape`);
    }
  } else {
    degraded.push('graph: design-context-query lib unavailable — using file scrape');
  }

  // File-scrape fallback: read the JSON directly.
  const raw = readFileOrNull(graphPath);
  if (raw == null) {
    degraded.push('graph: .design/context-graph.json not found');
    return null;
  }
  try {
    const graph = JSON.parse(raw);
    return { graph, unreachable: [], coverage: null };
  } catch (err) {
    degraded.push(`graph: scrape parse failed (${errMsg(err)})`);
    return null;
  }
}

/**
 * Load health checks via health-mirror getHealthChecks(root). Returns the
 * { checks: [...] } shape, or null + a degraded note on failure.
 *
 * @param {string} root
 * @param {string[]} degraded
 * @returns {Promise<{checks:Array<{name:string,status:string,detail:string}>} | null>}
 */
async function loadHealth(root, degraded) {
  if (!healthMirror || typeof healthMirror.getHealthChecks !== 'function') {
    degraded.push('health: health-mirror lib unavailable');
    return null;
  }
  try {
    return await healthMirror.getHealthChecks(root);
  } catch (err) {
    degraded.push(`health: getHealthChecks failed (${errMsg(err)})`);
    return null;
  }
}

/** Discovery sections (runtimes / worktrees / sessions) — each graceful. */
function loadRuntimes(degraded) {
  try {
    return discoverRuntimes();
  } catch (err) {
    degraded.push(`runtimes: discovery failed (${errMsg(err)})`);
    return [];
  }
}
function loadWorktrees(root, degraded) {
  try {
    return discoverWorktrees({ root });
  } catch (err) {
    degraded.push(`worktrees: discovery failed (${errMsg(err)})`);
    return [];
  }
}
function loadSessions(root, degraded) {
  try {
    const sessions = discoverSessions({ root });
    if (sessions.length === 0) {
      degraded.push('sessions: none persisted (Phase 55 R4 — best-effort)');
    }
    return sessions;
  } catch (err) {
    degraded.push(`sessions: discovery failed (${errMsg(err)})`);
    return [];
  }
}

/** Compact error message extractor. */
function errMsg(err) {
  return err && err.message ? String(err.message) : String(err);
}

// ---------------------------------------------------------------------------
// Public: loadDashboardModel
// ---------------------------------------------------------------------------
/**
 * Assemble the full dashboard model. NEVER throws — every section degrades to
 * null/[] with a `degraded[]` note on failure.
 *
 * @param {{root?: string}} [opts]
 * @returns {Promise<{
 *   status: string|null,
 *   phase: string|null,
 *   cycle: string|null,
 *   decisions: Array,
 *   blockers: Array,
 *   plans: Array,
 *   events: Array,
 *   chain: Array,
 *   costs: Object|null,
 *   graph: Object|null,
 *   health: Object|null,
 *   runtimes: Array,
 *   worktrees: Array,
 *   sessions: Array,
 *   degraded: string[],
 *   root: string,
 *   backend: 'sqlite'|'markdown',
 * }>}
 */
async function loadDashboardModel(opts = {}) {
  const degraded = [];
  let root;
  try {
    root = resolveRoot(opts);
  } catch {
    root = process.cwd();
    degraded.push('root: resolution failed — using cwd');
  }

  // Synchronous sections.
  const plans = loadPlans(root, degraded);
  const chain = loadChain(root, degraded);
  const costs = loadCosts(root, degraded);
  const graph = loadGraph(root, degraded);
  const runtimes = loadRuntimes(degraded);
  const worktrees = loadWorktrees(root, degraded);
  const sessions = loadSessions(root, degraded);

  // Async sections (typed-lib backed). Each loader already catches internally;
  // Promise.all is safe but we still guard defensively so one rejection can
  // never escape (loaders never reject, but belt-and-suspenders).
  const [stateRes, events, health] = await Promise.all([
    loadState(root, degraded).catch((err) => {
      degraded.push(`state: unexpected (${errMsg(err)})`);
      return { status: null, phase: null, cycle: null, decisions: [], blockers: [] };
    }),
    loadEvents(root, degraded).catch((err) => {
      degraded.push(`events: unexpected (${errMsg(err)})`);
      return [];
    }),
    loadHealth(root, degraded).catch((err) => {
      degraded.push(`health: unexpected (${errMsg(err)})`);
      return null;
    }),
  ]);

  return {
    status: stateRes.status,
    phase: stateRes.phase,
    cycle: stateRes.cycle,
    decisions: stateRes.decisions,
    blockers: stateRes.blockers,
    plans,
    events,
    chain,
    costs,
    graph,
    health,
    runtimes,
    worktrees,
    sessions,
    degraded,
    root,
    backend: stateRes.backend,
  };
}

module.exports = {
  loadDashboardModel,
  // Exposed for tests + sibling reuse (executors D/F may want the scrapers).
  resolveRoot,
  scrapeStateFile,
  scrapeEventsFile,
};
