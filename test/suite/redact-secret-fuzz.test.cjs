// test/suite/redact-secret-fuzz.test.cjs — Phase 33.5 Plan 05 (SEC-05, D-07/D-10/D-12)
//
// Synthetic-secret fuzz over the redact scrubber. Feeds clearly-fake secrets of
// EVERY provider format (the 3 new — gemini / github_pat_fine_grained /
// github_token — plus the 8 existing) through redact() and asserts zero leak +
// the correct [REDACTED:<type>] label.
//
// Hermetic (D-10): the only inputs are scripts/lib/redact.cjs + the synthetic
// corpus fixture. NO network. The corpus contains NO real secrets (all FAKE /
// 0-padded) and lives under test/fixtures/baselines/ (gitleaks-allowlisted by
// path) — this test file itself holds no secret strings, only the loaded corpus.
//
// No new runtime dependency (D-12): node:test + node:assert + node:fs only.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { redact, PATTERNS } = require('../../scripts/lib/redact.cjs');

const CORPUS_PATH = path.join(
  __dirname,
  '..',
  'fixtures',
  'baselines',
  'phase-33-5',
  'secret-fuzz-corpus.json',
);

const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));

// The provider types the corpus must cover: the 3 new (D-07) + the 8 existing.
const EXPECTED_TYPES = [
  'gemini',
  'github_pat_fine_grained',
  'github_token',
  'anthropic',
  'stripe',
  'slack',
  'github_pat',
  'aws',
  'jwt',
  'pem',
  'sk',
];

// The 3 formats this plan adds (D-07).
const NEW_TYPES = ['gemini', 'github_pat_fine_grained', 'github_token'];

/** Every {type, label, sample, token} tuple in the corpus, flattened. */
function* eachSample() {
  for (const type of EXPECTED_TYPES) {
    const entry = corpus[type];
    for (const s of entry.samples) {
      yield { type, label: entry.label, sample: s.sample, token: s.token };
    }
  }
}

test('33.5-05: corpus is well-formed (11 provider types, labels + samples + tokens)', () => {
  for (const type of EXPECTED_TYPES) {
    const entry = corpus[type];
    assert.ok(entry, `corpus missing provider type: ${type}`);
    assert.match(entry.label, /^\[REDACTED:.+\]$/, `bad label for ${type}: ${entry.label}`);
    assert.ok(Array.isArray(entry.samples) && entry.samples.length > 0, `no samples for ${type}`);
    for (const s of entry.samples) {
      assert.equal(typeof s.sample, 'string', `non-string sample for ${type}`);
      assert.equal(typeof s.token, 'string', `non-string token for ${type}`);
      // Clears redact()'s `length < 10` short-circuit so the real match path runs.
      assert.ok(s.sample.length >= 10, `sample too short (<10) for ${type}: ${s.sample}`);
      // The bare token must actually appear in its surrounding sample text.
      assert.ok(s.sample.includes(s.token), `token not present in sample for ${type}`);
    }
  }
});

test('33.5-05: each provider sample is fully redacted (zero leak)', () => {
  for (const { type, sample, token } of eachSample()) {
    const out = redact(sample);
    assert.ok(
      !out.includes(token),
      `LEAK: ${type} token survived redaction.\n  in:  ${sample}\n  out: ${out}`,
    );
  }
});

test('33.5-05: each provider gets the correct [REDACTED:<type>] label', () => {
  for (const { type, label, sample } of eachSample()) {
    const out = redact(sample);
    assert.ok(
      out.includes(label),
      `expected label ${label} for ${type}, got: ${out}`,
    );
  }
});

test('33.5-05: the 3 NEW formats are covered and fire', () => {
  for (const type of NEW_TYPES) {
    const entry = corpus[type];
    assert.ok(entry, `corpus missing new format: ${type}`);
    // PATTERNS now carries this type (proves the regex was added).
    assert.ok(
      PATTERNS.some((p) => p.type === type),
      `redact PATTERNS missing new type: ${type}`,
    );
    // And it actually redacts a sample of that format.
    for (const s of entry.samples) {
      const out = redact(s.sample);
      assert.ok(!out.includes(s.token), `new format ${type} leaked: ${out}`);
      assert.ok(out.includes(entry.label), `new format ${type} mislabeled: ${out}`);
    }
  }
});

test('33.5-05: whole-corpus blob leaks nothing', () => {
  const tokens = [];
  const parts = [];
  for (const { sample, token } of eachSample()) {
    parts.push(sample);
    tokens.push(token);
  }
  const blob = parts.join('\n');
  const out = redact(blob);
  for (const token of tokens) {
    assert.ok(!out.includes(token), `LEAK across corpus blob: token survived\n  ${token}`);
  }
});

test('33.5-05: PATTERNS grew to 11 (8 existing + 3 new)', () => {
  assert.equal(PATTERNS.length, 11, `expected 11 patterns, got ${PATTERNS.length}`);
});
