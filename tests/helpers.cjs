'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

// Root of the get-design-done plugin repo
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Create a temporary .design/ directory with a minimal STATE.md.
 * Returns { dir, designDir, cleanup } where dir is the temp path and cleanup() deletes it.
 */
function scaffoldDesignDir(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-test-'));
  const designDir = path.join(dir, '.design');
  fs.mkdirSync(designDir, { recursive: true });

  const defaultState = [
    '---',
    'pipeline_state_version: 1.0',
    'stage: scan',
    'cycle: default',
    'wave: 1',
    'started_at: 1970-01-01T00:00:00Z',
    'last_checkpoint: 1970-01-01T00:00:00Z',
    'model_profile: balanced',
    '---',
    '',
    '# Pipeline State',
  ].join('\n');

  fs.writeFileSync(
    path.join(designDir, 'STATE.md'),
    overrides.stateContent ?? defaultState,
    'utf8'
  );

  if (overrides.configContent) {
    fs.writeFileSync(path.join(designDir, 'config.json'), overrides.configContent, 'utf8');
  }

  return {
    dir,
    designDir,
    cleanup() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns an object of key→value pairs from the --- ... --- block.
 * Handles: string values, quoted strings, arrays (inline and block), booleans.
 */
function readFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const raw = match[1];
  const result = {};
  const lines = raw.split('\n');
  let currentKey = null;
  let arrayAccum = null;

  for (const line of lines) {
    // Block array item
    if (arrayAccum !== null && /^\s+-\s+/.test(line)) {
      arrayAccum.push(line.replace(/^\s+-\s+/, '').trim());
      continue;
    }
    // End of block array
    if (arrayAccum !== null && !/^\s+-\s+/.test(line) && line.trim() !== '') {
      result[currentKey] = arrayAccum;
      arrayAccum = null;
    }

    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (!kvMatch) continue;

    const [, key, raw_val] = kvMatch;
    currentKey = key;
    const val = raw_val.trim();

    if (val === '') {
      // Start block array
      arrayAccum = [];
      result[key] = [];
    } else if (val.startsWith('[')) {
      // Inline array
      result[key] = val
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      arrayAccum = null;
    } else if (val === 'true') {
      result[key] = true;
      arrayAccum = null;
    } else if (val === 'false') {
      result[key] = false;
      arrayAccum = null;
    } else {
      result[key] = val.replace(/^['"]|['"]$/g, '');
      arrayAccum = null;
    }
  }

  // Flush trailing array
  if (arrayAccum !== null && currentKey) {
    result[currentKey] = arrayAccum;
  }

  return result;
}

/**
 * Count the number of lines in a file (newline-delimited, trailing newline ignored).
 */
function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  // Ignore trailing empty line from trailing newline
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

/**
 * Create a minimal mock object that simulates MCP tool responses.
 * Pass name (string) and responses (object: toolName → returnValue).
 * Returns an object with a call(toolName, args) method and a calls[] log.
 */
function mockMCP(name, responses = {}) {
  const mock = {
    name,
    calls: [],
    call(toolName, args = {}) {
      mock.calls.push({ toolName, args });
      if (toolName in responses) {
        const resp = responses[toolName];
        return typeof resp === 'function' ? resp(args) : resp;
      }
      throw new Error(`mockMCP(${name}): unexpected tool call "${toolName}"`);
    },
    assertCalled(toolName) {
      const found = mock.calls.some(c => c.toolName === toolName);
      if (!found) {
        throw new Error(`mockMCP(${name}): expected "${toolName}" to be called, but it wasn't`);
      }
    },
    assertNotCalled(toolName) {
      const found = mock.calls.some(c => c.toolName === toolName);
      if (found) {
        throw new Error(`mockMCP(${name}): expected "${toolName}" NOT to be called, but it was`);
      }
    },
  };
  return mock;
}

module.exports = { REPO_ROOT, scaffoldDesignDir, readFrontmatter, countLines, mockMCP };
