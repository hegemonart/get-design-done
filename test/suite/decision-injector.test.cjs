'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { REPO_ROOT } = require('./helpers.ts');
const HOOK = path.join(REPO_ROOT, 'hooks', 'gdd-decision-injector.js');

function scaffold({ referenceFile = 'reference/heuristics.md', fileSize = 2000, withArchive = true, withLearnings = true, withState = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-di-'));

  // Create the reference file to open (sized above MIN_BYTES by default)
  fs.mkdirSync(path.join(dir, path.dirname(referenceFile)), { recursive: true });
  fs.writeFileSync(path.join(dir, referenceFile), 'x'.repeat(Math.max(1, fileSize)), 'utf8');

  const designDir = path.join(dir, '.design');
  fs.mkdirSync(designDir, { recursive: true });

  if (withLearnings) {
    fs.mkdirSync(path.join(designDir, 'learnings'), { recursive: true });
    fs.writeFileSync(
      path.join(designDir, 'learnings', 'LEARNINGS.md'),
      [
        '# Learnings',
        'L-01: Always prefer heuristics.md when scoring color contrast.',
        'L-02: anti-patterns.md supersedes ad-hoc advice for dark-mode.',
        'L-03: reference/heuristics.md is the canonical source for NNG.',
      ].join('\n'),
      'utf8'
    );
  }
  if (withState) {
    fs.writeFileSync(
      path.join(designDir, 'STATE.md'),
      [
        '---',
        'pipeline_state_version: 1.0',
        '---',
        '# STATE',
        'D-12: Heuristics reference (reference/heuristics.md) is tier L2 and must be imported by every audit-family agent.',
      ].join('\n'),
      'utf8'
    );
  }
  if (withArchive) {
    const cycleDir = path.join(designDir, 'archive', 'cycle-3');
    fs.mkdirSync(cycleDir, { recursive: true });
    fs.writeFileSync(
      path.join(cycleDir, 'CYCLE-SUMMARY.md'),
      [
        '# Cycle 3 Summary',
        'Key shift: Adopted heuristics.md as the canonical rubric.',
      ].join('\n'),
      'utf8'
    );
  }
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function runHook(payload, cwd) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd,
    env: { ...process.env, PWD: cwd },
  });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch {}
  return { stdout: r.stdout, parsed };
}

test('decision-injector: hook file exists', () => {
  assert.ok(fs.existsSync(HOOK));
});

test('decision-injector: open referenced file → recall block prepended', () => {
  const { dir, cleanup } = scaffold();
  try {
    const fp = path.join(dir, 'reference/heuristics.md');
    const { parsed } = runHook({ tool_name: 'Read', tool_input: { file_path: fp }, cwd: dir }, dir);
    assert.ok(parsed, 'hook must emit parseable JSON');
    assert.equal(parsed.continue, true);
    const ctx = parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx, 'additionalContext must be present for referenced file');
    assert.match(ctx, /Recall/);
    assert.match(ctx, /heuristics\.md/);
    assert.match(ctx, /D-12|L-01|cycle-3/);
  } finally { cleanup(); }
});

test('decision-injector: unreferenced file → silent pass', () => {
  const { dir, cleanup } = scaffold({ referenceFile: 'reference/unreferenced-xyz.md' });
  try {
    const fp = path.join(dir, 'reference/unreferenced-xyz.md');
    const { parsed } = runHook({ tool_name: 'Read', tool_input: { file_path: fp }, cwd: dir }, dir);
    assert.equal(parsed.continue, true);
    assert.equal(parsed.hookSpecificOutput, undefined);
  } finally { cleanup(); }
});

test('decision-injector: file outside matcher scope → silent pass', () => {
  const { dir, cleanup } = scaffold();
  try {
    const { parsed } = runHook({ tool_name: 'Read', tool_input: { file_path: path.join(dir, 'src/foo.ts') }, cwd: dir }, dir);
    assert.equal(parsed.continue, true);
    assert.equal(parsed.hookSpecificOutput, undefined);
  } finally { cleanup(); }
});

test('decision-injector: file below MIN_BYTES → silent pass', () => {
  const { dir, cleanup } = scaffold({ fileSize: 500 });
  try {
    const fp = path.join(dir, 'reference/heuristics.md');
    const { parsed } = runHook({ tool_name: 'Read', tool_input: { file_path: fp }, cwd: dir }, dir);
    assert.equal(parsed.continue, true);
    assert.equal(parsed.hookSpecificOutput, undefined);
  } finally { cleanup(); }
});

test('decision-injector: non-Read tool → silent pass', () => {
  const { dir, cleanup } = scaffold();
  try {
    const { parsed } = runHook({ tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'reference/heuristics.md') }, cwd: dir }, dir);
    assert.equal(parsed.continue, true);
    assert.equal(parsed.hookSpecificOutput, undefined);
  } finally { cleanup(); }
});

test('decision-injector: missing learnings/STATE → silent pass (no sources)', () => {
  const { dir, cleanup } = scaffold({ withArchive: false, withLearnings: false, withState: false });
  try {
    const fp = path.join(dir, 'reference/heuristics.md');
    const { parsed } = runHook({ tool_name: 'Read', tool_input: { file_path: fp }, cwd: dir }, dir);
    assert.equal(parsed.continue, true);
    assert.equal(parsed.hookSpecificOutput, undefined);
  } finally { cleanup(); }
});

test('decision-injector: duplicate matches are deduped', () => {
  const { dir, cleanup } = scaffold();
  // Append a duplicate learning that would produce identical hit
  const learnings = path.join(dir, '.design', 'learnings', 'LEARNINGS.md');
  fs.appendFileSync(learnings, '\nL-01: Always prefer heuristics.md when scoring color contrast.\n');
  try {
    const fp = path.join(dir, 'reference/heuristics.md');
    const { parsed } = runHook({ tool_name: 'Read', tool_input: { file_path: fp }, cwd: dir }, dir);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    // Count occurrences of "L-01:" in recall block: must be 1, not 2 (dedup by file+line)
    const occurrences = (ctx.match(/L-01:/g) || []).length;
    assert.equal(occurrences, 1);
  } finally { cleanup(); }
});

// Plan 25-06: <prototyping> outcomes surface alongside the existing recall block.
test('decision-injector: <prototyping> sketch matching opened file → outcome surfaced', () => {
  const { dir, cleanup } = scaffold({ referenceFile: 'reference/heuristics.md' });
  // Overwrite STATE.md with a <prototyping> block whose sketch slug matches `heuristics`.
  const state = path.join(dir, '.design', 'STATE.md');
  fs.writeFileSync(
    state,
    [
      '---',
      'pipeline_state_version: 1.0',
      '---',
      '<decisions>',
      'D-12: Heuristics reference (reference/heuristics.md) is tier L2 and must be imported by every audit-family agent. (locked)',
      'D-42: Prefer the lean heuristics rubric over the sprawling NNG one. (locked)',
      '</decisions>',
      '<prototyping>',
      '<sketch slug="heuristics-rubric" cycle="3" decision="D-42" status="resolved"/>',
      '<spike slug="heuristics-perf" cycle="2" decision="D-19" verdict="partial" status="resolved"/>',
      '<skipped at="explore" cycle="1" reason="unrelated-flow"/>',
      '</prototyping>',
    ].join('\n'),
    'utf8'
  );
  try {
    const fp = path.join(dir, 'reference/heuristics.md');
    const { parsed } = runHook({ tool_name: 'Read', tool_input: { file_path: fp }, cwd: dir }, dir);
    const ctx = parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx, 'additionalContext present');
    assert.match(ctx, /### Prior prototyping outcomes/);
    assert.match(ctx, /sketch\/heuristics-rubric/);
    assert.match(ctx, /D-42/);
    // Most recent cycle wins: cycle-3 sketch listed before cycle-2 spike.
    const sketchIdx = ctx.indexOf('sketch/heuristics-rubric');
    const spikeIdx = ctx.indexOf('spike/heuristics-perf');
    assert.ok(sketchIdx >= 0 && spikeIdx >= 0 && sketchIdx < spikeIdx, 'recency sort');
    // Skipped entry with non-matching reason is filtered out.
    assert.ok(!/skipped\/explore/.test(ctx));
  } finally { cleanup(); }
});

test('decision-injector: empty <prototyping> block → no proto section', () => {
  const { dir, cleanup } = scaffold({ referenceFile: 'reference/heuristics.md' });
  const state = path.join(dir, '.design', 'STATE.md');
  fs.writeFileSync(
    state,
    [
      '---',
      'pipeline_state_version: 1.0',
      '---',
      'D-12: Heuristics reference (reference/heuristics.md) is tier L2.',
      '<prototyping>',
      '<!-- empty -->',
      '</prototyping>',
    ].join('\n'),
    'utf8'
  );
  try {
    const fp = path.join(dir, 'reference/heuristics.md');
    const { parsed } = runHook({ tool_name: 'Read', tool_input: { file_path: fp }, cwd: dir }, dir);
    const ctx = parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext;
    // The recall block still fires (D-12 mentions heuristics.md), but no prototyping section.
    assert.ok(ctx);
    assert.ok(!/Prior prototyping outcomes/.test(ctx));
  } finally { cleanup(); }
});

test('decision-injector: missing <prototyping> block → no error, no proto section', () => {
  const { dir, cleanup } = scaffold({ referenceFile: 'reference/heuristics.md' });
  // Default scaffold() STATE.md has no <prototyping> block at all.
  try {
    const fp = path.join(dir, 'reference/heuristics.md');
    const { parsed } = runHook({ tool_name: 'Read', tool_input: { file_path: fp }, cwd: dir }, dir);
    const ctx = parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx);
    assert.ok(!/Prior prototyping outcomes/.test(ctx));
  } finally { cleanup(); }
});

test('decision-injector: <prototyping> matches but no recall hits → still surfaces proto section', () => {
  // unreferenced file: no D-XX/L-NN match, but a sketch slug that includes the basename token
  const { dir, cleanup } = scaffold({ referenceFile: 'reference/lonely-flow.md', withLearnings: false, withArchive: false });
  const state = path.join(dir, '.design', 'STATE.md');
  fs.writeFileSync(
    state,
    [
      '---',
      'pipeline_state_version: 1.0',
      '---',
      '<decisions>',
      'D-99: Lonely flow uses the minimal pattern. (locked)',
      '</decisions>',
      '<prototyping>',
      '<sketch slug="lonely-flow" cycle="4" decision="D-99" status="resolved"/>',
      '</prototyping>',
    ].join('\n'),
    'utf8'
  );
  try {
    const fp = path.join(dir, 'reference/lonely-flow.md');
    const { parsed } = runHook({ tool_name: 'Read', tool_input: { file_path: fp }, cwd: dir }, dir);
    const ctx = parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx, 'proto-only path emits additionalContext');
    assert.match(ctx, /Prior prototyping outcomes/);
    assert.match(ctx, /sketch\/lonely-flow/);
    assert.match(ctx, /D-99/);
    assert.match(ctx, /Lonely flow uses the minimal pattern/);
    // No Recall block because no D-XX/L-NN sources match.
    assert.ok(!/Recall/.test(ctx));
  } finally { cleanup(); }
});
