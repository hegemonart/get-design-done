/**
 * domain-primitives/anti-patterns.cjs — anti-pattern regex matcher
 * (Plan 23-09).
 *
 * Same shape as nng.cjs. Loads rules from `reference/anti-patterns.md`
 * yaml blocks. Caller may inject rules via opts.rules.
 *
 * Rule yaml shape:
 *   id: ban-01
 *   severity: P1
 *   grep: 'side-stripe-class'
 *   summary: 'Side-stripe borders are an AI-slop tell'
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseRulesFromMarkdown } = require('./nng.cjs');

let _cache = null;

function loadRules(cwd) {
  if (_cache) return _cache;
  const root = cwd ?? path.resolve(__dirname, '..', '..', '..');
  const file = path.join(root, 'reference', 'anti-patterns.md');
  if (!fs.existsSync(file)) {
    _cache = [];
    return _cache;
  }
  _cache = parseRulesFromMarkdown(fs.readFileSync(file, 'utf8'));
  return _cache;
}

/**
 * @param {{file: string, content: string, type?: string, cwd?: string, rules?: object[]}} input
 * @returns {Array<{rule_id: string, severity: string, summary: string, evidence?: string, line?: number, file: string}>}
 */
function check(input) {
  if (!input || typeof input !== 'object') return [];
  if (typeof input.content !== 'string' || typeof input.file !== 'string') return [];
  const rules = Array.isArray(input.rules) ? input.rules : loadRules(input.cwd);
  const hits = [];
  const lines = input.content.split(/\r?\n/);
  for (const rule of rules) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(rule.grep);
      if (!m) continue;
      hits.push({
        rule_id: rule.id,
        severity: rule.severity,
        summary: rule.summary,
        evidence: m[0].slice(0, 200),
        line: i + 1,
        file: input.file,
      });
    }
  }
  return hits;
}

function _resetCache() {
  _cache = null;
}

module.exports = { check, _resetCache };
