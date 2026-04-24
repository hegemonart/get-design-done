// tests/gdd-state-mutator.test.ts — mutator + serializer coverage.
//
// Plan 20-01 acceptance:
//   * Adding a decision appends to the <decisions> block without touching
//     anything else.
//   * Updating position.task_progress preserves all other blocks verbatim.
//   * Removing a decision removes only that line.
//   * Canonical emission when a block was mutated; raw verbatim when not.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { apply, serialize } from '../scripts/lib/gdd-state/mutator.ts';
import { parse } from '../scripts/lib/gdd-state/parser.ts';
import type { MustHave, ParsedState } from '../scripts/lib/gdd-state/types.ts';
import { REPO_ROOT } from './helpers.ts';

const FIXTURES: string = join(REPO_ROOT, 'tests', 'fixtures', 'state');

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

test('mutator.apply: identity fn returns byte-identical input', () => {
  const raw = readFixture('mid-pipeline.md');
  const out = apply(raw, (s) => s);
  assert.equal(out, raw);
});

test('mutator.apply: adding a decision appends to <decisions> block', () => {
  const raw = readFixture('mid-pipeline.md');
  const out = apply(raw, (s): ParsedState => {
    s.decisions.push({
      id: 'D-99',
      text: 'Added-by-test decision',
      status: 'locked',
    });
    return s;
  });

  // D-99 appears exactly once.
  const matches = out.match(/D-99:/g) ?? [];
  assert.equal(matches.length, 1, 'D-99 must appear exactly once');

  // Appears after D-03 (last pre-existing decision).
  const d03 = out.indexOf('D-03:');
  const d99 = out.indexOf('D-99:');
  assert.ok(d03 > 0 && d99 > d03, 'D-99 must appear after D-03');

  // <decisions> block still present and balanced.
  const openCount = (out.match(/<decisions>/g) ?? []).length;
  const closeCount = (out.match(/<\/decisions>/g) ?? []).length;
  assert.equal(openCount, 1);
  assert.equal(closeCount, 1);

  // Other blocks untouched — compare fragments.
  assert.ok(out.includes('M-01: Hero CTA renders'), 'must_haves untouched');
  assert.ok(out.includes('M-03: Form validation errors'), 'must_haves untouched');
  assert.ok(out.includes('figma: available'), 'connections untouched');
  assert.ok(
    out.includes('[design] [2026-04-23]: Waiting on design-tokens.json'),
    'blockers untouched',
  );
});

test('mutator.apply: updating position.task_progress preserves other blocks verbatim', () => {
  const raw = readFixture('mid-pipeline.md');
  const out = apply(raw, (s): ParsedState => {
    s.position.task_progress = '5/7';
    return s;
  });

  // The only delta should be within the <position> block. Extract each
  // file's pre-/post-position region and compare.
  const positionBlock = /<position>[\s\S]*?<\/position>/;
  const rawPos = raw.match(positionBlock)?.[0];
  const outPos = out.match(positionBlock)?.[0];
  assert.ok(rawPos && outPos);
  assert.notEqual(rawPos, outPos, 'position block differs');
  assert.ok(outPos!.includes('task_progress: 5/7'));

  // Compare rest-of-file (stripping the position blocks):
  const rawRest = raw.replace(positionBlock, '');
  const outRest = out.replace(positionBlock, '');
  assert.equal(outRest, rawRest, 'non-position content unchanged');
});

test('mutator.apply: removing a decision strips only that line', () => {
  const raw = readFixture('mid-pipeline.md');
  const out = apply(raw, (s): ParsedState => {
    s.decisions = s.decisions.filter((d) => d.id !== 'D-02');
    return s;
  });

  assert.ok(!out.includes('D-02:'), 'D-02 must be removed');
  assert.ok(out.includes('D-01:'), 'D-01 preserved');
  assert.ok(out.includes('D-03:'), 'D-03 preserved');
});

test('mutator.apply: mutating one block re-emits canonical form for that block only', () => {
  const raw = readFixture('mid-pipeline.md');
  const out = apply(raw, (s): ParsedState => {
    // Flip the first must-have to pass. The <must_haves> block was
    // canonical already (no comments), so semantic-equal check passes
    // only when the array matches byte-for-byte. Changing one status
    // forces canonical re-emit for must_haves; other blocks keep raw.
    if (s.must_haves[0] !== undefined) s.must_haves[0].status = 'fail';
    return s;
  });
  assert.match(out, /M-01: Hero CTA renders at accessible contrast ratio >= 4\.5:1 \| status: fail/);
  assert.ok(out.includes('figma: available'), 'connections block intact');
  assert.ok(out.includes('pending: 4'), 'todos block intact');
});

test('mutator.apply: frontmatter field mutation emitted in canonical order', () => {
  const raw = readFixture('mid-pipeline.md');
  const out = apply(raw, (s): ParsedState => {
    s.frontmatter.last_checkpoint = '2026-04-24T19:45:00Z';
    return s;
  });
  // last_checkpoint updated and still in fixed-order position.
  const fmMatch = out.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(fmMatch);
  const fmText = fmMatch![1]!;
  assert.match(fmText, /last_checkpoint: 2026-04-24T19:45:00Z/);
  // Extra key (model_profile) preserved.
  assert.match(fmText, /model_profile: balanced/);
});

test('mutator.serialize: empty raw_bodies emits canonical form', () => {
  const raw = readFixture('mid-pipeline.md');
  const { state } = parse(raw);
  const out = serialize(state); // no raw_bodies, no line_ending
  // Canonical doesn't preserve comments; round-trip parse should still work.
  const { state: reparsed } = parse(out);
  assert.deepEqual(reparsed.decisions, state.decisions);
  assert.deepEqual(reparsed.must_haves, state.must_haves);
  assert.deepEqual(reparsed.blockers, state.blockers);
  assert.deepEqual(reparsed.timestamps, state.timestamps);
  assert.equal(reparsed.position.task_progress, state.position.task_progress);
  assert.equal(reparsed.frontmatter.stage, state.frontmatter.stage);
});

test('mutator.apply: adding a blocker appends to the block in order', () => {
  const raw = readFixture('mid-pipeline.md');
  const out = apply(raw, (s): ParsedState => {
    s.blockers.push({
      stage: 'design',
      date: '2026-04-25',
      text: 'New blocker for this run',
    });
    return s;
  });
  assert.match(out, /\[design\] \[2026-04-25\]: New blocker for this run/);
  // Count blockers — should now be 3.
  const { state } = parse(out);
  assert.equal(state.blockers.length, 3);
});

// Plan 20-11 — the `verify` skill relies on `add_must_have` with an
// existing id being an update-in-place operation, not a duplicate
// append. The skill documents this as the canonical way to flip a
// must_have from `pending` to `pass`/`fail` without introducing a new
// `update_must_have_status` tool. This test is the contract check for
// that idiom at the mutator layer: given a state with M-01, M-02, if
// a consumer `fn` finds M-01 by id and overwrites its text/status, the
// serialized output MUST have M-01 updated in place (same position)
// and M-02 untouched, with the `<must_haves>` block retaining exactly
// two lines.
test('mutator.apply: add_must_have with existing id updates in-place', () => {
  const raw = readFixture('mid-pipeline.md');
  // Pre-conditions: fixture must have at least M-01 and M-02 so we can
  // assert that updating M-01 doesn't disturb M-02's position or count.
  const { state: before } = parse(raw);
  const beforeM01 = before.must_haves.find((m) => m.id === 'M-01');
  const beforeM02 = before.must_haves.find((m) => m.id === 'M-02');
  assert.ok(beforeM01, 'fixture must contain M-01');
  assert.ok(beforeM02, 'fixture must contain M-02');
  const beforeCount = before.must_haves.length;
  const beforeM01Index = before.must_haves.findIndex((m) => m.id === 'M-01');

  // Consumer fn simulates what `mcp__gdd_state__add_must_have` should
  // do when an id matches an existing entry — find-or-push.
  const out = apply(raw, (s): ParsedState => {
    const incoming: MustHave = {
      id: 'M-01',
      text: 'Updated M-01 text (in-place)',
      status: 'pass',
    };
    const existingIdx = s.must_haves.findIndex((m) => m.id === incoming.id);
    if (existingIdx >= 0) {
      s.must_haves[existingIdx] = incoming;
    } else {
      s.must_haves.push(incoming);
    }
    return s;
  });

  const { state: after } = parse(out);

  // Count unchanged — update-in-place, not append.
  assert.equal(
    after.must_haves.length,
    beforeCount,
    'must_haves count must be unchanged (update-in-place)',
  );

  // M-01 appears exactly once in the serialized output.
  const m01Matches = out.match(/^M-01:/gm) ?? [];
  assert.equal(m01Matches.length, 1, 'M-01 must appear exactly once');

  // M-01 text + status updated.
  const updatedM01 = after.must_haves.find((m) => m.id === 'M-01');
  assert.ok(updatedM01, 'M-01 still present');
  assert.equal(updatedM01!.text, 'Updated M-01 text (in-place)');
  assert.equal(updatedM01!.status, 'pass');

  // M-01 position preserved.
  const afterM01Index = after.must_haves.findIndex((m) => m.id === 'M-01');
  assert.equal(
    afterM01Index,
    beforeM01Index,
    'M-01 position in the array must be preserved',
  );

  // M-02 untouched (text and status identical to pre-mutation).
  const afterM02 = after.must_haves.find((m) => m.id === 'M-02');
  assert.ok(afterM02, 'M-02 still present');
  assert.equal(afterM02!.text, beforeM02.text);
  assert.equal(afterM02!.status, beforeM02.status);
  assert.ok(
    out.includes(`M-02: ${beforeM02.text} | status: ${beforeM02.status}`),
    'M-02 line emitted verbatim in canonical form',
  );

  // <must_haves> block balanced and line count unchanged.
  const blockMatch = out.match(/<must_haves>\n([\s\S]*?)<\/must_haves>/);
  assert.ok(blockMatch, '<must_haves> block still present');
  const bodyLines = blockMatch![1]!
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith('<!--'));
  assert.equal(
    bodyLines.length,
    beforeCount,
    '<must_haves> body has same number of non-empty lines as before',
  );
});
