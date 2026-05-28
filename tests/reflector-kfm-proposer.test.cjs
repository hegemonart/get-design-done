'use strict';
/**
 * tests/reflector-kfm-proposer.test.cjs — Plan 30.5-03 Task 1.
 *
 * RED → GREEN tests for `scripts/lib/reflector-kfm-proposer.cjs`.
 *
 * 6 cases mirror Plan 30.5-03 PLAN.md `<behavior>` Task 1:
 *   1. Cluster size ≥3 + no catalogue match → draft written.
 *   2. Cluster size ≥3 + catalogue match (confidence ≥ threshold) → skipped.
 *   3. Cluster size <3 → skipped regardless of match outcome.
 *   4. Draft frontmatter contains all 11 schema v2 fields + placeholders
 *      for the two un-inferable ones (`pattern`, `fix`).
 *   5. Apply-reflections accept action promotes the draft into
 *      `reference/known-failure-modes.md` AND appends a registry.json row.
 *   6. reject/defer/edit semantics mirror Phase 29-05.
 *
 * Determinism: all tests use synthetic fixtures + an isolated tmp repo root
 * created per test (`os.tmpdir() / fs.mkdtempSync`); no `.design/` writes
 * outside the tmp tree.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const proposer = require('../scripts/lib/reflector-kfm-proposer.cjs');

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function makeTmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kfm-proposer-test-'));
  fs.mkdirSync(path.join(root, 'reference'), { recursive: true });
  fs.mkdirSync(path.join(root, '.design', 'reflections', 'incubator'), { recursive: true });
  return root;
}

function writeCatalogue(root, entries) {
  const body = entries.map((e) => {
    const yaml = Object.entries(e).map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.join(', ')}]`;
      if (typeof v === 'string' && /[:#]/.test(v)) return `${k}: '${v.replace(/'/g, "''")}'`;
      return `${k}: ${v}`;
    }).join('\n');
    return `### ${e.id}\n\n\`\`\`yaml\n${yaml}\n\`\`\`\n`;
  }).join('\n');
  fs.writeFileSync(
    path.join(root, 'reference', 'known-failure-modes.md'),
    `# Known Failure Modes\n\n## Entries\n\n${body}`
  );
}

function writeRegistry(root) {
  fs.writeFileSync(
    path.join(root, 'reference', 'registry.json'),
    JSON.stringify({ version: 1, generated_at: '2026-05-21T00:00:00.000Z', entries: [] }, null, 2)
  );
}

function makeCluster({ size = 3, symptom = 'eslint plugin missing', signature = 'sig-abc', extras = {} } = {}) {
  return {
    cluster_id: signature,
    context_hash: signature,
    intent_summary: symptom,
    size,
    sources: { fast: size, router: 0, reflector_pattern: 0 },
    posterior: { alpha: size + 1, beta: 1, stddev: 0.03 },
    evidence_refs: [],
    parent_event_ids: ['evt-1', 'evt-2', 'evt-3'].slice(0, size),
    trajectory_refs: [],
    cycles_observed: ['cycle-2026-05'],
    first_seen_cycle: 'cycle-2026-05',
    last_seen_cycle: 'cycle-2026-05',
    suggested_kind: 'skill',
    symptom,
    ...extras,
  };
}

// -------------------------------------------------------------------
// Test 1 — ≥3 events + no catalogue match → draft written.
// -------------------------------------------------------------------

test('30.5-03 Task 1 / Test 1: ≥3 events + no match → draft written', () => {
  const root = makeTmpRepo();
  writeCatalogue(root, [
    {
      id: 'KFM-001', pattern: 'EACCES.*\\.design',
      diagnosis: 'permission denied', remedy: 'chown',
      severity: 'medium', propose_report: false,
      symptom: 'EACCES writing to .design',
      root_cause: 'permission',
      fix: 'chown', related_phases: [11], first_observed_cycle: 'pre-30.5',
    },
  ]);
  writeRegistry(root);

  const cluster = makeCluster({ symptom: 'webpack chunk hash collision blocks build' });
  const result = proposer.proposeKfmDraft(cluster, { repoRoot: root });

  assert.equal(result.action, 'drafted', `expected drafted, got ${result.action}`);
  assert.ok(result.path, 'draft path must be returned');
  assert.ok(fs.existsSync(result.path), `draft file must exist at ${result.path}`);
  const draftBody = fs.readFileSync(result.path, 'utf8');
  assert.match(draftBody, /webpack/i, 'draft should reference the symptom');
});

// -------------------------------------------------------------------
// Test 2 — ≥3 events + catalogue match → skipped.
// -------------------------------------------------------------------

test('30.5-03 Task 1 / Test 2: ≥3 events + match → skipped (logs matched)', () => {
  const root = makeTmpRepo();
  writeCatalogue(root, [
    {
      id: 'KFM-010', pattern: 'webpack.*chunk.*collision',
      diagnosis: 'webpack chunk hash collision', remedy: 'clean build',
      severity: 'high', propose_report: false,
      symptom: 'webpack chunk hash collision blocks build with EUSAGE error',
      root_cause: 'two chunks emit the same content hash; webpack treats as collision',
      fix: 'rm -rf .next dist && rebuild',
      related_phases: [12],
      first_observed_cycle: 'cycle-2026-05',
    },
  ]);
  writeRegistry(root);

  const cluster = makeCluster({
    symptom: 'webpack chunk hash collision blocks build with EUSAGE error',
  });
  const result = proposer.proposeKfmDraft(cluster, { repoRoot: root });

  assert.equal(result.action, 'skipped', `expected skipped, got ${result.action}`);
  assert.equal(result.reason, 'matched_existing');
  assert.equal(result.matchedModeId, 'KFM-010');
});

// -------------------------------------------------------------------
// Test 3 — cluster <3 → skipped regardless of match.
// -------------------------------------------------------------------

test('30.5-03 Task 1 / Test 3: cluster <3 → skipped (below threshold)', () => {
  const root = makeTmpRepo();
  writeCatalogue(root, []);
  writeRegistry(root);

  const cluster = makeCluster({ size: 2, symptom: 'rare new failure' });
  const result = proposer.proposeKfmDraft(cluster, { repoRoot: root });

  assert.equal(result.action, 'skipped');
  assert.equal(result.reason, 'below_stability_k');
});

// -------------------------------------------------------------------
// Test 4 — draft frontmatter contains all 11 schema v2 fields with TODO
//          placeholders for un-inferable fields.
// -------------------------------------------------------------------

test('30.5-03 Task 1 / Test 4: draft has all 11 fields incl. TODO placeholders', () => {
  const root = makeTmpRepo();
  writeCatalogue(root, []);
  writeRegistry(root);

  const cluster = makeCluster({ symptom: 'tsc emits TS6133 unused-locals on barrel files' });
  const result = proposer.proposeKfmDraft(cluster, { repoRoot: root });

  assert.equal(result.action, 'drafted');
  const draft = fs.readFileSync(result.path, 'utf8');
  // 11 schema fields per 30.5-01: id, pattern, diagnosis, remedy, severity,
  //   propose_report, symptom, root_cause, fix, related_phases, first_observed_cycle.
  const required = [
    'id:', 'pattern:', 'diagnosis:', 'remedy:', 'severity:',
    'propose_report:', 'symptom:', 'root_cause:', 'fix:',
    'related_phases:', 'first_observed_cycle:',
  ];
  for (const field of required) {
    assert.match(draft, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `expected field "${field}" in draft`);
  }
  // Per <action>3 — `pattern` and `fix` MUST be TODO placeholders since
  // the reflector cannot infer them.
  assert.match(draft, /pattern:\s+['"]?TODO:/i, 'pattern must be TODO placeholder');
  assert.match(draft, /fix:\s+['"]?TODO:/i, 'fix must be TODO placeholder');
});

// -------------------------------------------------------------------
// Test 5 — apply-reflections accept promotes draft → catalogue + registry.
// -------------------------------------------------------------------

test('30.5-03 Task 1 / Test 5: accept promotes draft → catalogue + registry', () => {
  const root = makeTmpRepo();
  writeCatalogue(root, [
    {
      id: 'KFM-001', pattern: 'EACCES.*\\.design',
      diagnosis: 'perm denied', remedy: 'chown',
      severity: 'medium', propose_report: false,
      symptom: 'EACCES on .design write',
      root_cause: 'permission', fix: 'chown',
      related_phases: [11], first_observed_cycle: 'pre-30.5',
    },
  ]);
  writeRegistry(root);

  const cluster = makeCluster({ symptom: 'rollup external dep not found at runtime' });
  const proposed = proposer.proposeKfmDraft(cluster, { repoRoot: root });
  assert.equal(proposed.action, 'drafted');

  // accept action: promote draft into catalogue + registry.
  const accepted = proposer.applyAccept(proposed.path, { repoRoot: root });
  assert.equal(accepted.action, 'accepted');
  assert.ok(accepted.promotedModeId, 'promoted modeId must be returned');

  // Catalogue now contains the new id.
  const catalogue = fs.readFileSync(path.join(root, 'reference', 'known-failure-modes.md'), 'utf8');
  assert.match(catalogue, new RegExp(`id:\\s*${accepted.promotedModeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

  // Registry now contains an entry referencing it.
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'reference', 'registry.json'), 'utf8'));
  const hit = registry.entries.find((e) => e && e.name && e.name.includes(accepted.promotedModeId.toLowerCase()));
  assert.ok(hit, `registry.json must contain entry for ${accepted.promotedModeId}`);
  assert.equal(hit.origin, 'incubator-kfm', 'registry entry must carry incubator-kfm origin');

  // Incubator draft directory removed.
  assert.ok(!fs.existsSync(proposed.path), 'draft path must be removed after accept');
});

// -------------------------------------------------------------------
// Test 6 — reject/defer/edit semantics mirror Phase 29-05.
// -------------------------------------------------------------------

test('30.5-03 Task 1 / Test 6: reject/defer semantics mirror Phase 29-05', () => {
  const root = makeTmpRepo();
  writeCatalogue(root, []);
  writeRegistry(root);

  // --- reject: removes the incubator subdir ---
  const cluster1 = makeCluster({ symptom: 'cluster A for reject', signature: 'sig-A' });
  const p1 = proposer.proposeKfmDraft(cluster1, { repoRoot: root });
  assert.equal(p1.action, 'drafted');
  const rej = proposer.applyReject(p1.path, { repoRoot: root });
  assert.equal(rej.action, 'rejected');
  assert.ok(!fs.existsSync(p1.path), 'draft must be removed on reject');

  // --- defer: leaves draft in place + stamps deferred_until ---
  const cluster2 = makeCluster({ symptom: 'cluster B for defer', signature: 'sig-B' });
  const p2 = proposer.proposeKfmDraft(cluster2, { repoRoot: root });
  assert.equal(p2.action, 'drafted');
  const def = proposer.applyDefer(p2.path, { repoRoot: root, deferredUntil: '2026-06-01' });
  assert.equal(def.action, 'deferred');
  assert.ok(fs.existsSync(p2.path), 'draft must remain after defer');
  const body = fs.readFileSync(p2.path, 'utf8');
  assert.match(body, /deferred_until/);
  assert.match(body, /2026-06-01/);
});
