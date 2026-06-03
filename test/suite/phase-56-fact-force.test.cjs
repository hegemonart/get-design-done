'use strict';
/**
 * test/suite/phase-56-fact-force.test.cjs — Phase 56 fact-forcing gate (56-03:).
 *
 * Exercises hooks/gdd-fact-force.js end-to-end via spawnSync (the repo's
 * canonical runHook pattern) over a hermetic tmpdir, plus the read-tracking
 * edit to hooks/gdd-decision-injector.js and scripts/lib/risk/consumers.cjs.
 *
 * Graph + session-state are injected through the tmpdir + a fake payload; the
 * Phase 52 graph shape is { nodes:[{id,type,name}], edges:[{source,target,type,
 * direction,weight}] } so consumersOf(Button) returns nodes that are the source
 * of a forward edge whose target is component:Button.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { REPO_ROOT } = require('./helpers.ts');
const FACT_HOOK = path.join(REPO_ROOT, 'hooks', 'gdd-fact-force.js');
const READ_HOOK = path.join(REPO_ROOT, 'hooks', 'gdd-decision-injector.js');
const consumers = require(path.join(REPO_ROOT, 'scripts', 'lib', 'risk', 'consumers.cjs'));

// ── helpers ────────────────────────────────────────────────────────────────
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

function runHook(hookPath, payload, cwd) {
  const r = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: cwd || REPO_ROOT,
  });
  return { stdout: r.stdout, status: r.status, parsed: safeParse(r.stdout) };
}

// A Phase 52 graph where component:Card and component:Modal CONSUME
// component:Button (forward edges target Button), so a first Write to
// Button.tsx requires having Read Card / Modal first.
function graphFixture() {
  return {
    generated: '2026-06-03T00:00:00.000Z',
    nodes: [
      { id: 'component:Button', type: 'component', name: 'Button' },
      { id: 'component:Card', type: 'component', name: 'Card' },
      { id: 'component:Modal', type: 'component', name: 'Modal' },
      { id: 'token:color/primary/500', type: 'token', name: 'primary-500' },
      // A high-sensitivity token file node (theme.css.ts) consumed by Button,
      // used to exercise the HARD tier (risk=block on a *.css.ts large diff).
      { id: 'token:theme', type: 'token', name: 'theme' },
    ],
    edges: [
      { source: 'component:Card', target: 'component:Button', type: 'renders', direction: 'forward', weight: 1 },
      { source: 'component:Modal', target: 'component:Button', type: 'renders', direction: 'forward', weight: 1 },
      { source: 'component:Button', target: 'token:color/primary/500', type: 'uses-token', direction: 'forward', weight: 1 },
      { source: 'component:Button', target: 'token:theme', type: 'uses-token', direction: 'forward', weight: 1 },
    ],
  };
}

function scaffold({ withGraph = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-ff-'));
  const designDir = path.join(dir, '.design');
  fs.mkdirSync(path.join(designDir, 'locks'), { recursive: true });
  if (withGraph) {
    fs.writeFileSync(path.join(designDir, 'context-graph.json'), JSON.stringify(graphFixture()), 'utf8');
  }
  return { dir, designDir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function stateFile(dir, sid) {
  return path.join(dir, '.design', 'locks', `factforce-${sid}.json`);
}
function writeState(dir, sid, state) {
  fs.writeFileSync(stateFile(dir, sid), JSON.stringify(state), 'utf8');
}
function readState(dir, sid) {
  try { return JSON.parse(fs.readFileSync(stateFile(dir, sid), 'utf8')); } catch { return null; }
}

const SID = 'sess-A';
function writePayload(filePath, cwd, sid = SID) {
  return { tool_name: 'Write', tool_input: { file_path: filePath, content: 'x' }, cwd, session_id: sid };
}

// ── consumers.cjs unit ───────────────────────────────────────────────────────
test('56-03: consumersOfFile maps Button.tsx -> component:Button and lists its consumers', () => {
  const res = consumers.consumersOfFile('src/components/Button.tsx', { graph: graphFixture() });
  assert.equal(res.available, true);
  assert.equal(res.nodeId, 'component:Button');
  // Card + Modal consume Button; importer slugs are the consumer leaf names.
  assert.ok(res.importers.includes('card'), `importers should include card: ${JSON.stringify(res.importers)}`);
  assert.ok(res.importers.includes('modal'), `importers should include modal: ${JSON.stringify(res.importers)}`);
});

test('56-03: consumersOfFile SOFTENS (available:false) when the graph is absent', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-ff-nograph-'));
  try {
    const res = consumers.consumersOfFile('src/components/Button.tsx', { root: tmp });
    assert.equal(res.available, false);
    assert.deepEqual(res.importers, []);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('56-03: consumersOfFile never throws on a malformed graph', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-ff-bad-'));
  try {
    fs.mkdirSync(path.join(tmp, '.design'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.design', 'context-graph.json'), '{ not valid json', 'utf8');
    const res = consumers.consumersOfFile('Button.tsx', { root: tmp });
    assert.equal(res.available, false);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ── gate: first write with UNREAD importer blocks ────────────────────────────
test('56-03: first Write to a file whose importer is UNREAD -> continue:false listing missing facts', () => {
  const { dir, cleanup } = scaffold();
  try {
    const { parsed } = runHook(FACT_HOOK, writePayload('src/components/Button.tsx', dir), dir);
    assert.equal(parsed.continue, false);
    assert.match(parsed.stopReason, /unread importers/i);
    // The missing-facts list names the unread consumers.
    assert.ok(/card/i.test(parsed.stopReason) || /modal/i.test(parsed.stopReason),
      `stopReason should name an unread importer: ${parsed.stopReason}`);
    // A blocked first attempt must NOT permanently disarm the gate.
    const st = readState(dir, SID);
    assert.ok(!st || !st.first_mutation_seen || !st.first_mutation_seen['src/components/Button.tsx'],
      'a blocked attempt must not record first_mutation_seen');
  } finally { cleanup(); }
});

// ── gate: after recording the importers in reads[] -> continue:true ──────────
test('56-03: after the importers are in reads[], the first Write is allowed (continue:true)', () => {
  const { dir, cleanup } = scaffold();
  try {
    writeState(dir, SID, {
      reads: {
        'src/components/Card.tsx': '2026-06-03T00:00:00Z',
        'src/components/Modal.tsx': '2026-06-03T00:00:00Z',
      },
      first_mutation_seen: {},
      checked: {},
    });
    const { parsed } = runHook(FACT_HOOK, writePayload('src/components/Button.tsx', dir), dir);
    assert.equal(parsed.continue, true);
    // Now first_mutation_seen is recorded on the allow path.
    const st = readState(dir, SID);
    assert.ok(st.first_mutation_seen['src/components/Button.tsx'], 'allow path records first_mutation_seen');
  } finally { cleanup(); }
});

// ── gate: graph ABSENT -> soft/warn, NOT a hard block ────────────────────────
test('56-03: graph ABSENT softens the importer prereq -> continue:true (no hard block)', () => {
  const { dir, cleanup } = scaffold({ withGraph: false });
  try {
    // README write, no decisions, no graph -> nothing to force -> pass.
    const { parsed } = runHook(FACT_HOOK, writePayload('README.md', dir), dir);
    assert.equal(parsed.continue, true, 'greenfield (no graph) must not over-block');
  } finally { cleanup(); }
});

// ── gate: checked[path] set (via /gdd:override) -> continue:true ─────────────
test('56-03: checked[path] set by /gdd:override unblocks the first Write', () => {
  const { dir, cleanup } = scaffold();
  try {
    writeState(dir, SID, {
      reads: {}, // importers still unread...
      first_mutation_seen: {},
      checked: { 'src/components/Button.tsx': true }, // ...but explicitly overridden
    });
    const { parsed } = runHook(FACT_HOOK, writePayload('src/components/Button.tsx', dir), dir);
    assert.equal(parsed.continue, true, 'checked[path] must bypass the prereqs');
  } finally { cleanup(); }
});

// ── gate: second mutation of an already-seen file is not re-gated ────────────
test('56-03: a second mutation of an already-seen file is NOT re-gated', () => {
  const { dir, cleanup } = scaffold();
  try {
    writeState(dir, SID, {
      reads: {}, // importers unread — would block a FIRST mutation...
      first_mutation_seen: { 'src/components/Button.tsx': '2026-06-03T00:00:00Z' }, // ...but already seen
      checked: {},
    });
    const { parsed } = runHook(FACT_HOOK, writePayload('src/components/Button.tsx', dir), dir);
    assert.equal(parsed.continue, true, 'already-mutated files are not re-gated');
  } finally { cleanup(); }
});

// ── gate: session-scoped (a different session_id re-arms the gate) ───────────
test('56-03: the gate is session-scoped — a different session_id re-arms it', () => {
  const { dir, cleanup } = scaffold();
  try {
    // Session A has satisfied + seen Button.
    writeState(dir, SID, {
      reads: { 'src/components/Card.tsx': 'x', 'src/components/Modal.tsx': 'x' },
      first_mutation_seen: { 'src/components/Button.tsx': 'x' },
      checked: {},
    });
    // Session B is fresh: importers unread -> blocks.
    const { parsed } = runHook(FACT_HOOK, writePayload('src/components/Button.tsx', dir, 'sess-B'), dir);
    assert.equal(parsed.continue, false, 'a new session must re-arm the gate');
    assert.match(parsed.stopReason, /unread importers/i);
  } finally { cleanup(); }
});

// ── gate: HARD block when computeRisk == block ───────────────────────────────
test('56-03: prereqs unmet + risk=block -> HARD block citing /gdd:override only', () => {
  const { dir, cleanup } = scaffold();
  try {
    // theme.css.ts maps to token:theme (consumed by Button — UNREAD, so the
    // importer prereq is unmet) AND a large *.css.ts diff drives computeRisk to
    // "block" — escalating the soft block to the HARD tier.
    const big = 'line\n'.repeat(2000);
    const payload = {
      tool_name: 'Write',
      tool_input: { file_path: 'src/theme.css.ts', content: big },
      cwd: dir,
      session_id: SID,
    };
    const { parsed } = runHook(FACT_HOOK, payload, dir);
    assert.equal(parsed.continue, false);
    // HARD tier names /gdd:override as the ONLY escape.
    assert.match(parsed.stopReason, /HARD/);
    assert.match(parsed.stopReason, /override/i);
    assert.match(parsed.stopReason, /only escape/i);
  } finally { cleanup(); }
});

// ── gate: prereqs unmet but risk NOT block -> SOFT block (not hard) ──────────
test('56-03: prereqs unmet + risk!=block -> SOFT block (offers Read or /gdd:override)', () => {
  const { dir, cleanup } = scaffold();
  try {
    // Small Button.tsx edit: importers unread (soft-blockable) but risk is only
    // require_confirmation, so the block stays SOFT (no "HARD" marker).
    const { parsed } = runHook(FACT_HOOK, {
      tool_name: 'Edit',
      tool_input: { file_path: 'src/components/Button.tsx', old_string: 'a', new_string: 'b' },
      cwd: dir,
      session_id: SID,
    }, dir);
    assert.equal(parsed.continue, false);
    assert.doesNotMatch(parsed.stopReason, /HARD/, 'a non-block risk must stay a SOFT block');
    assert.match(parsed.stopReason, /to mark checked|override/i);
  } finally { cleanup(); }
});

// ── gate: malformed payload -> fail-open (continue:true, exit 0) ─────────────
test('56-03: malformed stdin fails open (continue:true, exit 0)', () => {
  const r = spawnSync(process.execPath, [FACT_HOOK], {
    input: 'not json at all',
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  const parsed = safeParse(r.stdout);
  assert.equal(r.status, 0, 'exit 0 always');
  assert.equal(parsed && parsed.continue, true, 'fail-open on malformed input');
});

// ── gate: non-gated tool passes through ──────────────────────────────────────
test('56-03: a non-gated tool (Read) passes through untouched', () => {
  const { dir, cleanup } = scaffold();
  try {
    const { parsed } = runHook(FACT_HOOK, {
      tool_name: 'Read', tool_input: { file_path: 'src/components/Button.tsx' }, cwd: dir, session_id: SID,
    }, dir);
    assert.equal(parsed.continue, true);
  } finally { cleanup(); }
});

// ── read-tracking: the Read hook records reads[] -> unblocks the gate E2E ─────
test('56-03: gdd-decision-injector Read hook records reads[], unblocking the gate end-to-end', () => {
  const { dir, cleanup } = scaffold();
  try {
    // Drive the REAL Read hook for both importer files (absolute paths, as the
    // agent would pass them) — this should append reads[] to the shared state.
    for (const f of ['src/components/Card.tsx', 'src/components/Modal.tsx']) {
      const abs = path.join(dir, f);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, 'export const x = 1;\n', 'utf8');
      const r = runHook(READ_HOOK, {
        tool_name: 'Read', tool_input: { file_path: abs }, cwd: dir, session_id: SID,
      }, dir);
      assert.equal(r.parsed.continue, true, 'Read hook always continues');
    }
    // The shared session-state now carries both reads.
    const st = readState(dir, SID);
    assert.ok(st && st.reads, 'read-tracking wrote the session state');
    assert.ok(st.reads['src/components/Card.tsx'], 'Card read recorded');
    assert.ok(st.reads['src/components/Modal.tsx'], 'Modal read recorded');

    // Now the first Write to Button is allowed because its importers were Read.
    const { parsed } = runHook(FACT_HOOK, writePayload('src/components/Button.tsx', dir), dir);
    assert.equal(parsed.continue, true, 'reading the importers via the Read hook unblocks the gate');
  } finally { cleanup(); }
});

// ── read-tracking: never alters the Read hook's continue contract ────────────
test('56-03: read-tracking edit is non-destructive to the Read hook contract', () => {
  const { dir, cleanup } = scaffold();
  try {
    // A plain source Read (not a recall-matching .md) still returns continue:true.
    const abs = path.join(dir, 'src', 'foo.ts');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, 'export const y = 2;\n', 'utf8');
    const r = runHook(READ_HOOK, {
      tool_name: 'Read', tool_input: { file_path: abs }, cwd: dir, session_id: SID,
    }, dir);
    assert.equal(r.parsed.continue, true);
    // And it recorded the read.
    const st = readState(dir, SID);
    assert.ok(st.reads['src/foo.ts'], 'plain source reads are tracked too');
  } finally { cleanup(); }
});
