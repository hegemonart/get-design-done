'use strict';
// test/suite/phase-51-store.test.cjs — Phase 51 (Instinct-Based Learnings).
//
// Proves scripts/lib/instinct-store.cjs:
//   - add() -> get()/list() round-trip (stamps first_seen/last_seen/cycles_seen,
//     records project_ids), list() filters by domain + sorts by last_seen desc;
//   - query() returns ranked keyword matches over trigger+body+domain — asserted
//     on the in-memory JS-scan path, which is the path CI exercises (no
//     better-sqlite3 in devDependencies);
//   - deriveProjectId() is stable for one origin (and stable across git@/https
//     shapes) and returns the 'unknown' sentinel when no origin resolves;
//   - the promotion gate FAILS at K=1/M=1 and PASSES at K=2 across 2 project_ids;
//   - TTL decay over 7 simulated cycles drops confidence and archives a unit
//     once it falls below 0.2;
//   - a valid instinct validates against reference/schemas/instinct.schema.json
//     (Ajv) and an invalid one (confidence 1.5) fails.
//
// Hermetic: project stores live under os.tmpdir() (baseDir injected; git is
// faked via an injectable exec so worktree-resolve degrades to baseDir). The
// global store is redirected by temporarily stubbing os.homedir() onto a temp
// dir, so the real ~/.claude/gdd is never touched. All timestamps are injected
// via `now`. Temp dirs are removed in teardown.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const store = require('../../scripts/lib/instinct-store.cjs');

let Ajv;
try {
  Ajv = require('ajv');
} catch {
  throw new Error('ajv missing — scripts/validate-schemas.ts already imports it; run `npm install`.');
}
let addFormats = null;
try {
  addFormats = require('ajv-formats');
} catch {
  addFormats = null;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'reference', 'schemas', 'instinct.schema.json');
const SCHEMA = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hone-instinct-'));
}
function rmrf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

// An injectable git exec that has NO origin remote -> deriveProjectId/'unknown'
// and worktree-resolve degrades to baseDir. Matches the (cmd, args) => string
// contract; throwing models "git cannot answer".
function noGit() {
  return () => {
    throw new Error('no git');
  };
}

// A fixed ISO date and a +N-days helper so every timestamp is deterministic.
const DAY0 = '2026-06-01T12:00:00Z';
function dayN(n) {
  return new Date(Date.parse(DAY0) + n * 86400000).toISOString();
}

function makeValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  if (addFormats) addFormats(ajv);
  return ajv.compile(SCHEMA);
}

function sampleUnit(over = {}) {
  return {
    id: 'prefer-token-over-hex',
    trigger: 'When a raw color literal appears in a component, reach for a design token first.',
    confidence: 0.5,
    domain: 'build',
    scope: 'project',
    project_id: 'abcd1234',
    source: 'reflection',
    body: 'Hardcoded hex values drift from the system palette. A token keeps the value in one place.',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// add / get / list round-trip.
// ---------------------------------------------------------------------------

test('add() stamps metadata and get()/list() round-trip', () => {
  const baseDir = mkTmp();
  try {
    const stored = store.add(sampleUnit(), { baseDir, now: DAY0, exec: noGit() });
    assert.equal(stored.first_seen, '2026-06-01');
    assert.equal(stored.last_seen, '2026-06-01');
    assert.equal(stored.cycles_seen, 1);
    assert.deepEqual(stored.project_ids, ['abcd1234']);

    const got = store.get('prefer-token-over-hex', { baseDir, exec: noGit() });
    assert.ok(got, 'get() returns the unit');
    assert.equal(got.trigger, stored.trigger);

    const all = store.list({ baseDir, exec: noGit() });
    assert.equal(all.length, 1);
    assert.equal(all[0].id, 'prefer-token-over-hex');

    assert.equal(store.get('does-not-exist', { baseDir, exec: noGit() }), null);
  } finally {
    rmrf(baseDir);
  }
});

test('list() filters by domain and sorts by last_seen desc', () => {
  const baseDir = mkTmp();
  try {
    store.add(sampleUnit({ id: 'a-build', domain: 'build' }), { baseDir, now: dayN(0), exec: noGit() });
    store.add(sampleUnit({ id: 'b-verify', domain: 'verify' }), { baseDir, now: dayN(2), exec: noGit() });
    store.add(sampleUnit({ id: 'c-build', domain: 'build' }), { baseDir, now: dayN(4), exec: noGit() });

    const builds = store.list({ baseDir, domain: 'build', exec: noGit() });
    assert.deepEqual(builds.map((u) => u.id), ['c-build', 'a-build'], 'domain filter + last_seen desc');

    const allSorted = store.list({ baseDir, exec: noGit() });
    assert.deepEqual(allSorted.map((u) => u.id), ['c-build', 'b-verify', 'a-build']);
  } finally {
    rmrf(baseDir);
  }
});

// ---------------------------------------------------------------------------
// query — ranked keyword match (JS-scan path, which CI uses).
// ---------------------------------------------------------------------------

test('query() returns ranked matches over trigger+body+domain', () => {
  const baseDir = mkTmp();
  try {
    store.add(
      sampleUnit({
        id: 'token-first',
        trigger: 'Prefer a design token over a hardcoded color value.',
        body: 'Tokens centralize palette decisions.',
      }),
      { baseDir, now: dayN(0), exec: noGit() },
    );
    store.add(
      sampleUnit({
        id: 'spacing-scale',
        trigger: 'Use the spacing scale, not arbitrary pixel margins.',
        body: 'A consistent scale keeps rhythm.',
      }),
      { baseDir, now: dayN(1), exec: noGit() },
    );
    store.add(
      sampleUnit({
        id: 'mention-token-in-body',
        trigger: 'Keep accessible contrast on text.',
        body: 'A token can encode contrast-safe pairs.',
      }),
      { baseDir, now: dayN(2), exec: noGit() },
    );

    const hits = store.query('token', { baseDir, limit: 3, exec: noGit() });
    assert.ok(hits.length >= 2, 'matches multiple units containing "token"');
    // token-first matches "token" in BOTH trigger (weighted) and body -> ranks first.
    assert.equal(hits[0].id, 'token-first', 'trigger hit outranks body-only hit');
    const ids = hits.map((u) => u.id);
    assert.ok(ids.includes('mention-token-in-body'), 'body-only match is still returned');
    assert.ok(!ids.includes('spacing-scale'), 'non-matching unit excluded');

    assert.equal(store.query('', { baseDir, exec: noGit() }).length, 0, 'empty keyword -> no matches');
    assert.equal(
      store.query('nonexistentterm', { baseDir, exec: noGit() }).length,
      0,
      'no-match keyword -> empty',
    );

    // backendName() is one of the documented values; CI has no better-sqlite3.
    assert.ok(['fts5', 'js-scan'].includes(store.backendName()));
  } finally {
    rmrf(baseDir);
  }
});

// ---------------------------------------------------------------------------
// deriveProjectId — stable + 'unknown' fallback.
// ---------------------------------------------------------------------------

test('deriveProjectId() is stable across origin shapes and falls back to unknown', () => {
  const httpsExec = () => 'https://github.com/acme/widget.git';
  const sshExec = () => 'git@github.com:acme/widget.git';

  const a = store.deriveProjectId('/anywhere', httpsExec);
  const b = store.deriveProjectId('/anywhere', httpsExec);
  const c = store.deriveProjectId('/elsewhere', sshExec);

  assert.match(a, /^[0-9a-f]{8}$/, 'sha8 hex shape');
  assert.equal(a, b, 'deterministic for one origin');
  assert.equal(a, c, 'git@ and https shapes normalize to the same id');

  // No origin / git unavailable -> 'unknown', never throws.
  assert.equal(store.deriveProjectId('/anywhere', noGit()), 'unknown');
  assert.equal(
    store.deriveProjectId('/anywhere', () => ''),
    'unknown',
    'empty origin -> unknown',
  );
});

// ---------------------------------------------------------------------------
// promotion gate — FAIL at K=1/M=1, PASS at K=2 across 2 project_ids.
// Redirect the global store onto a temp homedir by stubbing os.homedir.
// ---------------------------------------------------------------------------

test('promote() enforces the K=2 / M=2 gate', () => {
  const baseDir = mkTmp();
  const fakeHome = mkTmp();
  const realHomedir = os.homedir;
  os.homedir = () => fakeHome;
  try {
    // Gate UNMET: one cycle, one project. (project_id matches the single id in
    // project_ids so add() folding it in keeps the distinct-project count at 1.)
    store.add(
      sampleUnit({ id: 'green-unit', cycles_seen: 1, project_id: '11111111', project_ids: ['11111111'] }),
      { baseDir, now: DAY0, exec: noGit() },
    );
    assert.throws(
      () => store.promote('green-unit', { baseDir, now: dayN(1), exec: noGit() }),
      /promotion gate/,
      'K=1/M=1 fails the gate',
    );

    // Still UNMET: two cycles but only one distinct project.
    store.add(
      sampleUnit({ id: 'one-project', cycles_seen: 2, project_id: '11111111', project_ids: ['11111111'] }),
      { baseDir, now: DAY0, exec: noGit() },
    );
    assert.throws(
      () => store.promote('one-project', { baseDir, now: dayN(1), exec: noGit() }),
      /promotion gate/,
      'M=1 fails the gate even when K>=2',
    );

    // Gate MET: two cycles across two distinct projects.
    store.add(
      sampleUnit({
        id: 'cross-project',
        cycles_seen: 2,
        project_id: '11111111',
        project_ids: ['11111111', '22222222'],
      }),
      { baseDir, now: DAY0, exec: noGit() },
    );
    const promoted = store.promote('cross-project', { baseDir, now: dayN(1), exec: noGit() });
    assert.equal(promoted.scope, 'global');
    assert.equal(promoted.alpha, store.INSTINCT_PRIOR.alpha, 'Beta(2,8) prior applied on promotion');
    assert.equal(promoted.beta, store.INSTINCT_PRIOR.beta);
    assert.equal(promoted.prior_class, 'instinct');
    assert.ok(!('project_id' in promoted), 'single-origin project_id dropped on promotion');

    // It moved: gone from project store, present in global store.
    assert.equal(store.get('cross-project', { baseDir, scope: 'project', exec: noGit() }), null);
    const fromGlobal = store.get('cross-project', { scope: 'global' });
    assert.ok(fromGlobal, 'promoted unit is in the global store');
    assert.equal(fromGlobal.scope, 'global');
  } finally {
    os.homedir = realHomedir;
    rmrf(baseDir);
    rmrf(fakeHome);
  }
});

// ---------------------------------------------------------------------------
// TTL decay over 7 simulated cycles.
// ---------------------------------------------------------------------------

test('decay() drops confidence on stale units and archives below 0.2', () => {
  const baseDir = mkTmp();
  try {
    // Seed a low-confidence unit at the floor so a few decays cross 0.2.
    store.add(sampleUnit({ id: 'fading', confidence: 0.3 }), { baseDir, now: dayN(0), exec: noGit() });

    let last = { decayed: 0, archived: 0 };
    // Simulate 7 cycles; each cycle steps the clock a full decay window forward
    // so the unit is "unsurfaced" each time (we never touch() it).
    for (let cycle = 1; cycle <= 7; cycle++) {
      const now = dayN(cycle * store.DECAY_CYCLES_WINDOW);
      last = store.decay({ baseDir, now, exec: noGit() });
      const live = store.get('fading', { baseDir, exec: noGit() });
      if (live) {
        assert.ok(live.confidence < 0.3, 'confidence decayed below its start');
      }
    }

    // 0.3 * 0.9^n < 0.2 first holds at n=4 (0.3*0.6561=0.1968), so the unit is
    // archived and removed from the live store by cycle 7.
    assert.equal(store.get('fading', { baseDir, exec: noGit() }), null, 'archived unit left the live store');
    assert.ok(last.archived >= 0, 'decay reports an archived count');

    const archiveDir = store.paths({ baseDir, scope: 'project' }).archiveDir;
    const archived = fs.existsSync(archiveDir) ? fs.readdirSync(archiveDir) : [];
    assert.ok(archived.includes('fading.json'), 'archived unit persisted under archive/');

    const archivedUnit = JSON.parse(fs.readFileSync(path.join(archiveDir, 'fading.json'), 'utf8'));
    assert.ok(archivedUnit.confidence < store.ARCHIVE_THRESHOLD, 'archived below threshold');
    assert.ok(typeof archivedUnit.archived_at === 'string', 'archive stamps archived_at');
  } finally {
    rmrf(baseDir);
  }
});

test('touch() bumps cycles_seen + last_seen and resets decay', () => {
  const baseDir = mkTmp();
  try {
    store.add(sampleUnit({ id: 'kept-fresh', confidence: 0.5 }), { baseDir, now: dayN(0), exec: noGit() });
    const t = store.touch('kept-fresh', { baseDir, now: dayN(3), projectId: '99999999', exec: noGit() });
    assert.equal(t.cycles_seen, 2, 'cycles_seen incremented');
    assert.equal(t.last_seen, '2026-06-04', 'last_seen advanced');
    assert.ok(t.project_ids.includes('99999999'), 'new project_id recorded');

    // Now decay with a clock only just past the touch -> NOT stale -> no decay.
    const res = store.decay({ baseDir, now: dayN(4), exec: noGit() });
    assert.equal(res.decayed, 0, 'recently-touched unit is not stale');
    assert.equal(store.touch('missing', { baseDir, exec: noGit() }), null, 'touch unknown -> null');
  } finally {
    rmrf(baseDir);
  }
});

// ---------------------------------------------------------------------------
// Schema validation (Ajv) — valid passes, confidence 1.5 fails.
// ---------------------------------------------------------------------------

test('instinct.schema.json validates a good unit and rejects confidence 1.5', () => {
  const validate = makeValidator();

  const good = {
    id: 'prefer-token-over-hex',
    trigger: 'When a raw color literal appears, reach for a design token first.',
    confidence: 0.5,
    domain: 'build',
    scope: 'project',
    project_id: 'abcd1234',
    source: 'reflection',
    cycles_seen: 1,
    project_ids: ['abcd1234'],
    first_seen: '2026-06-01',
    last_seen: '2026-06-01',
  };
  assert.ok(validate(good), `valid unit should pass: ${JSON.stringify(validate.errors)}`);

  // confidence out of [0.3, 0.9] range.
  const bad = { ...good, confidence: 1.5 };
  assert.equal(validate(bad), false, 'confidence 1.5 must fail');

  // project scope without project_id must fail (allOf if/then).
  const noPid = { ...good };
  delete noPid.project_id;
  assert.equal(validate(noPid), false, 'project scope requires project_id');

  // bad domain enum + non-kebab id must fail.
  assert.equal(validate({ ...good, domain: 'shipping' }), false, 'unknown domain rejected');
  assert.equal(validate({ ...good, id: 'NotKebab' }), false, 'non-kebab id rejected');

  // a global unit may omit project_id.
  const globalUnit = { ...good, scope: 'global' };
  delete globalUnit.project_id;
  assert.ok(validate(globalUnit), `global unit may omit project_id: ${JSON.stringify(validate.errors)}`);
});

test('parseUnit() reads YAML frontmatter + body, null on malformed', () => {
  const doc = [
    '---',
    'id: prefer-token-over-hex',
    'trigger: Prefer a token over a hex literal.',
    'confidence: 0.5',
    'domain: build',
    'scope: project',
    'project_id: abcd1234',
    'source: reflection',
    'cycles_seen: 2',
    '---',
    'Body paragraph explaining the instinct.',
    '',
  ].join('\n');
  const u = store.parseUnit(doc, 'sample');
  assert.equal(u.id, 'prefer-token-over-hex');
  assert.equal(u.confidence, 0.5, 'numeric scalar coerced');
  assert.equal(u.cycles_seen, 2, 'integer scalar coerced');
  assert.equal(u.domain, 'build');
  assert.ok(u.body.startsWith('Body paragraph'), 'body captured');

  // Malformed (no frontmatter fence) -> null, never exits the process.
  assert.equal(store.parseUnit('no frontmatter here', 'x'), null);
});
