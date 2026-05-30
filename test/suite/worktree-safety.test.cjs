'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scaffoldDesignDir } = require('./helpers.ts');

test('worktree-safety: two separate .design/ directories do not share STATE.md', () => {
  const worktree1 = scaffoldDesignDir({ stateContent: '---\nstage: scan\n---\n' });
  const worktree2 = scaffoldDesignDir({ stateContent: '---\nstage: design\n---\n' });
  try {
    const state1 = fs.readFileSync(path.join(worktree1.designDir, 'STATE.md'), 'utf8');
    const state2 = fs.readFileSync(path.join(worktree2.designDir, 'STATE.md'), 'utf8');
    assert.notEqual(state1, state2, 'Two worktrees must have independent STATE.md files');
    assert.ok(state1.includes('stage: scan'), 'Worktree 1 must have its own stage');
    assert.ok(state2.includes('stage: design'), 'Worktree 2 must have its own stage');
  } finally {
    worktree1.cleanup();
    worktree2.cleanup();
  }
});

test('worktree-safety: writing to one .design/ does not affect another', () => {
  const wt1 = scaffoldDesignDir();
  const wt2 = scaffoldDesignDir();
  try {
    // Write to wt1
    fs.writeFileSync(path.join(wt1.designDir, 'STATE.md'), '---\nstage: verify\n---\n', 'utf8');
    // wt2 must be unchanged
    const wt2State = fs.readFileSync(path.join(wt2.designDir, 'STATE.md'), 'utf8');
    assert.ok(!wt2State.includes('stage: verify'),
      'Writing to wt1 STATE.md must not affect wt2 STATE.md');
  } finally {
    wt1.cleanup();
    wt2.cleanup();
  }
});
