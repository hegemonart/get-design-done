// tests/gdd-state-prototyping.test.ts — <prototyping> block round-trip.
//
// Phase 25 Plan 25-01 acceptance:
//   * Parsing a STATE.md that carries a populated <prototyping> block
//     (sketch + spike + skipped children, plus an unknown-attribute case)
//     yields a `ParsedState.prototyping` whose nested arrays mirror the
//     source order exactly.
//   * Serializing back through `mutator.serialize` (with the parser's
//     fidelity hints) produces byte-identical output.
//   * Parsing a STATE.md that omits the block yields
//     `prototyping === null` and serialize omits the block (no empty
//     `<prototyping></prototyping>` pair).
//   * Mutating the typed structure (appending a sketch entry) re-emits
//     the block in canonical form while leaving sibling blocks verbatim.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse } from '../scripts/lib/gdd-state/parser.ts';
import { apply, serialize } from '../scripts/lib/gdd-state/mutator.ts';
import type {
  ParsedState,
  PrototypingBlock,
} from '../scripts/lib/gdd-state/types.ts';

// All blocks below carry at least one body line. The pre-existing serializer
// treats truly-empty blocks (`<x>\n</x>`) and comment-only blocks differently
// from non-empty blocks; using populated bodies keeps these tests focused on
// the new prototyping surface rather than re-litigating empty-block layout.
const WITH_PROTOTYPING: string = [
  '---',
  'pipeline_state_version: 1.0',
  'stage: design',
  'cycle: c1',
  'wave: 2',
  'started_at: 2026-04-20T10:00:00Z',
  'last_checkpoint: 2026-04-24T18:30:00Z',
  '---',
  '',
  '# Pipeline State — fixture-prototyping',
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
  'M-01: Hero CTA renders at accessible contrast | status: pending',
  '</must_haves>',
  '',
  '<prototyping>',
  '<sketch slug="home-hero" cycle="c1" decision="D-04" status="resolved"/>',
  '<spike slug="figma-import" cycle="c1" decision="D-05" verdict="yes" status="resolved"/>',
  '<spike slug="storybook-load" cycle="c1" decision="D-06" verdict="partial" status="resolved" note="works-in-dev"/>',
  '<skipped at="explore" cycle="c0" reason="trivial-mode"/>',
  '</prototyping>',
  '',
  '<connections>',
  'figma: available',
  '</connections>',
  '',
  '<blockers>',
  '[design] [2026-04-23]: Waiting on design-tokens.json from tokens team',
  '</blockers>',
  '',
  '<timestamps>',
  'started_at: 2026-04-20T10:00:00Z',
  'last_checkpoint: 2026-04-24T18:30:00Z',
  'brief_completed_at: 2026-04-20T14:00:00Z',
  'explore_completed_at: ~',
  'plan_completed_at: ~',
  'design_completed_at: ~',
  'verify_completed_at: ~',
  '</timestamps>',
  '',
].join('\n');

const WITHOUT_PROTOTYPING: string = [
  '---',
  'pipeline_state_version: 1.0',
  'stage: brief',
  'cycle: ""',
  'wave: 1',
  'started_at: 2026-04-20T10:00:00Z',
  'last_checkpoint: 2026-04-20T10:00:00Z',
  '---',
  '',
  '# Pipeline State — fixture-no-prototyping',
  '',
  '<position>',
  'stage: brief',
  'wave: 1',
  'task_progress: 0/0',
  'status: initialized',
  'handoff_source: ""',
  'handoff_path: ""',
  'skipped_stages: ""',
  '</position>',
  '',
  '<decisions>',
  'D-01: Placeholder decision (locked)',
  '</decisions>',
  '',
  '<must_haves>',
  'M-01: Placeholder must-have | status: pending',
  '</must_haves>',
  '',
  '<connections>',
  'figma: not_configured',
  '</connections>',
  '',
  '<blockers>',
  '[brief] [2026-04-20]: Placeholder blocker',
  '</blockers>',
  '',
  '<timestamps>',
  'started_at: 2026-04-20T10:00:00Z',
  'last_checkpoint: 2026-04-20T10:00:00Z',
  '</timestamps>',
  '',
].join('\n');

test('prototyping: parse exposes sketches, spikes, and skipped in source order', () => {
  const { state } = parse(WITH_PROTOTYPING);
  const proto: PrototypingBlock | null = state.prototyping;
  assert.ok(proto !== null, 'prototyping block must be parsed when present');
  assert.equal(proto.sketches.length, 1);
  assert.equal(proto.spikes.length, 2);
  assert.equal(proto.skipped.length, 1);

  assert.equal(proto.sketches[0]?.slug, 'home-hero');
  assert.equal(proto.sketches[0]?.cycle, 'c1');
  assert.equal(proto.sketches[0]?.decision, 'D-04');
  assert.equal(proto.sketches[0]?.status, 'resolved');

  assert.equal(proto.spikes[0]?.slug, 'figma-import');
  assert.equal(proto.spikes[0]?.verdict, 'yes');
  assert.equal(proto.spikes[1]?.slug, 'storybook-load');
  assert.equal(proto.spikes[1]?.verdict, 'partial');
  assert.deepEqual(proto.spikes[1]?.extra_attrs, { note: 'works-in-dev' });

  assert.equal(proto.skipped[0]?.at, 'explore');
  assert.equal(proto.skipped[0]?.cycle, 'c0');
  assert.equal(proto.skipped[0]?.reason, 'trivial-mode');
});

test('prototyping: round-trip is byte-identical for a populated block', () => {
  const parsed = parse(WITH_PROTOTYPING);
  const out = serialize(parsed.state, {
    raw_frontmatter: parsed.raw_frontmatter,
    raw_bodies: parsed.raw_bodies,
    block_gaps: parsed.block_gaps,
    line_ending: parsed.line_ending,
  });
  assert.equal(out, WITH_PROTOTYPING);
});

test('prototyping: absent block parses as null and serializer omits it', () => {
  const parsed = parse(WITHOUT_PROTOTYPING);
  assert.equal(parsed.state.prototyping, null);
  const out = serialize(parsed.state, {
    raw_frontmatter: parsed.raw_frontmatter,
    raw_bodies: parsed.raw_bodies,
    block_gaps: parsed.block_gaps,
    line_ending: parsed.line_ending,
  });
  assert.equal(out, WITHOUT_PROTOTYPING);
  assert.ok(
    !out.includes('<prototyping>'),
    'serialize must NOT emit a <prototyping> block when absent',
  );
});

test('prototyping: appending a sketch re-emits the block canonically', () => {
  const out = apply(WITH_PROTOTYPING, (s): ParsedState => {
    const proto = s.prototyping;
    if (proto === null) throw new Error('expected prototyping block');
    proto.sketches.push({
      slug: 'cta-row',
      cycle: 'c1',
      decision: 'D-07',
      status: 'resolved',
      extra_attrs: {},
    });
    return s;
  });
  // The new entry must be present.
  assert.ok(
    out.includes('<sketch slug="cta-row" cycle="c1" decision="D-07" status="resolved"/>'),
    'appended sketch must appear in canonical form',
  );
  // Sibling blocks must remain verbatim — pick a couple of distinctive lines.
  assert.ok(out.includes('D-01: Use Inter as primary display typeface (locked)'));
  assert.ok(out.includes('M-01: Hero CTA renders at accessible contrast | status: pending'));
  // Re-parse to confirm the round-trip is structurally sound.
  const reparsed = parse(out);
  assert.equal(reparsed.state.prototyping?.sketches.length, 2);
  assert.equal(reparsed.state.prototyping?.sketches[1]?.slug, 'cta-row');
});

test('prototyping: cycle-skip entries are preserved across round-trip', () => {
  const out = apply(WITH_PROTOTYPING, (s): ParsedState => {
    s.prototyping?.skipped.push({
      at: 'plan',
      cycle: 'c1',
      reason: 'user-deferred',
      extra_attrs: {},
    });
    return s;
  });
  const reparsed = parse(out);
  assert.equal(reparsed.state.prototyping?.skipped.length, 2);
  const last = reparsed.state.prototyping?.skipped[1];
  assert.equal(last?.at, 'plan');
  assert.equal(last?.cycle, 'c1');
  assert.equal(last?.reason, 'user-deferred');
});
