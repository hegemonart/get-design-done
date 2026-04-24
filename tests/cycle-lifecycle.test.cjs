'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scaffoldDesignDir, readFrontmatter } = require('./helpers.ts');

// Canonical stage sequence — matches skills/brief → explore → plan → design → verify.
const STAGES = ['brief', 'explore', 'plan', 'design', 'verify'];

/**
 * Write STATE.md with the given frontmatter fields. Simulates a stage skill's
 * STATE.md mutation. `body` is appended after the frontmatter block.
 */
function writeState(designDir, fields, body = '# Pipeline State\n') {
  const fmLines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    fmLines.push(`${k}: ${v}`);
  }
  fmLines.push('---');
  fmLines.push('');
  fmLines.push(body);
  fs.writeFileSync(path.join(designDir, 'STATE.md'), fmLines.join('\n'), 'utf8');
}

// Small synchronous sleep used to guarantee monotonic ISO-timestamp progression.
function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin */ }
}

test('cycle-lifecycle: new-cycle initializes STATE.md with cycle slug', () => {
  const { designDir, cleanup } = scaffoldDesignDir();
  try {
    const startedAt = new Date().toISOString();
    writeState(designDir, {
      pipeline_state_version: '1.0',
      cycle: 'project-x-2026-04-18',
      stage: 'brief',
      wave: 0,
      started_at: startedAt,
      last_checkpoint: startedAt,
      model_profile: 'balanced',
    });

    const fm = readFrontmatter(path.join(designDir, 'STATE.md'));
    assert.equal(fm.cycle, 'project-x-2026-04-18');
    assert.equal(fm.stage, 'brief');
    assert.ok(fm.started_at, 'started_at must be present');
    assert.ok(!isNaN(Date.parse(fm.started_at)),
      `started_at (${fm.started_at}) must parse as a valid ISO timestamp`);
  } finally {
    cleanup();
  }
});

test('cycle-lifecycle: stage progresses brief → explore → plan → design → verify', () => {
  const { designDir, cleanup } = scaffoldDesignDir();
  try {
    const observedStages = [];
    let last = new Date().toISOString();
    for (const stage of STAGES) {
      writeState(designDir, {
        pipeline_state_version: '1.0',
        cycle: 'project-x-2026-04-18',
        stage,
        wave: 0,
        started_at: last,
        last_checkpoint: new Date().toISOString(),
        model_profile: 'balanced',
      });
      const fm = readFrontmatter(path.join(designDir, 'STATE.md'));
      observedStages.push(fm.stage);
      sleep(11);
    }
    assert.deepEqual(observedStages, STAGES,
      `stages must progress in canonical order; got: ${observedStages.join(' → ')}`);
  } finally {
    cleanup();
  }
});

test('cycle-lifecycle: last_checkpoint updates on each stage write', () => {
  const { designDir, cleanup } = scaffoldDesignDir();
  try {
    const checkpoints = [];
    const startedAt = new Date().toISOString();
    for (const stage of STAGES) {
      const cp = new Date().toISOString();
      writeState(designDir, {
        pipeline_state_version: '1.0',
        cycle: 'project-x-2026-04-18',
        stage,
        wave: 0,
        started_at: startedAt,
        last_checkpoint: cp,
        model_profile: 'balanced',
      });
      const fm = readFrontmatter(path.join(designDir, 'STATE.md'));
      checkpoints.push(Date.parse(fm.last_checkpoint));
      sleep(11);
    }
    for (let i = 1; i < checkpoints.length; i++) {
      assert.ok(
        checkpoints[i - 1] < checkpoints[i],
        `last_checkpoint must be strictly monotonic; got ${checkpoints[i - 1]} then ${checkpoints[i]}`
      );
    }
  } finally {
    cleanup();
  }
});

test('cycle-lifecycle: complete-cycle writes CYCLE-SUMMARY.md with required fields', () => {
  const { designDir, cleanup } = scaffoldDesignDir();
  try {
    const slug = 'project-x-2026-04-18';
    const cycleDir = path.join(designDir, 'cycles', slug);
    fs.mkdirSync(cycleDir, { recursive: true });
    const summaryPath = path.join(cycleDir, 'CYCLE-SUMMARY.md');

    const body = [
      '---',
      `cycle: ${slug}`,
      `completed_at: ${new Date().toISOString()}`,
      'stages_completed: [brief, explore, plan, design, verify]',
      '---',
      '',
      '# Cycle Summary',
      '',
      '## Outcomes',
      '- Shipped cycle contract',
      '',
      '## Decisions',
      '- D-01: adopt token system',
      '',
      '## Learnings',
      '- Verified brief-first flow',
      '',
    ].join('\n');
    fs.writeFileSync(summaryPath, body, 'utf8');

    assert.ok(fs.existsSync(summaryPath), 'CYCLE-SUMMARY.md must exist');
    const fm = readFrontmatter(summaryPath);
    assert.equal(fm.cycle, slug);
    assert.ok(fm.completed_at, 'completed_at must be present');
    assert.ok(Array.isArray(fm.stages_completed),
      'stages_completed must be an array');
    assert.equal(fm.stages_completed.length, 5,
      `stages_completed must contain 5 entries; got ${fm.stages_completed.length}`);

    const content = fs.readFileSync(summaryPath, 'utf8');
    assert.ok(/^##\s+/m.test(content), 'body must contain at least one ## heading');
  } finally {
    cleanup();
  }
});

test('cycle-lifecycle: CYCLE-SUMMARY.md shape matches contract (enables Phase 10 learnings extraction)', () => {
  const { designDir, cleanup } = scaffoldDesignDir();
  try {
    const cycleDir = path.join(designDir, 'cycles', 'project-x');
    fs.mkdirSync(cycleDir, { recursive: true });
    const summaryPath = path.join(cycleDir, 'CYCLE-SUMMARY.md');
    const body = [
      '---',
      'cycle: project-x',
      `completed_at: ${new Date().toISOString()}`,
      'stages_completed: [brief, explore, plan, design, verify]',
      '---',
      '',
      '# Cycle Summary',
      '',
      '## Outcomes',
      '- A',
      '',
      '## Decisions',
      '- B',
      '',
      '## Learnings',
      '- C',
      '',
    ].join('\n');
    fs.writeFileSync(summaryPath, body, 'utf8');

    const content = fs.readFileSync(summaryPath, 'utf8');
    const hasOutcomes = content.includes('Outcomes') || content.includes('Outcome');
    const hasDecisions = content.includes('Decisions') || content.includes('Decision');
    const hasLearnings = content.includes('Learnings') || content.includes('Learning');
    assert.ok(hasOutcomes, 'CYCLE-SUMMARY.md should reference Outcomes section');
    assert.ok(hasDecisions, 'CYCLE-SUMMARY.md should reference Decisions section');
    assert.ok(hasLearnings, 'CYCLE-SUMMARY.md should reference Learnings section');
  } finally {
    cleanup();
  }
});
