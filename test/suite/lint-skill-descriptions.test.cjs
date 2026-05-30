'use strict';
/**
 * test/suite/lint-skill-descriptions.test.cjs — Phase 32 Plan 09 (D-02).
 *
 * Drives the description-drift detector via a STUBBED git-log / synthetic
 * history — NO dependency on the live repo's real git state. Asserts:
 *   (a) bodyChangesSince >= 3  -> FLAGGED
 *   (b) bodyChangesSince === 2 -> NOT flagged (threshold boundary)
 *   (c) description changed after the last body change (bodyChangesSince 0)
 *       -> NOT flagged
 *   (d) collectRecords driven with an injected git stub yields the expected
 *       per-skill records (drifted vs fresh) — the adapter is seamable
 *   (e) the CLI exit code is 0 when clean and non-zero when >=1 is flagged
 *   (f) a non-vacuous meta-case: a stub built to drift IS flagged AND a stub
 *       built to be in-sync is NOT — proving the detector is not trivially
 *       returning the same answer for every input
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '../../scripts/lint-skill-descriptions.cjs');
const { analyzeDrift, collectRecords } = require(SCRIPT);

// ---------------------------------------------------------------------------
// analyzeDrift — the pure threshold core
// ---------------------------------------------------------------------------

test('32-09: bodyChangesSince=3 is flagged', () => {
  const { flagged, clean } = analyzeDrift([{ skill: 'a', bodyChangesSince: 3 }]);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].skill, 'a');
  assert.equal(flagged[0].bodyChangesSince, 3);
  assert.equal(clean.length, 0);
});

test('32-09: bodyChangesSince=2 is NOT flagged (threshold boundary)', () => {
  const { flagged, clean } = analyzeDrift([{ skill: 'b', bodyChangesSince: 2 }]);
  assert.equal(flagged.length, 0);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].skill, 'b');
});

test('32-09: bodyChangesSince=4 is flagged (above threshold)', () => {
  const { flagged } = analyzeDrift([{ skill: 'd', bodyChangesSince: 4 }]);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].skill, 'd');
});

test('32-09: description-after-body (bodyChangesSince=0) NOT flagged', () => {
  const { flagged, clean } = analyzeDrift([{ skill: 'c', bodyChangesSince: 0 }]);
  assert.equal(flagged.length, 0);
  assert.equal(clean.length, 1);
});

test('32-09: threshold is configurable via options', () => {
  // With threshold=2, bodyChangesSince=2 should now flag.
  const { flagged } = analyzeDrift([{ skill: 'x', bodyChangesSince: 2 }], { threshold: 2 });
  assert.equal(flagged.length, 1);
  // Default threshold (3) must NOT regress: bodyChangesSince=2 stays clean.
  const def = analyzeDrift([{ skill: 'y', bodyChangesSince: 2 }]);
  assert.equal(def.flagged.length, 0);
});

// ---------------------------------------------------------------------------
// collectRecords — the seamable git adapter (injected git stub)
// ---------------------------------------------------------------------------

// A canned `git log -p --follow` style output. Newest commit first.
// `desc` = the commit changed the frontmatter `description:` line.
// `body` = the commit touched the file but NOT the description line.
function fakeLog(commits) {
  // commits: array newest-first of { hash, kind: 'desc'|'body', text? }
  const out = [];
  for (const c of commits) {
    out.push(`__COMMIT__${c.hash}`);
    if (c.kind === 'desc') {
      out.push('-description: "old summary that drifted"');
      out.push('+description: "new summary"');
    } else {
      out.push('+## A reworked body heading');
      out.push('-some removed body prose');
    }
  }
  return out.join('\n') + '\n';
}

test('32-09: collectRecords with stubbed git-log yields correct records', () => {
  // 'drifted': newest 3 commits are body-only, then a desc change -> since=3.
  // 'fresh':   newest commit changed the description -> since=0.
  const histories = {
    drifted: fakeLog([
      { hash: 'h6', kind: 'body' },
      { hash: 'h5', kind: 'body' },
      { hash: 'h4', kind: 'body' },
      { hash: 'h3', kind: 'desc' },
      { hash: 'h2', kind: 'body' },
      { hash: 'h1', kind: 'body' },
    ]),
    fresh: fakeLog([
      { hash: 'g3', kind: 'desc' },
      { hash: 'g2', kind: 'body' },
      { hash: 'g1', kind: 'body' },
    ]),
  };
  const gitStub = (skill) => histories[skill];
  const records = collectRecords({
    git: gitStub,
    skills: ['drifted', 'fresh'],
  });

  const byName = Object.fromEntries(records.map((r) => [r.skill, r]));
  assert.equal(byName.drifted.bodyChangesSince, 3);
  assert.equal(byName.drifted.descriptionChangedAt, 'h3');
  assert.equal(byName.fresh.bodyChangesSince, 0);
  assert.equal(byName.fresh.descriptionChangedAt, 'g3');
});

test('32-09: collectRecords treats a never-changed-description file as descChangedAt=first commit, since=bodyCommits', () => {
  // No 'desc' commit at all -> description never explicitly changed after
  // creation -> descriptionChangedAt anchors at the FIRST (oldest) commit and
  // every newer body commit counts.
  const history = fakeLog([
    { hash: 'b4', kind: 'body' },
    { hash: 'b3', kind: 'body' },
    { hash: 'b2', kind: 'body' },
    { hash: 'b1', kind: 'body' }, // oldest = creation
  ]);
  const records = collectRecords({ git: () => history, skills: ['nochg'] });
  const r = records[0];
  assert.equal(r.descriptionChangedAt, 'b1');
  // 3 body commits newer than the oldest creation commit.
  assert.equal(r.bodyChangesSince, 3);
});

test('32-09: collectRecords treats a single-commit file as bodyChangesSince=0', () => {
  const history = fakeLog([{ hash: 's1', kind: 'body' }]);
  const records = collectRecords({ git: () => history, skills: ['solo'] });
  assert.equal(records[0].bodyChangesSince, 0);
});

// ---------------------------------------------------------------------------
// Non-vacuous meta-case: drift-stub flagged, in-sync-stub clean (end to end)
// ---------------------------------------------------------------------------

test('32-09: non-vacuous — drift stub flags while in-sync stub stays clean (detector is not trivial)', () => {
  const drift = collectRecords({
    git: () => fakeLog([
      { hash: 'd3', kind: 'body' },
      { hash: 'd2', kind: 'body' },
      { hash: 'd1', kind: 'body' },
      { hash: 'd0', kind: 'desc' },
    ]),
    skills: ['drifty'],
  });
  const synced = collectRecords({
    git: () => fakeLog([
      { hash: 'e2', kind: 'desc' },
      { hash: 'e1', kind: 'body' },
    ]),
    skills: ['synced'],
  });
  const driftResult = analyzeDrift(drift);
  const syncResult = analyzeDrift(synced);
  assert.equal(driftResult.flagged.length, 1, 'drift stub MUST be flagged');
  assert.equal(syncResult.flagged.length, 0, 'in-sync stub MUST be clean');
  // Prove the two inputs actually differ (guards against a trivial detector).
  assert.notEqual(driftResult.flagged.length, syncResult.flagged.length);
});

// ---------------------------------------------------------------------------
// CLI exit-code semantics — 0 clean, non-zero flagged (child process)
// ---------------------------------------------------------------------------

function runCli(env) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: (e.stdout || '').toString() };
  }
}

test('32-09: exit 0 when clean (stubbed-clean run)', () => {
  // LINT_SELFTEST=clean forces an in-memory all-in-sync record set.
  const { code, stdout } = runCli({ LINT_SELFTEST: 'clean' });
  assert.equal(code, 0);
  assert.match(stdout, /in sync|clean|All skill descriptions/i);
});

test('32-09: exit non-zero when flagged (stubbed-flagged run)', () => {
  // LINT_SELFTEST=drift forces a record set with one drifted skill.
  const { code, stdout } = runCli({ LINT_SELFTEST: 'drift' });
  assert.notEqual(code, 0);
  // The flagged skill + its body-change count must appear, one per line.
  assert.match(stdout, /selftest-drift/);
  assert.match(stdout, /3/);
});
