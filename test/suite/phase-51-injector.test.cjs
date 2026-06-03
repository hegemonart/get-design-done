'use strict';
// test/suite/phase-51-injector.test.cjs — Phase 51 (Instinct-Based Learnings):
// the INJECTOR + EVENTS + CLEANUP unit.
//
// Covers:
//   (a) gdd-decision-injector, given a .design/*.md Read in a temp project
//       seeded with a couple of instinct units, emits a `### Relevant instincts`
//       block in additionalContext carrying the top matches.
//   (b) given NO instinct units present, the hook still returns { continue:true }
//       with the other recall blocks intact (never throws).
//   (c) the pure buildInstinctsBlock renderer (shape + malformed-input tolerance).
//   (d) events.schema.json lists the 3 instinct_* seed types in its `type`
//       description, and the `type` property stays a free-form string.
//   (e) the cleanup decay path archives a sub-0.2-confidence unit and removes it
//       from the live store; absent-store decay is non-fatal.
//
// The hook is driven the same way the existing decision-injector test drives it:
// spawn `node hooks/gdd-decision-injector.js` with a stdin PreToolUse payload.
// The pure helper is required in-process (the hook guards its auto-run with
// `require.main === module`).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { REPO_ROOT } = require('./helpers.ts');
const HOOK = path.join(REPO_ROOT, 'hooks', 'gdd-decision-injector.js');

// The injector module (pure helpers) — safe to require thanks to the
// require.main === module guard added in Phase 51.
const injector = require('../../hooks/gdd-decision-injector.js');

// The instinct store is a sibling module (Phase 51). It may be absent in older
// installs; the populated-path tests skip gracefully when it is missing.
let store = null;
try {
  store = require('../../scripts/lib/instinct-store.cjs');
} catch {
  store = null;
}

const cleanup = require('../../scripts/gsd-cleanup-incubator.cjs');

// ---------------------------------------------------------------------------
// Scaffolding — a temp project with a sized .design/*.md to open plus the
// recall sources (LEARNINGS/STATE) so the existing blocks fire too.

function scaffold({ openFile = '.design/color-tokens.md', fileSize = 2000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-p51-'));

  const target = path.join(dir, openFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, 'x'.repeat(Math.max(1, fileSize)), 'utf8');

  const designDir = path.join(dir, '.design');
  fs.mkdirSync(path.join(designDir, 'learnings'), { recursive: true });
  fs.writeFileSync(
    path.join(designDir, 'learnings', 'LEARNINGS.md'),
    ['# Learnings', 'L-07: color-tokens.md is the canonical palette source.'].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(designDir, 'STATE.md'),
    ['---', 'pipeline_state_version: 1.0', '---', '# STATE', 'D-21: color-tokens.md defines the brand ramp.'].join('\n'),
    'utf8',
  );

  return { dir, target, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function runHook(payload, cwd) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd,
    env: { ...process.env, PWD: cwd },
  });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch { /* leave null */ }
  return { stdout: r.stdout, stderr: r.stderr, status: r.status, parsed };
}

// Seed a project-scoped instinct unit via the real store. project_id is stamped
// so the project-scope schema requirement is satisfied; we pass an explicit one
// (the temp dir has no git origin → store would derive 'unknown' otherwise).
function seedUnit(baseDir, unit) {
  return store.add(
    { project_id: 'abcd1234', source: 'reflection', ...unit },
    { scope: 'project', baseDir, now: '2026-06-03' },
  );
}

// ---------------------------------------------------------------------------
// (a) Seeded store → `### Relevant instincts` block with the top matches.

test('51-injector: seeded instincts surface a "Relevant instincts" block', { skip: store ? false : 'instinct-store.cjs not installed' }, () => {
  const { dir, target, cleanup: clean } = scaffold({ openFile: '.design/color-tokens.md' });
  try {
    seedUnit(dir, {
      id: 'prefer-token-over-hex',
      trigger: 'When a color literal appears in a component, reach for a design token first.',
      confidence: 0.72,
      domain: 'build',
    });
    seedUnit(dir, {
      id: 'tokens-drive-theming',
      trigger: 'Theme color choices flow from the token ramp, not ad-hoc values.',
      confidence: 0.61,
      domain: 'decide',
    });

    const { parsed } = runHook({ tool_name: 'Read', tool_input: { file_path: target }, cwd: dir }, dir);
    assert.ok(parsed, 'hook emits parseable JSON');
    assert.equal(parsed.continue, true);
    const ctx = parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx, 'additionalContext present');
    assert.match(ctx, /### Relevant instincts/);
    assert.match(ctx, /When a color literal appears in a component/);
    assert.match(ctx, /confidence 0\.72, build/);
    // The other recall blocks still fire (D-21/L-07 mention color-tokens.md).
    assert.match(ctx, /Recall/);
  } finally { clean(); }
});

// ---------------------------------------------------------------------------
// (b) No instinct units → no instinct block, other blocks intact, no throw.

test('51-injector: no instincts → no instinct block, recall intact, continue:true', () => {
  const { dir, target, cleanup: clean } = scaffold({ openFile: '.design/color-tokens.md' });
  try {
    // No seedUnit() calls → query() returns [] (or the store is absent entirely);
    // either way the instinct block must be omitted and the hook must not throw.
    const { parsed, status } = runHook({ tool_name: 'Read', tool_input: { file_path: target }, cwd: dir }, dir);
    assert.equal(status, 0, 'hook exits 0');
    assert.ok(parsed, 'hook emits parseable JSON');
    assert.equal(parsed.continue, true);
    const ctx = parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext;
    // Recall block still present (D-21/L-07 reference the opened file)…
    assert.ok(ctx, 'additionalContext present (recall block)');
    assert.match(ctx, /Recall/);
    // …but no instinct block.
    assert.ok(!/### Relevant instincts/.test(ctx), 'no instinct block without units');
  } finally { clean(); }
});

// ---------------------------------------------------------------------------
// (c) Pure renderer: shape + malformed tolerance.

test('51-injector: buildInstinctsBlock renders trigger/confidence/domain, caps at 3', () => {
  const block = injector.buildInstinctsBlock([
    { trigger: 'A', confidence: 0.5, domain: 'build' },
    { trigger: 'B', confidence: 0.6, domain: 'decide' },
    { trigger: 'C', confidence: 0.7, domain: 'verify' },
    { trigger: 'D', confidence: 0.8, domain: 'operate' },
  ]);
  assert.ok(block, 'block produced');
  assert.match(block, /### Relevant instincts/);
  assert.match(block, /- A \(confidence 0\.50, build\)/);
  assert.match(block, /- C \(confidence 0\.70, verify\)/);
  assert.ok(!/- D \(/.test(block), 'capped at top-3');
});

test('51-injector: buildInstinctsBlock returns null for empty / non-array', () => {
  assert.equal(injector.buildInstinctsBlock([]), null);
  assert.equal(injector.buildInstinctsBlock(null), null);
  assert.equal(injector.buildInstinctsBlock(undefined), null);
  assert.equal(injector.buildInstinctsBlock('nope'), null);
});

test('51-injector: buildInstinctsBlock tolerates malformed units (missing fields)', () => {
  const block = injector.buildInstinctsBlock([
    { trigger: 'has trigger only' },
    { confidence: 0.4 },
    {},
  ]);
  assert.ok(block, 'still renders a block from partial units');
  assert.match(block, /has trigger only \(confidence \?, unknown\)/);
  // The fieldless units render with safe defaults rather than throwing.
  assert.match(block, /\(no trigger\) \(confidence 0\.40, unknown\)/);
});

test('51-injector: buildInstinctsBlock drops block when every unit is malformed', () => {
  assert.equal(injector.buildInstinctsBlock([null, 42, 'x']), null);
});

test('51-injector: instinctTokens derives substantive tokens from path', () => {
  const toks = injector.instinctTokens('color-tokens.md', '.design/color-tokens.md');
  assert.ok(toks.includes('color'));
  assert.ok(toks.includes('tokens'));
  // Stop-ish short tokens (<=2 chars) and the .md extension are dropped.
  assert.ok(!toks.includes('md'));
});

// ---------------------------------------------------------------------------
// (d) events.schema.json lists the 3 instinct_* seed types; type stays free-form.

test('51-injector: events.schema.json seeds the 3 instinct_* types', () => {
  const schemaPath = path.join(REPO_ROOT, 'reference', 'schemas', 'events.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const typeProp = schema.properties.type;
  // Free-form string, minLength 1, no closed enum.
  assert.equal(typeProp.type, 'string');
  assert.equal(typeProp.minLength, 1);
  assert.ok(!('enum' in typeProp), 'type must remain free-form (no enum)');
  // The 3 new seeds are listed in the description (mirrors live_* seeding).
  for (const seed of ['instinct_emitted', 'instinct_promoted', 'instinct_decayed']) {
    assert.ok(typeProp.description.includes(seed), `seed list must mention ${seed}`);
  }
  // No new allOf conditional was added for the instinct types (stays at 3:
  // capability_gap, kfm-candidate, router_pick).
  assert.equal(schema.allOf.length, 3, 'no new allOf conditional for instinct seeds');
});

// ---------------------------------------------------------------------------
// (e) Cleanup decay path archives a sub-0.2 unit; absent-store decay is non-fatal.

test('51-injector: cleanup decay archives a sub-0.2 unit + removes it from live store', { skip: store ? false : 'instinct-store.cjs not installed' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-p51-decay-'));
  try {
    // Seed a low-confidence unit, last surfaced 30 days ago → decay() multiplies
    // 0.21 * 0.9 = 0.189 < 0.2 → archived. now = today (far past last_seen).
    const longAgo = '2026-05-01';
    store.add(
      {
        id: 'fading-instinct',
        trigger: 'A weak instinct that has gone unsurfaced for many cycles now.',
        confidence: 0.21,
        domain: 'build',
        scope: 'project',
        project_id: 'abcd1234',
        source: 'reflection',
        last_seen: longAgo,
        first_seen: longAgo,
      },
      { scope: 'project', baseDir: dir, now: longAgo },
    );

    const before = store.list({ scope: 'project', baseDir: dir });
    assert.equal(before.length, 1, 'unit seeded into the live store');

    const out = cleanup.decayInstincts({ baseDir: dir, now: new Date('2026-05-31T00:00:00Z') });
    assert.equal(out.ran, true, 'decay ran (store present)');
    assert.ok(out.result, 'decay returned a result');
    assert.equal(out.result.archived, 1, 'one unit archived');

    // The live store no longer holds it…
    const after = store.list({ scope: 'project', baseDir: dir });
    assert.equal(after.length, 0, 'archived unit removed from live store');

    // …and an archive JSON exists under <baseDir>/.design/instincts/archive/.
    const archiveFile = path.join(dir, '.design', 'instincts', 'archive', 'fading-instinct.json');
    assert.equal(fs.existsSync(archiveFile), true, 'archived unit persisted to archive dir');
    const archived = JSON.parse(fs.readFileSync(archiveFile, 'utf8'));
    assert.equal(archived.id, 'fading-instinct');
    assert.ok('archived_at' in archived, 'archive stamps archived_at');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('51-injector: decayInstincts is non-fatal when the store data dir is absent', () => {
  // A bare temp dir with no instincts: decay either runs and reports 0 archived,
  // or (no store installed) returns ran:false. Neither path throws.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-p51-empty-'));
  try {
    // Inject a clock so that, when the store IS present, decay actually runs the
    // empty-store path (rather than no-opping on a missing-now throw).
    const out = cleanup.decayInstincts({ baseDir: dir, now: new Date('2026-06-03T00:00:00Z') });
    assert.equal(typeof out, 'object');
    assert.equal(typeof out.ran, 'boolean');
    if (out.ran) {
      assert.equal(out.result.archived, 0, 'nothing to archive in an empty project');
      assert.equal(out.result.decayed, 0, 'nothing to decay in an empty project');
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Hook still honours its core contract after the Phase 51 addition.

test('51-injector: non-Read tool → silent pass (contract unchanged)', () => {
  const { dir, target, cleanup: clean } = scaffold();
  try {
    const { parsed } = runHook({ tool_name: 'Edit', tool_input: { file_path: target }, cwd: dir }, dir);
    assert.equal(parsed.continue, true);
    assert.equal(parsed.hookSpecificOutput, undefined);
  } finally { clean(); }
});
