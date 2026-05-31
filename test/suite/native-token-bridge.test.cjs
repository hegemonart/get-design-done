// test/suite/native-token-bridge.test.cjs — Phase 34.1 Plan 01
//
// Hermetic per-emitter round-trip for the native token-bridge (SC#1).
// The bridge extends the Phase-23 token engine (scripts/lib/design-tokens/)
// with swift/compose/flutter emitters + symmetric re-extractors. This suite
// asserts the PRECISION CONTRACT documented in reference/native-platforms.md:
//   - COLOR: 8-bit-per-channel exact, #RGB -> #RRGGBB expansion
//   - DIMENSION: integer pt/dp, logical-px double (Flutter)
//   - TYPOGRAPHY: string pass-through
//   - NON-MAPPABLE (var()/calc()): verbatim, excluded from the identity set
//
// D-10: hermetic — node builtins + the emitters + the canonical fixture only.
// There is no simulator and no emulator in this suite: NO Xcode / Android /
// Flutter SDK, NO network, NO child_process. The emit/re-extract round-trip is
// the token-level lock; the agents/LLM are what produce real apps.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const facade = require('../../scripts/lib/design-tokens/index.cjs');
const {
  emitSwift,
  emitCompose,
  emitFlutter,
  reextractSwift,
  reextractCompose,
  reextractFlutter,
} = facade;

// ---------------------------------------------------------------------------
// Token maps under test.
// ---------------------------------------------------------------------------

// Canonical fixture is the AUDIT shape { tokens: [{token, category, ...}] } —
// an ARRAY of records, NOT the flat {name: value} map the emitters consume.
// Derive a flat map from the token NAMES (strip leading --) and assign
// representative values in-test (the fixture records names+categories, not
// resolved values). This keeps the committed fixture the shared Phase-23 seam.
const FIXTURE_PATH = path.join(
  __dirname,
  '..',
  'fixtures',
  'mapper-outputs',
  'tokens.json',
);
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

// A richer known-value map exercising every precision-contract branch.
const RICH = {
  tokens: {
    'color-primary': '#3B82F6', // 6-digit color
    'color-shorthand': '#3af', // #RGB -> #33aaff expansion
    'color-alpha': '#11223344', // 8-digit color (alpha preserved)
    'space-4': '16px', // integer dimension
    'radius-lg': '8px', // integer dimension
    'font-family-body': 'Inter, system-ui', // typography string
  },
};

// The non-mappable map — var()/calc() must pass through verbatim and be
// EXCLUDED from the round-trip identity set.
const NON_MAPPABLE = {
  tokens: {
    'color-ref': 'var(--brand)',
    'space-calc': 'calc(100% - 16px)',
  },
};

const EMITTERS = [
  { name: 'swift', emit: emitSwift, reextract: reextractSwift },
  { name: 'compose', emit: emitCompose, reextract: reextractCompose },
  { name: 'flutter', emit: emitFlutter, reextract: reextractFlutter },
];

// Round-trip identity is asserted within precision: colors recover to their
// EXPANDED #RRGGBB(AA) form. Build the expected canonical map per the contract.
function expectedIdentity(tokens) {
  /** @type {Record<string,string>} */
  const out = {};
  for (const [k, v] of Object.entries(tokens)) {
    if (/^#[0-9a-fA-F]{3}$/.test(v)) {
      // #RGB -> #RRGGBB (nibble duplication), lower-cased canonical
      out[k] = ('#' + v.slice(1).split('').map((c) => c + c).join('')).toLowerCase();
    } else if (/^#[0-9a-fA-F]{6}$/.test(v) || /^#[0-9a-fA-F]{8}$/.test(v)) {
      out[k] = v.toLowerCase();
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Determinism + non-empty.
// ---------------------------------------------------------------------------

test('34.1-01: emitSwift/emitCompose/emitFlutter produce non-empty deterministic source', () => {
  const map = deriveFixtureMap();
  for (const { name, emit } of EMITTERS) {
    const a = emit(map);
    const b = emit(map);
    assert.equal(typeof a, 'string', `${name} must return a string`);
    assert.ok(a.length > 20, `${name} output too small`);
    assert.equal(a, b, `${name} must be byte-deterministic (emit(x) === emit(x))`);
  }
});

// ---------------------------------------------------------------------------
// 2. Per-emitter round-trip identity within precision (color+dimension+type).
// ---------------------------------------------------------------------------

test('34.1-01: swift/compose/flutter round-trip preserves token identity within precision', () => {
  // Only the identity-set tokens (no non-mappable here).
  const idMap = {
    tokens: {
      'color-primary': '#3B82F6',
      'space-4': '16px',
      'font-family-body': 'Inter, system-ui',
    },
  };
  const expected = expectedIdentity(idMap.tokens);
  for (const { name, emit, reextract } of EMITTERS) {
    const recovered = reextract(emit(idMap));
    assert.ok(recovered && recovered.tokens, `${name} reextract must return {tokens}`);
    // Normalise recovered colors to lower-case for comparison stability.
    const norm = {};
    for (const [k, v] of Object.entries(recovered.tokens)) {
      norm[k] = /^#[0-9a-fA-F]+$/.test(v) ? v.toLowerCase() : v;
    }
    assert.deepEqual(norm, expected, `${name} round-trip identity mismatch`);
  }
});

// ---------------------------------------------------------------------------
// 3. Known color #3B82F6 — documented channel form + exact recovery.
// ---------------------------------------------------------------------------

test('34.1-01: color #3B82F6 maps to documented channels and back exactly', () => {
  const map = { tokens: { 'color-primary': '#3B82F6' } };
  // R=0x3B=59, G=0x82=130, B=0xF6=246, A opaque
  const swift = emitSwift(map);
  assert.match(swift, /Color\(red:\s*59\.0\/255\.0/, 'Swift must carry the 8-bit numerator form');
  assert.match(swift, /green:\s*130\.0\/255\.0/);
  assert.match(swift, /blue:\s*246\.0\/255\.0/);

  const compose = emitCompose(map);
  assert.match(compose, /Color\(0xFF3B82F6\)/i, 'Compose must carry 0xAARRGGBB');

  const flutter = emitFlutter(map);
  assert.match(flutter, /Color\(0xFF3B82F6\)/i, 'Flutter must carry 0xAARRGGBB');

  for (const { name, emit, reextract } of EMITTERS) {
    const recovered = reextract(emit(map)).tokens['color-primary'].toLowerCase();
    assert.equal(recovered, '#3b82f6', `${name} must recover #3B82F6 with no channel off-by-one`);
  }
});

// ---------------------------------------------------------------------------
// 4. Known dimension 16px — pt/dp/logical + recovery.
// ---------------------------------------------------------------------------

test('34.1-01: dimension 16px maps to pt/dp/logical and back', () => {
  const map = { tokens: { 'space-4': '16px' } };
  const swift = emitSwift(map);
  assert.match(swift, /:\s*CGFloat\s*=\s*16\b/, 'Swift dimension -> integer pt');
  const compose = emitCompose(map);
  assert.match(compose, /16\.dp\b/, 'Compose dimension -> N.dp');
  const flutter = emitFlutter(map);
  assert.match(flutter, /\b16\.0\b/, 'Flutter dimension -> logical-px double');

  for (const { name, emit, reextract } of EMITTERS) {
    const recovered = reextract(emit(map)).tokens['space-4'];
    assert.equal(recovered, '16px', `${name} must recover 16px`);
  }
});

// ---------------------------------------------------------------------------
// 5. Non-mappable values pass through verbatim and are excluded from identity.
// ---------------------------------------------------------------------------

test('34.1-01: non-mappable value passes through verbatim and is excluded from identity set', () => {
  for (const { name, emit, reextract } of EMITTERS) {
    const src = emit(NON_MAPPABLE);
    assert.ok(
      src.includes('var(--brand)'),
      `${name} must carry var(--brand) verbatim`,
    );
    assert.ok(
      src.includes('calc(100% - 16px)'),
      `${name} must carry calc(...) verbatim`,
    );
    // Excluded from identity: the re-extractor must NOT resurrect the
    // non-mappable values as typed tokens.
    const recovered = reextract(src).tokens;
    assert.equal(
      recovered['color-ref'],
      undefined,
      `${name} must exclude var() from the round-trip identity set`,
    );
    assert.equal(
      recovered['space-calc'],
      undefined,
      `${name} must exclude calc() from the round-trip identity set`,
    );
  }
});

// ---------------------------------------------------------------------------
// 6. Facade re-exports the three emitters (+ existing Phase-23 exports intact).
// ---------------------------------------------------------------------------

test('34.1-01: index.cjs re-exports emitSwift/emitCompose/emitFlutter (existing exports intact)', () => {
  for (const fn of ['emitSwift', 'emitCompose', 'emitFlutter']) {
    assert.equal(typeof facade[fn], 'function', `facade must export ${fn}`);
  }
  for (const fn of ['reextractSwift', 'reextractCompose', 'reextractFlutter']) {
    assert.equal(typeof facade[fn], 'function', `facade must export ${fn}`);
  }
  // No regression: the Phase-23 facade exports are still present.
  for (const fn of ['read', 'readAll', 'detectFormat', 'readCssVars', 'readJsConst', 'readTailwind', 'readFigma']) {
    assert.equal(typeof facade[fn], 'function', `Phase-23 export ${fn} must remain`);
  }
});

// ---------------------------------------------------------------------------
// 7. Richer map — every precision branch (shorthand expansion + alpha + radius).
// ---------------------------------------------------------------------------

test('34.1-01: richer map exercises #RGB expansion, alpha preservation, multi-dimension', () => {
  const expected = expectedIdentity(RICH.tokens);
  for (const { name, emit, reextract } of EMITTERS) {
    const recovered = reextract(emit(RICH));
    const norm = {};
    for (const [k, v] of Object.entries(recovered.tokens)) {
      norm[k] = /^#[0-9a-fA-F]+$/.test(v) ? v.toLowerCase() : v;
    }
    assert.deepEqual(norm, expected, `${name} richer-map round-trip mismatch`);
    // #RGB expanded
    assert.equal(norm['color-shorthand'], '#33aaff', `${name} must expand #3af -> #33aaff`);
    // 8-digit alpha preserved
    assert.equal(norm['color-alpha'], '#11223344', `${name} must preserve 8-digit alpha`);
  }
});

// ---------------------------------------------------------------------------
// 8. Input-shape tolerance + TypeError on missing tokens.
// ---------------------------------------------------------------------------

test('34.1-01: emitters accept {tokens, source, format} and bare {tokens}; throw on missing tokens', () => {
  const full = { tokens: { 'color-primary': '#3B82F6' }, source: '/x.css', format: 'css-vars' };
  const bare = { tokens: { 'color-primary': '#3B82F6' } };
  for (const { name, emit } of EMITTERS) {
    assert.equal(emit(full), emit(bare), `${name} must treat {tokens,...} and {tokens} identically`);
    assert.throws(() => emit({}), TypeError, `${name} must throw TypeError when no .tokens`);
    assert.throws(() => emit(null), TypeError, `${name} must throw TypeError on null`);
  }
});
