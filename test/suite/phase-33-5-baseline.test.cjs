'use strict';

// Phase 33.5 — GDD Runtime Security Hardening regression baseline.
//
// Locks the union of the Wave A–C deliverable as a single release artifact so
// future drift cannot silently regress the v1.33.5 contract. Asserts:
//   1. 6-manifest version lockstep (package + claude plugin + marketplace
//      metadata.version + marketplace plugins[0].version + cursor + codex),
//      VERSION-AGNOSTIC (reads package.json#version, asserts the rest equal it).
//   2. phase-33-5/manifests-version.txt baseline == live == 1.33.5.
//   3. CHANGELOG has a [1.33.5] block at the top.
//   4. SECURITY.md exists, references GitHub private advisories / "Report a
//      vulnerability", and publishes NO email-shaped PII (D-02).
//   5. hardening-surface.json matches reality: redact PATTERNS.length === 11,
//      ws.cjs contains the 127.0.0.1 default-host literal, the named modules /
//      docs / allowlist exist, the hone-state schemas dir has 11 *.schema.json.
//
// Hermetic — file reads + require only (no network, no live peer/server). Runs
// in the default `npm test` suite (D-10). All tests carry the `33.5-06:` tag.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test/fixtures/baselines/phase-33-5');

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function readJsonRel(rel) {
  return JSON.parse(read(rel));
}
function readBaseline(name) {
  return fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

// ── 1. 6-manifest version lockstep (version-agnostic) ───────────────────────────

test('33.5-06: 6-manifest version lockstep (package + claude plugin + marketplace x2 + cursor + codex equal)', () => {
  const pkgVersion = readJsonRel('package.json').version;
  assert.match(pkgVersion, /^\d+\.\d+\.\d+$/, 'package.json version looks like semver');
  for (const f of ['.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.equal(readJsonRel(f).version, pkgVersion, `${f} version != package.json version`);
  }
  const mp = readJsonRel('.claude-plugin/marketplace.json');
  assert.equal(mp.metadata.version, pkgVersion, 'marketplace metadata.version != package version');
  assert.ok(mp.plugins && mp.plugins[0], 'marketplace plugins[0] exists');
  assert.equal(mp.plugins[0].version, pkgVersion, 'marketplace plugins[0].version != package version');
  // package-lock root + packages."" (the 6th treated location) track the live version too.
  const lock = readJsonRel('package-lock.json');
  assert.equal(lock.version, pkgVersion, 'package-lock.json root version != package version');
  if (lock.packages && lock.packages['']) {
    assert.equal(lock.packages[''].version, pkgVersion, 'package-lock.json packages."" version != package version');
  }
});

// ── 2. phase-33-5 manifests-version baseline == live (version-agnostic) ─────────
// NOTE: this baseline is a D-09 forward-prop target — it tracks the LIVE package
// version, not a frozen 1.33.5. The original hard-coded `=== '1.33.5'` was a
// latent defect that breaks on every later decimal release (it broke at v1.33.6
// when 33.6-04 forward-propped this file). Made version-agnostic to match the
// phase-32/phase-33 idiom: assert it equals the live version and is not stale.

test('33.5-06: phase-33-5/manifests-version.txt baseline == live package version (forward-prop target)', () => {
  const baseline = readBaseline('manifests-version.txt').replace(/\s+$/, '');
  const live = readJsonRel('package.json').version;
  assert.match(baseline, /^\d+\.\d+\.\d+$/, 'phase-33-5 manifests-version.txt looks like semver');
  assert.equal(baseline, live, `phase-33-5 manifests-version.txt (${baseline}) != package.json version (${live})`);
});

// ── 3. CHANGELOG [1.33.5] present (version-agnostic top check) ──────────────────

test('33.5-06: CHANGELOG carries the [1.33.5] block (D-01)', () => {
  const cl = read('CHANGELOG.md');
  assert.match(cl, /## \[1\.33\.5\]/, 'CHANGELOG must carry a ## [1.33.5] entry (D-01)');
  // The top-most heading tracks the LIVE version (later decimal releases insert
  // above [1.33.5]); assert it is a valid heading == the live version rather than
  // hard-pinning 1.33.5 (the original literal broke at v1.33.6).
  const firstHeading = cl.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  assert.ok(firstHeading, 'CHANGELOG has at least one release heading');
  assert.equal(
    firstHeading[1],
    readJsonRel('package.json').version,
    'the top-most CHANGELOG release heading must match the live package version',
  );
});

// ── 4. SECURITY.md disclosure + no PII (D-02) ───────────────────────────────────

test('33.5-06: SECURITY.md exists, uses GitHub private advisories, and publishes NO email PII (D-02)', () => {
  assert.ok(exists('SECURITY.md'), 'SECURITY.md must exist at the repo root (D-11)');
  const sec = read('SECURITY.md');
  assert.match(
    sec,
    /advisor|Report a vulnerability/i,
    'SECURITY.md must point at GitHub private advisories / the "Report a vulnerability" flow (D-02)',
  );
  // No email-shaped substring anywhere (D-02 — no PII published).
  assert.doesNotMatch(
    sec,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    'SECURITY.md must NOT publish an email-shaped contact (D-02 no PII)',
  );
  // The D-11 enable-private-reporting maintainer note must be present.
  assert.match(
    sec,
    /[Pp]rivate vulnerability reporting/,
    'SECURITY.md must carry the D-11 enable-private-vulnerability-reporting maintainer note',
  );
});

// ── 5. hardening-surface manifest matches reality ───────────────────────────────

test('33.5-06: hardening-surface.json matches the live hardened surface (SC#8)', () => {
  const h = JSON.parse(readBaseline('hardening-surface.json'));

  // redact pattern count (33.5-05 extended 8 -> 11).
  const redact = require(path.join(REPO_ROOT, h.redact_module));
  assert.ok(Array.isArray(redact.PATTERNS), 'redact.cjs must export PATTERNS[]');
  assert.equal(
    redact.PATTERNS.length,
    h.redact_patterns_count,
    `redact PATTERNS length (${redact.PATTERNS.length}) != hardening-surface redact_patterns_count (${h.redact_patterns_count})`,
  );
  assert.equal(h.redact_patterns_count, 11, 'redact_patterns_count must be 11 (D-07)');

  // ws default-host literal (33.5-03 flipped 0.0.0.0 -> 127.0.0.1).
  assert.equal(h.ws_default_host, '127.0.0.1', 'ws_default_host must be 127.0.0.1 (D-04)');
  const ws = read(h.ws_module);
  assert.ok(
    ws.includes(h.ws_default_host),
    `${h.ws_module} must contain the default-host literal ${h.ws_default_host} (D-04)`,
  );

  // sanitize-env helper + allowlist key (33.5-04).
  assert.ok(exists(h.sanitize_env_module), `${h.sanitize_env_module} must exist (D-03)`);
  const sanitize = read(h.sanitize_env_module);
  assert.ok(
    sanitize.includes('env_allowlist'),
    'sanitize-env must reference the peer_cli.env_allowlist config key (D-03)',
  );
  assert.equal(h.peer_cli_allowlist_key, 'peer_cli.env_allowlist', 'allowlist key must be peer_cli.env_allowlist');

  // outbound allowlist + threat model + runtime audit present.
  for (const rel of [h.outbound_allowlist, h.threat_model, h.runtime_audit, h.secret_fuzz_corpus]) {
    assert.ok(exists(rel), `hardening-surface references ${rel} but it does not exist`);
  }

  // hone-state schemas dir has exactly 11 *.schema.json (D-08).
  const schemaDir = path.join(REPO_ROOT, h.hone_state_schema_dir);
  const schemas = fs.readdirSync(schemaDir).filter((f) => f.endsWith('.schema.json'));
  assert.equal(
    schemas.length,
    h.hone_state_schema_count,
    `hone-state schemas dir has ${schemas.length} *.schema.json; expected ${h.hone_state_schema_count}`,
  );
  assert.equal(h.hone_state_schema_count, 11, 'hone_state_schema_count must be 11 (D-08)');
});

// ── stride-checklist snapshot present + well-formed ─────────────────────────────

test('33.5-06: stride-checklist.json mirrors the 5 components + residual->plan map', () => {
  const sc = JSON.parse(readBaseline('stride-checklist.json'));
  assert.deepEqual(
    sc.components,
    ['hooks', 'mcp-hone-state', 'peer-cli', 'websocket', 'issue-reporter'],
    'stride-checklist must snapshot the 5 in-scope components',
  );
  assert.ok(Array.isArray(sc.residuals) && sc.residuals.length >= 6, 'stride-checklist must list the residual->plan rows');
  // Every residual routes to a closing plan; the disclosure residual closes in 33.5-06.
  for (const r of sc.residuals) {
    assert.ok(typeof r.plan === 'string' && r.plan.includes('33.5'), `residual missing 33.5 closing plan: ${JSON.stringify(r)}`);
  }
  assert.ok(
    sc.residuals.some((r) => r.plan.includes('33.5-06')),
    'the no-disclosure-policy residual must route to 33.5-06 (SECURITY.md)',
  );
});
