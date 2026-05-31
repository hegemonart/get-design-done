'use strict';

// Phase 34.1 — Native Mobile Output regression baseline (SC#10, D-05, D-08, D-10).
//
// Freezes the Wave A–B deliverable (the native token-bridge + the three native
// executors) as a single release artifact so future drift cannot silently
// regress the v1.34.1 contract. Asserts (every test tagged `34.1-06:`):
//   1. Native-theme fixtures match the emitters — emitSwift/emitCompose/
//      emitFlutter over the canonical-derived token map equal the recorded
//      swift/compose/flutter-theme fixtures byte-for-byte (the determinism +
//      regression lock on the emitters).
//   2. Token-bridge round-trip snapshot holds — reextract(emit(input))
//      deep-equals the recorded re-extraction within the documented precision
//      (color 8-bit exact / integer pt-dp / family string-equal).
//   3. 6-manifest version lockstep — package.json == .claude-plugin/plugin.json
//      == marketplace.metadata.version == marketplace.plugins[0].version ==
//      .cursor-plugin == .codex-plugin == package-lock (root + packages."").
//   4. phase-34-1/manifests-version.txt == live package version == 1.34.1.
//   5. CHANGELOG has a [1.34.1] block at the top.
//
// Hermetic (D-10): file reads + require the design-tokens facade + the recorded
// fixtures. NO simulator, NO emulator, NO network, NO child_process. The
// emit/re-extract round-trip is the token-level lock; the agents/LLM produce the
// real native apps. Runs in the default `npm test`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-34-1');

const facade = require(path.join(REPO_ROOT, 'scripts/lib/design-tokens/index.cjs'));
const {
  emitSwift,
  emitCompose,
  emitFlutter,
  reextractSwift,
  reextractCompose,
  reextractFlutter,
} = facade;

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function readJsonRel(rel) {
  return JSON.parse(read(rel));
}
function readBaseline(name) {
  return fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');
}

// Derive the canonical token map the SAME way native-token-bridge.test.cjs (the
// 34.1-01 round-trip suite) does: token NAMES from the shared Phase-23 fixture
// (strip leading --) + representative values per category. This keeps the
// committed baseline self-consistent with the canonical fixture seam.
const FIXTURE_PATH = path.join(REPO_ROOT, 'test', 'fixtures', 'mapper-outputs', 'tokens.json');
const REPRESENTATIVE = {
  'color-primary': '#3B82F6',
  'space-4': '16px',
  'font-family-body': 'Inter, system-ui',
};
function deriveFixtureMap() {
  const raw = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  /** @type {Record<string,string>} */
  const tokens = {};
  for (const rec of raw.tokens) {
    const name = String(rec.token).replace(/^--/, '');
    tokens[name] = REPRESENTATIVE[name] || '#000000';
  }
  return { tokens };
}

const EMITTERS = [
  { name: 'swift', emit: emitSwift, reextract: reextractSwift, fixture: 'swift-theme.txt' },
  { name: 'compose', emit: emitCompose, reextract: reextractCompose, fixture: 'compose-theme.txt' },
  { name: 'flutter', emit: emitFlutter, reextract: reextractFlutter, fixture: 'flutter-theme.txt' },
];

// ── 1. Native-theme fixtures match the emitters (byte-equal determinism lock) ───

test('34.1-06: native-theme fixtures match the emitters (byte-equal over the canonical map)', () => {
  const ts = deriveFixtureMap();
  for (const { name, emit, fixture } of EMITTERS) {
    const recorded = readBaseline(fixture);
    const fresh = emit(ts);
    assert.equal(
      fresh,
      recorded,
      `${name}-theme fixture drifted from emit${name[0].toUpperCase() + name.slice(1)}() over the ` +
        `canonical-derived token map. If the emitter changed intentionally, re-record the fixture ` +
        `(emit -> test/fixtures/baselines/phase-34-1/${fixture}).`,
    );
    // Determinism: emit is a pure function of its input.
    assert.equal(emit(ts), fresh, `${name} must be byte-deterministic (emit(x) === emit(x))`);
  }
});

// ── 2. Token-bridge round-trip snapshot holds within the precision contract ─────

test('34.1-06: token-bridge round-trip snapshot holds (reextract(emit(input)) within precision)', () => {
  const snapshot = JSON.parse(readBaseline('token-bridge-roundtrip.json'));
  assert.ok(snapshot && snapshot.input, 'round-trip snapshot must record the input token map');
  const ts = { tokens: snapshot.input };

  for (const { name, emit, reextract } of EMITTERS) {
    const recordedRe = snapshot[name];
    assert.ok(
      recordedRe && recordedRe.tokens,
      `round-trip snapshot must record the ${name} re-extraction`,
    );
    const fresh = reextract(emit(ts));
    assert.deepEqual(
      fresh,
      recordedRe,
      `${name} round-trip drifted from the recorded snapshot. A regression to the ${name} ` +
        `emitter or re-extractor (the precision contract) trips this.`,
    );
    // Identity-within-precision: every recovered token equals the input,
    // colors normalised to their expanded lower-cased #RRGGBB(AA) canonical.
    for (const [k, v] of Object.entries(fresh.tokens)) {
      const input = snapshot.input[k];
      const expected = /^#[0-9a-fA-F]{3}$/.test(input)
        ? ('#' + input.slice(1).split('').map((c) => c + c).join('')).toLowerCase()
        : /^#[0-9a-fA-F]{6}$/.test(input) || /^#[0-9a-fA-F]{8}$/.test(input)
          ? input.toLowerCase()
          : input;
      const got = /^#[0-9a-fA-F]+$/.test(v) ? v.toLowerCase() : v;
      assert.equal(got, expected, `${name} round-trip identity mismatch for token "${k}"`);
    }
  }
});

// ── 3. 6-manifest version lockstep (version-agnostic equality) ──────────────────

test('34.1-06: 6-manifest version lockstep (package + claude plugin + marketplace x2 + cursor + codex + lock)', () => {
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

// ── 4. phase-34-1 manifests-version baseline == live (version-agnostic) ─────────
// The phase-34-1 baseline is a D-08 FORWARD-PROP target: each later closeout
// bumps it to the new live version (Phase 34.2 forward-propped it 1.34.1 ->
// 1.34.2 as the prior closeout's own baseline now trailing live), so this
// asserts == live (the same phase-32/33/33.5/33.6 idiom — a hard-coded literal
// here is a latent defect that breaks on every subsequent decimal release) and
// >= 1.34.1 (it must never regress below the version this baseline froze).

test('34.1-06: phase-34-1/manifests-version.txt baseline == live package version (>= 1.34.1)', () => {
  const baseline = readBaseline('manifests-version.txt').replace(/\s+$/, '');
  const live = readJsonRel('package.json').version;
  assert.equal(baseline, live, `phase-34-1 manifests-version.txt (${baseline}) != package.json version (${live})`);
  const [maj, min, pat] = baseline.split('.').map(Number);
  const gteBaseline =
    maj > 1 || (maj === 1 && min > 34) || (maj === 1 && min === 34 && pat >= 1);
  assert.ok(gteBaseline, `phase-34-1 manifests-version.txt (${baseline}) must be >= 1.34.1 (D-08 forward-prop target; must not regress)`);
});

// ── 5. CHANGELOG [1.34.1] block present + not regressed below 1.34.1 ─────────────
// Version-agnostic (the phase-32/33/33.5/33.6 idiom): a later decimal release
// (e.g. 1.34.2 from Phase 34.2) legitimately sits ABOVE [1.34.1], so this
// asserts the [1.34.1] entry still EXISTS (the 34.1 regression lock) and that
// the top-most heading has not REGRESSED below 1.34.1 — not that 1.34.1 is top.

test('34.1-06: CHANGELOG has a [1.34.1] block and the top heading has not regressed (D-01)', () => {
  const cl = read('CHANGELOG.md');
  assert.match(cl, /## \[1\.34\.1\]/, 'CHANGELOG must carry a ## [1.34.1] entry (D-01)');
  const firstHeading = cl.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  assert.ok(firstHeading, 'CHANGELOG has at least one release heading');
  const [maj, min, pat] = firstHeading[1].split('.').map(Number);
  const topGteBaseline =
    maj > 1 ||
    (maj === 1 && min > 34) ||
    (maj === 1 && min === 34 && pat >= 1);
  assert.ok(
    topGteBaseline,
    `the top-most CHANGELOG release heading (${firstHeading[1]}) must be >= 1.34.1 (must not regress below the 34.1 baseline)`,
  );
});
