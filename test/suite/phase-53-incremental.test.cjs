'use strict';
/**
 * test/suite/phase-53-incremental.test.cjs — Phase 53 (Semantic Mapper Engine), FP-02.
 *
 * Tag: 53-04.
 *
 * Covers the incremental CLASSIFIER (`sdk/fingerprint/classify.cjs`) and the
 * fingerprint STORE (`sdk/fingerprint/store.cjs`):
 *
 *   classify — S=0 → SKIP; 5% structural (no dir change) → PARTIAL_UPDATE with
 *     affectedBatchHints == exactly the changed ids; dirChanged + ~20% structural
 *     → ARCHITECTURE_UPDATE; >30 structural files → FULL_UPDATE; empty prior
 *     baseline → FULL bootstrap; totalFiles===0 → SKIP.
 *
 *   store — writeCurrent→readCurrent round-trip in an os.tmpdir fake repo root;
 *     rollCycle prunes to rolling 5 (write 7 cycles, assert oldest 2 gone); a
 *     store under a SIMULATED worktree resolves to the main root (injectable git
 *     exec, no real worktree) and degrades gracefully when git is unavailable;
 *     sinceCycle returns changed ids on the dep-free fallback path (no
 *     better-sqlite3 required for this suite to pass).
 *
 * All filesystem state is hermetic under os.tmpdir; every store call passes a
 * `{ root }` override so the real `.design/` is never touched.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const classifyMod = require('../../sdk/fingerprint/classify.cjs');
const store = require('../../sdk/fingerprint/store.cjs');

const { classify } = classifyMod;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make a unique hermetic temp dir to act as a fake repo root. */
function mkTmpRoot(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `gdd-53-04-${label}-`));
}

/** Best-effort recursive cleanup. */
function rmRoot(root) {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

/** Build N compareResults entries with a given change, ids zero-padded + prefixed. */
function makeResults(n, change, prefix = 'component:c') {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `${prefix}${String(i).padStart(3, '0')}`, type: 'component', change });
  }
  return out;
}

/** A minimal DirShape. */
function dirShape(dirs, counts, layerHist) {
  return { dirs, counts: counts || {}, layerHist: layerHist || {} };
}

// ===========================================================================
// classify
// ===========================================================================

test('53-04: classify — structuralCount===0 against a known baseline → SKIP', () => {
  // 10 cosmetic, 0 structural, prior baseline present.
  const results = makeResults(10, 'COSMETIC');
  const prev = dirShape(['atoms', 'molecules'], { atoms: 5, molecules: 5 }, { atom: 5, molecule: 5 });
  const r = classify(results, {
    totalFiles: 10,
    prevDirShape: prev,
    currDirShape: prev,
  });
  assert.equal(r.action, 'SKIP');
  assert.equal(r.structuralCount, 0);
  assert.deepEqual(r.affectedBatchHints, []);
});

test('53-04: classify — ~5% structural, no dir change → PARTIAL_UPDATE with only the changed ids', () => {
  // 100 files, 5 structural, identical dir shape (no dir change).
  const structural = makeResults(5, 'STRUCTURAL', 'component:s');
  const cosmetic = makeResults(20, 'COSMETIC', 'component:c');
  const prev = dirShape(['atoms'], { atoms: 100 }, { atom: 100 });
  const r = classify([...cosmetic, ...structural], {
    totalFiles: 100,
    prevDirShape: prev,
    currDirShape: prev, // identical ⇒ dirChanged false
  });
  assert.equal(r.action, 'PARTIAL_UPDATE');
  assert.equal(r.structuralCount, 5);
  assert.ok(Math.abs(r.pct - 0.05) < 1e-9, `pct should be 0.05, got ${r.pct}`);
  assert.equal(r.dirChanged, false);
  assert.equal(r.majorRestructure, false);
  // affectedBatchHints must be EXACTLY the structural ids, sorted, nothing else.
  const expected = structural.map((s) => s.id).sort();
  assert.deepEqual(r.affectedBatchHints, expected);
  // No cosmetic id leaked into the hints.
  for (const h of r.affectedBatchHints) assert.ok(h.startsWith('component:s'));
});

test('53-04: classify — dir change + ~20% structural → ARCHITECTURE_UPDATE', () => {
  // 100 files, 20 structural (pct 0.2 <= archPctMax 0.3), and a per-dir count
  // shift that is NOT large enough to trip majorRestructure's re-own heuristic
  // (so we get ARCHITECTURE, not FULL). dirChanged is true via a new top-level
  // dir appearing — but a single new dir with few files keeps re-own < 25%.
  const structural = makeResults(20, 'STRUCTURAL', 'component:s');
  const prev = dirShape(
    ['atoms', 'molecules'],
    { atoms: 60, molecules: 40 },
    { atom: 60, molecule: 40 },
  );
  // current: a few files moved molecules→atoms (4 files: |+4| + |-4| = 8; /2 = 4
  // moved; 4/100 = 4% < 25%) and the layer histogram shift stays under 30%.
  const curr = dirShape(
    ['atoms', 'molecules'],
    { atoms: 64, molecules: 36 },
    { atom: 64, molecule: 36 },
  );
  const r = classify(structural, {
    totalFiles: 100,
    prevDirShape: prev,
    currDirShape: curr,
  });
  assert.equal(r.dirChanged, true, 'per-dir count delta must register as dirChanged');
  assert.equal(r.majorRestructure, false, 'small re-own + small layer shift ⇒ not major');
  assert.equal(r.action, 'ARCHITECTURE_UPDATE');
  assert.ok(Math.abs(r.pct - 0.2) < 1e-9);
});

test('53-04: classify — >30 structural files → FULL_UPDATE', () => {
  // 200 files, 31 structural ⇒ over the default fullFileCount=30 threshold.
  const structural = makeResults(31, 'STRUCTURAL', 'component:s');
  const prev = dirShape(['atoms'], { atoms: 200 }, { atom: 200 });
  const r = classify(structural, {
    totalFiles: 200,
    prevDirShape: prev,
    currDirShape: prev,
  });
  assert.equal(r.action, 'FULL_UPDATE');
  assert.equal(r.structuralCount, 31);
  assert.equal(r.reason, 'structural-count-over-threshold');
});

test('53-04: classify — pct over fullPct (0.5) → FULL_UPDATE even under the count threshold', () => {
  // 10 files, 6 structural ⇒ pct 0.6 > 0.5 but count 6 < 30.
  const structural = makeResults(6, 'STRUCTURAL', 'component:s');
  const prev = dirShape(['atoms'], { atoms: 10 }, { atom: 10 });
  const r = classify(structural, {
    totalFiles: 10,
    prevDirShape: prev,
    currDirShape: prev,
  });
  assert.equal(r.action, 'FULL_UPDATE');
  assert.equal(r.reason, 'structural-pct-over-threshold');
});

test('53-04: classify — majorRestructure (top-level dir added) → FULL_UPDATE under thresholds', () => {
  // Small structural count + low pct, but a brand-new top-level design dir ⇒
  // majorRestructure ⇒ FULL.
  const structural = makeResults(3, 'STRUCTURAL', 'component:s');
  const prev = dirShape(['atoms'], { atoms: 100 }, { atom: 100 });
  const curr = dirShape(['atoms', 'organisms'], { atoms: 100, organisms: 0 }, { atom: 100 });
  const r = classify(structural, {
    totalFiles: 100,
    prevDirShape: prev,
    currDirShape: curr,
  });
  assert.equal(r.majorRestructure, true);
  assert.equal(r.action, 'FULL_UPDATE');
  assert.equal(r.reason, 'major-restructure');
});

test('53-04: classify — empty prior baseline → FULL_UPDATE (bootstrap)', () => {
  // First run: there are structural changes and files, but no prevDirShape.
  const structural = makeResults(2, 'STRUCTURAL', 'component:s');
  const r = classify(structural, {
    totalFiles: 50,
    prevDirShape: null,
    currDirShape: dirShape(['atoms'], { atoms: 50 }, { atom: 50 }),
  });
  assert.equal(r.action, 'FULL_UPDATE');
  assert.equal(r.reason, 'bootstrap-no-baseline');
});

test('53-04: classify — empty compareResults with files but no baseline → FULL_UPDATE (bootstrap)', () => {
  // The canonical bootstrap signal: empty compare array + no prior baseline.
  // Must NOT be misread as structuralCount===0 SKIP.
  const r = classify([], {
    totalFiles: 42,
    prevDirShape: null,
  });
  assert.equal(r.action, 'FULL_UPDATE');
  assert.equal(r.reason, 'bootstrap-no-baseline');
  assert.equal(r.structuralCount, 0);
});

test('53-04: classify — totalFiles===0 → SKIP (no divide-by-zero, wins over bootstrap)', () => {
  const r = classify([], { totalFiles: 0, prevDirShape: null });
  assert.equal(r.action, 'SKIP');
  assert.equal(r.reason, 'no-files');
  assert.equal(r.pct, 0, 'pct must be 0 when totalFiles is 0 — no NaN/Infinity');
  assert.ok(Number.isFinite(r.pct));
});

test('53-04: classify — thresholds overridable via projectStats.thresholds', () => {
  // Lower fullFileCount to 2 ⇒ 3 structural now trips FULL where default would PARTIAL.
  const structural = makeResults(3, 'STRUCTURAL', 'component:s');
  const prev = dirShape(['atoms'], { atoms: 100 }, { atom: 100 });
  const r = classify(structural, {
    totalFiles: 100,
    prevDirShape: prev,
    currDirShape: prev,
    thresholds: { fullFileCount: 2 },
  });
  assert.equal(r.action, 'FULL_UPDATE');
  assert.equal(r.thresholds.fullFileCount, 2);
  // The other thresholds keep their defaults.
  assert.equal(r.thresholds.fullPct, 0.5);
});

test('53-04: classify — thresholds also read from a raw config.incremental object', () => {
  const structural = makeResults(3, 'STRUCTURAL', 'component:s');
  const prev = dirShape(['atoms'], { atoms: 100 }, { atom: 100 });
  const r = classify(structural, {
    totalFiles: 100,
    prevDirShape: prev,
    currDirShape: prev,
    config: { incremental: { fullFileCount: 2 } },
  });
  assert.equal(r.action, 'FULL_UPDATE');
  assert.equal(r.thresholds.fullFileCount, 2);
});

test('53-04: classify — deterministic affectedBatchHints (sorted, deduped)', () => {
  // Out-of-order + duplicate structural ids must come back sorted + unique.
  const results = [
    { id: 'component:zeta', change: 'STRUCTURAL' },
    { id: 'component:alpha', change: 'STRUCTURAL' },
    { id: 'component:alpha', change: 'STRUCTURAL' }, // dup
    { id: 'component:mid', change: 'COSMETIC' }, // not structural ⇒ excluded
    { id: 'component:beta', change: 'STRUCTURAL' },
  ];
  const prev = dirShape(['atoms'], { atoms: 10 }, { atom: 10 });
  const r = classify(results, { totalFiles: 10, prevDirShape: prev, currDirShape: prev });
  assert.deepEqual(r.affectedBatchHints, ['component:alpha', 'component:beta', 'component:zeta']);
  assert.equal(r.structuralCount, 3);
});

// ===========================================================================
// store — round-trip
// ===========================================================================

test('53-04: store — writeCurrent → readCurrent round-trip under an os.tmpdir fake root', () => {
  const root = mkTmpRoot('roundtrip');
  try {
    const fps = {
      'component:button': { full: 'aaa111', structural: 'aaa', type: 'component' },
      'token:color-primary': { full: 'bbb222', structural: 'bbb', type: 'token' },
    };
    const { path: written } = store.writeCurrent(fps, { root });

    // File lands at <root>/.design/fingerprints/current.json
    const expectedPath = path.join(root, '.design', 'fingerprints', 'current.json');
    assert.equal(path.resolve(written), path.resolve(expectedPath));
    assert.ok(fs.existsSync(expectedPath), 'current.json must exist after writeCurrent');

    const back = store.readCurrent({ root });
    assert.equal(back.schema_version, store.SCHEMA_VERSION);
    assert.deepEqual(back.fingerprints, fps);

    // No orphan tmp files left behind.
    const dirEntries = fs.readdirSync(path.dirname(expectedPath));
    assert.ok(
      dirEntries.every((n) => !n.includes('.tmp.')),
      `no .tmp.* orphans, saw: ${dirEntries.join(', ')}`,
    );
  } finally {
    rmRoot(root);
  }
});

test('53-04: store — readCurrent on an absent store returns the empty bootstrap shape (never throws)', () => {
  const root = mkTmpRoot('absent');
  try {
    const back = store.readCurrent({ root });
    assert.equal(back.cycle, null);
    assert.deepEqual(back.fingerprints, {});
  } finally {
    rmRoot(root);
  }
});

test('53-04: store — writeCurrent accepts an already-enveloped snapshot too', () => {
  const root = mkTmpRoot('envelope');
  try {
    store.writeCurrent(
      { schema_version: 'ignored', cycle: 7, fingerprints: { 'component:x': 'hashx' } },
      { root },
    );
    const back = store.readCurrent({ root });
    assert.equal(back.cycle, 7);
    assert.deepEqual(back.fingerprints, { 'component:x': 'hashx' });
    assert.equal(back.schema_version, store.SCHEMA_VERSION, 'schema_version is stamped by the store');
  } finally {
    rmRoot(root);
  }
});

// ===========================================================================
// store — rollCycle pruning to rolling N=5
// ===========================================================================

test('53-04: store — rollCycle prunes to the newest 5 (write 7 cycles, oldest 2 gone)', () => {
  const root = mkTmpRoot('roll');
  try {
    // Seed a distinct current each cycle so snapshots differ, then roll 1..7.
    for (let n = 1; n <= 7; n++) {
      store.writeCurrent({ [`component:c${n}`]: `hash-${n}` }, { root });
      store.rollCycle(n, { root });
    }

    const dir = path.join(root, '.design', 'fingerprints');
    const cycleFiles = fs
      .readdirSync(dir)
      .filter((f) => /^cycle-\d+\.json$/.test(f))
      .sort();

    // Exactly 5 cycle snapshots remain.
    assert.equal(cycleFiles.length, store.ROLLING_HISTORY, `expected 5 cycles, saw ${cycleFiles.join(', ')}`);

    // The newest 5 (cycles 3..7) are kept; the oldest 2 (1, 2) are pruned.
    assert.ok(!fs.existsSync(path.join(dir, 'cycle-001.json')), 'cycle-001 should be pruned');
    assert.ok(!fs.existsSync(path.join(dir, 'cycle-002.json')), 'cycle-002 should be pruned');
    for (const n of [3, 4, 5, 6, 7]) {
      assert.ok(
        fs.existsSync(path.join(dir, `cycle-${String(n).padStart(3, '0')}.json`)),
        `cycle-${n} should be kept`,
      );
    }

    // The kept set reported by rollCycle's last call matches disk.
    const last = store.rollCycle(7, { root }); // idempotent re-roll
    assert.deepEqual(last.kept.slice().sort((a, b) => a - b), [3, 4, 5, 6, 7]);
  } finally {
    rmRoot(root);
  }
});

test('53-04: store — readCycle returns a specific snapshot and stamps its cycle number', () => {
  const root = mkTmpRoot('readcycle');
  try {
    store.writeCurrent({ 'component:c': 'hash-c' }, { root });
    store.rollCycle(12, { root });
    const snap = store.readCycle(12, { root });
    assert.equal(snap.cycle, 12);
    assert.deepEqual(snap.fingerprints, { 'component:c': 'hash-c' });

    // An absent cycle is the empty bootstrap shape (never throws).
    const missing = store.readCycle(999, { root });
    assert.deepEqual(missing.fingerprints, {});
  } finally {
    rmRoot(root);
  }
});

// ===========================================================================
// store — worktree redirect (simulated via injectable git exec)
// ===========================================================================

test('53-04: store — under a SIMULATED worktree, the store resolves to the MAIN repo root', () => {
  // Build a fake "main repo" dir and a fake "worktree" dir. The injectable git
  // exec mimics `git rev-parse` inside a linked worktree: git-dir is
  // <main>/.git/worktrees/<wt>, common-dir is <main>/.git ⇒ they DIFFER, and
  // resolveRepoRoot must climb to <main>. We then assert writes land under
  // <main>/.design/fingerprints, NOT under the worktree dir.
  const mainRoot = mkTmpRoot('wt-main');
  const worktreeDir = mkTmpRoot('wt-leaf');
  try {
    const commonDir = path.join(mainRoot, '.git');
    const gitDir = path.join(mainRoot, '.git', 'worktrees', 'leaf');

    // exec(cmd, args) → string, matching the worktree-resolve.cjs contract.
    const fakeExec = (cmd, args) => {
      assert.equal(cmd, 'git');
      const sub = args.join(' ');
      if (sub === 'rev-parse --git-dir') return gitDir;
      if (sub === 'rev-parse --git-common-dir') return commonDir;
      if (sub === 'rev-parse --show-toplevel') return worktreeDir; // toplevel is the worktree checkout
      return '';
    };

    // No {root} override here — we exercise the worktree-redirect path via cwd+exec.
    store.writeCurrent(
      { 'component:wt': 'hash-wt' },
      { cwd: worktreeDir, exec: fakeExec },
    );

    const mainStore = path.join(mainRoot, '.design', 'fingerprints', 'current.json');
    const leafStore = path.join(worktreeDir, '.design', 'fingerprints', 'current.json');
    assert.ok(fs.existsSync(mainStore), 'fingerprints must be written under the MAIN repo root');
    assert.ok(!fs.existsSync(leafStore), 'fingerprints must NOT be written under the worktree dir');

    // And it reads back through the same redirect.
    const back = store.readCurrent({ cwd: worktreeDir, exec: fakeExec });
    assert.deepEqual(back.fingerprints, { 'component:wt': 'hash-wt' });
  } finally {
    rmRoot(mainRoot);
    rmRoot(worktreeDir);
  }
});

test('53-04: store — degrades gracefully to cwd when git is unavailable (exec throws)', () => {
  const fakeRoot = mkTmpRoot('nogit');
  try {
    // exec throws ⇒ worktree-resolve treats it as "no git" ⇒ resolveRepoRoot
    // degrades to path.resolve(cwd). The store then lives under cwd/.design.
    const throwingExec = () => {
      throw new Error('git not found');
    };
    store.writeCurrent({ 'component:x': 'hx' }, { cwd: fakeRoot, exec: throwingExec });
    const expected = path.join(fakeRoot, '.design', 'fingerprints', 'current.json');
    assert.ok(fs.existsSync(expected), 'store should fall back to cwd/.design when git is unavailable');
  } finally {
    rmRoot(fakeRoot);
  }
});

// ===========================================================================
// store — sinceCycle on the dep-free fallback path
// ===========================================================================

test('53-04: store — sinceCycle returns the changed ids (added/modified/removed), sorted', () => {
  const root = mkTmpRoot('since');
  try {
    // Cycle 1 baseline.
    store.writeCurrent(
      {
        'component:keep': { full: 'k1', structural: 'ks' },
        'component:modify': { full: 'm1', structural: 'ms1' },
        'component:remove': { full: 'r1', structural: 'rs' },
      },
      { root },
    );
    store.rollCycle(1, { root });

    // Now current diverges: keep unchanged, modify changed, remove dropped, add new.
    store.writeCurrent(
      {
        'component:keep': { full: 'k1', structural: 'ks' }, // unchanged
        'component:modify': { full: 'm2', structural: 'ms2' }, // full+structural changed
        'component:add': { full: 'a1', structural: 'as' }, // added
      },
      { root },
    );

    const changed = store.sinceCycle(1, { root });
    // 'keep' is unchanged ⇒ excluded; modify/add/remove are all changes.
    assert.deepEqual(changed, ['component:add', 'component:modify', 'component:remove']);
  } finally {
    rmRoot(root);
  }
});

test('53-04: store — sinceCycle against a non-existent baseline cycle → all current ids (bootstrap)', () => {
  const root = mkTmpRoot('since-bootstrap');
  try {
    store.writeCurrent(
      { 'component:b': 'hb', 'component:a': 'ha', 'component:c': 'hc' },
      { root },
    );
    // No cycle-005 exists ⇒ everything current is "changed".
    const changed = store.sinceCycle(5, { root });
    assert.deepEqual(changed, ['component:a', 'component:b', 'component:c']);
  } finally {
    rmRoot(root);
  }
});

test('53-04: store — sinceCycle with both snapshots empty → []', () => {
  const root = mkTmpRoot('since-empty');
  try {
    // Roll an empty current into cycle 1, leave current empty.
    store.rollCycle(1, { root });
    const changed = store.sinceCycle(1, { root });
    assert.deepEqual(changed, []);
  } finally {
    rmRoot(root);
  }
});

test('53-04: store — diffFingerprintMaps compares full|structural|stringify and sorts', () => {
  // Direct unit test of the shared diff used by both backends.
  const base = {
    'component:same': 'hash-same',
    'component:obj': { full: 'f1', structural: 's1' },
    'component:gone': 'hash-gone',
  };
  const curr = {
    'component:same': 'hash-same', // unchanged
    'component:obj': { full: 'f2', structural: 's1' }, // full changed
    'component:new': 'hash-new', // added
  };
  const changed = store.diffFingerprintMaps(base, curr);
  assert.deepEqual(changed, ['component:gone', 'component:new', 'component:obj']);
});

test('53-04: store — backendName reports json-scan or fts5 (suite passes without better-sqlite3)', () => {
  const name = store.backendName();
  assert.ok(name === 'json-scan' || name === 'fts5', `unexpected backend: ${name}`);
  // Whichever backend is active, sinceCycle must work; this is implicitly
  // covered above, but assert the contract is a string here.
  assert.equal(typeof name, 'string');
});
