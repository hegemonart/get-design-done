// tests/gdd-state-quality-gate.test.ts — <quality_gate> block round-trip.
//
// Phase 25 Plan 25-03 acceptance:
//   * Parsing a STATE.md that carries a populated <quality_gate> block
//     yields a `ParsedState.quality_gate` whose `run` mirrors the source
//     `<run/>` attributes byte-for-byte (including `extra_attrs`).
//   * Serializing back through `mutator.serialize` (with the parser's
//     fidelity hints) produces byte-identical output.
//   * Parsing a STATE.md that omits the block yields
//     `quality_gate === null` and serialize omits the block (no empty
//     `<quality_gate></quality_gate>` pair).
//   * Mutating the typed structure (overwriting the run with a new
//     status) re-emits the block in canonical form while leaving sibling
//     blocks verbatim.
//   * Status transitions across the four-status enum (`pass | fail |
//     timeout | skipped`) round-trip without surprises.
//
// Mirrors `tests/gdd-state-prototyping.test.ts` — the sister test landed
// alongside the <prototyping> block in Plan 25-01. Pattern parity is
// intentional; the gdd-state surface treats both blocks the same way.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse } from '../scripts/lib/gdd-state/parser.ts';
import { apply, serialize } from '../scripts/lib/gdd-state/mutator.ts';
import type {
  ParsedState,
  QualityGateBlock,
} from '../scripts/lib/gdd-state/types.ts';

// All blocks below carry at least one body line — same rationale as the
// prototyping test: empty/comment-only block layout is litigated elsewhere,
// here we focus exclusively on the <quality_gate> surface.
const WITH_QUALITY_GATE: string = [
  '---',
  'pipeline_state_version: 1.0',
  'stage: design',
  'cycle: c1',
  'wave: 2',
  'started_at: 2026-04-20T10:00:00Z',
  'last_checkpoint: 2026-04-29T10:01:42Z',
  '---',
  '',
  '# Pipeline State — fixture-quality-gate',
  '',
  '<position>',
  'stage: design',
  'wave: 2',
  'task_progress: 3/3',
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
  '</prototyping>',
  '',
  '<quality_gate>',
  '<run started_at="2026-04-29T10:00:00Z" completed_at="2026-04-29T10:01:42Z" status="pass" iteration="1" commands_run="lint,typecheck,test" build_id="b-42"/>',
  '</quality_gate>',
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
  'last_checkpoint: 2026-04-29T10:01:42Z',
  'brief_completed_at: 2026-04-20T14:00:00Z',
  'explore_completed_at: ~',
  'plan_completed_at: ~',
  'design_completed_at: ~',
  'verify_completed_at: ~',
  '</timestamps>',
  '',
].join('\n');

const WITHOUT_QUALITY_GATE: string = [
  '---',
  'pipeline_state_version: 1.0',
  'stage: brief',
  'cycle: ""',
  'wave: 1',
  'started_at: 2026-04-20T10:00:00Z',
  'last_checkpoint: 2026-04-20T10:00:00Z',
  '---',
  '',
  '# Pipeline State — fixture-no-quality-gate',
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

test('quality_gate: parse exposes run with all required attrs and extras', () => {
  const { state } = parse(WITH_QUALITY_GATE);
  const qg: QualityGateBlock | null = state.quality_gate;
  assert.ok(qg !== null, 'quality_gate block must be parsed when present');
  assert.ok(qg.run !== null, 'run must be parsed when the body has a <run/>');
  assert.equal(qg.run?.started_at, '2026-04-29T10:00:00Z');
  assert.equal(qg.run?.completed_at, '2026-04-29T10:01:42Z');
  assert.equal(qg.run?.status, 'pass');
  assert.equal(qg.run?.iteration, 1);
  assert.equal(qg.run?.commands_run, 'lint,typecheck,test');
  assert.deepEqual(qg.run?.extra_attrs, { build_id: 'b-42' });
});

test('quality_gate: round-trip is byte-identical for a populated block', () => {
  const parsed = parse(WITH_QUALITY_GATE);
  const out = serialize(parsed.state, {
    raw_frontmatter: parsed.raw_frontmatter,
    raw_bodies: parsed.raw_bodies,
    block_gaps: parsed.block_gaps,
    line_ending: parsed.line_ending,
  });
  assert.equal(out, WITH_QUALITY_GATE);
});

test('quality_gate: absent block parses as null and serializer omits it', () => {
  const parsed = parse(WITHOUT_QUALITY_GATE);
  assert.equal(parsed.state.quality_gate, null);
  const out = serialize(parsed.state, {
    raw_frontmatter: parsed.raw_frontmatter,
    raw_bodies: parsed.raw_bodies,
    block_gaps: parsed.block_gaps,
    line_ending: parsed.line_ending,
  });
  assert.equal(out, WITHOUT_QUALITY_GATE);
  assert.ok(
    !out.includes('<quality_gate>'),
    'serialize must NOT emit a <quality_gate> block when absent',
  );
});

test('quality_gate: appending the block to a STATE.md without it materializes canonically', () => {
  const out = apply(WITHOUT_QUALITY_GATE, (s): ParsedState => {
    s.quality_gate = {
      run: {
        started_at: '2026-04-29T11:00:00Z',
        completed_at: '2026-04-29T11:00:30Z',
        status: 'skipped',
        iteration: 0,
        commands_run: '',
        extra_attrs: {},
      },
    };
    return s;
  });
  // The new entry must be present in canonical form.
  assert.ok(
    out.includes(
      '<run started_at="2026-04-29T11:00:00Z" completed_at="2026-04-29T11:00:30Z" status="skipped" iteration="0" commands_run=""/>',
    ),
    'newly-added quality_gate run must appear in canonical form',
  );
  // Sibling blocks must remain verbatim.
  assert.ok(out.includes('D-01: Placeholder decision (locked)'));
  assert.ok(out.includes('M-01: Placeholder must-have | status: pending'));
  // Re-parse to confirm the round-trip is structurally sound.
  const reparsed = parse(out);
  assert.equal(reparsed.state.quality_gate?.run?.status, 'skipped');
  assert.equal(reparsed.state.quality_gate?.run?.iteration, 0);
});

test('quality_gate: status transitions round-trip across the four-status enum', () => {
  // Each status flips the run in place; the rest of the block stays.
  for (const status of ['pass', 'fail', 'timeout', 'skipped'] as const) {
    const out = apply(WITH_QUALITY_GATE, (s): ParsedState => {
      const qg = s.quality_gate;
      if (qg === null || qg.run === null) {
        throw new Error('expected a quality_gate run in fixture');
      }
      qg.run.status = status;
      qg.run.iteration = status === 'fail' ? 3 : qg.run.iteration;
      return s;
    });
    const reparsed = parse(out);
    assert.equal(reparsed.state.quality_gate?.run?.status, status);
    if (status === 'fail') {
      assert.equal(reparsed.state.quality_gate?.run?.iteration, 3);
    }
    // Sibling-block sanity check — prototyping should still survive.
    assert.equal(
      reparsed.state.prototyping?.sketches[0]?.slug,
      'home-hero',
      `sibling <prototyping> must survive a status=${status} mutation`,
    );
  }
});
