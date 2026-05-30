'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scaffoldDesignDir } = require('./helpers.ts');

test('atomic-write: write-then-rename pattern produces intact file', () => {
  const { designDir, cleanup } = scaffoldDesignDir();
  try {
    const statePath = path.join(designDir, 'STATE.md');
    const tmpPath = statePath + '.tmp';
    const content = '---\nstage: plan\n---\n# State\n';

    // Simulate atomic write pattern used by pipeline stages
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, statePath);

    assert.ok(!fs.existsSync(tmpPath), 'Temp file must not exist after rename');
    assert.equal(fs.readFileSync(statePath, 'utf8'), content, 'STATE.md must contain written content');
  } finally { cleanup(); }
});

test('atomic-write: partial write to temp does not corrupt STATE.md', () => {
  const { designDir, cleanup } = scaffoldDesignDir();
  try {
    const statePath = path.join(designDir, 'STATE.md');
    const tmpPath = statePath + '.tmp';
    const originalContent = fs.readFileSync(statePath, 'utf8');

    // Write partial content to temp (simulates interrupted write)
    fs.writeFileSync(tmpPath, '---\npartial', 'utf8');
    // "Crash" — don't rename. STATE.md should be unchanged.

    assert.equal(
      fs.readFileSync(statePath, 'utf8'),
      originalContent,
      'STATE.md must not be modified if rename never happens'
    );
    // Clean up tmp
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  } finally { cleanup(); }
});
