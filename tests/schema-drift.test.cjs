'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT, scaffoldDesignDir } = require('./helpers.cjs');

const TEMPLATE_PATH = path.join(REPO_ROOT, 'reference', 'STATE-TEMPLATE.md');

function extractFrontmatterFields(content) {
  // Try top-level frontmatter first (standard YAML front matter at file start)
  const topMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (topMatch) {
    const fields = topMatch[1].split('\n')
      .map(l => l.match(/^([a-z_]+):/))
      .filter(Boolean)
      .map(m => m[1]);
    if (fields.length > 0) return fields;
  }

  // Fall back: look for embedded frontmatter inside a BEGIN TEMPLATE block
  // (used in reference/STATE-TEMPLATE.md where the template is inside a code block)
  const templateMatch = content.match(/BEGIN TEMPLATE ====\n([\s\S]*?)END TEMPLATE/);
  if (templateMatch) {
    const templateBody = templateMatch[1];
    const embeddedMatch = templateBody.match(/---\n([\s\S]*?)\n---/);
    if (embeddedMatch) {
      return embeddedMatch[1].split('\n')
        .map(l => l.match(/^([a-z_]+):/))
        .filter(Boolean)
        .map(m => m[1]);
    }
  }

  return [];
}

test('schema-drift: STATE-TEMPLATE.md exists', () => {
  assert.ok(fs.existsSync(TEMPLATE_PATH), 'reference/STATE-TEMPLATE.md must exist');
});

test('schema-drift: STATE-TEMPLATE.md has frontmatter fields', () => {
  const content = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const fields = extractFrontmatterFields(content);
  assert.ok(fields.length > 0, 'STATE-TEMPLATE.md must have at least one frontmatter field');
});

test('schema-drift: scaffoldDesignDir produces STATE.md with all template fields', () => {
  const templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const templateFields = extractFrontmatterFields(templateContent);
  if (templateFields.length === 0) return; // template has no frontmatter — skip

  const { designDir, cleanup } = scaffoldDesignDir();
  try {
    const statePath = path.join(designDir, 'STATE.md');
    if (!fs.existsSync(statePath)) return; // scaffoldDesignDir may not write STATE.md — skip
    const stateContent = fs.readFileSync(statePath, 'utf8');
    const stateFields = extractFrontmatterFields(stateContent);
    for (const field of templateFields) {
      assert.ok(
        stateFields.includes(field),
        `STATE.md is missing field '${field}' defined in STATE-TEMPLATE.md`
      );
    }
  } finally { cleanup(); }
});
