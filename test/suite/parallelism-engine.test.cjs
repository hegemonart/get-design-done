'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.ts');

/**
 * Reference implementation of the parallelism decision engine. The canonical
 * rules live in reference/parallelism-rules.md as prose; Phase 13+ may extract
 * this into production code. The test carries an explicit mirror so the test
 * itself is self-contained and reviewable.
 *
 * Contract:
 *  - If ANY task has parallel_safe === 'never' OR settings.max_parallel < 2,
 *    return serial (each task in its own wave, original order).
 *  - Otherwise, greedy wave-packing: place each task in the first wave where
 *    its `touches` are disjoint from every task already in that wave, subject
 *    to wave size <= settings.max_parallel. Start a new wave if no wave fits.
 *  - mode === 'parallel' iff at least one wave has more than one task.
 */
function decide(tasks, settings) {
  if (tasks.some(t => t.parallel_safe === 'never') || settings.max_parallel < 2) {
    return { mode: 'serial', waves: tasks.map(t => [t.id]) };
  }
  const waves = [];
  for (const t of tasks) {
    let placed = false;
    for (const w of waves) {
      const conflict = w.some(other => other.touches.some(f => t.touches.includes(f)));
      if (!conflict && w.length < settings.max_parallel) {
        w.push(t);
        placed = true;
        break;
      }
    }
    if (!placed) waves.push([t]);
  }
  return {
    mode: waves.some(w => w.length > 1) ? 'parallel' : 'serial',
    waves: waves.map(w => w.map(t => t.id)),
  };
}

const CASES = [
  {
    name: 'two tasks with disjoint touches → parallel',
    tasks: [
      { id: 'A', touches: ['src/Button.tsx'], parallel_safe: 'always' },
      { id: 'B', touches: ['src/Card.tsx'],   parallel_safe: 'always' },
    ],
    settings: { max_parallel: 4 },
    expected: { mode: 'parallel', waves: [['A', 'B']] },
  },
  {
    name: 'two tasks with overlapping touches → serial',
    tasks: [
      { id: 'A', touches: ['src/Button.tsx', 'src/theme.ts'], parallel_safe: 'always' },
      { id: 'B', touches: ['src/theme.ts'],                    parallel_safe: 'always' },
    ],
    settings: { max_parallel: 4 },
    expected: { mode: 'serial', waves: [['A'], ['B']] },
  },
  {
    name: "task with parallel_safe: 'never' → serial regardless of touches",
    tasks: [
      { id: 'A', touches: ['src/X.tsx'], parallel_safe: 'never' },
      { id: 'B', touches: ['src/Y.tsx'], parallel_safe: 'always' },
    ],
    settings: { max_parallel: 4 },
    expected: { mode: 'serial', waves: [['A'], ['B']] },
  },
  {
    name: 'max_parallel: 1 forces serial even with disjoint touches',
    tasks: [
      { id: 'A', touches: ['src/X.tsx'], parallel_safe: 'always' },
      { id: 'B', touches: ['src/Y.tsx'], parallel_safe: 'always' },
    ],
    settings: { max_parallel: 1 },
    expected: { mode: 'serial', waves: [['A'], ['B']] },
  },
  {
    name: 'three tasks, one overlap → two waves',
    tasks: [
      { id: 'A', touches: ['src/X.tsx'],                 parallel_safe: 'always' },
      { id: 'B', touches: ['src/Y.tsx', 'src/theme.ts'], parallel_safe: 'always' },
      { id: 'C', touches: ['src/theme.ts'],              parallel_safe: 'always' },
    ],
    settings: { max_parallel: 4 },
    expected: { mode: 'parallel', waves: [['A', 'B'], ['C']] },
  },
];

test('parallelism-engine: reference/parallelism-rules.md exists', () => {
  const p = path.join(REPO_ROOT, 'reference', 'parallelism-rules.md');
  assert.ok(fs.existsSync(p),
    'reference/parallelism-rules.md must exist — engine cases mirror its rules');
});

for (const c of CASES) {
  test(`parallelism-engine: ${c.name}`, () => {
    const result = decide(c.tasks, c.settings);
    assert.deepEqual(result, c.expected, c.name);
  });
}
