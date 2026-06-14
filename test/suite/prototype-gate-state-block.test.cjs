'use strict';

// tests/prototype-gate-state-block.test.cjs — Phase 25 Plan 25-09 surface test.
//
// Asserts the <prototyping> STATE.md block (landed in 25-01) round-trips
// through parse → serialize without byte loss, that the parser populates the
// nested arrays correctly, and that an absent block does NOT spuriously emit
// an empty <prototyping></prototyping> pair on serialize.
//
// This is the surface-level closeout test for the prototype-gate sub-feature.
// Deeper structural coverage (mutation-after-parse, multi-cycle round-trips,
// extra_attrs forwards-compat) lives in tests/hone-state-prototyping.test.ts;
// this file exercises the *minimum* contract Plan 25-09 acceptance asks for
// (one sketch + one spike + one skipped, byte-identical re-serialization, and
// the block-omission rule when nothing is set).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '../..');

// The parser/mutator are TS modules that Node 22 strips at runtime (the test
// runner uses --experimental-strip-types per package.json#scripts.test). The
// require() resolves the .ts file directly under that flag.
const { parse } = require(path.join(REPO_ROOT, 'sdk/state/parser.ts'));
const { apply, serialize } = require(path.join(REPO_ROOT, 'sdk/state/mutator.ts'));

// Minimal STATE.md fixture carrying one sketch, one spike, and one skipped
// entry. The trailing block layout (newlines around block tags) matches the
// canonical serializer output so round-trip is byte-identical.
const WITH_PROTOTYPING = [
  '---',
  'pipeline_state_version: 1.0',
  'stage: design',
  'cycle: c1',
  'wave: 2',
  'started_at: 2026-04-25T10:00:00Z',
  'last_checkpoint: 2026-04-25T18:00:00Z',
  '---',
  '',
  '# Pipeline State — fixture-25-09',
  '',
  '<position>',
  'stage: design',
  'wave: 2',
  'task_progress: 1/3',
  'status: in_progress',
  'handoff_source: ""',
  'handoff_path: ""',
  'skipped_stages: ""',
  '</position>',
  '',
  '<decisions>',
  'D-01: Use Inter as primary display typeface (locked)',
  '</decisions>',
  '',
  '<must_haves>',
  'M-01: Hero CTA renders at AA contrast | status: pending',
  '</must_haves>',
  '',
  '<prototyping>',
  '<sketch slug="home-hero" cycle="c1" decision="D-04" status="resolved"/>',
  '<spike slug="figma-import" cycle="c1" decision="D-05" verdict="yes" status="resolved"/>',
  '<skipped at="explore" cycle="c0" reason="trivial-mode"/>',
  '</prototyping>',
  '',
  '<connections>',
  'figma: available',
  '</connections>',
  '',
  '<blockers>',
  '',
  '</blockers>',
  '',
  '<timestamps>',
  'started_at: 2026-04-25T10:00:00Z',
  'last_checkpoint: 2026-04-25T18:00:00Z',
  '</timestamps>',
  '',
].join('\n');

// Same shape as WITH_PROTOTYPING but with the <prototyping> block removed.
// The serializer MUST NOT emit an empty <prototyping></prototyping> pair on
// round-trip; that's the omission-on-null contract documented on
// ParsedState.prototyping in sdk/state/types.ts.
const WITHOUT_PROTOTYPING = [
  '---',
  'pipeline_state_version: 1.0',
  'stage: design',
  'cycle: c1',
  'wave: 2',
  'started_at: 2026-04-25T10:00:00Z',
  'last_checkpoint: 2026-04-25T18:00:00Z',
  '---',
  '',
  '# Pipeline State — fixture-25-09',
  '',
  '<position>',
  'stage: design',
  'wave: 2',
  'task_progress: 1/3',
  'status: in_progress',
  'handoff_source: ""',
  'handoff_path: ""',
  'skipped_stages: ""',
  '</position>',
  '',
  '<decisions>',
  'D-01: Use Inter as primary display typeface (locked)',
  '</decisions>',
  '',
  '<must_haves>',
  'M-01: Hero CTA renders at AA contrast | status: pending',
  '</must_haves>',
  '',
  '<connections>',
  'figma: available',
  '</connections>',
  '',
  '<blockers>',
  '',
  '</blockers>',
  '',
  '<timestamps>',
  'started_at: 2026-04-25T10:00:00Z',
  'last_checkpoint: 2026-04-25T18:00:00Z',
  '</timestamps>',
  '',
].join('\n');

test('25-09 prototype-gate: <prototyping> block round-trips byte-identically', () => {
  // apply() = parse + identity-mutate + serialize-with-fidelity. This is the
  // canonical round-trip path consumed by callers in sdk/state.
  const out = apply(WITH_PROTOTYPING, (s) => s);
  assert.equal(out, WITH_PROTOTYPING, 'apply(state, identity) must match the input verbatim');
});

test('25-09 prototype-gate: parser populates state.prototyping.sketches[0].slug', () => {
  const { state } = parse(WITH_PROTOTYPING);
  assert.ok(state.prototyping, 'state.prototyping must be non-null when block is present');
  assert.equal(state.prototyping.sketches.length, 1, 'expected one <sketch/> entry');
  assert.equal(state.prototyping.sketches[0].slug, 'home-hero');
  assert.equal(state.prototyping.sketches[0].cycle, 'c1');
  assert.equal(state.prototyping.sketches[0].decision, 'D-04');
  assert.equal(state.prototyping.sketches[0].status, 'resolved');
});

test('25-09 prototype-gate: parser populates state.prototyping.spikes[0].verdict', () => {
  const { state } = parse(WITH_PROTOTYPING);
  assert.ok(state.prototyping);
  assert.equal(state.prototyping.spikes.length, 1);
  assert.equal(state.prototyping.spikes[0].slug, 'figma-import');
  assert.equal(state.prototyping.spikes[0].verdict, 'yes');
});

test('25-09 prototype-gate: parser populates state.prototyping.skipped[0].reason', () => {
  const { state } = parse(WITH_PROTOTYPING);
  assert.ok(state.prototyping);
  assert.equal(state.prototyping.skipped.length, 1);
  assert.equal(state.prototyping.skipped[0].at, 'explore');
  assert.equal(state.prototyping.skipped[0].reason, 'trivial-mode');
});

test('25-09 prototype-gate: STATE.md without block parses to prototyping === null', () => {
  const { state } = parse(WITHOUT_PROTOTYPING);
  assert.equal(state.prototyping, null, 'absent block must yield null on ParsedState.prototyping');
});

test('25-09 prototype-gate: serialize omits the block when prototyping is null', () => {
  const out = apply(WITHOUT_PROTOTYPING, (s) => s);
  assert.ok(
    !/<prototyping>\s*<\/prototyping>/.test(out),
    'serializer must NOT emit an empty <prototyping></prototyping> pair when the field is null',
  );
  assert.equal(out, WITHOUT_PROTOTYPING, 'round-trip without block must be byte-identical');
});
