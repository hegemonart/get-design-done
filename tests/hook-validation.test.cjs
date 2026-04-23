'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.ts');

const HOOKS_PATH = path.join(REPO_ROOT, 'hooks', 'hooks.json');

test('hook-validation: hooks.json is valid JSON', () => {
  assert.ok(fs.existsSync(HOOKS_PATH), 'hooks/hooks.json must exist');
  assert.doesNotThrow(
    () => JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8')),
    'hooks/hooks.json must be valid JSON'
  );
});

test('hook-validation: all hook command files exist', () => {
  const hooksData = JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'));
  const violations = [];

  function checkHooks(hooksArray, context) {
    if (!Array.isArray(hooksArray)) return;
    for (const hookEntry of hooksArray) {
      const innerHooks = hookEntry.hooks || [];
      for (const h of innerHooks) {
        if (h.type === 'command' && h.command) {
          // Extract file path from command string
          // Pattern: bash "${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.sh"
          // Match paths that may be preceded by env vars like ${CLAUDE_PLUGIN_ROOT}
          const fileMatch = h.command.match(/\$\{[A-Z_]+\}([^'"\s]+\.(?:sh|js|cjs))|(?:^|[\s'"])([./][^'"\s]+\.(?:sh|js|cjs))/);
          if (fileMatch) {
            // Group 1: path after env var like ${CLAUDE_PLUGIN_ROOT}/scripts/file.sh
            // Group 2: plain relative path
            const rawPath = fileMatch[1] || fileMatch[2];
            // Resolve ${CLAUDE_PLUGIN_ROOT}-relative paths against REPO_ROOT
            const resolved = rawPath.startsWith('/')
              ? path.join(REPO_ROOT, rawPath)
              : rawPath;
            if (!fs.existsSync(resolved)) {
              violations.push(`${context}: command references missing file: ${resolved}`);
            }
          }
        }
      }
    }
  }

  // Traverse hooks structure
  for (const [event, entries] of Object.entries(hooksData.hooks || {})) {
    checkHooks(entries, `hooks.${event}`);
  }

  assert.deepEqual(violations, [],
    `Hook command files missing:\n${violations.join('\n')}`
  );
});
