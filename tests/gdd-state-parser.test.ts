// tests/gdd-state-parser.test.ts — parser coverage.
//
// Plan 20-01 acceptance: parsing a fresh .design/STATE.md round-trips
// byte-identical through parse → serialize → parse for both the
// template-shaped fixture and a mid-pipeline fixture. Malformed input
// throws ParseError with a line number.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from '../scripts/lib/gdd-state/parser.ts';
import { serialize } from '../scripts/lib/gdd-state/mutator.ts';
import { ParseError } from '../scripts/lib/gdd-state/types.ts';
import { REPO_ROOT } from './helpers.ts';

const FIXTURES: string = join(REPO_ROOT, 'tests', 'fixtures', 'state');

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

test('parse: fresh template fixture round-trips byte-identical', () => {
  const raw = readFixture('fresh.md');
  const { state, raw_bodies, raw_frontmatter, block_gaps, line_ending } =
    parse(raw);
  const out = serialize(state, {
    raw_frontmatter,
    raw_bodies,
    block_gaps,
    line_ending,
  });
  assert.equal(out, raw, 'serialize(parse(raw)) must equal raw');
});

test('parse: mid-pipeline fixture round-trips byte-identical', () => {
  const raw = readFixture('mid-pipeline.md');
  const { state, raw_bodies, raw_frontmatter, block_gaps, line_ending } =
    parse(raw);
  const out = serialize(state, {
    raw_frontmatter,
    raw_bodies,
    block_gaps,
    line_ending,
  });
  assert.equal(out, raw, 'serialize(parse(raw)) must equal raw');
});

test('parse: fresh fixture yields empty decisions and must_haves arrays', () => {
  const { state } = parse(readFixture('fresh.md'));
  assert.deepEqual(state.decisions, []);
  assert.deepEqual(state.must_haves, []);
  assert.equal(state.blockers.length, 0);
  assert.equal(state.position.stage, 'brief');
  assert.equal(state.position.status, 'initialized');
});

test('parse: mid-pipeline fixture exposes decisions, must_haves, blockers', () => {
  const { state } = parse(readFixture('mid-pipeline.md'));
  assert.equal(state.decisions.length, 3);
  assert.equal(state.decisions[0]?.id, 'D-01');
  assert.equal(state.decisions[0]?.status, 'locked');
  assert.equal(state.decisions[2]?.status, 'tentative');

  assert.equal(state.must_haves.length, 3);
  assert.equal(state.must_haves[0]?.status, 'pass');
  assert.equal(state.must_haves[2]?.status, 'fail');

  assert.equal(state.blockers.length, 2);
  assert.equal(state.blockers[0]?.stage, 'design');
  assert.equal(state.blockers[0]?.date, '2026-04-23');

  assert.equal(state.connections['figma'], 'available');
  assert.equal(state.connections['storybook'], 'unavailable');

  assert.equal(state.position.task_progress, '3/7');
  assert.equal(state.position.status, 'in_progress');
  assert.equal(state.position.wave, 2);

  assert.equal(state.frontmatter.stage, 'design');
  assert.equal(state.frontmatter.wave, 2);
  assert.equal(state.frontmatter['model_profile'], 'balanced');
});

test('parse: malformed fixture throws ParseError with line number', () => {
  const raw = readFixture('malformed.md');
  let caught: unknown = null;
  try {
    parse(raw);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof ParseError, 'expected ParseError');
  assert.ok(
    (caught as ParseError).line > 0,
    'ParseError must carry a positive line number',
  );
  assert.match((caught as ParseError).message, /<blockers>/);
});

test('parse: missing frontmatter fence throws ParseError at line 1', () => {
  let caught: unknown = null;
  try {
    parse('no frontmatter here\n<position>\nstage: brief\nwave: 1\n</position>\n');
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof ParseError);
  assert.equal((caught as ParseError).line, 1);
});

test('parse: unterminated frontmatter throws ParseError', () => {
  let caught: unknown = null;
  try {
    parse('---\nstage: brief\n');
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof ParseError);
  assert.match((caught as ParseError).message, /unterminated frontmatter/);
});

test('parse: missing <position> block throws ParseError', () => {
  const raw = [
    '---',
    'pipeline_state_version: 1.0',
    'stage: brief',
    'cycle: ""',
    'wave: 1',
    'started_at: 2026-04-24T00:00:00Z',
    'last_checkpoint: 2026-04-24T00:00:00Z',
    '---',
    '',
    '# No position block',
    '',
  ].join('\n');
  let caught: unknown = null;
  try {
    parse(raw);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof ParseError);
  assert.match((caught as ParseError).message, /<position>/);
});

test('parse: tolerates unknown frontmatter keys (forward compat)', () => {
  const raw = [
    '---',
    'pipeline_state_version: 1.0',
    'stage: brief',
    'cycle: ""',
    'wave: 1',
    'started_at: 2026-04-24T00:00:00Z',
    'last_checkpoint: 2026-04-24T00:00:00Z',
    'future_field_we_do_not_know: some-value',
    '---',
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
  ].join('\n');
  const { state } = parse(raw);
  assert.equal(state.frontmatter['future_field_we_do_not_know'], 'some-value');
});
