'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scaffoldDesignDir } = require('./helpers.ts');

/**
 * Parse task blocks from a DESIGN-PLAN.md-shaped markdown string.
 * Returns an array of { taskId, touches: string[] }.
 */
function parsePlan(content) {
  const taskBlocks = content.split(/^###\s+Task\s+/m).slice(1);
  return taskBlocks.map(block => {
    const idMatch = block.match(/^(\S+)/);
    const touchesMatch = block.match(/^Touches:\s*(.*)$/m);
    const touches = touchesMatch
      ? touchesMatch[1].split(',').map(s => s.trim()).filter(Boolean)
      : [];
    return { taskId: idMatch ? idMatch[1] : null, touches };
  });
}

/**
 * Given an array of touches lists, return:
 *   { disjoint: boolean, overlaps: string[] }
 * `overlaps` contains file paths that appear in two or more lists.
 */
function analyzeSets(touchesList) {
  const counts = {};
  for (const list of touchesList) {
    for (const f of list) counts[f] = (counts[f] || 0) + 1;
  }
  const overlaps = Object.keys(counts).filter(k => counts[k] > 1);
  return { disjoint: overlaps.length === 0, overlaps };
}

const PLAN_FIXTURE = `# DESIGN PLAN

## Wave 1

### Task 1A — Update Button
Type: design
Scope: component-styling
Touches: src/Button.tsx, src/theme.ts
Parallel: yes
Acceptance: Button uses theme tokens

### Task 1B — Update Card
Type: design
Scope: component-styling
Touches: src/Card.tsx
Parallel: yes
Acceptance: Card uses theme tokens
`;

test('touches-analysis: parse Touches field from plan markdown', () => {
  const { dir, designDir, cleanup } = scaffoldDesignDir();
  try {
    const planPath = path.join(designDir, 'DESIGN-PLAN.md');
    fs.writeFileSync(planPath, PLAN_FIXTURE, 'utf8');

    const tasks = parsePlan(fs.readFileSync(planPath, 'utf8'));
    assert.equal(tasks.length, 2, 'two tasks expected');
    assert.equal(tasks[0].taskId, '1A');
    assert.deepEqual(tasks[0].touches, ['src/Button.tsx', 'src/theme.ts']);
    assert.equal(tasks[1].taskId, '1B');
    assert.deepEqual(tasks[1].touches, ['src/Card.tsx']);
  } finally {
    cleanup();
  }
});

test('touches-analysis: disjoint set detection', () => {
  const result = analyzeSets([['src/X.tsx'], ['src/Y.tsx']]);
  assert.deepEqual(result, { disjoint: true, overlaps: [] });
});

test('touches-analysis: overlapping set detection', () => {
  const result = analyzeSets([['src/X.tsx', 'src/theme.ts'], ['src/theme.ts']]);
  assert.equal(result.disjoint, false);
  assert.deepEqual(result.overlaps, ['src/theme.ts']);
});

test('touches-analysis: blank or missing Touches field is handled', () => {
  const planNoTouches = `## Wave 1

### Task 1A — No Touches Field
Type: design
Scope: component-styling
Parallel: yes
Acceptance: Does something
`;
  const tasks = parsePlan(planNoTouches);
  assert.equal(tasks.length, 1);
  assert.deepEqual(tasks[0].touches, [],
    'missing Touches: line must yield an empty array (not null, not error)');
});

test('touches-analysis: trailing whitespace and comma-spacing tolerated', () => {
  const a = parsePlan(`### Task A
Touches: src/X.tsx ,src/Y.tsx
`);
  const b = parsePlan(`### Task B
Touches:src/X.tsx, src/Y.tsx
`);
  assert.deepEqual(a[0].touches, ['src/X.tsx', 'src/Y.tsx']);
  assert.deepEqual(b[0].touches, ['src/X.tsx', 'src/Y.tsx']);
  assert.deepEqual(a[0].touches, b[0].touches,
    'both spacing variants must parse to the same array');
});
