'use strict';
// test/suite/phase-53-fingerprint.test.cjs
// ---------------------------------------------------------------------------
// Phase 53 (Semantic Mapper Engine) — FP-01 fingerprint engine (53-03).
//
// Proves sdk/fingerprint/index.ts:
//   * fingerprint(input, type) → { full, structural } (both sha256 hex);
//   * compareFingerprints(a, b) → NONE | COSMETIC | STRUCTURAL;
//   * the precise COSMETIC-vs-STRUCTURAL contract executor C's classifier and
//     executor E's wiring depend on:
//       - cosmetic token-VALUE edit            → COSMETIC
//       - prop added                           → STRUCTURAL
//       - motion 198ms vs 200ms (same bucket)  → NONE or COSMETIC (NOT STRUCTURAL)
//       - exported variant added               → STRUCTURAL
//       - add (null→x) / remove (x→null)        → STRUCTURAL
//   * DETERMINISM (the HARD cross-OS contract): the same logical input with
//     shuffled object-key order + extra whitespace produces an IDENTICAL `full`
//     hex — canonicalization (sorted keys, set-array sort/dedupe, whitespace
//     collapse) is what makes win32/Linux/macOS agree;
//   * TYPE-PREFIX isolation: two DIFFERENT types whose field values coincide
//     hash to DIFFERENT digests (no cross-type collision).
//
// The module is TypeScript run under --experimental-strip-types; we load it via
// dynamic import(pathToFileURL(absPath).href) so Node strips the types at load.
// All inputs are hermetic in-memory objects (no disk, no network).
//
// Runner: node --test --experimental-strip-types test/suite/phase-53-fingerprint.test.cjs

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FP_MODULE = path.join(REPO_ROOT, 'sdk', 'fingerprint', 'index.ts');

/** Dynamic-import the .ts fingerprint module (types stripped at load). */
async function loadFingerprint() {
  return import(pathToFileURL(FP_MODULE).href);
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// In-memory fixtures (hermetic).
// ---------------------------------------------------------------------------

/** A baseline component projection. */
function baseComponent() {
  return {
    component_signature: { name: 'Button', members: ['onClick', 'render'] },
    props_shape: [
      { name: 'label', type: 'string' },
      { name: 'disabled', type: 'boolean', optional: true },
    ],
    used_tokens: ['token.color.brand', 'token.space.sm'],
    exported_variants: ['primary', 'secondary'],
  };
}

/** A baseline token projection. */
function baseToken() {
  return {
    token_name: 'color.brand',
    token_value: '#3366ff',
    token_type: 'color',
    theme_scope: 'light',
  };
}

/** A baseline motion projection. */
function baseMotion() {
  return {
    animation_target: 'opacity',
    duration_ms: 200,
    easing: 'ease-in-out',
  };
}

// ---------------------------------------------------------------------------
// Shape + basic invariants.
// ---------------------------------------------------------------------------

test('53-03: fingerprint() returns two sha256 hex digests for each type', async () => {
  const { fingerprint } = await loadFingerprint();
  for (const [input, type] of [
    [baseComponent(), 'component'],
    [baseToken(), 'token'],
    [baseMotion(), 'motion'],
  ]) {
    const fp = fingerprint(input, type);
    assert.match(fp.full, SHA256_HEX, `${type}.full must be sha256 hex`);
    assert.match(fp.structural, SHA256_HEX, `${type}.structural must be sha256 hex`);
  }
});

test('53-03: fingerprint() is a pure function of its input (re-call equality)', async () => {
  const { fingerprint } = await loadFingerprint();
  const a = fingerprint(baseToken(), 'token');
  const b = fingerprint(baseToken(), 'token');
  assert.equal(a.full, b.full);
  assert.equal(a.structural, b.structural);
});

// ---------------------------------------------------------------------------
// COSMETIC: a token VALUE edit changes `full` but not `structural`.
// ---------------------------------------------------------------------------

test('53-03: cosmetic token-VALUE edit → compareFingerprints COSMETIC', async () => {
  const { fingerprint, compareFingerprints } = await loadFingerprint();
  const before = fingerprint(baseToken(), 'token');
  const edited = baseToken();
  edited.token_value = '#0044cc'; // value-only change
  const after = fingerprint(edited, 'token');

  assert.notEqual(before.full, after.full, 'full must differ (value changed)');
  assert.equal(before.structural, after.structural, 'structural must be stable');
  assert.equal(compareFingerprints(before, after), 'COSMETIC');
});

// ---------------------------------------------------------------------------
// STRUCTURAL: a prop added.
// ---------------------------------------------------------------------------

test('53-03: prop added → STRUCTURAL', async () => {
  const { fingerprint, compareFingerprints } = await loadFingerprint();
  const before = fingerprint(baseComponent(), 'component');
  const grown = baseComponent();
  grown.props_shape.push({ name: 'size', type: 'string', optional: true });
  const after = fingerprint(grown, 'component');

  assert.notEqual(before.structural, after.structural, 'structural must change');
  assert.equal(compareFingerprints(before, after), 'STRUCTURAL');
});

test('53-03: changing a prop from required to optional → STRUCTURAL', async () => {
  const { fingerprint, compareFingerprints } = await loadFingerprint();
  const before = fingerprint(baseComponent(), 'component');
  const opt = baseComponent();
  opt.props_shape[0].optional = true; // label: string  ->  label?: string
  const after = fingerprint(opt, 'component');

  assert.equal(compareFingerprints(before, after), 'STRUCTURAL');
});

// ---------------------------------------------------------------------------
// COSMETIC: gaining/losing a used-token reference is component-cosmetic.
//   (used_tokens is in `full` but omitted from `structural`.)
// ---------------------------------------------------------------------------

test('53-03: component used_tokens delta → COSMETIC (omitted from structural)', async () => {
  const { fingerprint, compareFingerprints } = await loadFingerprint();
  const before = fingerprint(baseComponent(), 'component');
  const reTokened = baseComponent();
  reTokened.used_tokens = ['token.color.accent']; // different token set
  const after = fingerprint(reTokened, 'component');

  assert.notEqual(before.full, after.full, 'full must differ (token set changed)');
  assert.equal(before.structural, after.structural, 'structural omits used_tokens');
  assert.equal(compareFingerprints(before, after), 'COSMETIC');
});

// ---------------------------------------------------------------------------
// Motion bucketing: 198ms vs 200ms stays in 'base' bucket → NOT STRUCTURAL.
// ---------------------------------------------------------------------------

test('53-03: motion 198ms vs 200ms (same bucket) → not STRUCTURAL', async () => {
  const { fingerprint, compareFingerprints } = await loadFingerprint();
  const m200 = baseMotion(); // 200ms
  const m198 = baseMotion();
  m198.duration_ms = 198; // still ≤300 → 'base'
  const before = fingerprint(m200, 'motion');
  const after = fingerprint(m198, 'motion');

  const change = compareFingerprints(before, after);
  assert.notEqual(change, 'STRUCTURAL', 'same duration bucket must not read STRUCTURAL');
  assert.ok(change === 'NONE' || change === 'COSMETIC', `got ${change}`);
  // structural omits the bucket, so structural is identical regardless.
  assert.equal(before.structural, after.structural);
});

test('53-03: motion crossing a duration bucket boundary (90ms→200ms) → COSMETIC', async () => {
  const { fingerprint, compareFingerprints } = await loadFingerprint();
  const fast = baseMotion();
  fast.duration_ms = 90; // 'fast'
  const base = baseMotion();
  base.duration_ms = 200; // 'base'
  const before = fingerprint(fast, 'motion');
  const after = fingerprint(base, 'motion');

  // duration_bucket is in `full` (so full differs) but omitted from
  // `structural` (so structural is stable) → COSMETIC.
  assert.notEqual(before.full, after.full);
  assert.equal(before.structural, after.structural);
  assert.equal(compareFingerprints(before, after), 'COSMETIC');
});

test('53-03: motion easing-class change → STRUCTURAL', async () => {
  const { fingerprint, compareFingerprints } = await loadFingerprint();
  const before = fingerprint(baseMotion(), 'motion'); // ease-in-out
  const sprung = baseMotion();
  sprung.easing = 'spring';
  const after = fingerprint(sprung, 'motion');

  assert.notEqual(before.structural, after.structural, 'easing_class is structural');
  assert.equal(compareFingerprints(before, after), 'STRUCTURAL');
});

// ---------------------------------------------------------------------------
// STRUCTURAL: exported variant added.
// ---------------------------------------------------------------------------

test('53-03: exported variant added → STRUCTURAL', async () => {
  const { fingerprint, compareFingerprints } = await loadFingerprint();
  const before = fingerprint(baseComponent(), 'component');
  const grown = baseComponent();
  grown.exported_variants.push('ghost');
  const after = fingerprint(grown, 'component');

  assert.notEqual(before.structural, after.structural);
  assert.equal(compareFingerprints(before, after), 'STRUCTURAL');
});

// ---------------------------------------------------------------------------
// add (null → x) and remove (x → null) are STRUCTURAL.
// ---------------------------------------------------------------------------

test('53-03: add (null → fingerprint) → STRUCTURAL', async () => {
  const { fingerprint, compareFingerprints } = await loadFingerprint();
  const added = fingerprint(baseToken(), 'token');
  assert.equal(compareFingerprints(null, added), 'STRUCTURAL');
});

test('53-03: remove (fingerprint → null) → STRUCTURAL', async () => {
  const { fingerprint, compareFingerprints } = await loadFingerprint();
  const removed = fingerprint(baseToken(), 'token');
  assert.equal(compareFingerprints(removed, null), 'STRUCTURAL');
});

test('53-03: null vs null → STRUCTURAL (defensive; never NONE)', async () => {
  const { compareFingerprints } = await loadFingerprint();
  // Both absent is degenerate; the contract returns STRUCTURAL (NONE requires
  // both present AND full-equal). Guards executor C against a false SKIP.
  assert.equal(compareFingerprints(null, null), 'STRUCTURAL');
});

// ---------------------------------------------------------------------------
// NONE: an identical entity (no change at all).
// ---------------------------------------------------------------------------

test('53-03: identical entity → NONE', async () => {
  const { fingerprint, compareFingerprints } = await loadFingerprint();
  const before = fingerprint(baseComponent(), 'component');
  const after = fingerprint(baseComponent(), 'component');
  assert.equal(compareFingerprints(before, after), 'NONE');
});

// ---------------------------------------------------------------------------
// DETERMINISM (HARD cross-OS contract): shuffled key order + extra whitespace
// → identical `full` hex.
// ---------------------------------------------------------------------------

test('53-03: shuffled key order produces identical full hex (key-sort canonicalization)', async () => {
  const { fingerprint } = await loadFingerprint();

  const ordered = {
    token_name: 'color.brand',
    token_value: '#3366ff',
    token_type: 'color',
    theme_scope: 'light',
  };
  // Same fields, different insertion order.
  const shuffled = {
    theme_scope: 'light',
    token_type: 'color',
    token_name: 'color.brand',
    token_value: '#3366ff',
  };

  const a = fingerprint(ordered, 'token');
  const b = fingerprint(shuffled, 'token');
  assert.equal(a.full, b.full, 'key order must not affect the hash');
  assert.equal(a.structural, b.structural);
});

test('53-03: extra/collapsible whitespace produces identical full hex (whitespace normalization)', async () => {
  const { fingerprint } = await loadFingerprint();

  const tight = {
    animation_target: 'opacity',
    duration_ms: 200,
    easing: 'ease-in-out',
  };
  const loose = {
    animation_target: '  opacity ',
    duration_ms: 200,
    easing: '  ease-in-out  ',
  };

  const a = fingerprint(tight, 'motion');
  const b = fingerprint(loose, 'motion');
  assert.equal(a.full, b.full, 'surrounding whitespace must be normalized away');
});

test('53-03: set-array order + duplicates do not affect the hash (set canonicalization)', async () => {
  const { fingerprint } = await loadFingerprint();

  const a = baseComponent();
  a.used_tokens = ['token.color.brand', 'token.space.sm'];
  a.exported_variants = ['primary', 'secondary'];

  const b = baseComponent();
  // Reordered + duplicated set members.
  b.used_tokens = ['token.space.sm', 'token.color.brand', 'token.color.brand'];
  b.exported_variants = ['secondary', 'primary', 'secondary'];

  const fa = fingerprint(a, 'component');
  const fb = fingerprint(b, 'component');
  assert.equal(fa.full, fb.full, 'set-array order/dupes must be canonicalized');
  assert.equal(fa.structural, fb.structural);
});

test('53-03: members set order does not affect the component hash', async () => {
  const { fingerprint } = await loadFingerprint();
  const a = baseComponent();
  a.component_signature.members = ['onClick', 'render'];
  const b = baseComponent();
  b.component_signature.members = ['render', 'onClick'];
  const fa = fingerprint(a, 'component');
  const fb = fingerprint(b, 'component');
  assert.equal(fa.full, fb.full);
  assert.equal(fa.structural, fb.structural);
});

test('53-03: numeric scalar normalization — 200 and 200.0 hash identically', async () => {
  const { fingerprint } = await loadFingerprint();
  const a = baseMotion();
  a.duration_ms = 200;
  const b = baseMotion();
  b.duration_ms = 200.0; // same numeric value, canonical String(Number(x))
  assert.equal(fingerprint(a, 'motion').full, fingerprint(b, 'motion').full);
});

// ---------------------------------------------------------------------------
// TYPE-PREFIX isolation: two DIFFERENT types with identical field values must
// NOT collide. The `type:`-prefixed serialization guarantees this.
// ---------------------------------------------------------------------------

test('53-03: two different types with identical field values → different hashes (type prefix)', async () => {
  const { fingerprint } = await loadFingerprint();

  // Construct inputs that, absent a type prefix, could serialize to the same
  // bytes: a single shared field name with the same value.
  const shared = { animation_target: 'x', token_name: 'x', token_value: 'x', token_type: 'x' };

  const asToken = fingerprint(shared, 'token');
  const asMotion = fingerprint(shared, 'motion');
  assert.notEqual(asToken.full, asMotion.full, 'type prefix must prevent collision');
  assert.notEqual(asToken.structural, asMotion.structural);
});

test('53-03: empty-ish token vs empty-ish component do not collide', async () => {
  const { fingerprint } = await loadFingerprint();
  const tokenLike = { token_name: '', token_value: '', token_type: '' };
  const componentLike = { component_signature: { name: '' }, props_shape: [] };
  const t = fingerprint(tokenLike, 'token');
  const c = fingerprint(componentLike, 'component');
  assert.notEqual(t.full, c.full);
  assert.notEqual(t.structural, c.structural);
});

// ---------------------------------------------------------------------------
// Defensive input handling.
// ---------------------------------------------------------------------------

test('53-03: fingerprint() throws on non-object input', async () => {
  const { fingerprint } = await loadFingerprint();
  assert.throws(() => fingerprint(null, 'token'), /must be an object/);
  assert.throws(() => fingerprint('nope', 'token'), /must be an object/);
});

test('53-03: missing optional fields default deterministically (no throw, stable hash)', async () => {
  const { fingerprint } = await loadFingerprint();
  // Minimal component: no used_tokens / exported_variants / members.
  const minimal = {
    component_signature: { name: 'Bare' },
    props_shape: [],
  };
  const a = fingerprint(minimal, 'component');
  const b = fingerprint(minimal, 'component');
  assert.match(a.full, SHA256_HEX);
  assert.equal(a.full, b.full);
  assert.equal(a.structural, b.structural);
});
