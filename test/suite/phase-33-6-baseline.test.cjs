'use strict';

// Phase 33.6 — OpenRouter Provider Adapter regression baseline.
//
// Freezes the Wave A–B deliverable as a single release artifact so future drift
// cannot silently regress the v1.33.6 contract. Asserts (every test tagged
// `33.6-04:`):
//   1. Golden tier-resolution — resolve('opus'|'sonnet'|'haiku') over the SHARED
//      fixture catalog (test/fixtures/baselines/phase-33-6/openrouter-catalog.json)
//      equals the recorded golden ids in tier-resolution.json. A regression to the
//      closed-vs-open / pricing heuristic trips this. (SC#10 / D-03 / D-04)
//   2. TTL skip + fallback-no-key — a FRESH cache short-circuits the injected stub
//      fetch (no call); a no-key + empty cache resolves to null (graceful — D-08).
//      Hermetic: stub fetchImpl + tmpdir cachePath (D-07), NO live network.
//   3. Drift classification — diffOpenRouterCatalog on the recorded synthetic delta
//      (withdraw an override-pinned id + add a brand-new model) surfaces ONLY the
//      override-matching withdrawn id, NOT the new model. (SC#8)
//   4. 6-manifest version lockstep (package + claude plugin + marketplace
//      metadata.version + marketplace plugins[0].version + cursor + codex +
//      package-lock root/packages.""), VERSION-AGNOSTIC equality.
//   5. phase-33-6/manifests-version.txt == live package version == 1.33.6.
//   6. CHANGELOG has a [1.33.6] block at the top.
//
// Hermetic — file reads + require + the fixture + the 33.6-01 stub idiom (no
// network, no real OPENROUTER_API_KEY). Runs in the default `npm test` suite
// (D-07).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test/fixtures/baselines/phase-33-6');

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function readJsonRel(rel) {
  return JSON.parse(read(rel));
}
function readBaseline(name) {
  return fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');
}
function readBaselineJson(name) {
  return JSON.parse(readBaseline(name));
}

const GOLDEN = readBaselineJson('tier-resolution.json');
const FIXTURE = readBaselineJson('openrouter-catalog.json');

const tierResolver = require(path.join(REPO_ROOT, 'scripts/lib/tier-resolver-openrouter.cjs'));
const { fetchCatalog } = require(path.join(REPO_ROOT, 'scripts/lib/openrouter/catalog-fetcher.cjs'));
const authorityWatcher = require(path.join(REPO_ROOT, 'scripts/lib/authority-watcher/index.cjs'));

// ── 1. Golden tier-resolution over the shared fixture ───────────────────────────

test('33.6-04: golden tier-resolution matches resolve() over the fixture catalog', () => {
  for (const tier of ['opus', 'sonnet', 'haiku']) {
    const resolved = tierResolver.resolve(tier, { models: FIXTURE.models });
    assert.equal(
      resolved,
      GOLDEN.golden[tier],
      `resolve('${tier}') over the fixture catalog must equal the recorded golden id ` +
        `(${GOLDEN.golden[tier]}); got ${resolved}. If the heuristic changed intentionally, re-record the golden.`,
    );
  }
  // The three golden picks are distinct (no tier collapse on this catalog).
  const picks = new Set([GOLDEN.golden.opus, GOLDEN.golden.sonnet, GOLDEN.golden.haiku]);
  assert.equal(picks.size, 3, 'golden opus/sonnet/haiku must be three distinct ids');
});

// ── 2. TTL skip + fallback-no-key (hermetic — stub fetch, tmpdir cache) ─────────

test('33.6-04: fresh cache TTL-skips the stub fetch (recorded ttl_hours)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-33-6-04-ttl-'));
  const cachePath = path.join(dir, 'openrouter-models.json');
  const nowMs = Date.UTC(2026, 4, 31, 12, 0, 0); // fixed clock
  // A FRESH cache: fetched_at one hour ago, well within the 24h TTL.
  const fresh = {
    fetched_at: new Date(nowMs - 3600_000).toISOString(),
    ttl_hours: GOLDEN.ttl_hours,
    source: FIXTURE.source,
    models: FIXTURE.models,
  };
  fs.writeFileSync(cachePath, JSON.stringify(fresh), 'utf8');

  let stubCalls = 0;
  const stub = async () => {
    stubCalls += 1;
    return { ok: true, status: 200, headers: new Map(), json: async () => ({ data: [] }) };
  };

  const models = await fetchCatalog({
    fetchImpl: stub,
    now: () => new Date(nowMs),
    cachePath,
    ttlHours: GOLDEN.ttl_hours,
    apiKey: 'test-key',
  });

  assert.equal(stubCalls, 0, 'a FRESH cache must short-circuit the fetch (TTL skip — no stub call)');
  assert.deepEqual(models, FIXTURE.models, 'TTL-skip must return the cached models verbatim');
  assert.equal(GOLDEN.ttl_hours, 24, 'recorded ttl_hours must be 24 (D-02)');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('33.6-04: no-key + empty cache resolves to the recorded fallback (null, graceful)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-33-6-04-nokey-'));
  const cachePath = path.join(dir, 'absent-openrouter-models.json'); // never written

  let stubCalls = 0;
  const stub = async () => {
    stubCalls += 1;
    return { ok: true, status: 200, headers: new Map(), json: async () => ({ data: [] }) };
  };

  const models = await fetchCatalog({
    fetchImpl: stub,
    now: () => new Date(),
    cachePath,
    ttlHours: GOLDEN.ttl_hours,
    apiKey: undefined, // no key
  });

  assert.equal(stubCalls, 0, 'no key must NEVER trigger a fetch');
  assert.equal(
    models,
    GOLDEN.fallback_no_key,
    `no-key + empty cache must degrade to the recorded fallback (${GOLDEN.fallback_no_key})`,
  );
  assert.equal(GOLDEN.fallback_no_key, null, 'recorded fallback_no_key must be null (D-08)');

  fs.rmSync(dir, { recursive: true, force: true });
});

// ── 3. Drift classification on the recorded synthetic delta ─────────────────────

test('33.6-04: drift surfaces only the override-matching withdrawn id (not the new model)', () => {
  const d = GOLDEN.drift_synthetic;
  // Build curr from the fixture per the recorded synthetic delta: withdraw the
  // override-pinned id + add the recorded brand-new model.
  const prev = FIXTURE.models;
  const curr = prev
    .filter((m) => m.id !== d.withdrawn_surfaced)
    .concat([
      { id: d.new_model_id, name: 'Synthetic New', context_length: 1000, pricing: { prompt: '0.1', completion: '0.2' } },
    ]);

  const out = authorityWatcher.diffOpenRouterCatalog(prev, curr, { overrides: d.overrides });
  const byId = new Map(out.map((e) => [e.id, e]));

  const withdrawn = byId.get(d.withdrawn_surfaced);
  assert.ok(withdrawn, 'the withdrawn override id must appear in the diff');
  assert.equal(withdrawn.change, 'withdrawn', 'the override id must be classified withdrawn');
  assert.equal(withdrawn.surfaced, true, 'a withdrawn id IN the overrides must be surfaced (SC#8)');

  const created = byId.get(d.new_model_id);
  assert.ok(created, 'the brand-new model must appear in the diff');
  assert.equal(created.change, 'new-model', 'the brand-new id must be classified new-model');
  assert.equal(
    created.surfaced,
    d.new_model_surfaced,
    `the new model must NOT be surfaced (recorded ${d.new_model_surfaced}) — noise control`,
  );

  // Exactly one surfaced entry — the withdrawn override id.
  const surfaced = out.filter((e) => e.surfaced);
  assert.equal(surfaced.length, 1, 'exactly one surfaced entry (the override-matching withdrawal)');
  assert.equal(surfaced[0].id, d.withdrawn_surfaced, 'the single surfaced entry is the withdrawn override id');
});

// ── 4. 6-manifest version lockstep (version-agnostic) ───────────────────────────

test('33.6-04: 6-manifest version lockstep (package + claude plugin + marketplace x2 + cursor + codex + lock)', () => {
  const pkgVersion = readJsonRel('package.json').version;
  assert.match(pkgVersion, /^\d+\.\d+\.\d+$/, 'package.json version looks like semver');
  for (const f of ['.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.equal(readJsonRel(f).version, pkgVersion, `${f} version != package.json version`);
  }
  const mp = readJsonRel('.claude-plugin/marketplace.json');
  assert.equal(mp.metadata.version, pkgVersion, 'marketplace metadata.version != package version');
  assert.ok(mp.plugins && mp.plugins[0], 'marketplace plugins[0] exists');
  assert.equal(mp.plugins[0].version, pkgVersion, 'marketplace plugins[0].version != package version');
  const lock = readJsonRel('package-lock.json');
  assert.equal(lock.version, pkgVersion, 'package-lock.json root version != package version');
  if (lock.packages && lock.packages['']) {
    assert.equal(lock.packages[''].version, pkgVersion, 'package-lock.json packages."" version != package version');
  }
});

// ── 5. phase-33-6 manifests-version baseline == live (version-agnostic) ─────────
//
// The phase-33-6 manifests-version baseline is a forward-prop target: it tracks
// the LIVE package version, not a frozen 1.33.6. The original hard-coded
// `=== '1.33.6'` was a latent defect (the same one phase-33-5's baseline already
// fixed) that breaks on every later decimal release — it broke at v1.34.1 when
// Phase 34.1 forward-propagated this baseline 1.33.6 → 1.34.1 (D-08). Assert
// baseline == live and that the [1.33.6] release is still RECORDED in the
// CHANGELOG, rather than pinning the literal.

test('33.6-04: phase-33-6/manifests-version.txt baseline == live package version (forward-prop target)', () => {
  const baseline = readBaseline('manifests-version.txt').replace(/\s+$/, '');
  const live = readJsonRel('package.json').version;
  assert.match(baseline, /^\d+\.\d+\.\d+$/, 'phase-33-6 manifests-version.txt looks like semver');
  assert.equal(baseline, live, `phase-33-6 manifests-version.txt (${baseline}) != package.json version (${live})`);
});

// ── 6. CHANGELOG carries the [1.33.6] block (version-agnostic top check) ────────

test('33.6-04: CHANGELOG carries the [1.33.6] block (D-01)', () => {
  const cl = read('CHANGELOG.md');
  assert.match(cl, /## \[1\.33\.6\]/, 'CHANGELOG must carry a ## [1.33.6] entry (D-01)');
  // The top-most heading tracks the live version (later decimals stack above
  // [1.33.6]); assert it is a valid heading == the live version rather than
  // hard-pinning 1.33.6 (the original literal broke at v1.34.1).
  const firstHeading = cl.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  assert.ok(firstHeading, 'CHANGELOG has at least one release heading');
  assert.equal(
    firstHeading[1],
    readJsonRel('package.json').version,
    'the top-most CHANGELOG release heading must match the live package version',
  );
});
