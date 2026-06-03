'use strict';
/**
 * test/suite/phase-55-tui.test.cjs — Phase 55 (GDD Dashboard, DEP-FREE), TUI-01/02/03 (executor D).
 *
 * Tag: '55-04:'.
 *
 * Proves sdk/dashboard/tui/index.cjs — the terminal dashboard loop + its PURE per-pane renderer.
 * Three concerns, all hermetic (NO real raw mode, NO real TTY, NO FS for the render path):
 *
 *   1. run({once:true, source}) — the test seam: load the model ONCE, write a single frame to a
 *      fake writable, return {frame}. The snapshot must contain all 5 pane titles + key model
 *      values (root, status, runtime presence). No raw mode, no timers, no alt-screen restore.
 *
 *   2. renderFrame(model, {pane, cols, rows}) — the pure render. Per-pane structural asserts:
 *      every frame is EXACTLY `rows` lines of EXACTLY `cols` visible columns (so B's diffRender
 *      stays exact); the Cost pane shows the per-runtime table + a cumulative TOTAL; the
 *      DesignContext pane groups nodes by layer with a coverage line; the Findings pane shows a
 *      BLANK risk/confidence placeholder (D8, pre-Phase-56). Determinism: same model -> same bytes.
 *
 *   3. Keypress routing — drive an INJECTED stdin EventEmitter (isTTY:false, so setRawMode is
 *      never touched): 'tab' advances the pane, 'shift-tab' retreats, 'q' / Ctrl-C quit (the
 *      run() promise resolves AND the terminal is restored: showCursor is emitted on teardown).
 *
 * DEP-FREE: Node builtins only (node:test, node:assert, node:events). NO_COLOR is forced so the
 * snapshot is plain text (the SGR-wrap path is B's test surface, not this one).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

// Force NO_COLOR before requiring the module so ansi.color() is a no-op (plain-text frames).
process.env.NO_COLOR = '1';

const tui = require('../../sdk/dashboard/tui/index.cjs');
const ansi = require('../../sdk/dashboard/tui/ansi.cjs');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A fully-populated, deterministic dashboard model (mirrors A's loadDashboardModel shape). */
function fixtureModel() {
  return {
    status: 'in_progress',
    phase: 'plan',
    cycle: 'c-55',
    decisions: [
      { id: 'D-1', text: 'Go fully dep-free', status: 'locked' },
      { id: 'D-2', text: 'Web layer swappable', status: 'tentative' },
    ],
    blockers: [{ stage: 'plan', date: '2026-06-02', text: 'waiting on graph fixture' }],
    plans: [
      { phase: '55', plan: '55-04', kind: 'plan', file: 'x-PLAN.md' },
      { phase: '55', plan: '55-04', kind: 'summary', file: 'x-SUMMARY.md' },
    ],
    events: [{ event: 'quality_gate_a11y' }, { type: 'plan_started' }],
    chain: [],
    costs: {
      rows: [],
      byRuntime: {
        claude: { tokens_in: 1000, tokens_out: 500, est_cost_usd: 0.1234 },
        gemini: { tokens_in: 200, tokens_out: 100, est_cost_usd: 0.02 },
      },
      cumulative: { tokens_in: 1200, tokens_out: 600, est_cost_usd: 0.1434 },
      byCycle: {},
    },
    graph: {
      graph: {
        nodes: [
          { id: 'a', type: 'token', layer: 'Atomic' },
          { id: 'b', type: 'component', layer: 'Molecular' },
          { id: 'c', type: 'component', layer: 'Molecular' },
          { id: 'd', type: 'screen', layer: 'Template' },
        ],
        edges: [{ source: 'a', target: 'b', direction: 'forward' }],
      },
      unreachable: ['c'],
      coverage: { present_types: ['token', 'component', 'screen'], missing_types: ['variant'], pct: 30 },
    },
    health: {
      checks: [
        { name: 'design_dir', status: 'pass', detail: 'ok' },
        { name: 'graph_valid', status: 'warn', detail: 'orphans present' },
      ],
    },
    runtimes: [
      { runtime: 'claude', configDir: '/c', skillsBase: '/s', present: true },
      { runtime: 'gemini', configDir: '/g', skillsBase: '/gs', present: false },
    ],
    worktrees: [
      { path: '/repo', head: 'abc', branch: 'phase/55', detached: false, bare: false, locked: false },
    ],
    sessions: [],
    degraded: [],
    root: '/repo',
  };
}

/** A minimal "no GDD project" model — every data section absent (the graceful path). */
function emptyModel() {
  return {
    status: null, phase: null, cycle: null,
    decisions: [], blockers: [], plans: [],
    events: [], chain: [], costs: null, graph: null, health: null,
    runtimes: [], worktrees: [], sessions: [],
    degraded: ['state: .design/STATE.md not found', 'graph: .design/context-graph.json not found'],
    root: '/empty',
  };
}

/** A fake writable that records every write() chunk. Mimics a non-TTY stdout with a fixed size. */
function fakeWritable({ columns = 80, rows = 24 } = {}) {
  const chunks = [];
  return {
    columns,
    rows,
    isTTY: false,
    write(s) { chunks.push(String(s)); return true; },
    text() { return chunks.join(''); },
    chunks,
  };
}

/** Visible width of a line (SGR-stripped, wide-char aware) — reuses B's measurer. */
function vwidth(line) {
  return ansi.visibleWidth(line);
}

// ---------------------------------------------------------------------------
// 1. run({once:true}) — the frame-capture test seam
// ---------------------------------------------------------------------------

test('55-04: run({once:true}) renders one frame containing all 5 pane titles + key model values', async () => {
  const out = fakeWritable();
  const res = await tui.run({ once: true, source: async () => fixtureModel(), stdout: out });

  // The returned frame and the written output agree.
  assert.equal(typeof res.frame, 'string');
  assert.ok(out.text().includes(res.frame), 'written output contains the returned frame');

  // All 5 pane titles appear (the tab strip).
  for (const title of ['Sessions', 'Cycle', 'Cost', 'Findings', 'DesignContext']) {
    assert.match(res.frame, new RegExp(title), `frame mentions pane "${title}"`);
  }

  // Key model values surface on the default (Sessions) pane + status bar.
  assert.match(res.frame, /\/repo/, 'frame shows the project root');
  assert.match(res.frame, /Runtimes/, 'frame shows the Runtimes section');
  assert.match(res.frame, /1\/2 present/, 'frame shows runtime presence count (1/2)');
  // No degraded sections in the fixture -> the "live" indicator, not a warning.
  assert.match(res.frame, /live/, 'frame shows the live indicator when not degraded');
});

test('55-04: run({once:true}) does NOT enter raw mode or alt-screen (no teardown escapes written)', async () => {
  const out = fakeWritable();
  // A stdin that would THROW if setRawMode were called — proves once-mode never touches it.
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.setRawMode = () => { throw new Error('setRawMode must not be called in once-mode'); };

  const res = await tui.run({ once: true, source: async () => fixtureModel(), stdout: out, stdin });
  // once-mode writes exactly the frame (+ a trailing newline) — no alt-screen enter/exit, no cursor toggles.
  assert.ok(!out.text().includes(ansi.altScreenEnter()), 'no alt-screen enter in once-mode');
  assert.ok(!out.text().includes(ansi.hideCursor()), 'no hide-cursor in once-mode');
  assert.equal(out.text(), res.frame + '\n');
});

test('55-04: run({once:true}) degrades gracefully on an empty model (no GDD project)', async () => {
  const out = fakeWritable();
  const res = await tui.run({ once: true, source: async () => emptyModel(), stdout: out });
  assert.match(res.frame, /degraded/, 'empty model surfaces a degraded indicator');
  // Still a full, well-formed frame: 24 rows.
  assert.equal(res.frame.split('\n').length, 24);
});

test('55-04: run({once:true}) survives a source that throws (renders a degraded frame, exits clean)', async () => {
  const out = fakeWritable();
  const res = await tui.run({ once: true, source: async () => { throw new Error('boom'); }, stdout: out });
  assert.equal(typeof res.frame, 'string');
  assert.match(res.frame, /degraded/, 'a throwing source degrades rather than crashing');
});

// ---------------------------------------------------------------------------
// 2. renderFrame — the pure render
// ---------------------------------------------------------------------------

test('55-04: renderFrame emits EXACTLY rows lines of EXACTLY cols visible columns', () => {
  const model = fixtureModel();
  for (const pane of ['sessions', 'cycle', 'cost', 'findings', 'context']) {
    const frame = tui.renderFrame(model, { pane, cols: 80, rows: 24 });
    const lines = frame.split('\n');
    assert.equal(lines.length, 24, `pane ${pane}: 24 rows`);
    for (const ln of lines) {
      assert.equal(vwidth(ln), 80, `pane ${pane}: every line is 80 visible columns`);
    }
  }
});

test('55-04: renderFrame is deterministic (same model -> identical bytes)', () => {
  const a = tui.renderFrame(fixtureModel(), { pane: 'cost', cols: 80, rows: 24 });
  const b = tui.renderFrame(fixtureModel(), { pane: 'cost', cols: 80, rows: 24 });
  assert.equal(a, b);
});

test('55-04: renderFrame cost pane shows the per-runtime table + cumulative TOTAL', () => {
  const frame = tui.renderFrame(fixtureModel(), { pane: 'cost', cols: 80, rows: 24 });
  assert.match(frame, /runtime/, 'cost header');
  assert.match(frame, /tok_in/, 'cost header tok_in');
  assert.match(frame, /cost_usd/, 'cost header cost_usd');
  assert.match(frame, /claude/, 'per-runtime row: claude');
  assert.match(frame, /gemini/, 'per-runtime row: gemini');
  assert.match(frame, /0\.1234/, 'claude cost (4dp)');
  assert.match(frame, /TOTAL/, 'cumulative footer');
  assert.match(frame, /0\.1434/, 'cumulative cost (4dp)');
});

test('55-04: renderFrame cycle pane shows phase/cycle/status + decisions + blockers + plan counts', () => {
  const frame = tui.renderFrame(fixtureModel(), { pane: 'cycle', cols: 80, rows: 24 });
  assert.match(frame, /plan/, 'phase value');
  assert.match(frame, /c-55/, 'cycle value');
  assert.match(frame, /in_progress/, 'status value');
  assert.match(frame, /D-1/, 'decision D-1');
  assert.match(frame, /Go fully dep-free/, 'decision text');
  assert.match(frame, /waiting on graph fixture/, 'blocker text');
  assert.match(frame, /1 plan \/ 1 summary/, 'plan/summary counts');
});

test('55-04: renderFrame DesignContext pane groups nodes by layer with per-type counts + coverage', () => {
  const frame = tui.renderFrame(fixtureModel(), { pane: 'context', cols: 80, rows: 24 });
  assert.match(frame, /Coverage 30%/, 'coverage line');
  assert.match(frame, /Atomic/, 'Atomic layer');
  assert.match(frame, /Molecular/, 'Molecular layer');
  assert.match(frame, /Template/, 'Template layer');
  assert.match(frame, /token/, 'token type under a layer');
  assert.match(frame, /component/, 'component type under a layer');
  // Molecular has two `component` nodes -> a "× 2" count.
  assert.match(frame, /component .*2/, 'component count of 2 in Molecular');
  assert.match(frame, /4 nodes/, 'node total');
  assert.match(frame, /1 unreachable/, 'unreachable count');
});

test('55-04: renderFrame Findings pane shows a BLANK risk/confidence placeholder (D8, pre-Phase-56)', () => {
  const frame = tui.renderFrame(fixtureModel(), { pane: 'findings', cols: 80, rows: 24 });
  assert.match(frame, /Health checks/, 'health section');
  assert.match(frame, /design_dir/, 'a health check name');
  // The risk + conf columns exist as headers...
  assert.match(frame, /risk/, 'risk column header');
  assert.match(frame, /conf/, 'confidence column header');
  // ...but the data cells are the placeholder '·' (NOT a number) pre-Phase-56.
  assert.match(frame, /·/, 'placeholder dot for risk/confidence');
  assert.ok(!/risk\s+\d/.test(frame), 'no numeric risk score is rendered yet');
});

test('55-04: renderFrame context pane degrades to a friendly message when no graph', () => {
  const frame = tui.renderFrame(emptyModel(), { pane: 'context', cols: 80, rows: 24 });
  assert.match(frame, /no design-context graph/, 'graceful no-graph message');
  assert.equal(frame.split('\n').length, 24, 'still a full frame');
});

test('55-04: renderFrame highlights the active pane in the tab strip', () => {
  // With NO_COLOR the highlight is not an SGR difference, but the active pane index drives the
  // body — assert the body switches. Sessions body has "Runtimes"; Cost body has "cost_usd".
  const sessions = tui.renderFrame(fixtureModel(), { pane: 0, cols: 80, rows: 24 });
  const cost = tui.renderFrame(fixtureModel(), { pane: 2, cols: 80, rows: 24 });
  assert.match(sessions, /Runtimes/);
  assert.ok(!/cost_usd/.test(sessions), 'sessions pane body is not the cost table');
  assert.match(cost, /cost_usd/);
  assert.ok(!/Runtimes/.test(cost), 'cost pane body is not the sessions list');
});

test('55-04: renderFrame tolerates tiny/odd viewports without throwing or overflowing', () => {
  for (const [cols, rows] of [[20, 6], [40, 10], [200, 60]]) {
    const frame = tui.renderFrame(fixtureModel(), { pane: 'cost', cols, rows });
    const lines = frame.split('\n');
    assert.equal(lines.length, rows, `${cols}x${rows}: row count`);
    for (const ln of lines) assert.equal(vwidth(ln), cols, `${cols}x${rows}: column width`);
  }
});

// ---------------------------------------------------------------------------
// 3. Keypress routing — injected stdin EventEmitter, NO real raw mode
// ---------------------------------------------------------------------------

/** A fake stdin: an EventEmitter that looks like a non-TTY readable. NO setRawMode (never a TTY). */
function fakeStdin() {
  const ee = new EventEmitter();
  ee.isTTY = false;            // -> run() will NOT call setRawMode
  ee.pause = () => {};
  ee.resume = () => {};
  // emitKeypressEvents is a no-op on a non-stream; tests emit 'keypress' directly.
  return ee;
}

test('55-04: keypress "tab" advances the active pane; "shift-tab" retreats; "q" quits + restores', async () => {
  const out = fakeWritable();
  const stdin = fakeStdin();

  // Start the interactive loop. It resolves only when we quit.
  const runPromise = tui.run({
    source: async () => fixtureModel(),
    stdout: out,
    stdin,
    interval: 100000, // effectively disable the timer for the test
  });

  // Let the initial paint + first refresh flush (run awaits an initial refresh before returning
  // the teardown promise, so a microtask turn is enough to wire the keypress listener).
  await new Promise((r) => setImmediate(r));

  // Sanity: alt-screen WAS entered (interactive mode, unlike once-mode).
  assert.ok(out.text().includes(ansi.altScreenEnter()), 'interactive mode enters the alt screen');
  assert.ok(out.text().includes(ansi.hideCursor()), 'interactive mode hides the cursor');

  // Default pane is Sessions -> its body ("Runtimes") is in the painted output.
  assert.match(out.text(), /Runtimes/, 'initial pane is Sessions');

  // Press TAB -> advance to Cycle. The repaint diff writes the Cycle body ("Decisions").
  stdin.emit('keypress', '\t', { name: 'tab' });
  await new Promise((r) => setImmediate(r));
  assert.match(out.text(), /Decisions/, 'tab advanced to the Cycle pane');

  // Press TAB again -> Cost ("cost_usd").
  stdin.emit('keypress', '\t', { name: 'tab' });
  await new Promise((r) => setImmediate(r));
  assert.match(out.text(), /cost_usd/, 'tab advanced to the Cost pane');

  // Press SHIFT-TAB -> back to Cycle.
  const before = out.chunks.length;
  stdin.emit('keypress', '\t', { name: 'tab', shift: true });
  await new Promise((r) => setImmediate(r));
  assert.ok(out.chunks.length > before, 'shift-tab triggered a repaint');

  // Press q -> quit. The run promise resolves and the terminal is restored.
  stdin.emit('keypress', 'q', { name: 'q' });
  await runPromise; // resolves on cleanup

  assert.ok(out.text().includes(ansi.showCursor()), 'quit restores the cursor');
  assert.ok(out.text().includes(ansi.altScreenExit()), 'quit leaves the alt screen');
});

test('55-04: Ctrl-C (key.ctrl + "c") quits the loop and restores the terminal', async () => {
  const out = fakeWritable();
  const stdin = fakeStdin();
  const runPromise = tui.run({ source: async () => fixtureModel(), stdout: out, stdin, interval: 100000 });
  await new Promise((r) => setImmediate(r));

  stdin.emit('keypress', '', { name: 'c', ctrl: true });
  await runPromise;

  assert.ok(out.text().includes(ansi.showCursor()), 'Ctrl-C restores the cursor');
  assert.ok(out.text().includes(ansi.altScreenExit()), 'Ctrl-C leaves the alt screen');
});

test('55-04: arrow keys scroll an overflowing pane (the frame changes) and never throw', async () => {
  // A SHORT viewport (rows:10) so the Sessions body overflows the inner height -> a 'down' press
  // shifts the scroll window and the rendered frame genuinely changes (diffRender emits ops).
  const out = fakeWritable({ columns: 80, rows: 10 });
  const stdin = fakeStdin();
  const runPromise = tui.run({ source: async () => fixtureModel(), stdout: out, stdin, interval: 100000 });
  await new Promise((r) => setImmediate(r));

  const before = out.chunks.length;
  stdin.emit('keypress', null, { name: 'down' });
  stdin.emit('keypress', null, { name: 'down' });
  await new Promise((r) => setImmediate(r));
  assert.ok(out.chunks.length > before, 'scrolling an overflowing pane produced repaints');

  // Scrolling back up + past the top must not throw (clampScroll floors at 0).
  stdin.emit('keypress', null, { name: 'up' });
  stdin.emit('keypress', null, { name: 'up' });
  stdin.emit('keypress', null, { name: 'up' });
  await new Promise((r) => setImmediate(r));

  stdin.emit('keypress', 'q', { name: 'q' });
  await runPromise;
  assert.ok(out.text().includes(ansi.showCursor()), 'terminal restored after scroll+quit');
});

// ---------------------------------------------------------------------------
// 4. CLI surface (parseCliArgs) — the bin trampoline's argv contract
// ---------------------------------------------------------------------------

test('55-04: parseCliArgs parses --once / --root / --interval / --help', () => {
  assert.deepEqual(tui.parseCliArgs(['--once']), { once: true, help: false, root: undefined, interval: undefined });
  assert.deepEqual(tui.parseCliArgs(['--root', '/p']), { once: false, help: false, root: '/p', interval: undefined });
  assert.deepEqual(tui.parseCliArgs(['--root=/p']), { once: false, help: false, root: '/p', interval: undefined });
  assert.deepEqual(tui.parseCliArgs(['--interval', '500']), { once: false, help: false, root: undefined, interval: 500 });
  assert.equal(tui.parseCliArgs(['-h']).help, true);
  assert.equal(tui.parseCliArgs(['--help']).help, true);
});

// ---------------------------------------------------------------------------
// 5. Pure helpers
// ---------------------------------------------------------------------------

test('55-04: paneIndex normalizes string keys + numeric indices (wrapping)', () => {
  assert.equal(tui.paneIndex('sessions'), 0);
  assert.equal(tui.paneIndex('context'), 4);
  assert.equal(tui.paneIndex('bogus'), 0);
  assert.equal(tui.paneIndex(2), 2);
  assert.equal(tui.paneIndex(5), 0, 'wraps past the end');
  assert.equal(tui.paneIndex(-1), 4, 'wraps below zero');
});

test('55-04: clampScroll keeps offsets within [0, length-visible]', () => {
  assert.equal(tui.clampScroll(-5, 10, 3), 0);
  assert.equal(tui.clampScroll(100, 10, 3), 7);
  assert.equal(tui.clampScroll(2, 10, 3), 2);
  assert.equal(tui.clampScroll(0, 2, 5), 0, 'never negative when content < viewport');
});

test('55-04: detectWorktreeConflicts flags a file open in 2+ worktrees, ignores single-owner files', () => {
  const sessions = [
    { id: 's1', worktree: '/wt-a', open_files: ['src/x.ts', 'src/y.ts'] },
    { id: 's2', worktree: '/wt-b', open_files: ['src/x.ts'] },          // x.ts conflict
    { id: 's3', worktree: '/wt-c', open_files: ['src/z.ts'] },          // no conflict
  ];
  const conflicts = tui.detectWorktreeConflicts(sessions);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].file, 'src/x.ts');
  assert.equal(conflicts[0].count, 2);
});

test('55-04: detectWorktreeConflicts returns [] when sessions carry no open_files (R4 default)', () => {
  assert.deepEqual(tui.detectWorktreeConflicts([{ id: 's1' }, { id: 's2' }]), []);
  assert.deepEqual(tui.detectWorktreeConflicts([]), []);
  assert.deepEqual(tui.detectWorktreeConflicts(null), []);
});

test('55-04: windowItems slices to the visible window and reports a "more" hint when clipped', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];
  const w1 = tui.windowItems(items, 0, 2);
  assert.deepEqual(w1.slice, ['a', 'b']);
  assert.match(w1.more, /1-2 of 5/);
  const w2 = tui.windowItems(items, 3, 2);
  assert.deepEqual(w2.slice, ['d', 'e']);
  const w3 = tui.windowItems(items, 0, 10);
  assert.deepEqual(w3.slice, items);
  assert.equal(w3.more, null, 'no hint when everything fits');
});
