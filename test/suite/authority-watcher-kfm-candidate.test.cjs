'use strict';
/**
 * tests/authority-watcher-kfm-candidate.test.cjs — Plan 30.5-03 Task 2.
 *
 * 5 cases per Task 2 <behavior>:
 *   1. Schema validates a well-formed kfm-candidate event with all 7 fields → passes.
 *   2. Schema rejects a kfm-candidate event missing `article_url` → fails.
 *   3. Authority-watcher with whitelist-matched article title → emits 1 kfm-candidate event
 *      with suggested_symptom + raw_excerpt ≤ 500 chars.
 *   4. Authority-watcher with non-whitelisted article title → emits 0 events.
 *   5. Reflector consumes a kfm-candidate event into the SAME incubator draft surface
 *      as the Task 1 capability_gap input.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const watcher = require('../../scripts/lib/authority-watcher/index.cjs');
const proposer = require('../../scripts/lib/reflector-kfm-proposer.cjs');

// -------------------------------------------------------------------
// Lightweight schema validator (kfm-candidate sub-shape only).
//
// We avoid pulling ajv into this test (matches the rest of the suite's
// hand-rolled JSON Schema parity checks). The validator below mirrors
// the kfm-candidate allOf branch we add to events.schema.json — keeping
// this self-contained ensures the test exercises the same shape contract
// the schema enforces at write time.
// -------------------------------------------------------------------

function validateKfmCandidatePayload(payload) {
  const required = [
    'event_id',
    'source',
    'article_url',
    'article_title',
    'suggested_symptom',
    'suggested_pattern_hint',
    'raw_excerpt',
  ];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'payload must be object' };
  }
  for (const k of required) {
    if (!(k in payload)) {
      return { valid: false, error: `missing field: ${k}` };
    }
  }
  if (payload.source !== 'authority_watcher') {
    return { valid: false, error: `source must be 'authority_watcher'` };
  }
  if (typeof payload.raw_excerpt === 'string' && payload.raw_excerpt.length > 500) {
    return { valid: false, error: 'raw_excerpt > 500 chars' };
  }
  return { valid: true };
}

// -------------------------------------------------------------------
// Schema-file sanity — events.schema.json should declare the
// kfm-candidate branch additively (Task 2 step 1).
// -------------------------------------------------------------------

test('30.5-03 Task 2 / Test 1: schema declares kfm-candidate discriminator branch', () => {
  const schemaPath = path.join(__dirname, '../..', 'reference', 'schemas', 'events.schema.json');
  const text = fs.readFileSync(schemaPath, 'utf8');
  assert.match(text, /kfm-candidate/, 'events.schema.json must mention kfm-candidate');
  const schema = JSON.parse(text);
  // The new branch lives in allOf[1] (additive after the Phase 29 capability_gap branch).
  const branches = Array.isArray(schema.allOf) ? schema.allOf : [];
  const found = branches.some((b) =>
    b && b.if && b.if.properties && b.if.properties.type && b.if.properties.type.const === 'kfm-candidate'
  );
  assert.ok(found, 'kfm-candidate allOf branch must exist');
  // KfmCandidatePayload definition must exist with 7 required fields.
  const def = schema.definitions && schema.definitions.KfmCandidatePayload;
  assert.ok(def, 'KfmCandidatePayload definition must be present');
  const required = Array.isArray(def.required) ? def.required.slice().sort() : [];
  const expected = [
    'article_title', 'article_url', 'event_id', 'raw_excerpt',
    'source', 'suggested_pattern_hint', 'suggested_symptom',
  ];
  assert.deepEqual(required, expected, 'KfmCandidatePayload required list must match');
});

// -------------------------------------------------------------------
// Test 2 — well-formed event passes, missing article_url fails.
// -------------------------------------------------------------------

test('30.5-03 Task 2 / Test 2: schema validates well-formed event, rejects missing fields', () => {
  const good = {
    event_id: 'e1-abc',
    source: 'authority_watcher',
    article_url: 'https://example.dev/troubleshooting',
    article_title: 'Common Errors',
    suggested_symptom: 'webpack ENOENT for missing chunk',
    suggested_pattern_hint: 'ENOENT.*chunk',
    raw_excerpt: 'Excerpt body, shorter than 500 chars.',
  };
  assert.equal(validateKfmCandidatePayload(good).valid, true);

  const badMissingUrl = { ...good };
  delete badMissingUrl.article_url;
  const res = validateKfmCandidatePayload(badMissingUrl);
  assert.equal(res.valid, false);
  assert.match(res.error, /article_url/);
});

// -------------------------------------------------------------------
// Test 3 — whitelist match → emits one kfm-candidate event.
// -------------------------------------------------------------------

test('30.5-03 Task 2 / Test 3: whitelist-matched article emits exactly one event', () => {
  const longBody = 'x'.repeat(2000); // ensure excerpt truncation kicks in
  const article = {
    id: 'art-001',
    title: 'Common Errors in Webpack 5',
    url: 'https://example.dev/webpack-common-errors',
    summary: 'When migrating to webpack 5 you may see chunk hash collisions. ' + longBody,
    feed_id: 'webpack-blog',
  };
  const events = watcher.classifyArticles([article]);
  const kfm = events.filter((e) => e.event_type === 'kfm-candidate' || (e.payload && e.payload.source === 'authority_watcher'));
  assert.equal(kfm.length, 1, 'expected exactly 1 kfm-candidate event');
  const e = kfm[0];
  const payload = e.payload || e;
  const v = validateKfmCandidatePayload(payload);
  assert.equal(v.valid, true, `payload validate failed: ${v.error}`);
  assert.ok(payload.raw_excerpt.length <= 500, `raw_excerpt must be <=500 chars, got ${payload.raw_excerpt.length}`);
  assert.match(payload.suggested_symptom, /webpack|chunk|errors/i, 'symptom derived from article');
});

// -------------------------------------------------------------------
// Test 4 — non-whitelisted title → zero events.
// -------------------------------------------------------------------

test('30.5-03 Task 2 / Test 4: non-whitelisted article emits zero events', () => {
  const article = {
    id: 'art-002',
    title: 'Component API Reference',
    url: 'https://example.dev/component-api',
    summary: 'Stable API docs for the Button component.',
    feed_id: 'radix-ui-releases',
  };
  const events = watcher.classifyArticles([article]);
  const kfm = events.filter((e) => e.event_type === 'kfm-candidate' || (e.payload && e.payload.source === 'authority_watcher'));
  assert.equal(kfm.length, 0);
});

// -------------------------------------------------------------------
// Test 5 — reflector consumes kfm-candidate into the same incubator surface.
// -------------------------------------------------------------------

test('30.5-03 Task 2 / Test 5: reflector accepts kfm-candidate as alternate input', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kfm-task2-test-'));
  fs.mkdirSync(path.join(root, 'reference'), { recursive: true });
  fs.mkdirSync(path.join(root, '.design', 'reflections', 'incubator'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'reference', 'known-failure-modes.md'),
    '# Known Failure Modes\n\n## Entries\n\n'
  );
  fs.writeFileSync(
    path.join(root, 'reference', 'registry.json'),
    JSON.stringify({ version: 1, entries: [] }, null, 2)
  );

  const candidate = {
    event_type: 'kfm-candidate',
    event_id: 'evt-99',
    source: 'authority_watcher',
    article_url: 'https://example.dev/troubleshooting',
    article_title: 'Troubleshooting Webpack 5',
    suggested_symptom: 'webpack chunk hash collision on migration',
    suggested_pattern_hint: 'chunk hash.*collision',
    raw_excerpt: 'Migrating to webpack 5 surfaces chunk-hash collisions when two emitted chunks resolve to the same module-graph signature.',
  };

  const result = proposer.proposeKfmDraft(candidate, { repoRoot: root });
  assert.equal(result.action, 'drafted', `expected drafted, got ${result.action}`);
  assert.ok(fs.existsSync(result.path), 'draft path must exist');
  const body = fs.readFileSync(result.path, 'utf8');
  assert.match(body, /authority_watcher/);
  assert.match(body, /Troubleshooting Webpack 5/);
  // Same draft surface as Task 1 (`.design/reflections/incubator/kfm-<slug>/CATALOGUE-ENTRY.md`).
  assert.match(result.path, /[/\\]incubator[/\\]kfm-/);
  assert.match(result.path, /CATALOGUE-ENTRY\.md$/);
});
