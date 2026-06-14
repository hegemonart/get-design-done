'use strict';
/**
 * sdk/dashboard/tui/index.cjs — Phase 55 (GDD Dashboard, DEP-FREE), TUI-01/02/03 (executor D).
 *
 * The terminal dashboard main loop + the PURE per-pane renderer it draws with.
 * Consumes the two Round-1 pins:
 *   - A: sdk/dashboard/data/source.cjs  loadDashboardModel({root?}) -> the model.
 *   - B: sdk/dashboard/tui/ansi.cjs     box/columns/truncate/color/diffRender/... (pure).
 *
 * Two public functions:
 *
 *   renderFrame(model, {pane, cols, rows}) -> string
 *     The TESTABLE render. PURE: maps an immutable model + a viewport spec to a single
 *     multi-line frame string (rows joined by '\n', every row exactly `cols` visible columns
 *     so diffRender stays exact). NO Date.now / Math.random / I/O — given the same model it
 *     returns the same bytes. `pane` selects one of the 5 panes; an optional `scroll` offset
 *     and `now` (a fixed clock string, excluded by default) may be passed by the loop.
 *
 *   run({source?, stdin?, stdout?, once?, root?, interval?, now?}) -> Promise|void
 *     The loop. Defaults: source=loadDashboardModel, stdin=process.stdin, stdout=process.stdout.
 *       - once:true  -> load the model ONCE, write a single frame to stdout, return (NO raw
 *         mode, NO alt-screen, NO timers). This is the test seam + the `--once` smoke path.
 *       - otherwise  -> enter the alt screen, hide the cursor, enable keypress events
 *         (readline.emitKeypressEvents + setRawMode), poll the source + tail
 *         .design/telemetry/events.jsonl on `interval`, repaint via diffRender (no flicker),
 *         and restore the terminal (showCursor + altScreenExit) on q / Ctrl-C / SIGINT / SIGTERM.
 *
 * Read-only by design (D6): the dashboard NEVER mutates project state. The only "actions" are
 * navigation + scroll. Worktree-aware (D7 walk-up already done by the data plane): the Sessions
 * pane lists worktrees[] and flags a lightweight conflict when two worktrees report the same
 * open file (best-effort — sessions carry open_files[] when a future writer persists them).
 */

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const ansi = require('./ansi.cjs');

// Lazily require the risk-surface helper (same dep-free constraint as the data plane).
let _surfaceRisk = null;
function getSurfaceRisk() {
  if (_surfaceRisk === null) {
    try {
      ({ surfaceRisk: _surfaceRisk } = require('../data/risk-surface.cjs'));
    } catch {
      // If the module is unavailable for any reason, fall back to a no-op that returns
      // blank placeholder rows so the column still renders cleanly.
      _surfaceRisk = () => ({ risk_score: null, confidence: null, suggested_action: null, color: 'default' });
    }
  }
  return _surfaceRisk;
}

// Lazily require the data plane so `renderFrame` (the pure path) can be imported + unit-tested
// without paying for the data module's transitive requires. `run` resolves it on demand.
let _loadDashboardModel = null;
function defaultSource(opts) {
  if (_loadDashboardModel === null) {
    // sibling module in the same package; relative require is correct here (same tree, not a
    // cross-tree jump — the package-root walk-up lives inside source.cjs for ITS siblings).
    ({ loadDashboardModel: _loadDashboardModel } = require('../data/source.cjs'));
  }
  return _loadDashboardModel(opts);
}

// ---------------------------------------------------------------------------
// Pane registry
// ---------------------------------------------------------------------------

/** The 5 panes, in tab-cycle order. `key` is the stable id; `title` shows in the header + box. */
const PANES = Object.freeze([
  { key: 'sessions', title: 'Sessions' },
  { key: 'cycle', title: 'Cycle' },
  { key: 'cost', title: 'Cost' },
  { key: 'findings', title: 'Findings' },
  { key: 'context', title: 'DesignContext' },
]);

const PANE_KEYS = Object.freeze(PANES.map((p) => p.key));

/** Normalize a `pane` arg (string key or numeric index) to a valid 0-based index. */
function paneIndex(pane) {
  if (typeof pane === 'number' && Number.isFinite(pane)) {
    const n = Math.trunc(pane);
    return ((n % PANES.length) + PANES.length) % PANES.length;
  }
  const idx = PANE_KEYS.indexOf(String(pane));
  return idx === -1 ? 0 : idx;
}

// ---------------------------------------------------------------------------
// Small formatting helpers (pure)
// ---------------------------------------------------------------------------

/** A dim em-dash placeholder for an absent value. */
const NONE = '—';

function asText(v) {
  return v == null || v === '' ? NONE : String(v);
}

/** Round a USD number to 4 dp as a plain decimal string (deterministic; no locale). */
function usd(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0.0000';
  return x.toFixed(4);
}

/** Integer with no separators (deterministic; locale-free). */
function intStr(n) {
  const x = Number(n);
  return Number.isFinite(x) ? String(Math.trunc(x)) : '0';
}

/**
 * Clamp a scroll offset into [0, max] where max = length - visible (never negative).
 * @param {number} offset
 * @param {number} length total items
 * @param {number} visible rows available
 */
function clampScroll(offset, length, visible) {
  const max = Math.max(0, length - Math.max(0, visible));
  const o = Number.isFinite(offset) ? Math.trunc(offset) : 0;
  return Math.max(0, Math.min(o, max));
}

/**
 * Window an array to `visible` items starting at `offset`, returning the slice plus a
 * scroll-indicator suffix line when there is more above/below. Pure.
 * @returns {{slice: any[], more: string|null}}
 */
function windowItems(items, offset, visible) {
  const list = Array.isArray(items) ? items : [];
  const off = clampScroll(offset, list.length, visible);
  const slice = visible > 0 ? list.slice(off, off + visible) : [];
  let more = null;
  if (list.length > visible && visible > 0) {
    const shownEnd = off + slice.length;
    more = `… ${off + 1}-${shownEnd} of ${list.length}`;
  }
  return { slice, more };
}

// ---------------------------------------------------------------------------
// Per-pane body builders. Each returns string[] of CONTENT lines (the box wraps + pads them
// to the inner width, so these need not be exactly `inner` wide — but we truncate long lines
// defensively so a runaway value never breaks the layout). PURE.
// ---------------------------------------------------------------------------

/**
 * Sessions pane: runtimes presence + discovered sessions + git worktrees, with a lightweight
 * conflict note when two worktrees (via session.open_files, when present) report the same file.
 */
function bodySessions(model, inner, scroll) {
  const lines = [];
  const runtimes = Array.isArray(model.runtimes) ? model.runtimes : [];
  const present = runtimes.filter((r) => r && r.present);
  lines.push(ansi.color('Runtimes', { bold: true }) + `  (${present.length}/${runtimes.length} present)`);
  // Compact per-runtime status: name + a present/absent glyph.
  const rtCells = runtimes.map((r) => {
    const mark = r && r.present ? '●' : '○';
    return `${mark} ${asText(r && r.runtime)}`;
  });
  // Pack runtime cells into rows of up to 4 columns.
  const perRow = 4;
  for (let i = 0; i < rtCells.length; i += perRow) {
    const row = rtCells.slice(i, i + perRow);
    lines.push('  ' + ansi.columns(row, new Array(row.length).fill(Math.max(8, Math.floor((inner - 2) / perRow)))));
  }

  const sessions = Array.isArray(model.sessions) ? model.sessions : [];
  lines.push('');
  lines.push(ansi.color('Sessions', { bold: true }) + `  (${sessions.length})`);
  if (sessions.length === 0) {
    lines.push('  ' + ansi.color('none persisted (best-effort discovery)', { dim: true }));
  } else {
    for (const s of sessions) {
      const id = asText(s && s.id);
      const harness = asText(s && s.harness);
      lines.push(`  ${id}  [${harness}]`);
    }
  }

  const worktrees = Array.isArray(model.worktrees) ? model.worktrees : [];
  lines.push('');
  lines.push(ansi.color('Worktrees', { bold: true }) + `  (${worktrees.length})`);
  for (const w of worktrees) {
    const branch = w && w.detached ? '(detached)' : asText(w && w.branch);
    const flags = [];
    if (w && w.locked) flags.push('locked');
    if (w && w.bare) flags.push('bare');
    const suffix = flags.length ? `  {${flags.join(',')}}` : '';
    lines.push(`  ${branch}  ${ansi.color(asText(w && w.path), { dim: true })}${suffix}`);
  }

  const conflicts = detectWorktreeConflicts(sessions);
  if (conflicts.length) {
    lines.push('');
    lines.push(ansi.color('⚠ Conflicts', { fg: 'yellow', bold: true }));
    for (const c of conflicts) {
      lines.push('  ' + ansi.color(`${c.file} — open in ${c.count} worktrees`, { fg: 'yellow' }));
    }
  }

  return applyScroll(lines, scroll, inner);
}

/**
 * Detect a lightweight conflict: the same open file reported by two+ sessions whose worktree
 * roots differ. Sessions are the only carrier of open_files (R4 — a future writer persists
 * them); absent that data this returns []. PURE.
 */
function detectWorktreeConflicts(sessions) {
  const byFile = new Map(); // file -> Set<worktree-or-session-id>
  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!s || typeof s !== 'object') continue;
    const files = Array.isArray(s.open_files) ? s.open_files : [];
    const owner = String(s.worktree || s.root || s.id || 'unknown');
    for (const f of files) {
      if (typeof f !== 'string' || f === '') continue;
      if (!byFile.has(f)) byFile.set(f, new Set());
      byFile.get(f).add(owner);
    }
  }
  const out = [];
  for (const [file, owners] of byFile) {
    if (owners.size >= 2) out.push({ file, count: owners.size });
  }
  out.sort((a, b) => a.file.localeCompare(b.file));
  return out;
}

/** Cycle pane: phase / cycle / status + decisions[] + blockers[] + a plan count. */
function bodyCycle(model, inner, scroll) {
  const lines = [];
  lines.push(`${ansi.color('Phase', { bold: true })}  ${asText(model.phase)}` +
    `    ${ansi.color('Cycle', { bold: true })}  ${asText(model.cycle)}`);
  lines.push(`${ansi.color('Status', { bold: true })} ${asText(model.status)}`);

  const decisions = Array.isArray(model.decisions) ? model.decisions : [];
  lines.push('');
  lines.push(ansi.color('Decisions', { bold: true }) + `  (${decisions.length})`);
  if (decisions.length === 0) {
    lines.push('  ' + ansi.color(NONE, { dim: true }));
  } else {
    for (const d of decisions) {
      const id = asText(d && d.id);
      const status = (d && d.status) || '';
      const lockGlyph = status === 'locked'
        ? ansi.color('🔒', {})
        : (status === 'tentative' ? ansi.color('~', { dim: true }) : ' ');
      lines.push(`  ${lockGlyph} ${id}: ${asText(d && d.text)}`);
    }
  }

  const blockers = Array.isArray(model.blockers) ? model.blockers : [];
  lines.push('');
  const blkLabel = ansi.color('Blockers', { bold: true }) + `  (${blockers.length})`;
  lines.push(blockers.length ? ansi.color(blkLabel, { fg: 'red' }) : blkLabel);
  if (blockers.length === 0) {
    lines.push('  ' + ansi.color('none', { dim: true }));
  } else {
    for (const b of blockers) {
      const stage = asText(b && b.stage);
      const date = asText(b && b.date);
      lines.push('  ' + ansi.color(`[${stage} ${date}] ${asText(b && b.text)}`, { fg: 'red' }));
    }
  }

  const plans = Array.isArray(model.plans) ? model.plans : [];
  const planCount = plans.filter((p) => p && p.kind === 'plan').length;
  const summaryCount = plans.filter((p) => p && p.kind === 'summary').length;
  lines.push('');
  lines.push(`${ansi.color('Plans', { bold: true })}  ${planCount} plan / ${summaryCount} summary`);

  return applyScroll(lines, scroll, inner);
}

/** Cost pane: a per-runtime table (runtime | tokens_in | tokens_out | est_cost_usd) + cumulative. */
function bodyCost(model, inner, scroll) {
  const lines = [];
  const costs = model.costs;
  if (!costs || !costs.byRuntime) {
    lines.push(ansi.color('no cost telemetry', { dim: true }));
    return applyScroll(lines, scroll, inner);
  }

  // Column widths sized to the inner width: runtime gets the slack, numbers fixed.
  const wIn = 10;
  const wOut = 10;
  const wCost = 12;
  const wRt = Math.max(8, inner - (wIn + wOut + wCost) - 3); // 3 single-space separators

  const header = ansi.columns(
    [
      ansi.color('runtime', { bold: true }),
      ansi.color('tok_in', { bold: true }),
      ansi.color('tok_out', { bold: true }),
      ansi.color('cost_usd', { bold: true }),
    ],
    [wRt, wIn, wOut, wCost],
  );
  lines.push(header);
  lines.push('─'.repeat(Math.max(0, inner)));

  const entries = Object.entries(costs.byRuntime);
  for (const [rt, bucket] of entries) {
    lines.push(ansi.columns(
      [rt, intStr(bucket.tokens_in), intStr(bucket.tokens_out), usd(bucket.est_cost_usd)],
      [wRt, wIn, wOut, wCost],
    ));
  }
  if (entries.length === 0) {
    lines.push(ansi.color('(no rows)', { dim: true }));
  }

  // Cumulative footer.
  const cum = costs.cumulative || { tokens_in: 0, tokens_out: 0, est_cost_usd: 0 };
  lines.push('─'.repeat(Math.max(0, inner)));
  lines.push(ansi.columns(
    [
      ansi.color('TOTAL', { bold: true }),
      intStr(cum.tokens_in),
      intStr(cum.tokens_out),
      ansi.color(usd(cum.est_cost_usd), { bold: true }),
    ],
    [wRt, wIn, wOut, wCost],
  ));

  return applyScroll(lines, scroll, inner);
}

/**
 * Findings pane: recent events + health checks. The risk/confidence column is a BLANK
 * placeholder pre-Phase-56 (D8) — we render the header column but fill it with '·'.
 */
function bodyFindings(model, inner, scroll) {
  const lines = [];

  // Health checks first (compact name + status glyph).
  const health = model.health && Array.isArray(model.health.checks) ? model.health.checks : [];
  lines.push(ansi.color('Health checks', { bold: true }) + `  (${health.length})`);
  if (health.length === 0) {
    lines.push('  ' + ansi.color('unavailable', { dim: true }));
  } else {
    for (const c of health) {
      const ok = c && (c.status === 'pass' || c.status === 'ok');
      const isWarn = c && c.status === 'warn';
      const glyph = ok
        ? ansi.color('+', { fg: 'green' })
        : ansi.color(isWarn ? '!' : 'x', { fg: isWarn ? 'yellow' : 'red' });
      lines.push(`  ${glyph} ${asText(c && c.name)}  ${ansi.color(asText(c && c.detail), { dim: true })}`);
    }
  }

  // Recent events tail (last-N, newest last as stored). Risk column = placeholder.
  const events = Array.isArray(model.events) ? model.events : [];
  const TAIL = 12;
  const tail = events.slice(-TAIL);
  lines.push('');
  lines.push(ansi.columns(
    [ansi.color('event', { bold: true }), ansi.color('risk', { bold: true }), ansi.color('conf', { bold: true })],
    [Math.max(8, inner - 14), 5, 5],
  ));
  if (tail.length === 0) {
    lines.push('  ' + ansi.color('no events', { dim: true }));
  } else {
    const surfaceRisk = getSurfaceRisk();
    for (const ev of tail) {
      const name = (ev && (ev.event || ev.type || ev.kind)) || 'event';
      // Phase-56+: surface risk/confidence from risk_assessment events.
      // For pre-56 events that lack risk fields, surfaceRiskOne returns the blank placeholder.
      const surfaced = (ev && ev.type === 'risk_assessment')
        ? surfaceRisk(ev)
        : { risk_score: null, confidence: null, suggested_action: null, color: 'default' };
      const riskText = surfaced.risk_score !== null
        ? ansi.color(surfaced.risk_score.toFixed(2), { fg: surfaced.color !== 'default' ? surfaced.color : undefined })
        : ansi.color('·', { dim: true });
      const confText = surfaced.confidence !== null
        ? String(surfaced.confidence.toFixed(2))
        : ansi.color('·', { dim: true });
      lines.push(ansi.columns(
        [String(name), riskText, confText],
        [Math.max(8, inner - 14), 5, 5],
      ));
    }
  }

  return applyScroll(lines, scroll, inner);
}

/**
 * DesignContext pane: a TEXT TREE of graph nodes grouped by layer
 * (Atomic -> Molecular -> Organism -> Template), each layer listing per-type counts, plus a
 * coverage% line. Nodes without a `layer` are grouped under "(unlayered)".
 */
const LAYER_ORDER = Object.freeze(['Atomic', 'Molecular', 'Organism', 'Template']);

function bodyContext(model, inner, scroll) {
  const lines = [];
  const g = model.graph;
  if (!g || !g.graph) {
    lines.push(ansi.color('no design-context graph', { dim: true }));
    lines.push(ansi.color('(run the Phase 52 mapper to populate .design/context-graph.json)', { dim: true }));
    return applyScroll(lines, scroll, inner);
  }

  const nodes = Array.isArray(g.graph.nodes) ? g.graph.nodes : [];
  const edges = Array.isArray(g.graph.edges) ? g.graph.edges : [];

  // Coverage line.
  const cov = g.coverage;
  const covLine = cov && typeof cov.pct === 'number'
    ? `Coverage ${cov.pct}%  (${(cov.present_types || []).length}/${(cov.present_types || []).length + (cov.missing_types || []).length} types)`
    : 'Coverage —';
  lines.push(ansi.color(covLine, { bold: true }));
  lines.push(`${nodes.length} nodes · ${edges.length} edges · ${(g.unreachable || []).length} unreachable`);
  lines.push('');

  // Group nodes by layer, then by type within a layer.
  const byLayer = new Map();
  for (const lyr of LAYER_ORDER) byLayer.set(lyr, new Map());
  const unlayered = new Map();
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    const lyr = typeof n.layer === 'string' && LAYER_ORDER.includes(n.layer) ? n.layer : null;
    const type = typeof n.type === 'string' ? n.type : '(untyped)';
    const bucket = lyr ? byLayer.get(lyr) : unlayered;
    bucket.set(type, (bucket.get(type) || 0) + 1);
  }

  const renderLayer = (label, typeMap) => {
    const total = [...typeMap.values()].reduce((a, b) => a + b, 0);
    lines.push(`${ansi.color('▸', { fg: 'cyan' })} ${ansi.color(label, { bold: true })}  (${total})`);
    const types = [...typeMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (let i = 0; i < types.length; i++) {
      const [type, count] = types[i];
      const branch = i === types.length - 1 ? '└─' : '├─';
      lines.push(`   ${branch} ${type} ${ansi.color(`× ${count}`, { dim: true })}`);
    }
  };

  for (const lyr of LAYER_ORDER) {
    const typeMap = byLayer.get(lyr);
    if (typeMap.size > 0) renderLayer(lyr, typeMap);
  }
  if (unlayered.size > 0) renderLayer('(unlayered)', unlayered);

  return applyScroll(lines, scroll, inner);
}

/**
 * Apply a scroll offset to a list of content lines, truncating each to `inner` columns so a
 * single long line can never overflow the box. Returns the visible window unbounded by height
 * (the box honors `height` separately). We DO truncate horizontally here. PURE.
 */
function applyScroll(lines, scroll, inner) {
  // Horizontal safety only: truncate each content line to the inner width so a runaway value can
  // never overflow the box. VERTICAL scrolling/windowing is owned by renderFrame (windowItems +
  // the box height), so `scroll` is intentionally not consumed here.
  void scroll;
  return lines.map((ln) => ansi.truncate(ln, inner));
}

// ---------------------------------------------------------------------------
// renderFrame — the pure render
// ---------------------------------------------------------------------------

const PANE_BODY = {
  sessions: bodySessions,
  cycle: bodyCycle,
  cost: bodyCost,
  findings: bodyFindings,
  context: bodyContext,
};

/**
 * Render ONE full frame for `model` at the given viewport. PURE + deterministic.
 *
 * @param {object} model the dashboard model (from loadDashboardModel)
 * @param {{pane?: string|number, cols?: number, rows?: number, scroll?: number, now?: string}} [view]
 * @returns {string} the frame: `rows` lines joined by '\n', each exactly `cols` visible columns.
 */
function renderFrame(model, view = {}) {
  const m = model && typeof model === 'object' ? model : {};
  const cols = Math.max(20, view.cols | 0 || 80);
  const rows = Math.max(6, view.rows | 0 || 24);
  const idx = paneIndex(view.pane == null ? 0 : view.pane);
  const active = PANES[idx];

  // Header row (line 1): tab strip with the active pane highlighted.
  const tabs = PANES.map((p, i) => {
    const label = ` ${p.title} `;
    return i === idx ? ansi.color(label, { bold: true, fg: 'black', bg: 'cyan' }) : ansi.color(label, { dim: true });
  }).join(ansi.color('│', { dim: true }));
  const headerLine = ansi.padRight('GDD Dashboard ' + tabs, cols);

  // Degraded indicator (line 2): a compact count so the user knows data is partial.
  const degraded = Array.isArray(m.degraded) ? m.degraded : [];
  const rootStr = asText(m.root);
  const statusBar = degraded.length
    ? ansi.color(`⚠ ${degraded.length} degraded`, { fg: 'yellow' }) + '  ' + ansi.color(rootStr, { dim: true })
    : ansi.color('● live', { fg: 'green' }) + '  ' + ansi.color(rootStr, { dim: true });
  const statusLine = ansi.padRight(statusBar, cols);

  // Footer (last line): key hints.
  const footer = ansi.padRight(
    ansi.color('[tab] next  [shift-tab] prev  [↑/↓] scroll  [q] quit', { dim: true }),
    cols,
  );

  // The box occupies the rows between the 2 header lines and the 1 footer line.
  const boxHeight = Math.max(3, rows - 3);
  const inner = cols - 2;
  const bodyFn = PANE_BODY[active.key] || bodySessions;
  const bodyLines = bodyFn(m, inner, view.scroll || 0);

  // Vertically window the body to the box's inner height (boxHeight - 2 for the borders),
  // appending a scroll hint when clipped.
  const innerHeight = Math.max(1, boxHeight - 2);
  const { slice, more } = windowItems(bodyLines, view.scroll || 0, innerHeight);
  const shown = more ? slice.slice(0, Math.max(0, innerHeight - 1)).concat(ansi.color(more, { dim: true })) : slice;

  const boxed = ansi.box({
    title: active.title,
    lines: shown,
    width: cols,
    height: boxHeight,
    border: 'round',
  });

  const all = [headerLine, statusLine, ...boxed, footer];

  // Enforce EXACTLY `rows` lines so diffRender is exact across frames.
  while (all.length < rows) all.push(ansi.padRight('', cols));
  if (all.length > rows) all.length = rows;

  // Defensive: pad every line to exactly `cols` (box already does; header/footer too).
  return all.map((ln) => ansi.padRight(ln, cols)).join('\n');
}

// ---------------------------------------------------------------------------
// run — the loop
// ---------------------------------------------------------------------------

/** Resolve the viewport size from a stdout-ish stream (graceful defaults). */
function viewportOf(stdout) {
  const cols = (stdout && Number.isInteger(stdout.columns) && stdout.columns > 0) ? stdout.columns : 80;
  const rows = (stdout && Number.isInteger(stdout.rows) && stdout.rows > 0) ? stdout.rows : 24;
  return { cols, rows };
}

/**
 * Run the dashboard.
 *
 * @param {{
 *   source?: (opts:{root?:string}) => Promise<object>|object,
 *   stdin?: NodeJS.ReadStream,
 *   stdout?: NodeJS.WriteStream,
 *   once?: boolean,
 *   root?: string,
 *   interval?: number,
 *   now?: string,
 * }} [opts]
 * @returns {Promise<{frame:string}>|Promise<void>}
 */
async function run(opts = {}) {
  const source = typeof opts.source === 'function' ? opts.source : defaultSource;
  const stdout = opts.stdout || process.stdout;
  const stdin = opts.stdin || process.stdin;
  const root = opts.root;

  // --- once: render a single frame and return (test seam + --once smoke). -------------------
  if (opts.once) {
    let model;
    try {
      model = await source({ root });
    } catch (err) {
      // The data plane never throws, but a custom test source might. Degrade to an empty frame.
      model = { degraded: [`source threw: ${err && err.message ? err.message : String(err)}`], root: root || null };
    }
    const { cols, rows } = viewportOf(stdout);
    const frame = renderFrame(model, { pane: 0, cols, rows, now: opts.now });
    stdout.write(frame + '\n');
    return { frame };
  }

  // --- interactive loop ---------------------------------------------------------------------
  const state = {
    paneIdx: 0,
    scroll: 0,
    model: { degraded: ['loading…'], root: root || null },
    prevLines: [],
    running: true,
  };

  // Terminal setup: alt screen + hide cursor. Guard each call (a non-TTY test stdout lacks them).
  const write = (s) => { try { stdout.write(s); } catch { /* ignore */ } };
  write(ansi.altScreenEnter());
  write(ansi.hideCursor());
  write(ansi.clearScreen());

  let rawEnabled = false;
  if (stdin && typeof stdin.setRawMode === 'function' && stdin.isTTY) {
    try {
      readline.emitKeypressEvents(stdin);
      stdin.setRawMode(true);
      rawEnabled = true;
    } catch { /* non-interactive — keypress nav simply won't fire */ }
  } else if (stdin) {
    // Non-TTY (or a fake EventEmitter in tests): still wire keypress events so injected
    // 'keypress' emissions route. emitKeypressEvents is a no-op without a real stream, so the
    // test feeds {name} objects directly via stdin.emit('keypress', ...).
    try { readline.emitKeypressEvents(stdin); } catch { /* ignore */ }
  }

  // Repaint via diffRender (no flicker): only changed rows are rewritten.
  const paint = () => {
    const { cols, rows } = viewportOf(stdout);
    const next = renderFrame(state.model, {
      pane: state.paneIdx,
      cols,
      rows,
      scroll: state.scroll,
      now: opts.now,
    }).split('\n');
    const opsList = ansi.diffRender(state.prevLines, next);
    let buf = '';
    for (const op of opsList) {
      buf += ansi.cursorTo(op.row, 1) + ansi.clearLine() + op.text;
    }
    if (buf) write(buf);
    state.prevLines = next;
  };

  // First paint (loading state), then load real data.
  paint();

  const refresh = async () => {
    if (!state.running) return;
    try {
      const model = await source({ root });
      if (model && typeof model === 'object') state.model = model;
    } catch {
      // keep the previous model; the loop is resilient
    }
    if (state.running) paint();
  };
  await refresh();

  // --- live refresh: poll the source + tail telemetry on an interval. -----------------------
  const intervalMs = Number.isFinite(opts.interval) ? Math.max(250, opts.interval | 0) : 1500;
  const eventsPath = root
    ? path.join(root, '.design', 'telemetry', 'events.jsonl')
    : (state.model && state.model.root ? path.join(state.model.root, '.design', 'telemetry', 'events.jsonl') : null);
  let lastSize = -1;
  try {
    if (eventsPath && fs.existsSync(eventsPath)) lastSize = fs.statSync(eventsPath).size;
  } catch { /* ignore */ }

  const timer = setInterval(() => {
    if (!state.running) return;
    // Cheap tail probe: only do a full reload when the events file grew (or every tick if we
    // can't stat it). This keeps a steady terminal at near-zero cost.
    let changed = true;
    try {
      if (eventsPath && fs.existsSync(eventsPath)) {
        const size = fs.statSync(eventsPath).size;
        changed = size !== lastSize;
        lastSize = size;
      }
    } catch { /* fall back to always-refresh */ }
    if (changed) void refresh();
  }, intervalMs);
  if (timer && typeof timer.unref === 'function') timer.unref();

  // --- teardown + key handling --------------------------------------------------------------
  return await new Promise((resolve) => {
    const cleanup = () => {
      if (!state.running) return;
      state.running = false;
      clearInterval(timer);
      if (rawEnabled && typeof stdin.setRawMode === 'function') {
        try { stdin.setRawMode(false); } catch { /* ignore */ }
      }
      try { stdin.removeListener('keypress', onKey); } catch { /* ignore */ }
      if (typeof stdin.pause === 'function') { try { stdin.pause(); } catch { /* ignore */ } }
      write(ansi.showCursor());
      write(ansi.altScreenExit());
      resolve();
    };

    const onKey = (str, key) => {
      // `key` is the readline keypress descriptor; tests may emit a bare {name}/{sequence}.
      const k = key || {};
      const name = k.name || str;
      if ((k.ctrl && name === 'c') || name === 'q') return cleanup();
      if (name === 'tab' && k.shift) {
        state.paneIdx = (state.paneIdx - 1 + PANES.length) % PANES.length;
        state.scroll = 0;
        return paint();
      }
      if (name === 'tab') {
        state.paneIdx = (state.paneIdx + 1) % PANES.length;
        state.scroll = 0;
        return paint();
      }
      if (name === 'down' || name === 'j') { state.scroll += 1; return paint(); }
      if (name === 'up' || name === 'k') { state.scroll = Math.max(0, state.scroll - 1); return paint(); }
      if (name === 'pagedown') { state.scroll += 10; return paint(); }
      if (name === 'pageup') { state.scroll = Math.max(0, state.scroll - 10); return paint(); }
    };

    if (stdin && typeof stdin.on === 'function') stdin.on('keypress', onKey);

    // Signal-based teardown so Ctrl-C / kill restores the terminal.
    const onSig = () => cleanup();
    process.once('SIGINT', onSig);
    process.once('SIGTERM', onSig);
  });
}

// ---------------------------------------------------------------------------
// CLI entry — `node sdk/dashboard/tui/index.cjs [--once] [--root <dir>]`.
// This is what bin/hone-dashboard spawns. Kept tiny: parse a couple of flags,
// invoke run(), and translate the result to an exit code. Read-only; never
// throws out (errors degrade to a non-zero exit + a stderr note).
// ---------------------------------------------------------------------------

/**
 * Parse the dashboard CLI argv (a minimal hand-rolled parser — zero deps).
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{once:boolean, help:boolean, root:string|undefined, interval:number|undefined}}
 */
function parseCliArgs(argv) {
  const out = { once: false, help: false, root: undefined, interval: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') out.once = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else if (a === '--root') out.root = argv[++i];
    else if (a.startsWith('--root=')) out.root = a.slice('--root='.length);
    else if (a === '--interval') out.interval = Number.parseInt(argv[++i], 10);
    else if (a.startsWith('--interval=')) out.interval = Number.parseInt(a.slice('--interval='.length), 10);
  }
  return out;
}

const CLI_USAGE = [
  'Usage: hone-dashboard [--once] [--root <dir>] [--interval <ms>]',
  '',
  '  A read-only terminal dashboard for a GDD project: Sessions / Cycle / Cost /',
  '  Findings / DesignContext panes. Live-refreshes by polling the project state +',
  '  tailing .design/telemetry/events.jsonl.',
  '',
  '  --once            Render a single frame to stdout and exit (no raw mode / loop).',
  '  --root <dir>      Project root to read (default: GDD_PROJECT_ROOT / package-root).',
  '  --interval <ms>   Live-refresh poll interval (default 1500; min 250).',
  '  -h, --help        Show this help.',
  '',
  '  Keys (interactive): [tab]/[shift-tab] cycle panes · [↑/↓] scroll · [q] quit.',
  '',
].join('\n');

async function mainCli(argv) {
  const args = parseCliArgs(argv);
  if (args.help) {
    process.stdout.write(CLI_USAGE);
    return 0;
  }
  try {
    await run({ once: args.once, root: args.root, interval: args.interval });
    return 0;
  } catch (err) {
    process.stderr.write(`hone-dashboard: ${err && err.message ? err.message : String(err)}\n`);
    return 1;
  }
}

if (require.main === module) {
  mainCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`hone-dashboard: ${err && err.message ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}

module.exports = {
  run,
  renderFrame,
  // CLI surface (exported for tests).
  parseCliArgs,
  mainCli,
  // Exposed for tests + sibling reuse.
  PANES,
  PANE_KEYS,
  paneIndex,
  detectWorktreeConflicts,
  clampScroll,
  windowItems,
};
