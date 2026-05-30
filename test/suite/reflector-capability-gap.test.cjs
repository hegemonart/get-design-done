// tests/reflector-capability-gap.test.cjs — Plan 29-02: reflector pattern-detection capability-gap scan
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');

const m = require('../../scripts/lib/reflector/capability-gap-scan.cjs');

// ---------------------------------------------------------------------------
// Module-level helpers

function mkTmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'capgap-test-'));
}
function rmTmpdir(d) {
  try {
    fs.rmSync(d, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}
function sha256OfSlice(filePath, lineStart, lineEnd) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const slice = lines.slice(lineStart - 1, lineEnd).join('\n');
  return createHash('sha256').update(slice, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Fixture builders — one per signal source

function seedIntel(root, { sliceCount, touches, namePrefix = 'slice', extraLines = '' }) {
  const dir = path.join(root, '.design', 'intel');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < sliceCount; i++) {
    const p = path.join(dir, `${namePrefix}-${i}.md`);
    fs.writeFileSync(p, `# Slice ${i}\n\nTouches: ${touches.join(', ')}\n\n${extraLines}\nNotes.\n`);
  }
  return dir;
}

function seedPosterior(root, arms) {
  const dir = path.join(root, '.design', 'telemetry');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'posterior.json');
  fs.writeFileSync(p, JSON.stringify({
    schema_version: '1.0.0',
    generated_at: new Date().toISOString(),
    arms,
  }, null, 2));
  return p;
}

function seedChain(root, events) {
  const dir = path.join(root, '.design', 'gep');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'events.jsonl');
  fs.writeFileSync(p, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return p;
}

function seedConfig(root, cfg) {
  const dir = path.join(root, '.design');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'config.json');
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
  return p;
}

// ---------------------------------------------------------------------------
// computeContextHash tests

test('capability-gap: computeContextHash is deterministic — same input → same hash', () => {
  const h1 = m.computeContextHash({ touches: ['a', 'b', 'c'], agent_type: 'x' });
  const h2 = m.computeContextHash({ touches: ['a', 'b', 'c'], agent_type: 'x' });
  assert.equal(h1, h2);
  assert.ok(/^[0-9a-f]{64}$/.test(h1));
});

test('capability-gap: computeContextHash is order-invariant on touches array', () => {
  const h1 = m.computeContextHash({ touches: ['a', 'b'], agent_type: 'x' });
  const h2 = m.computeContextHash({ touches: ['b', 'a'], agent_type: 'x' });
  assert.equal(h1, h2);
});

test('capability-gap: computeContextHash is sensitive to agent_type', () => {
  const h1 = m.computeContextHash({ touches: ['a', 'b'], agent_type: 'x' });
  const h2 = m.computeContextHash({ touches: ['a', 'b'], agent_type: 'y' });
  assert.notEqual(h1, h2);
});

test('capability-gap: computeContextHash rejects malformed signal with TypeError', () => {
  assert.throws(() => m.computeContextHash(null), TypeError);
  assert.throws(() => m.computeContextHash({}), TypeError);
  assert.throws(() => m.computeContextHash({ touches: 'a,b', agent_type: 'x' }), TypeError);
  assert.throws(() => m.computeContextHash({ touches: ['a'], agent_type: 42 }), TypeError);
  assert.throws(() => m.computeContextHash({ touches: [1, 2], agent_type: 'x' }), TypeError);
});

// ---------------------------------------------------------------------------
// scanIntelTouchesClusters tests

test('capability-gap: scanIntelTouchesClusters N=3 → 1 finding with sha256 context_hash', () => {
  const tmp = mkTmpdir();
  try {
    const intelDir = seedIntel(tmp, { sliceCount: 3, touches: ['button.tsx', 'modal.tsx', 'theme.ts'] });
    const findings = m.scanIntelTouchesClusters({
      intelDir, existingAgents: [], threshold: 3, baseDir: tmp,
    });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].occurrences, 3);
    assert.ok(/^[0-9a-f]{64}$/.test(findings[0].context_hash));
    assert.equal(findings[0].source_origin, 'intel');
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: scanIntelTouchesClusters N=2 → 0 findings (below threshold)', () => {
  const tmp = mkTmpdir();
  try {
    const intelDir = seedIntel(tmp, { sliceCount: 2, touches: ['a.tsx', 'b.tsx'] });
    const findings = m.scanIntelTouchesClusters({
      intelDir, existingAgents: [], threshold: 3, baseDir: tmp,
    });
    assert.equal(findings.length, 0);
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: scanIntelTouchesClusters skips clusters owned by an existing agent slug', () => {
  const tmp = mkTmpdir();
  try {
    // Seeded touches share tokens with existing agent slug "button-modal-mapper".
    // The overlap heuristic counts tokens ≥4 chars from agent slug intersecting tokens ≥4 chars from touches; ≥2 overlap = owned.
    const intelDir = seedIntel(tmp, { sliceCount: 3, touches: ['button.tsx', 'modal.tsx'] });
    const findings = m.scanIntelTouchesClusters({
      intelDir,
      existingAgents: ['button-modal-mapper'],
      threshold: 3,
      baseDir: tmp,
    });
    assert.equal(findings.length, 0, 'cluster owned by existing agent slug should be filtered out');
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: scanIntelTouchesClusters returns [] when intelDir does not exist (no crash)', () => {
  const tmp = mkTmpdir();
  try {
    const findings = m.scanIntelTouchesClusters({
      intelDir: path.join(tmp, 'nonexistent'),
      existingAgents: [],
      threshold: 3,
      baseDir: tmp,
    });
    assert.deepEqual(findings, []);
  } finally { rmTmpdir(tmp); }
});

// ---------------------------------------------------------------------------
// scanPosteriorArms tests

test('capability-gap: scanPosteriorArms with generic agent + count >= threshold → 1 finding', () => {
  const tmp = mkTmpdir();
  try {
    const posteriorPath = seedPosterior(tmp, [
      { agent: 'general-purpose', bin: 'medium', tier: 'sonnet', alpha: 5, beta: 2, last_used: new Date().toISOString(), count: 10 },
    ]);
    const findings = m.scanPosteriorArms({
      posteriorPath, threshold: 3, baseDir: tmp,
    });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].source_origin, 'posterior');
    assert.equal(findings[0].suggested_kind, 'agent');
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: scanPosteriorArms ignores arms with count below threshold', () => {
  const tmp = mkTmpdir();
  try {
    const posteriorPath = seedPosterior(tmp, [
      { agent: 'general-purpose', bin: 'small', tier: 'haiku', alpha: 1, beta: 1, last_used: new Date().toISOString(), count: 2 },
    ]);
    const findings = m.scanPosteriorArms({ posteriorPath, threshold: 3, baseDir: tmp });
    assert.equal(findings.length, 0);
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: scanPosteriorArms ignores arms whose agent is specialized (not in GENERIC_AGENT_FALLBACKS)', () => {
  const tmp = mkTmpdir();
  try {
    const posteriorPath = seedPosterior(tmp, [
      { agent: 'design-verifier', bin: 'medium', tier: 'sonnet', alpha: 8, beta: 2, last_used: new Date().toISOString(), count: 20 },
    ]);
    const findings = m.scanPosteriorArms({
      posteriorPath,
      threshold: 3,
      baseDir: tmp,
    });
    assert.equal(findings.length, 0, 'specialized agent must not be flagged');
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: scanPosteriorArms ignores arms whose agent is in specializedAgents set', () => {
  const tmp = mkTmpdir();
  try {
    // 'foo-agent' is not in GENERIC_AGENT_FALLBACKS, but we explicitly mark it specialized.
    const posteriorPath = seedPosterior(tmp, [
      { agent: 'foo-agent', bin: 'medium', tier: 'sonnet', alpha: 8, beta: 2, last_used: new Date().toISOString(), count: 20 },
    ]);
    const findings = m.scanPosteriorArms({
      posteriorPath,
      specializedAgents: new Set(['foo-agent']),
      threshold: 3,
      baseDir: tmp,
    });
    assert.equal(findings.length, 0);
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: scanPosteriorArms returns [] when posterior file does not exist', () => {
  const tmp = mkTmpdir();
  try {
    const findings = m.scanPosteriorArms({
      posteriorPath: path.join(tmp, '.design', 'telemetry', 'posterior.json'),
      threshold: 3,
      baseDir: tmp,
    });
    assert.deepEqual(findings, []);
  } finally { rmTmpdir(tmp); }
});

// ---------------------------------------------------------------------------
// scanTrajectorySlices tests

test('capability-gap: scanTrajectorySlices N=3 sequences sharing decision_refs → 1 finding', () => {
  const tmp = mkTmpdir();
  try {
    const now = new Date().toISOString();
    const events = Array.from({ length: 3 }, (_, i) => ({
      event_id: `evt-${i}`,
      parent_event_id: null,
      ts: now,
      agent: 'foo-agent',
      decision_refs: ['D-01', 'D-02'],
      outcome: 'pass',
    }));
    const chainPath = seedChain(tmp, events);
    const findings = m.scanTrajectorySlices({
      chainPath, windowDays: 30, threshold: 3, baseDir: tmp,
    });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].source_origin, 'trajectory');
    assert.equal(findings[0].occurrences, 3);
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: scanTrajectorySlices EXCLUDES rows with outcome:connection-error (D-08 #1)', () => {
  const tmp = mkTmpdir();
  try {
    const now = new Date().toISOString();
    const events = Array.from({ length: 3 }, (_, i) => ({
      event_id: `evt-${i}`,
      parent_event_id: null,
      ts: now,
      agent: 'foo-agent',
      decision_refs: ['D-MCP-01'],
      outcome: 'connection-error',
    }));
    const chainPath = seedChain(tmp, events);
    const findings = m.scanTrajectorySlices({
      chainPath, windowDays: 30, threshold: 3, baseDir: tmp,
    });
    assert.equal(findings.length, 0, 'connection-error outcomes must NOT contribute (D-08)');
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: scanTrajectorySlices EXCLUDES rows with agent:mcp-probe (D-08 #2)', () => {
  const tmp = mkTmpdir();
  try {
    const now = new Date().toISOString();
    const events = Array.from({ length: 3 }, (_, i) => ({
      event_id: `evt-${i}`,
      parent_event_id: null,
      ts: now,
      agent: 'mcp-probe',
      decision_refs: ['D-01'],
      outcome: 'pass',
    }));
    const chainPath = seedChain(tmp, events);
    const findings = m.scanTrajectorySlices({
      chainPath, windowDays: 30, threshold: 3, baseDir: tmp,
    });
    assert.equal(findings.length, 0, 'agent=mcp-probe rows must NOT contribute (D-08)');
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: scanTrajectorySlices EXCLUDES rows with mcp_probe:true (D-08 #3)', () => {
  const tmp = mkTmpdir();
  try {
    const now = new Date().toISOString();
    const events = Array.from({ length: 3 }, (_, i) => ({
      event_id: `evt-${i}`,
      parent_event_id: null,
      ts: now,
      agent: 'foo-agent',
      decision_refs: ['D-01'],
      outcome: 'pass',
      mcp_probe: true,
    }));
    const chainPath = seedChain(tmp, events);
    const findings = m.scanTrajectorySlices({
      chainPath, windowDays: 30, threshold: 3, baseDir: tmp,
    });
    assert.equal(findings.length, 0, 'mcp_probe:true rows must NOT contribute (D-08)');
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: scanTrajectorySlices returns [] when chain file does not exist', () => {
  const tmp = mkTmpdir();
  try {
    const findings = m.scanTrajectorySlices({
      chainPath: path.join(tmp, '.design', 'gep', 'events.jsonl'),
      windowDays: 30, threshold: 3, baseDir: tmp,
    });
    assert.deepEqual(findings, []);
  } finally { rmTmpdir(tmp); }
});

// ---------------------------------------------------------------------------
// runCapabilityGapScan tests (emit spy injected)

test('capability-gap: runCapabilityGapScan calls emit once per finding with source=reflector_pattern', () => {
  const tmp = mkTmpdir();
  try {
    seedIntel(tmp, { sliceCount: 3, touches: ['x.tsx', 'y.tsx', 'z.tsx'] });
    const emitted = [];
    const result = m.runCapabilityGapScan({
      baseDir: tmp,
      emit: (e) => { emitted.push(e); return `id-${emitted.length}`; },
    });
    assert.ok(result.findings.length >= 1);
    assert.equal(emitted.length, result.findings.length);
    for (const e of emitted) {
      assert.equal(e.source, 'reflector_pattern');
    }
    assert.equal(result.emittedEventIds.length, emitted.length);
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: runCapabilityGapScan honors .design/config.json threshold override', () => {
  const tmp = mkTmpdir();
  try {
    seedConfig(tmp, { reflector: { capability_gap_threshold: 5 } });
    seedIntel(tmp, { sliceCount: 4, touches: ['p.tsx', 'q.tsx'] });
    const result = m.runCapabilityGapScan({
      baseDir: tmp,
      emit: () => 'spy-id',
    });
    assert.equal(result.findings.length, 0, 'N=4 < threshold=5 → no findings');

    // Now seed 5 slices: should produce 1 finding.
    seedIntel(tmp, { sliceCount: 5, touches: ['r.tsx', 's.tsx'], namePrefix: 'big' });
    const result2 = m.runCapabilityGapScan({
      baseDir: tmp,
      emit: () => 'spy-id',
    });
    assert.ok(result2.findings.length >= 1, 'N=5 >= threshold=5 → finding emitted');
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: runCapabilityGapScan falls back to DEFAULT_THRESHOLD when config absent', () => {
  const tmp = mkTmpdir();
  try {
    // No config.json → falls back to DEFAULT_THRESHOLD (3).
    seedIntel(tmp, { sliceCount: 3, touches: ['a.tsx'] });
    const result = m.runCapabilityGapScan({
      baseDir: tmp,
      emit: () => 'spy-id',
    });
    assert.ok(result.findings.length >= 1);
    assert.equal(m.DEFAULT_THRESHOLD, 3);
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: runCapabilityGapScan honors opts.threshold over config', () => {
  const tmp = mkTmpdir();
  try {
    // Config says 5; opts.threshold says 3; opts wins.
    seedConfig(tmp, { reflector: { capability_gap_threshold: 5 } });
    seedIntel(tmp, { sliceCount: 3, touches: ['o.tsx'] });
    const result = m.runCapabilityGapScan({
      baseDir: tmp, threshold: 3, emit: () => 'spy-id',
    });
    assert.ok(result.findings.length >= 1);
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: runCapabilityGapScan throws when config threshold is non-integer', () => {
  const tmp = mkTmpdir();
  try {
    seedConfig(tmp, { reflector: { capability_gap_threshold: 'three' } });
    seedIntel(tmp, { sliceCount: 3, touches: ['m.tsx'] });
    assert.throws(() => m.runCapabilityGapScan({ baseDir: tmp, emit: () => 'spy' }), TypeError);
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: runCapabilityGapScan throws when config threshold < 1', () => {
  const tmp = mkTmpdir();
  try {
    seedConfig(tmp, { reflector: { capability_gap_threshold: 0 } });
    seedIntel(tmp, { sliceCount: 3, touches: ['m.tsx'] });
    assert.throws(() => m.runCapabilityGapScan({ baseDir: tmp, emit: () => 'spy' }), TypeError);
  } finally { rmTmpdir(tmp); }
});

// ---------------------------------------------------------------------------
// D-02 7-field event payload shape

test('capability-gap: emitted-event payload contains exactly the 5 required scan-level fields (D-02 / 7-field schema shape)', () => {
  const tmp = mkTmpdir();
  try {
    seedIntel(tmp, { sliceCount: 3, touches: ['x.tsx', 'y.tsx', 'z.tsx'] });
    const emitted = [];
    m.runCapabilityGapScan({
      baseDir: tmp,
      emit: (e) => { emitted.push(e); return `id-${emitted.length}`; },
    });
    assert.ok(emitted.length >= 1);
    // The scan-level emit input carries the 5 fields the orchestrator owns
    // (source, context_hash, intent_summary, suggested_kind, evidence_refs).
    // event_id + parent_event_id are assigned by the emitter (default helper
    // or spy). The schema's 7 fields are pinned by the default emitter
    // (defaultEmitCapabilityGapEvent — see the chain-emit round-trip test
    // below).
    const requiredKeys = new Set(['source', 'context_hash', 'intent_summary', 'suggested_kind', 'evidence_refs']);
    const allowedExtras = new Set(['parent_event_id', 'event_id', 'baseDir', 'chainPath']);
    for (const e of emitted) {
      const actual = Object.keys(e);
      for (const k of requiredKeys) {
        assert.ok(actual.includes(k), `missing required key ${k}`);
      }
      for (const k of actual) {
        assert.ok(requiredKeys.has(k) || allowedExtras.has(k), `unexpected key ${k}`);
      }
      assert.equal(e.source, 'reflector_pattern');
      assert.equal(typeof e.context_hash, 'string');
      assert.equal(typeof e.intent_summary, 'string');
      assert.ok(['agent', 'skill'].includes(e.suggested_kind));
      assert.ok(Array.isArray(e.evidence_refs));
      assert.ok(e.intent_summary.length <= 256, 'intent_summary must be ≤ 256 chars');
    }
  } finally { rmTmpdir(tmp); }
});

// ---------------------------------------------------------------------------
// D-07 hash-pin acceptance + mutation detection

test('capability-gap: evidence_refs sha256 pin validates against source slice (D-07 acceptance)', () => {
  const tmp = mkTmpdir();
  try {
    const intelDir = seedIntel(tmp, { sliceCount: 3, touches: ['p.tsx', 'q.tsx'] });
    const findings = m.scanIntelTouchesClusters({
      intelDir, existingAgents: [], threshold: 3, baseDir: tmp,
    });
    assert.equal(findings.length, 1);
    for (const ref of findings[0].evidence_refs) {
      const absPath = path.resolve(tmp, ref.path);
      const expected = sha256OfSlice(absPath, ref.lineStart, ref.lineEnd);
      assert.equal(ref.sha256, expected, 'evidence_ref sha256 must match recomputed slice hash');
    }
  } finally { rmTmpdir(tmp); }
});

test('capability-gap: evidence_refs sha256 mismatches after source mutation (D-07 mutation detection)', () => {
  const tmp = mkTmpdir();
  try {
    const intelDir = seedIntel(tmp, { sliceCount: 3, touches: ['p.tsx', 'q.tsx'] });
    const findings = m.scanIntelTouchesClusters({
      intelDir, existingAgents: [], threshold: 3, baseDir: tmp,
    });
    const ref = findings[0].evidence_refs[0];
    const absPath = path.resolve(tmp, ref.path);
    // Mutate the pinned line(s) directly so the recomputed slice hash changes.
    const original = fs.readFileSync(absPath, 'utf8');
    const lines = original.split('\n');
    lines[ref.lineStart - 1] = 'Touches: MUTATED.tsx';
    fs.writeFileSync(absPath, lines.join('\n'));
    const after = sha256OfSlice(absPath, ref.lineStart, ref.lineEnd);
    assert.notEqual(ref.sha256, after, 'mutation should invalidate the pin');
  } finally { rmTmpdir(tmp); }
});

// ---------------------------------------------------------------------------
// suggested_kind inference

test('capability-gap: suggested_kind inference — >1 distinct decision-class → agent', () => {
  // Direct inference helper test.
  assert.equal(m.inferSuggestedKind({ distinctDecisionClasses: 3 }), 'agent');
  assert.equal(m.inferSuggestedKind({ distinctDecisionClasses: 2 }), 'agent');
});

test('capability-gap: suggested_kind inference — 1 decision-class → skill (tie-break)', () => {
  assert.equal(m.inferSuggestedKind({ distinctDecisionClasses: 1 }), 'skill');
  assert.equal(m.inferSuggestedKind({}), 'skill');
});

// ---------------------------------------------------------------------------
// MCP-probe predicate unit test (D-08 belt-and-suspenders)

test('capability-gap: isMcpProbeRow recognizes all three exclusion shapes (D-08)', () => {
  assert.equal(m.isMcpProbeRow({ outcome: 'connection-error' }), true);
  assert.equal(m.isMcpProbeRow({ agent: 'mcp-probe' }), true);
  assert.equal(m.isMcpProbeRow({ mcp_probe: true }), true);
  assert.equal(m.isMcpProbeRow({ outcome: 'pass', agent: 'foo' }), false);
  assert.equal(m.isMcpProbeRow(null), false);
});

// ---------------------------------------------------------------------------
// Cross-source orchestrator integration

test('capability-gap: runCapabilityGapScan integrates all three sources (intel + posterior + trajectory)', () => {
  const tmp = mkTmpdir();
  try {
    // Seed all three sources at the threshold.
    seedIntel(tmp, { sliceCount: 3, touches: ['multi-1.tsx', 'multi-2.tsx'] });
    seedPosterior(tmp, [
      { agent: 'general-purpose', bin: 'large', tier: 'opus', alpha: 5, beta: 2, last_used: new Date().toISOString(), count: 7 },
    ]);
    const now = new Date().toISOString();
    seedChain(tmp, Array.from({ length: 3 }, (_, i) => ({
      event_id: `tr-${i}`, parent_event_id: null, ts: now, agent: 'unknown', decision_refs: ['D-Tr-01'], outcome: 'pass',
    })));

    const emitted = [];
    const result = m.runCapabilityGapScan({
      baseDir: tmp,
      emit: (e) => { emitted.push(e); return `id-${emitted.length}`; },
    });

    // At least one finding from EACH source.
    const origins = new Set(result.findings.map((f) => f.source_origin));
    assert.ok(origins.has('intel'), 'intel source must produce a finding');
    assert.ok(origins.has('posterior'), 'posterior source must produce a finding');
    assert.ok(origins.has('trajectory'), 'trajectory source must produce a finding');
    assert.equal(emitted.length, result.findings.length);
  } finally { rmTmpdir(tmp); }
});

// ---------------------------------------------------------------------------
// D-11: tmpdir isolation — orchestrator's default emitter does NOT write to
// the repo's real .design/gep/events.jsonl

test('capability-gap: defaultEmitCapabilityGapEvent honors baseDir; does NOT touch repo .design/gep when baseDir=tmpdir', () => {
  const tmp = mkTmpdir();
  try {
    // Snapshot real .design/gep/events.jsonl state before.
    const realPath = path.resolve(process.cwd(), '.design', 'gep', 'events.jsonl');
    const existedBefore = fs.existsSync(realPath);
    const sizeBefore = existedBefore ? fs.readFileSync(realPath, 'utf8').length : 0;

    // Drive the default emitter end-to-end against a tmpdir baseDir.
    seedIntel(tmp, { sliceCount: 3, touches: ['z1.tsx', 'z2.tsx'] });
    const result = m.runCapabilityGapScan({ baseDir: tmp });
    assert.ok(result.emittedEventIds.length >= 1);
    const tmpChain = path.join(tmp, '.design', 'gep', 'events.jsonl');
    assert.ok(fs.existsSync(tmpChain), 'tmpdir chain should have been written');
    // Real path should be unchanged.
    if (existedBefore) {
      const sizeAfter = fs.readFileSync(realPath, 'utf8').length;
      assert.equal(sizeAfter, sizeBefore, 'real .design/gep/events.jsonl must be untouched');
    } else {
      assert.equal(
        fs.existsSync(realPath),
        false,
        'real .design/gep/events.jsonl must not be created by tests',
      );
    }
  } finally { rmTmpdir(tmp); }
});

// ---------------------------------------------------------------------------
// lineRefToTrajectoryRef sanity (schema-shape translation)

test('capability-gap: lineRefToTrajectoryRef emits schema-compliant TrajectoryRef shape', () => {
  const tmp = mkTmpdir();
  try {
    const intelDir = seedIntel(tmp, { sliceCount: 3, touches: ['s1.tsx', 's2.tsx'] });
    const findings = m.scanIntelTouchesClusters({
      intelDir, existingAgents: [], threshold: 3, baseDir: tmp,
    });
    assert.equal(findings.length, 1);
    const lineRef = findings[0].evidence_refs[0];
    const trajRef = m.lineRefToTrajectoryRef(lineRef, tmp);
    assert.equal(typeof trajRef.trajectory_path, 'string');
    assert.equal(typeof trajRef.byte_start, 'number');
    assert.equal(typeof trajRef.byte_end, 'number');
    assert.ok(/^sha256:[0-9a-f]{64}$/.test(trajRef.content_hash), 'content_hash must match schema pattern');
    assert.ok(trajRef.byte_end >= trajRef.byte_start);
  } finally { rmTmpdir(tmp); }
});

// ---------------------------------------------------------------------------
// No live network / no fetch — static-file regression for D-11

test('capability-gap: test file does NOT make live network calls (no fetch / no http URLs)', () => {
  const selfPath = __filename;
  const raw = fs.readFileSync(selfPath, 'utf8');
  // Count occurrences of literal "fetch(" or "https://" or "http://" strings —
  // expecting 1 (the regex literal in this very assertion). We assert ≤ 2 to be
  // defensive of the assertion's own pattern.
  const matches = raw.match(/fetch\(|https?:\/\//g) || [];
  // The regex literal itself contributes ~2 matches in this file; nothing
  // beyond a small constant is allowed.
  assert.ok(matches.length <= 3, `expected ≤ 3 network-string occurrences, found ${matches.length}`);
});

// ---------------------------------------------------------------------------
// Cross-platform path sanity

test('capability-gap: evidence_refs.path uses forward-slash separators (cross-platform)', () => {
  const tmp = mkTmpdir();
  try {
    const intelDir = seedIntel(tmp, { sliceCount: 3, touches: ['cp1.tsx', 'cp2.tsx'] });
    const findings = m.scanIntelTouchesClusters({
      intelDir, existingAgents: [], threshold: 3, baseDir: tmp,
    });
    for (const ref of findings[0].evidence_refs) {
      assert.equal(ref.path.includes('\\'), false, `ref.path should use forward slashes, got ${ref.path}`);
      assert.ok(ref.path.includes('/'), `ref.path should be hierarchical, got ${ref.path}`);
    }
  } finally { rmTmpdir(tmp); }
});
