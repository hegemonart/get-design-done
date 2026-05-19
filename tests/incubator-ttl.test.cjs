// tests/incubator-ttl.test.cjs — Phase 29 Plan 06 / CONTEXT D-06
// scanIncubator + archiveSlug semantics: archive at TTL, refresh resets
// timer, collision-suffix, dry-run, deterministic. Tmpdir-only (D-11).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const c = require('../scripts/gsd-cleanup-incubator.cjs');

const NOW = new Date('2026-05-19T12:00:00.000Z');

function mkTmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rmTmpdir(d) {
  fs.rmSync(d, { recursive: true, force: true });
}

function seedIncubator(baseDir, slug, contextHash, draftBody = '') {
  const dir = path.join(baseDir, '.design', 'reflections', 'incubator', slug);
  fs.mkdirSync(dir, { recursive: true });
  const draft =
    `---\nname: ${slug}\ncontext_hash: ${contextHash}\n---\n` +
    (draftBody || `Draft body for ${slug}.\n`);
  fs.writeFileSync(path.join(dir, `${slug}-draft.md`), draft, 'utf8');
  return dir;
}

function seedDraftNoFrontmatter(baseDir, slug) {
  const dir = path.join(baseDir, '.design', 'reflections', 'incubator', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${slug}-draft.md`), `# ${slug}\nplain body\n`, 'utf8');
  return dir;
}

function seedDirNoDraft(baseDir, slug) {
  const dir = path.join(baseDir, '.design', 'reflections', 'incubator', slug);
  fs.mkdirSync(dir, { recursive: true });
  // No .md file at all
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'placeholder\n', 'utf8');
  return dir;
}

function seedEvent(baseDir, opts) {
  const contextHash = opts.contextHash;
  const agedDays = opts.agedDays;
  const eventField = opts.eventField || 'type';
  const now = opts.now || NOW;
  const tsOverride = opts.tsOverride;
  const events = path.join(baseDir, '.design', 'gep', 'events.jsonl');
  fs.mkdirSync(path.dirname(events), { recursive: true });
  const ts =
    tsOverride !== undefined
      ? tsOverride
      : new Date(now.getTime() - agedDays * 86_400_000).toISOString();
  const row = {
    event_id: `evt-${Math.random().toString(36).slice(2)}`,
    parent_event_id: null,
    ts,
    agent: 'test-reflector',
    context_hash: contextHash,
  };
  row[eventField] = 'capability_gap';
  fs.appendFileSync(events, JSON.stringify(row) + '\n', 'utf8');
}

test('incubator-ttl: newest event > 30 days → would-archive', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    seedIncubator(tmp, 'stale', 'hash-stale');
    seedEvent(tmp, { contextHash: 'hash-stale', agedDays: 60, now: NOW });
    const results = c.scanIncubator({ baseDir: tmp, now: NOW });
    const r = results.find((x) => x.slug === 'stale');
    assert.ok(r, 'stale result present');
    assert.equal(r.status, 'would-archive');
  } finally {
    rmTmpdir(tmp);
  }
});

test('incubator-ttl: newest event 5 days → kept', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    seedIncubator(tmp, 'fresh', 'hash-fresh');
    seedEvent(tmp, { contextHash: 'hash-fresh', agedDays: 5, now: NOW });
    const results = c.scanIncubator({ baseDir: tmp, now: NOW });
    const r = results.find((x) => x.slug === 'fresh');
    assert.equal(r.status, 'kept');
    assert.equal(
      fs.existsSync(path.join(tmp, '.design/reflections/incubator/fresh')),
      true,
    );
  } finally {
    rmTmpdir(tmp);
  }
});

test('incubator-ttl: refresh resets timer (newest event wins)', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    seedIncubator(tmp, 'refresh-me', 'hash-refresh');
    seedEvent(tmp, { contextHash: 'hash-refresh', agedDays: 31, now: NOW });
    seedEvent(tmp, { contextHash: 'hash-refresh', agedDays: 1, now: NOW });
    const results = c.scanIncubator({ baseDir: tmp, now: NOW });
    const r = results.find((x) => x.slug === 'refresh-me');
    assert.equal(r.status, 'kept', 'newest event (1d) overrides oldest (31d)');
  } finally {
    rmTmpdir(tmp);
  }
});

test('incubator-ttl: no matching capability_gap events → no-events (defensive, not archived)', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    seedIncubator(tmp, 'orphan', 'hash-orphan');
    // Note: no events seeded
    const results = c.scanIncubator({ baseDir: tmp, now: NOW });
    const r = results.find((x) => x.slug === 'orphan');
    assert.equal(r.status, 'no-events');
    assert.equal(
      fs.existsSync(path.join(tmp, '.design/reflections/incubator/orphan')),
      true,
      'orphan should NOT be archived',
    );
  } finally {
    rmTmpdir(tmp);
  }
});

test('incubator-ttl: slug with no draft .md → no-draft', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    seedDirNoDraft(tmp, 'no-md');
    const results = c.scanIncubator({ baseDir: tmp, now: NOW });
    const r = results.find((x) => x.slug === 'no-md');
    assert.equal(r.status, 'no-draft');
  } finally {
    rmTmpdir(tmp);
  }
});

test('incubator-ttl: draft with no context_hash → no-context-hash', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    seedDraftNoFrontmatter(tmp, 'plain');
    const results = c.scanIncubator({ baseDir: tmp, now: NOW });
    const r = results.find((x) => x.slug === 'plain');
    assert.equal(r.status, 'no-context-hash');
  } finally {
    rmTmpdir(tmp);
  }
});

test('incubator-ttl: archive directory created lazily', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    seedIncubator(tmp, 'lazy', 'hash-lazy');
    const archiveRoot = path.join(tmp, '.design/reflections/incubator/archive');
    assert.equal(fs.existsSync(archiveRoot), false, 'archive dir absent before call');
    const { archivePath } = c.archiveSlug({ baseDir: tmp, slug: 'lazy', now: NOW });
    assert.equal(fs.existsSync(archiveRoot), true, 'archive dir created');
    assert.equal(fs.existsSync(archivePath), true, 'slug archived');
    assert.equal(
      fs.existsSync(path.join(tmp, '.design/reflections/incubator/lazy')),
      false,
      'source removed by rename',
    );
  } finally {
    rmTmpdir(tmp);
  }
});

test('incubator-ttl: archive collision appends timestamp suffix', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    const FIXED_TS = new Date('2026-05-19T22:53:11.123Z');
    seedIncubator(tmp, 'collide', 'hash-c');
    const archiveCollide = path.join(tmp, '.design/reflections/incubator/archive/collide');
    fs.mkdirSync(archiveCollide, { recursive: true });
    fs.writeFileSync(path.join(archiveCollide, 'preexisting.md'), 'old\n', 'utf8');
    const { archivePath } = c.archiveSlug({ baseDir: tmp, slug: 'collide', now: FIXED_TS });
    assert.match(archivePath, /collide-20260519-225311/);
    assert.equal(fs.existsSync(archiveCollide), true, 'preexisting archive untouched');
    assert.equal(fs.existsSync(archivePath), true, 'new archive at suffixed path');
    // Pre-existing file preserved
    assert.equal(
      fs.readFileSync(path.join(archiveCollide, 'preexisting.md'), 'utf8'),
      'old\n',
    );
  } finally {
    rmTmpdir(tmp);
  }
});

test('incubator-ttl: dry-run / scanIncubator never mutates filesystem', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    seedIncubator(tmp, 'stale', 'hash-stale');
    seedEvent(tmp, { contextHash: 'hash-stale', agedDays: 60, now: NOW });
    const results = c.scanIncubator({ baseDir: tmp, now: NOW });
    const r = results.find((x) => x.slug === 'stale');
    assert.equal(r.status, 'would-archive');
    // Critical: scanIncubator never mutates
    assert.equal(
      fs.existsSync(path.join(tmp, '.design/reflections/incubator/stale')),
      true,
      'source dir still exists after scan',
    );
    assert.equal(
      fs.existsSync(path.join(tmp, '.design/reflections/incubator/archive')),
      false,
      'archive dir not created by scan',
    );
  } finally {
    rmTmpdir(tmp);
  }
});

test('incubator-ttl: --ttl-days override (7 days) makes 10-day-old stale', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    seedIncubator(tmp, 'tendays', 'hash-t');
    seedEvent(tmp, { contextHash: 'hash-t', agedDays: 10, now: NOW });
    // Under default 30: kept
    const r30 = c.scanIncubator({ baseDir: tmp, ttlDays: 30, now: NOW });
    assert.equal(r30.find((x) => x.slug === 'tendays').status, 'kept');
    // Under override 7: would-archive
    const r7 = c.scanIncubator({ baseDir: tmp, ttlDays: 7, now: NOW });
    assert.equal(r7.find((x) => x.slug === 'tendays').status, 'would-archive');
  } finally {
    rmTmpdir(tmp);
  }
});

test('incubator-ttl: formatTimestamp produces deterministic YYYYMMDD-HHMMSS', () => {
  const ts = c.formatTimestamp(new Date('2026-05-19T22:53:11.123Z'));
  assert.equal(ts, '20260519-225311');
});

test('incubator-ttl: archive operation preserves nested files (atomic rename)', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    const slug = 'nested';
    const dir = seedIncubator(tmp, slug, 'hash-n');
    // Add nested files alongside the draft
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{}\n', 'utf8');
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sub', 'extra.txt'), 'inner\n', 'utf8');
    const { archivePath } = c.archiveSlug({ baseDir: tmp, slug, now: NOW });
    assert.equal(fs.existsSync(path.join(archivePath, 'manifest.json')), true);
    assert.equal(fs.existsSync(path.join(archivePath, 'sub', 'extra.txt')), true);
    assert.equal(
      fs.readFileSync(path.join(archivePath, 'sub', 'extra.txt'), 'utf8'),
      'inner\n',
    );
  } finally {
    rmTmpdir(tmp);
  }
});

test('incubator-ttl: event with type=capability_gap field recognised', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    seedIncubator(tmp, 't-field', 'hash-tf');
    seedEvent(tmp, { contextHash: 'hash-tf', agedDays: 60, now: NOW, eventField: 'type' });
    const results = c.scanIncubator({ baseDir: tmp, now: NOW });
    const r = results.find((x) => x.slug === 't-field');
    assert.equal(r.status, 'would-archive');
  } finally {
    rmTmpdir(tmp);
  }
});

test('incubator-ttl: event with outcome=capability_gap field recognised (Phase 22 compat)', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    seedIncubator(tmp, 'o-field', 'hash-of');
    seedEvent(tmp, { contextHash: 'hash-of', agedDays: 60, now: NOW, eventField: 'outcome' });
    const results = c.scanIncubator({ baseDir: tmp, now: NOW });
    const r = results.find((x) => x.slug === 'o-field');
    assert.equal(r.status, 'would-archive');
  } finally {
    rmTmpdir(tmp);
  }
});

test('incubator-ttl: events with invalid ts (NaN date) silently skipped', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    seedIncubator(tmp, 'badts', 'hash-bad');
    // Inject an invalid timestamp first, then a valid one
    seedEvent(tmp, { contextHash: 'hash-bad', agedDays: 0, now: NOW, tsOverride: 'not-a-date' });
    seedEvent(tmp, { contextHash: 'hash-bad', agedDays: 5, now: NOW });
    const results = c.scanIncubator({ baseDir: tmp, now: NOW });
    const r = results.find((x) => x.slug === 'badts');
    // The valid 5-day-old event determines status → kept
    assert.equal(r.status, 'kept');
  } finally {
    rmTmpdir(tmp);
  }
});

test('incubator-ttl: scanIncubator is deterministic given fixed now', () => {
  const tmp = mkTmpdir('incubator-ttl-');
  try {
    seedIncubator(tmp, 'det-a', 'h-a');
    seedIncubator(tmp, 'det-b', 'h-b');
    seedEvent(tmp, { contextHash: 'h-a', agedDays: 40, now: NOW });
    seedEvent(tmp, { contextHash: 'h-b', agedDays: 5, now: NOW });
    const r1 = c.scanIncubator({ baseDir: tmp, now: NOW });
    const r2 = c.scanIncubator({ baseDir: tmp, now: NOW });
    // Compare deterministic shape — Dates round-trip via toISOString
    const norm = (rs) =>
      rs.map((r) => ({
        slug: r.slug,
        status: r.status,
        contextHash: r.contextHash,
        newestEventIso: r.newestEvent ? r.newestEvent.toISOString() : null,
      }));
    assert.deepEqual(norm(r1), norm(r2));
  } finally {
    rmTmpdir(tmp);
  }
});
