// tests/touches-pattern-miner.test.cjs — Plan 23-06 pattern miner
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } =
  require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  mine,
  writeProposals,
  canonicalize,
  stripCycleSlugs,
  DEFAULT_OUT_PATH,
} = require('../scripts/lib/touches-pattern-miner.cjs');

function seedFixture() {
  const root = mkdtempSync(join(tmpdir(), 'gdd-miner-'));
  const archive = join(root, '.design', 'archive');
  // Two cycles, 2 tasks each.
  const cycle1 = join(archive, 'cycle-2026-04-01', 'tasks');
  const cycle2 = join(archive, 'cycle-2026-04-08', 'tasks');
  mkdirSync(cycle1, { recursive: true });
  mkdirSync(cycle2, { recursive: true });
  // Shared signature (occurs 3 times across both cycles):
  writeFileSync(
    join(cycle1, 'task-a.md'),
    '# A\n\nTouches: src/components/Button.tsx, src/components/Card.tsx\n',
  );
  writeFileSync(
    join(cycle1, 'task-b.md'),
    '# B\n\nTouches: src/components/Card.tsx, src/components/Button.tsx\n',
  );
  writeFileSync(
    join(cycle2, 'task-c.md'),
    '# C\n\nTouches: src/components/Button.tsx, src/components/Card.tsx\n',
  );
  // Unique signature (one cycle, one task):
  writeFileSync(
    join(cycle2, 'task-d.md'),
    '# D\n\nTouches: scripts/foo.ts\n',
  );
  return root;
}

test('23-06: canonicalize lowers, dedups, sorts, joins with comma', () => {
  assert.equal(canonicalize(['B.ts', 'a.ts', 'A.ts']), 'a.ts,b.ts');
});

test('23-06: canonicalize replaces backslashes', () => {
  assert.equal(canonicalize(['src\\Foo.ts', 'src/Foo.ts']), 'src/foo.ts');
});

test('23-06: canonicalize empty input → empty signature', () => {
  assert.equal(canonicalize([]), '');
  assert.equal(canonicalize(null), '');
});

test('23-06: stripCycleSlugs replaces dated and slug cycle segments', () => {
  assert.equal(
    stripCycleSlugs('.design/archive/cycle-2026-04-01/tasks/x.md'),
    '.design/archive/<cycle>/tasks/x.md',
  );
  assert.equal(
    stripCycleSlugs('cycle-foo-bar/files/y.md'),
    '<cycle>/files/y.md',
  );
});

test('23-06: mine surfaces signature recurring 3 tasks across 2 cycles', async () => {
  const root = seedFixture();
  try {
    const proposal = await mine({ cwd: root });
    assert.equal(proposal.schema_version, '1.0.0');
    assert.equal(proposal.thresholds.minTasks, 3);
    assert.equal(proposal.thresholds.minCycles, 2);
    assert.equal(proposal.proposals.length, 1, JSON.stringify(proposal, null, 2));
    const top = proposal.proposals[0];
    assert.equal(top.taskCount, 3);
    assert.equal(top.cycleCount, 2);
    assert.deepEqual(
      top.globs,
      ['src/components/button.tsx', 'src/components/card.tsx'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('23-06: minTasks threshold prunes proposals below cutoff', async () => {
  const root = seedFixture();
  try {
    const proposal = await mine({ cwd: root, minTasks: 4 });
    assert.equal(proposal.proposals.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('23-06: minCycles threshold prunes proposals below cutoff', async () => {
  const root = seedFixture();
  try {
    const proposal = await mine({ cwd: root, minCycles: 3 });
    assert.equal(proposal.proposals.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('23-06: mine returns empty envelope when archive dir missing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gdd-miner-empty-'));
  try {
    const proposal = await mine({ cwd: root });
    assert.equal(proposal.proposals.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('23-06: writeProposals atomic + idempotent', async () => {
  const root = seedFixture();
  try {
    const proposal = await mine({ cwd: root });
    const p1 = writeProposals(proposal, { cwd: root });
    assert.ok(existsSync(p1));
    assert.match(p1, /touches-patterns\.json$/);
    const written1 = JSON.parse(readFileSync(p1, 'utf8'));
    assert.equal(written1.proposals.length, 1);
    // Second write replaces; .tmp must not linger.
    const p2 = writeProposals(proposal, { cwd: root });
    assert.equal(p2, p1);
    assert.ok(!existsSync(p1 + '.tmp'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('23-06: writeProposals creates parent dirs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gdd-miner-mkdir-'));
  try {
    const env = await mine({ cwd: root });
    const p = writeProposals(env, { cwd: root });
    assert.ok(p.endsWith(DEFAULT_OUT_PATH.replace(/\//g, require('node:path').sep)) ||
              p.endsWith('touches-patterns.json'));
    assert.ok(existsSync(p));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
