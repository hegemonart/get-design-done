'use strict';
// Phase 40 — collab pure-core units. Covers the 7 dep-free cores under scripts/lib/collab/:
// attribution, section-merge, lock-policy, review-queue, cycle-mode, permissions, sync-backend.
// Each is purity-checked (zero require). Every test tagged `40-05:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.resolve(__dirname, '../../scripts/lib/collab');
const at = require(path.join(DIR, 'attribution.cjs'));
const sm = require(path.join(DIR, 'section-merge.cjs'));
const lp = require(path.join(DIR, 'lock-policy.cjs'));
const rq = require(path.join(DIR, 'review-queue.cjs'));
const cm = require(path.join(DIR, 'cycle-mode.cjs'));
const pm = require(path.join(DIR, 'permissions.cjs'));
const sb = require(path.join(DIR, 'sync-backend.cjs'));

// ── attribution ──────────────────────────────────────────────────────────────
test('40-05: attribution parses + round-trips the [author= co-author=] suffix', () => {
  const d = at.parseDecisionLine('D-07: Use OKLCH (locked) [author=alice co-author=hone-9f]');
  assert.deepEqual(d, { id: 'D-07', text: 'Use OKLCH', status: 'locked', author: 'alice', coAuthor: 'hone-9f' });
  assert.equal(at.formatDecisionLine(d), 'D-07: Use OKLCH (locked) [author=alice co-author=hone-9f]');
  const plain = at.parseDecisionLine('D-01: plain (tentative)');
  assert.equal(plain.author, null);
  assert.equal(at.formatDecisionLine(plain), 'D-01: plain (tentative)');
  assert.equal(at.parseDecisionLine('not a decision'), null);
});
test('40-05: attribution groupByAuthor + parseDecisionsBlock', () => {
  const g = at.groupByAuthor([{ id: 'D-1', author: 'a' }, { id: 'D-2' }]);
  assert.deepEqual(Object.keys(g).sort(), ['<unattributed>', 'a']);
  const parsed = at.parseDecisionsBlock('D-1: x (locked)\n<!-- comment -->\n\nD-2: y (tentative) [author=b]');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].author, 'b');
});

// ── section-merge ────────────────────────────────────────────────────────────
test('40-05: section-merge unions new D-NN from both sides, no conflict', () => {
  const base = [{ id: 'D-1', text: 'x', status: 'locked' }];
  const ours = [{ id: 'D-1', text: 'x', status: 'locked' }, { id: 'D-3', text: 'o' }];
  const theirs = [{ id: 'D-1', text: 'x', status: 'locked' }, { id: 'D-4', text: 't' }];
  const r = sm.mergeDecisions(base, ours, theirs);
  assert.deepEqual(r.merged.map((d) => d.id), ['D-1', 'D-3', 'D-4']);
  assert.equal(r.conflicts.length, 0);
  assert.deepEqual(r.added.sort(), ['D-3', 'D-4']);
});
test('40-05: section-merge flags same-id divergence as the only conflict', () => {
  const r = sm.mergeDecisions([], [{ id: 'D-1', text: 'A' }], [{ id: 'D-1', text: 'B' }]);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].id, 'D-1');
  // a decision removed on one side but unchanged on the other is kept (durable)
  const keep = sm.mergeDecisions([{ id: 'D-9', text: 'x' }], [{ id: 'D-9', text: 'x' }], []);
  assert.ok(keep.merged.some((d) => d.id === 'D-9'), 'durable: not auto-deleted');
  assert.deepEqual(sm.mergeStatusScalar('a', 'a', 'c'), { value: 'c', conflict: false });
  assert.equal(sm.mergeStatusScalar('a', 'b', 'c').conflict, true);
});

// ── lock-policy ──────────────────────────────────────────────────────────────
test('40-05: lock-policy team mode widens the acquire window', () => {
  assert.deepEqual(lp.acquireOpts({}), { staleMs: 60000, maxWaitMs: 5000, pollMs: 50 });
  assert.equal(lp.acquireOpts({ collab: { multi_writer_enabled: true } }).maxWaitMs, 30000);
  assert.equal(lp.acquireOpts({ collab: { multi_writer_enabled: true, lock_timeout_ms: 12000 } }).maxWaitMs, 12000);
  assert.equal(lp.isMultiWriter({ collab: { multi_writer_enabled: true } }), true);
});

// ── review-queue ─────────────────────────────────────────────────────────────
test('40-05: review-queue transitions + hard lock + audited unlock', () => {
  assert.equal(rq.transition('proposed', 'reviewing'), 'reviewing');
  assert.equal(rq.transition('approved', 'locked'), 'locked');
  assert.throws(() => rq.transition('locked', 'reviewing'), /illegal transition/);
  assert.equal(rq.canAmend('locked'), false);
  assert.equal(rq.canAmend('reviewing'), true);
  const u = rq.unlock({ id: 'D-1', state: 'locked', audit: [] }, { approver: 'lead', reason: 'r' });
  assert.equal(u.state, 'reviewing');
  assert.equal(u.audit[0].approver, 'lead');
  assert.throws(() => rq.unlock({ state: 'locked' }, { approver: '' }), /approver/);
  assert.throws(() => rq.unlock({ state: 'reviewing' }, { approver: 'x' }), /locked/);
  assert.deepEqual(rq.pending([{ state: 'locked' }, { state: 'proposed' }]).length, 1);
});

// ── cycle-mode ───────────────────────────────────────────────────────────────
test('40-05: cycle-mode gates stages by role', () => {
  assert.equal(cm.stagePermitted('designer', 'brief'), true);
  assert.equal(cm.stagePermitted('designer', 'plan'), false);
  assert.equal(cm.stagePermitted('dev', 'design'), true);
  assert.equal(cm.stagePermitted('dev', 'explore'), false);
  assert.equal(cm.stagePermitted('full', 'verify'), true);
  assert.equal(cm.stagePermitted('full', 'bogus'), false);
  assert.equal(cm.resolveMode({}), 'full');
  assert.equal(cm.normalizeMode('junk'), 'full');
});

// ── permissions ──────────────────────────────────────────────────────────────
test('40-05: permissions permissive by default; rules restrict; viewer denied', () => {
  assert.equal(pm.can({}, '@x', 'decisions', 'write'), true, 'no config = allowed');
  const cfg = { permissions: { default: 'contributor', actors: { '@lead': 'owner' }, rules: [{ section: 'decisions', action: 'lock', roles: ['owner'] }] } };
  assert.equal(pm.can(cfg, '@bob', 'decisions', 'lock'), false, 'contributor cannot lock');
  assert.equal(pm.can(cfg, '@lead', 'decisions', 'lock'), true, 'owner can lock');
  assert.equal(pm.can(cfg, '@bob', 'decisions', 'write'), true, 'unruled action allowed');
  assert.equal(pm.can({ permissions: { actors: { '@v': 'viewer' } } }, '@v', 'status', 'write'), false, 'viewer never mutates');
  assert.equal(pm.roleOf({}, '@anyone'), 'owner');
});

// ── sync-backend ─────────────────────────────────────────────────────────────
test('40-05: sync-backend defaults to git; s3/git-lfs are opt-in declarations', () => {
  assert.deepEqual(sb.resolveBackend({}), { backend: 'git', optIn: false, supported: true });
  assert.deepEqual(sb.resolveBackend({ collab: { sync_backend: 's3' } }), { backend: 's3', optIn: true, supported: false });
  assert.equal(sb.isOptIn({ collab: { sync_backend: 'git-lfs' } }), true);
  assert.equal(sb.resolveBackend({ collab: { sync_backend: 'bogus' } }).backend, 'git', 'unknown → git');
});

// ── purity ───────────────────────────────────────────────────────────────────
test('40-05: all 7 collab cores are pure (zero require)', () => {
  for (const f of ['attribution', 'section-merge', 'lock-policy', 'review-queue', 'cycle-mode', 'permissions', 'sync-backend']) {
    const src = fs.readFileSync(path.join(DIR, `${f}.cjs`), 'utf8');
    assert.doesNotMatch(src, /\brequire\s*\(/, `${f}.cjs must not require anything`);
  }
});
