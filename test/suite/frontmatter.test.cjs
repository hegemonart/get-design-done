'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readFrontmatter } = require('./helpers.ts');

function tmpMd(content) {
  const f = path.join(os.tmpdir(), `gdd-fm-test-${Date.now()}.md`);
  fs.writeFileSync(f, content, 'utf8');
  return { path: f, cleanup: () => { try { fs.unlinkSync(f); } catch {} } };
}

test('frontmatter: parses simple key-value', () => {
  const { path: p, cleanup } = tmpMd('---\nname: my-agent\ncolor: blue\n---\n# body');
  try {
    const fm = readFrontmatter(p);
    assert.equal(fm.name, 'my-agent');
    assert.equal(fm.color, 'blue');
  } finally { cleanup(); }
});

test('frontmatter: parses quoted string value', () => {
  const { path: p, cleanup } = tmpMd('---\ndescription: "Agent that does things"\n---\n');
  try {
    const fm = readFrontmatter(p);
    assert.equal(fm.description, 'Agent that does things');
  } finally { cleanup(); }
});

test('frontmatter: parses inline array', () => {
  const { path: p, cleanup } = tmpMd('---\ntools: [Read, Write, Bash]\n---\n');
  try {
    const fm = readFrontmatter(p);
    assert.ok(Array.isArray(fm.tools));
    assert.deepEqual(fm.tools, ['Read', 'Write', 'Bash']);
  } finally { cleanup(); }
});

test('frontmatter: parses boolean true/false', () => {
  const { path: p, cleanup } = tmpMd('---\nreads-only: true\nwrites: false\n---\n');
  try {
    const fm = readFrontmatter(p);
    assert.equal(fm['reads-only'], true);
    assert.equal(fm.writes, false);
  } finally { cleanup(); }
});

test('frontmatter: handles Windows CRLF line endings', () => {
  const { path: p, cleanup } = tmpMd('---\r\nname: crlfagent\r\ncolor: red\r\n---\r\n# body');
  try {
    const fm = readFrontmatter(p);
    assert.equal(fm.name, 'crlfagent');
    assert.equal(fm.color, 'red');
  } finally { cleanup(); }
});

test('frontmatter: returns empty object when no frontmatter', () => {
  const { path: p, cleanup } = tmpMd('# Just a markdown file\nNo frontmatter here.');
  try {
    const fm = readFrontmatter(p);
    assert.deepEqual(fm, {});
  } finally { cleanup(); }
});
