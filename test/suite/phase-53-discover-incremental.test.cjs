'use strict';
/**
 * test/suite/phase-53-discover-incremental.test.cjs — Phase 53 (Semantic Mapper Engine), DISC-01 (executor E).
 *
 * Tag: 53-05.
 *
 * Covers the incremental discover/explore COMPOSITION + the explore-parallel-runner
 * wiring:
 *
 *   planIncremental (scripts/lib/mappers/incremental-discover.cjs) — the layer
 *   that composes A (compute-batches / neighbor-map), B (sdk/fingerprint), and C
 *   (classify) into a "what to re-map" plan:
 *     - cosmetic-only re-run (a token VALUE tweak; everything NONE/COSMETIC) →
 *       action SKIP, batchesToMap empty (0 mappers), no neighborMaps;
 *     - a single STRUCTURAL change within one community → PARTIAL_UPDATE, only the
 *       batch containing the changed node is selected (affected-only), neighborMap
 *       built for that batch only;
 *     - no prior fingerprint store (empty prev) → FULL bootstrap, all batches;
 *     - `--full` (opts.forceFull) forces ALL batches regardless of the classifier.
 *
 *   run() wiring (scripts/lib/explore-parallel-runner) — the runner respects the
 *   plan: with `incremental.graph` supplied it attaches a `batching` block to the
 *   result (action + batches + batchesToMap + neighborMaps + classification);
 *   SKIP yields batchesToMap=[]; the spec roster + rolling semaphore are
 *   unchanged (mappers still dispatch from the SPEC list — batching is metadata,
 *   not a mapper gate); the default path (no `incremental`) leaves `batching`
 *   undefined (backward-compatible). The session layer is mocked via `runOverride`
 *   so no Agent SDK / network is touched. Dispatch concurrency is sourced from
 *   resolveConcurrency (the runner's existing default).
 *
 * All state is hermetic in-memory; no fs writes, no spawning, no network. The
 * .cjs composer is loaded via require(); the .ts runner via dynamic
 * import(pathToFileURL(absPath)). Determinism (CONTEXT D6) is asserted by
 * re-running planIncremental and deep-equalling the plan.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const incremental = require('../../sdk/../scripts/lib/mappers/incremental-discover.cjs');
const { planIncremental, selectBatches, deriveDirShape } = incremental;

const RUNNER_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'lib',
  'explore-parallel-runner',
  'index.ts',
);
function importRunner() {
  return import(pathToFileURL(RUNNER_PATH).href);
}

// ---------------------------------------------------------------------------
// Synthetic Phase-52 graph builders (mirror the phase-53-louvain suite shape).
// ---------------------------------------------------------------------------

function compNode(name, layer, props) {
  return {
    id: `component:${name}`,
    type: 'component',
    name,
    summary: '',
    tags: [],
    complexity: 'moderate',
    layer: layer || 'Molecular',
    ...(props ? { props } : {}),
  };
}
function tokenNode(name, subtype, value) {
  return {
    id: `token:${subtype}:${name}`,
    type: 'token',
    name,
    summary: '',
    tags: [],
    subtype,
    value: value == null ? name : value,
  };
}
function composes(a, b, w) {
  return { source: `component:${a}`, target: `component:${b}`, type: 'composes', direction: 'forward', weight: w == null ? 0.9 : w };
}
function usesToken(comp, tokenId, w) {
  return { source: `component:${comp}`, target: tokenId, type: 'uses-token', direction: 'forward', weight: w == null ? 0.5 : w };
}

/**
 * Build `clusters` densely-connected component communities of `perCluster`
 * members each, plus one weak inter-cluster bridge so the graph is connected but
 * still cleanly partitions. Zero-padded names ⇒ OS-stable lexicographic order.
 */
function buildClustered(clusters, perCluster) {
  const k = clusters;
  const nodes = [];
  const edges = [];
  const clusterMembers = [];
  for (let c = 0; c < k; c++) {
    const members = [];
    for (let i = 0; i < perCluster; i++) {
      const name = `c${String(c).padStart(2, '0')}n${String(i).padStart(2, '0')}`;
      nodes.push(compNode(name, 'Molecular', [`p${i}`]));
      members.push(name);
    }
    clusterMembers.push(members);
    const hub = members[0];
    for (let i = 0; i < members.length; i++) {
      const a = members[i];
      const b = members[(i + 1) % members.length];
      edges.push(composes(a, b, 0.9));
      if (a !== hub) edges.push(composes(hub, a, 0.9));
    }
  }
  // Weak bridges hub_c → hub_{c+1}.
  for (let c = 0; c < k; c++) {
    edges.push(composes(clusterMembers[c][0], clusterMembers[(c + 1) % k][0], 0.1));
  }
  return { schema_version: '52.0', nodes, edges, _clusters: clusterMembers };
}

/** Deep clone a graph so mutations don't bleed across tests. */
function clone(g) {
  return JSON.parse(JSON.stringify(g));
}

/** Find the batch (in a plan) that contains a given member id. */
function batchOf(plan, memberId) {
  return plan.batches.find((b) => b.members.includes(memberId));
}

// ===========================================================================
// planIncremental — cosmetic-only re-run → SKIP (0 mappers)
// ===========================================================================

test('53-05: planIncremental — cosmetic-only re-run (token value tweak) → SKIP, 0 batches to map', async () => {
  const graph = {
    schema_version: '52.0',
    nodes: [
      compNode('Button', 'Atomic', ['variant']),
      compNode('Card', 'Molecular', ['title']),
      tokenNode('primary', 'color', '#0000ff'),
    ],
    edges: [
      composes('Card', 'Button', 0.6),
      usesToken('Button', 'token:color:primary'),
      usesToken('Card', 'token:color:primary'),
    ],
  };

  // Cycle 1: bootstrap to get the current fingerprints.
  const boot = await planIncremental({ graph, prevFingerprints: {}, opts: {} });
  assert.equal(boot.action, 'FULL_UPDATE');

  // Cycle 2: change ONLY the token VALUE (cosmetic — structural projection omits
  // token_value, so compareFingerprints → COSMETIC, not STRUCTURAL).
  const graph2 = clone(graph);
  graph2.nodes.find((n) => n.id === 'token:color:primary').value = '#0000ee';

  const plan = await planIncremental({ graph: graph2, prevFingerprints: boot.fingerprints, opts: {} });

  assert.equal(plan.action, 'SKIP', 'cosmetic-only change must classify SKIP');
  assert.equal(plan.batchesToMap.length, 0, 'SKIP dispatches 0 mappers (empty batchesToMap)');
  assert.deepEqual(plan.neighborMaps, {}, 'no neighborMaps when nothing is re-mapped');
  assert.equal(plan.classification.structuralCount, 0);
  // The full batch set is still computed (so the dispatcher has the inventory).
  assert.ok(plan.batches.length >= 1, 'full batch set is always computed');
});

test('53-05: planIncremental — identical re-run (no change at all) → SKIP', async () => {
  const graph = {
    schema_version: '52.0',
    nodes: [compNode('A', 'Atomic', ['x']), compNode('B', 'Atomic', ['y'])],
    edges: [composes('A', 'B', 0.5)],
  };
  const boot = await planIncremental({ graph, prevFingerprints: {}, opts: {} });
  const again = await planIncremental({ graph: clone(graph), prevFingerprints: boot.fingerprints, opts: {} });
  assert.equal(again.action, 'SKIP');
  assert.equal(again.batchesToMap.length, 0);
  assert.equal(again.classification.structuralCount, 0);
});

// ===========================================================================
// planIncremental — partial structural change → only affected batches
// ===========================================================================

test('53-05: planIncremental — a single structural change → PARTIAL_UPDATE selecting only the affected batch', async () => {
  // Two 10-node communities ⇒ 2 batches. One structural change is well under
  // the FULL thresholds (1/20 = 5% < 50%, 1 < 30).
  const graph = buildClustered(2, 10);

  const boot = await planIncremental({ graph, prevFingerprints: {}, opts: {} });
  assert.equal(boot.batches.length, 2, 'expected 2 community batches');

  // Mutate ONE component STRUCTURALLY (add a prop ⇒ props_shape KEYS change ⇒
  // structural projection differs ⇒ STRUCTURAL).
  const target = 'component:c01n03';
  const graph2 = clone(graph);
  graph2.nodes.find((n) => n.id === target).props = ['p3', 'NEW_PROP'];

  const plan = await planIncremental({ graph: graph2, prevFingerprints: boot.fingerprints, opts: {} });

  assert.equal(plan.action, 'PARTIAL_UPDATE');
  assert.equal(plan.classification.structuralCount, 1);
  assert.deepEqual(plan.classification.affectedBatchHints, [target], 'only the changed id is a hint');
  assert.equal(plan.classification.dirChanged, false);
  assert.equal(plan.classification.majorRestructure, false);

  // Exactly the batch containing the changed node is selected.
  const owning = batchOf(plan, target);
  assert.ok(owning, 'the changed node must belong to some batch');
  assert.equal(plan.batchesToMap.length, 1, 'only ONE batch (the affected one) is re-mapped');
  assert.equal(plan.batchesToMap[0].id, owning.id);
  assert.ok(plan.batchesToMap[0].members.includes(target));

  // neighborMap built for the SELECTED batch only.
  assert.deepEqual(Object.keys(plan.neighborMaps), [owning.id]);
  assert.equal(plan.neighborMaps[owning.id].batchId, owning.id);
});

test('53-05: planIncremental — structural changes spanning BOTH communities select both batches', async () => {
  const graph = buildClustered(2, 10);
  const boot = await planIncremental({ graph, prevFingerprints: {}, opts: {} });

  const t0 = 'component:c00n02';
  const t1 = 'component:c01n07';
  const graph2 = clone(graph);
  graph2.nodes.find((n) => n.id === t0).props = ['p2', 'EXTRA0'];
  graph2.nodes.find((n) => n.id === t1).props = ['p7', 'EXTRA1'];

  const plan = await planIncremental({ graph: graph2, prevFingerprints: boot.fingerprints, opts: {} });
  assert.equal(plan.action, 'PARTIAL_UPDATE');
  assert.equal(plan.classification.structuralCount, 2);
  // Two distinct batches selected (one per changed community).
  const selectedIds = plan.batchesToMap.map((b) => b.id).sort();
  const expectIds = [batchOf(plan, t0).id, batchOf(plan, t1).id].sort();
  assert.deepEqual(selectedIds, expectIds);
  assert.equal(selectedIds.length, 2);
  assert.deepEqual(Object.keys(plan.neighborMaps).sort(), expectIds);
});

// ===========================================================================
// planIncremental — bootstrap (no prior store) → FULL
// ===========================================================================

test('53-05: planIncremental — no prior fingerprint store (empty prev) → FULL bootstrap, all batches', async () => {
  const graph = buildClustered(3, 8);
  const plan = await planIncremental({ graph, prevFingerprints: {}, opts: {} });

  assert.equal(plan.action, 'FULL_UPDATE');
  assert.equal(plan.classification.reason, 'bootstrap-no-baseline');
  assert.equal(plan.batchesToMap.length, plan.batches.length, 'FULL re-maps every batch');
  // A fingerprint is produced for every component file-node (3*8 = 24).
  assert.equal(Object.keys(plan.fingerprints).length, 24);
  // neighborMap for every batch.
  assert.deepEqual(
    Object.keys(plan.neighborMaps).sort(),
    plan.batches.map((b) => b.id).sort(),
  );
});

test('53-05: planIncremental — empty/missing graph → SKIP (nothing to map, never throws)', async () => {
  const plan = await planIncremental({ graph: { nodes: [], edges: [] }, prevFingerprints: {}, opts: {} });
  assert.equal(plan.action, 'SKIP');
  assert.equal(plan.classification.reason, 'no-files');
  assert.equal(plan.batchesToMap.length, 0);
});

// ===========================================================================
// planIncremental — `--full` opt-out forces all batches
// ===========================================================================

test('53-05: planIncremental — forceFull (--full) forces ALL batches even on a cosmetic-only re-run', async () => {
  const graph = buildClustered(2, 10);
  const boot = await planIncremental({ graph, prevFingerprints: {}, opts: {} });

  // A cosmetic-only re-run would normally SKIP; --full overrides to FULL.
  const graph2 = clone(graph);
  // (no structural change at all)

  const skipPlan = await planIncremental({ graph: graph2, prevFingerprints: boot.fingerprints, opts: {} });
  assert.equal(skipPlan.action, 'SKIP', 'baseline: unchanged re-run SKIPs');

  const fullPlan = await planIncremental({ graph: graph2, prevFingerprints: boot.fingerprints, opts: { forceFull: true } });
  assert.equal(fullPlan.action, 'FULL_UPDATE', '--full forces FULL');
  assert.equal(fullPlan.batchesToMap.length, fullPlan.batches.length, '--full re-maps every batch');
  // Underlying classifier verdict is still SKIP — forceFull overrides selection,
  // it does not rewrite the classification's reason.
  assert.equal(fullPlan.classification.action, 'SKIP');
  assert.equal(fullPlan.classification.reason, 'no-structural-change');
});

test('53-05: planIncremental — forceFull also forces all batches on a PARTIAL change', async () => {
  const graph = buildClustered(2, 10);
  const boot = await planIncremental({ graph, prevFingerprints: {}, opts: {} });
  const graph2 = clone(graph);
  graph2.nodes.find((n) => n.id === 'component:c00n01').props = ['p1', 'X'];

  const partial = await planIncremental({ graph: graph2, prevFingerprints: boot.fingerprints, opts: {} });
  assert.equal(partial.action, 'PARTIAL_UPDATE');
  assert.equal(partial.batchesToMap.length, 1);

  const full = await planIncremental({ graph: graph2, prevFingerprints: boot.fingerprints, opts: { forceFull: true } });
  assert.equal(full.action, 'FULL_UPDATE');
  assert.equal(full.batchesToMap.length, full.batches.length);
});

// ===========================================================================
// Determinism — identical inputs ⇒ identical plan
// ===========================================================================

test('53-05: planIncremental — deterministic: identical (graph, prev) ⇒ identical plan', async () => {
  const graph = buildClustered(3, 7);
  const boot = await planIncremental({ graph, prevFingerprints: {}, opts: {} });
  const graph2 = clone(graph);
  graph2.nodes.find((n) => n.id === 'component:c02n05').props = ['p5', 'DELTA'];

  const a = await planIncremental({ graph: graph2, prevFingerprints: boot.fingerprints, opts: {} });
  const b = await planIncremental({ graph: clone(graph2), prevFingerprints: boot.fingerprints, opts: {} });

  assert.equal(a.action, b.action);
  assert.deepEqual(a.classification.affectedBatchHints, b.classification.affectedBatchHints);
  assert.deepEqual(
    a.batchesToMap.map((x) => x.id),
    b.batchesToMap.map((x) => x.id),
  );
  assert.deepEqual(a.fingerprints, b.fingerprints, 'fingerprints are reproducible');
  assert.deepEqual(Object.keys(a.neighborMaps).sort(), Object.keys(b.neighborMaps).sort());
});

// ===========================================================================
// selectBatches (pure helper) — direct unit coverage of the selection matrix
// ===========================================================================

test('53-05: selectBatches — SKIP→[], FULL→all, PARTIAL→intersection with hints', () => {
  const batches = [
    { id: 'batch-01', members: ['component:a', 'component:b'] },
    { id: 'batch-02', members: ['component:c', 'component:d'] },
    { id: 'batch-03', members: ['component:e'] },
  ];
  assert.deepEqual(selectBatches(batches, 'SKIP', ['component:a']), []);
  assert.equal(selectBatches(batches, 'FULL_UPDATE', []).length, 3);
  // PARTIAL with a hint in batch-02 + batch-03.
  const part = selectBatches(batches, 'PARTIAL_UPDATE', ['component:d', 'component:e']);
  assert.deepEqual(part.map((b) => b.id), ['batch-02', 'batch-03']);
  // PARTIAL with no hints ⇒ nothing selected.
  assert.deepEqual(selectBatches(batches, 'ARCHITECTURE_UPDATE', []), []);
  // A hint that matches no member selects nothing.
  assert.deepEqual(selectBatches(batches, 'PARTIAL_UPDATE', ['component:zzz']), []);
});

test('53-05: deriveDirShape — counts file-nodes by namespace, tokens broken out by subtype', () => {
  const graph = {
    nodes: [
      compNode('A', 'Atomic'),
      compNode('B', 'Molecular'),
      tokenNode('primary', 'color', '#fff'),
      tokenNode('sm', 'spacing', '4px'),
      { id: 'variant:a', type: 'variant', name: 'A (variants)' }, // NOT a file-node
      { id: 'layer:Atomic', type: 'layer', name: 'Atomic layer' }, // NOT a file-node
    ],
    edges: [],
  };
  const shape = deriveDirShape(graph);
  assert.equal(shape.totalFiles, 4, 'only component + token nodes count (variant/layer excluded)');
  assert.deepEqual(shape.dirs.sort(), ['component', 'token:color', 'token:spacing']);
  assert.equal(shape.counts.component, 2);
  assert.equal(shape.counts['token:color'], 1);
  assert.equal(shape.counts['token:spacing'], 1);
});

// ===========================================================================
// run() wiring — the runner respects the plan + threads `batching` metadata
// ===========================================================================

const BUDGET = Object.freeze({
  usdLimit: 100,
  inputTokensLimit: 1_000_000,
  outputTokensLimit: 1_000_000,
});

function fakeSessionResult() {
  return {
    status: 'completed',
    transcript_path: '/tmp/fake.jsonl',
    turns: 1,
    usage: { input_tokens: 10, output_tokens: 5, usd_cost: 0.001 },
    tool_calls: [],
    sanitizer: { applied: [], removedSections: [] },
  };
}

/** Minimal mapper spec roster (no agent files ⇒ all parallelism-safe). */
function rosterFor(cwd) {
  return Object.freeze([
    Object.freeze({ name: 'token', agentPath: 'agents/token-mapper.md', outputPath: '.design/map/token.md', prompt: 'run token' }),
    Object.freeze({ name: 'component-taxonomy', agentPath: 'agents/component-taxonomy-mapper.md', outputPath: '.design/map/component-taxonomy.md', prompt: 'run component-taxonomy' }),
  ]);
}

/** Build run options with a runOverride that writes outputs so synth stabilizes. */
function runOptsWith(cwd, extra) {
  const names = ['token', 'component-taxonomy', 'a11y', 'visual-hierarchy'];
  const fs = require('node:fs');
  const runOverride = async (o) => {
    for (const m of names) {
      if (o.prompt.startsWith(`run ${m}`)) {
        const p = path.join(cwd, '.design', 'map', `${m}.md`);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, `# ${m}`);
      }
    }
    return fakeSessionResult();
  };
  return {
    mappers: rosterFor(cwd),
    budget: BUDGET,
    maxTurnsPerMapper: 5,
    synthesizerPrompt: 'SYNTH',
    synthesizerBudget: BUDGET,
    synthesizerMaxTurns: 5,
    cwd,
    pollIntervalMs: 10,
    timeoutMs: 2000,
    runOverride,
    ...extra,
  };
}

test('53-05: run() — no `incremental` option ⇒ batching undefined (backward-compatible)', async () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-53-05-nobatch-'));
  try {
    const { run } = await importRunner();
    const result = await run(runOptsWith(cwd, {}));
    assert.equal(result.batching, undefined, 'default path must NOT attach a batching block');
    assert.equal(result.mappers.length, 2, 'spec roster still dispatched unchanged');
    assert.equal(result.synthesizer.status, 'completed');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('53-05: run() — incremental SKIP ⇒ batching.action SKIP, batchesToMap empty; mappers still run from spec roster', async () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-53-05-skip-'));
  try {
    const graph = {
      schema_version: '52.0',
      nodes: [compNode('A', 'Atomic', ['x']), compNode('B', 'Atomic', ['y'])],
      edges: [composes('A', 'B', 0.5)],
    };
    // Pre-compute the current fingerprints so the re-run is a no-op SKIP.
    const boot = await planIncremental({ graph, prevFingerprints: {}, opts: {} });

    const { run } = await importRunner();
    const result = await run(
      runOptsWith(cwd, { incremental: { graph: clone(graph), prevFingerprints: boot.fingerprints } }),
    );

    assert.ok(result.batching, 'batching block present when incremental.graph supplied');
    assert.equal(result.batching.action, 'SKIP');
    assert.deepEqual(result.batching.batchesToMap, [], 'SKIP ⇒ no batches to re-map');
    assert.deepEqual(result.batching.neighborMaps, {});
    assert.equal(result.batching.classification.structuralCount, 0);
    // The spec roster STILL dispatches (batching is metadata, not a mapper gate).
    assert.equal(result.mappers.length, 2);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('53-05: run() — incremental bootstrap (no prev) ⇒ batching.action FULL_UPDATE, all batch ids listed', async () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-53-05-boot-'));
  try {
    const graph = buildClustered(2, 6);
    const { run } = await importRunner();
    const result = await run(
      runOptsWith(cwd, { incremental: { graph } }),
    );
    assert.ok(result.batching);
    assert.equal(result.batching.action, 'FULL_UPDATE');
    assert.equal(result.batching.batchesToMap.length, result.batching.batches.length);
    assert.ok(result.batching.batches.length >= 2);
    // batchesToMap is a list of batch IDs (strings) on the runner result.
    assert.ok(result.batching.batchesToMap.every((id) => typeof id === 'string'));
    // neighborMaps keyed by the selected batch ids.
    assert.deepEqual(
      Object.keys(result.batching.neighborMaps).sort(),
      result.batching.batchesToMap.slice().sort(),
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('53-05: run() — incremental forceFull (--full) ⇒ batching.action FULL even when the classifier would SKIP', async () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-53-05-full-'));
  try {
    const graph = buildClustered(2, 6);
    const boot = await planIncremental({ graph, prevFingerprints: {}, opts: {} });
    const { run } = await importRunner();
    const result = await run(
      runOptsWith(cwd, {
        incremental: { graph: clone(graph), prevFingerprints: boot.fingerprints, forceFull: true },
      }),
    );
    assert.ok(result.batching);
    assert.equal(result.batching.action, 'FULL_UPDATE', '--full overrides the SKIP verdict');
    assert.equal(result.batching.batchesToMap.length, result.batching.batches.length);
    // The classifier's own verdict (pre-override) is still SKIP.
    assert.equal(result.batching.classification.action, 'SKIP');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('53-05: run() — empty spec roster + incremental still attaches batching (short-circuit path)', async () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-53-05-empty-'));
  try {
    const graph = buildClustered(2, 5);
    const { run } = await importRunner();
    const result = await run({
      mappers: [],
      budget: BUDGET,
      maxTurnsPerMapper: 5,
      synthesizerPrompt: 'SYNTH',
      synthesizerBudget: BUDGET,
      synthesizerMaxTurns: 5,
      cwd,
      pollIntervalMs: 10,
      timeoutMs: 2000,
      incremental: { graph },
    });
    // Empty roster short-circuits the mapper/synth work but STILL surfaces the
    // batching plan (it is computed before the short-circuit).
    assert.equal(result.mappers.length, 0);
    assert.equal(result.synthesizer.status, 'skipped');
    assert.ok(result.batching, 'batching plan present even on the empty-roster short-circuit');
    assert.equal(result.batching.action, 'FULL_UPDATE');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
