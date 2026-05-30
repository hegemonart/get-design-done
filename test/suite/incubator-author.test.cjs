// tests/incubator-author.test.cjs — Plan 29-04
//
// Unit + filesystem tests for scripts/lib/incubator-author.cjs draftClusters().
// Most tests are pure-function (dryRun:true with synthetic existingArtifacts).
// Two filesystem tests use os.tmpdir() to verify scoped writes + escape paths.
//
// Coverage map:
//   * Empty input → empty output
//   * Stability gates (size K, posterior stddev)
//   * Suggested-kind branches (skill, agent)
//   * Similarity guard (D-09): tools-overlap, name-overlap, description-overlap
//   * Tools inference (top-N, no Write unless observed)
//   * Default-tier inference (posterior best-arm)
//   * Slug derivation (kebab, dedupe, traversal-safe)
//   * Path-escape detection (safeWritePath direct injection)
//   * Deterministic ordering by cluster_id
//   * dryRun (no write) vs non-dryRun (file written under incubator root with
//     `delegate_to: null` in the on-disk content).

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  draftClusters,
  deriveSlug,
  inferTools,
  buildDescription,
  computeSimilarity,
  safeWritePath,
  jaccard,
  cosineSim,
  tokenize,
  DEFAULT_STABILITY_K,
  DEFAULT_STDDEV_THRESHOLD,
  DEFAULT_SIMILARITY_THRESHOLD,
  INCUBATOR_ROOT,
} = require('../../scripts/lib/incubator-author.cjs');

// ---- fixture helpers ----

function highStabilitySkillCluster(overrides) {
  const o = overrides || {};
  return {
    cluster_id: o.cluster_id || 'c-figma-token-sync',
    context_hash: 'h-1',
    intent_summary: o.intent_summary || 'Extract Figma tokens and sync to repo',
    suggested_kind: 'skill',
    size: o.size != null ? o.size : 5,
    sources: { fast: 3, router: 2, reflector_pattern: 0 },
    posterior: { alpha: 8, beta: 2, stddev: o.stddev != null ? o.stddev : 0.03 },
    evidence_refs: ['ev-1', 'ev-2'],
    parent_event_ids: ['skill:design-fixer', 'skill:design-fixer'],
    trajectory_refs: [
      { trajectory_id: 't1', tools: ['Read', 'Grep', 'Bash'], observed_triggers: 'extract figma tokens' },
      { trajectory_id: 't2', tools: ['Read', 'Grep'], observed_triggers: 'sync design tokens to repo' },
    ],
    cycles_observed: ['c-1', 'c-2', 'c-3'],
    first_seen_cycle: 'c-1',
    last_seen_cycle: 'c-3',
  };
}

function highStabilityAgentCluster() {
  return {
    cluster_id: 'c-figma-extractor',
    context_hash: 'h-2',
    intent_summary: 'Extract and normalize Figma frames into design tokens',
    suggested_kind: 'agent',
    size: 4,
    sources: { fast: 0, router: 0, reflector_pattern: 4 },
    posterior: { alpha: 9, beta: 1, stddev: 0.025 },
    evidence_refs: ['ev-10'],
    parent_event_ids: ['agent:design-discussant'],
    trajectory_refs: [
      { trajectory_id: 't10', tools: ['Read', 'Bash', 'Grep'], observed_triggers: 'extract figma frames' },
    ],
    cycles_observed: ['c-1', 'c-2'],
    first_seen_cycle: 'c-1',
    last_seen_cycle: 'c-2',
  };
}

// ---- pure-function tests (dryRun:true) ----

test('29-04: empty clusters -> empty arrays', () => {
  const out = draftClusters({ clusters: [] }, { dryRun: true, existingArtifacts: [] });
  assert.deepEqual(out.drafts, []);
  assert.deepEqual(out.skipped, []);
  assert.deepEqual(out.deferred, []);
});

test('29-04: defaults match plan spec (K=3, stddev=0.05, sim=0.8, incubator root)', () => {
  assert.equal(DEFAULT_STABILITY_K, 3);
  assert.equal(DEFAULT_STDDEV_THRESHOLD, 0.05);
  assert.equal(DEFAULT_SIMILARITY_THRESHOLD, 0.8);
  assert.equal(INCUBATOR_ROOT, '.design/reflections/incubator');
});

test('29-04: high-stability skill cluster -> SKILL.md draft with Phase 28.5 frontmatter + delegate_to:null', () => {
  const out = draftClusters({ clusters: [highStabilitySkillCluster()] }, { dryRun: true, existingArtifacts: [] });
  assert.equal(out.drafts.length, 1, 'one draft expected: ' + JSON.stringify(out));
  const d = out.drafts[0];
  assert.equal(d.kind, 'skill');
  assert.match(d.path, /\.design\/reflections\/incubator\/.+\/SKILL\.md$/);
  // Frontmatter shape
  assert.ok(typeof d.frontmatter.name === 'string' && d.frontmatter.name.length > 0);
  assert.ok(typeof d.frontmatter.description === 'string');
  assert.ok(d.frontmatter.description.length <= 200, 'desc soft cap: ' + d.frontmatter.description.length);
  assert.ok(Array.isArray(d.frontmatter.tools) && d.frontmatter.tools.length >= 1);
  assert.ok(['haiku', 'sonnet', 'opus'].includes(d.frontmatter['default-tier']));
  assert.equal(d.frontmatter.delegate_to, null, 'delegate_to MUST be literal null (D-12)');
  // Body shape: Origin section present
  assert.match(d.body, /## Origin/);
  assert.match(d.body, /Cluster ID:.*c-figma-token-sync/);
  assert.match(d.body, /Cluster size:.*5/);
  assert.match(d.body, /capability_gap|capability gap|capgap/i, 'mentions capability_gap event origin context');
});

test('29-04: high-stability agent cluster -> agents/<slug>.md draft path', () => {
  const out = draftClusters({ clusters: [highStabilityAgentCluster()] }, { dryRun: true, existingArtifacts: [] });
  assert.equal(out.drafts.length, 1);
  const d = out.drafts[0];
  assert.equal(d.kind, 'agent');
  assert.match(d.path, /\.design\/reflections\/incubator\/[^/]+\/agents\/[^/]+\.md$/);
});

test('29-04: below-K cluster -> skipped (below_stability_threshold)', () => {
  const cluster = highStabilitySkillCluster({ size: 2, cluster_id: 'c-below-k' });
  const out = draftClusters({ clusters: [cluster] }, { dryRun: true, existingArtifacts: [], stabilityK: 3 });
  assert.equal(out.drafts.length, 0);
  assert.equal(out.skipped.length, 1);
  assert.equal(out.skipped[0].cluster_id, 'c-below-k');
  assert.equal(out.skipped[0].reason, 'below_stability_threshold');
});

test('29-04: wide-stddev cluster -> skipped (posterior_stddev_too_wide)', () => {
  const cluster = highStabilitySkillCluster({ stddev: 0.10, cluster_id: 'c-wide' });
  const out = draftClusters({ clusters: [cluster] }, { dryRun: true, existingArtifacts: [] });
  assert.equal(out.drafts.length, 0);
  assert.equal(out.skipped.length, 1);
  assert.equal(out.skipped[0].reason, 'posterior_stddev_too_wide');
});

test('29-04: high-similarity by tools overlap -> deferred to phase_11_frontmatter_update', () => {
  // Existing artifact uses the SAME tools as cluster trajectories -> Jaccard = 1.0 >= 0.8.
  const existing = [
    {
      path: 'skills/extract-figma-tokens/SKILL.md',
      frontmatter: {
        name: 'extract-figma-tokens',
        description: 'Some unrelated description here.',
        tools: ['Read', 'Grep', 'Bash'],
      },
    },
  ];
  const out = draftClusters({ clusters: [highStabilitySkillCluster()] }, { dryRun: true, existingArtifacts: existing });
  assert.equal(out.drafts.length, 0, 'no draft when similarity high');
  assert.equal(out.deferred.length, 1);
  assert.equal(out.deferred[0].reason, 'similarity_to_existing');
  assert.equal(out.deferred[0].forward_to, 'phase_11_frontmatter_update');
  assert.ok(out.deferred[0].nearest.score >= 0.8);
});

test('29-04: high-similarity by description token overlap -> deferred', () => {
  // Tools differ (Jaccard low), but description tokens overlap heavily.
  const existing = [
    {
      path: 'agents/figma-token-extractor.md',
      frontmatter: {
        name: 'figma-token-extractor',
        description: 'Extract Figma tokens and sync to repo. Use when tokens change.',
        tools: ['Task', 'WebFetch'], // disjoint from cluster tools (no Write, no Edit)
      },
    },
  ];
  const out = draftClusters({ clusters: [highStabilitySkillCluster()] }, { dryRun: true, existingArtifacts: existing });
  assert.equal(out.drafts.length, 0);
  assert.equal(out.deferred.length, 1);
  assert.ok(
    out.deferred[0].nearest.score_breakdown.description >= 0.8
      || out.deferred[0].nearest.score_breakdown.name >= 0.8,
    'nearest score_breakdown: ' + JSON.stringify(out.deferred[0].nearest.score_breakdown),
  );
});

test('29-04: tools inference picks most-common observed; no Write unless observed', () => {
  const cluster = highStabilitySkillCluster();
  // Trajectories carry only Read/Grep/Bash; Write must NOT appear in inferred tools.
  const tools = inferTools(cluster, ['Read', 'Grep', 'Glob']);
  assert.ok(tools.includes('Read'));
  assert.ok(!tools.includes('Write'), 'Write not in trajectories -> must not be inferred: ' + JSON.stringify(tools));
  assert.ok(!tools.includes('Edit'), 'Edit not in trajectories -> must not be inferred: ' + JSON.stringify(tools));
});

test('29-04: default-tier inferred from posterior best-arm when arms array present', () => {
  const cluster = highStabilitySkillCluster();
  cluster.posterior.arms = [
    { tier: 'haiku', alpha: 2, beta: 5 },
    { tier: 'sonnet', alpha: 5, beta: 4 },
    { tier: 'opus', alpha: 9, beta: 1 }, // mean = 0.9, wins
  ];
  const out = draftClusters({ clusters: [cluster] }, { dryRun: true, existingArtifacts: [] });
  assert.equal(out.drafts.length, 1);
  assert.equal(out.drafts[0].frontmatter['default-tier'], 'opus');
  assert.equal(out.drafts[0].inference.default_tier_source, 'posterior_best_arm');
});

test('29-04: safeWritePath refuses path traversal', () => {
  // Direct call with adversarial slug:
  assert.throws(
    () => safeWritePath('../../etc/passwd', 'skill', INCUBATOR_ROOT),
    /incubator_path_escape/,
  );
  assert.throws(
    () => safeWritePath('..\\..\\windows\\system32', 'skill', INCUBATOR_ROOT),
    /incubator_path_escape/,
  );
  // Benign slug derived from path-traversal-flavored intent still resolves safely
  // (deriveSlug strips dangerous chars):
  const safeSlug = deriveSlug('../../etc/passwd cracker');
  const { targetFile } = safeWritePath(safeSlug, 'skill', INCUBATOR_ROOT);
  const rel = path.relative(path.resolve(INCUBATOR_ROOT), targetFile);
  assert.ok(!rel.startsWith('..'), 'derived slug resolves under incubator root: ' + rel);
});

test('29-04: deterministic ordering of drafts/skipped/deferred by cluster_id ascending', () => {
  const clusters = [
    Object.assign(highStabilitySkillCluster({ cluster_id: 'z-cluster', intent_summary: 'do thing z' }), { intent_summary: 'do thing z' }),
    Object.assign(highStabilitySkillCluster({ cluster_id: 'a-cluster', intent_summary: 'do thing a' }), { intent_summary: 'do thing a' }),
    Object.assign(highStabilitySkillCluster({ cluster_id: 'm-cluster', intent_summary: 'do thing m' }), { intent_summary: 'do thing m' }),
  ];
  const out = draftClusters({ clusters }, { dryRun: true, existingArtifacts: [] });
  assert.equal(out.drafts.length, 3);
  assert.deepEqual(
    out.drafts.map((d) => d.cluster_id),
    ['a-cluster', 'm-cluster', 'z-cluster'],
  );
});

test('29-04: dryRun:true does not write to disk', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'incubator-test-'));
  try {
    const customRoot = path.join(tmpRoot, '.design/reflections/incubator');
    const out = draftClusters(
      { clusters: [highStabilitySkillCluster()] },
      { dryRun: true, existingArtifacts: [], incubatorRoot: customRoot },
    );
    assert.equal(out.drafts.length, 1);
    // No file should exist:
    assert.ok(!fs.existsSync(customRoot), 'dryRun should not create incubator dir: ' + customRoot);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('29-04: non-dryRun writes file under incubatorRoot with delegate_to: null on disk', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'incubator-test-'));
  try {
    const customRoot = path.join(tmpRoot, '.design/reflections/incubator');
    const out = draftClusters(
      { clusters: [highStabilitySkillCluster()] },
      { dryRun: false, existingArtifacts: [], incubatorRoot: customRoot },
    );
    assert.equal(out.drafts.length, 1);
    // Walk the customRoot directory to find the actual file.
    const files = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else files.push(p);
      }
    }
    walk(customRoot);
    assert.equal(files.length, 1, 'exactly one file under incubator root: ' + JSON.stringify(files));
    assert.match(files[0], /SKILL\.md$/);
    const content = fs.readFileSync(files[0], 'utf8');
    assert.match(content, /^---/);
    assert.match(content, /delegate_to: null/);
    assert.match(content, /## Origin/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

// ---- helper-level coverage (small) ----

test('29-04: helper jaccard returns 0 on disjoint, 1 on identical', () => {
  assert.equal(jaccard(new Set(['a']), new Set(['b'])), 0);
  assert.equal(jaccard(new Set(['a', 'b']), new Set(['a', 'b'])), 1);
});

test('29-04: helper tokenize drops stopwords + non-alnum + sorts', () => {
  const toks = tokenize('The quick, brown fox jumps over the lazy dog.');
  assert.ok(!toks.includes('the'));
  assert.ok(toks.includes('brown'));
  assert.ok(toks.includes('quick'));
  // Sorted result.
  const sorted = toks.slice().sort();
  assert.deepEqual(toks, sorted);
});

test('29-04: helper computeSimilarity returns null when no existing artifacts', () => {
  const r = computeSimilarity({ slug: 'x', inferredTools: [], description: '' }, []);
  assert.equal(r, null);
});

test('29-04: helper buildDescription clamps to 200 chars and marks truncated', () => {
  const longIntent = 'A '.repeat(120) + 'thing';
  const cluster = {
    intent_summary: longIntent,
    trajectory_refs: [
      { trajectory_id: 't', tools: ['Read'], observed_triggers: 'long trigger phrase that takes more space' },
    ],
  };
  const out = buildDescription(cluster);
  assert.ok(out.description.length <= 200, 'desc too long: ' + out.description.length);
  assert.equal(out.truncated, true);
});

test('29-04: deriveSlug dedupes against existingSlugs', () => {
  const seen = new Set(['extract-figma-tokens']);
  const s = deriveSlug('Extract Figma tokens', seen);
  assert.equal(s, 'extract-figma-tokens-2');
});
