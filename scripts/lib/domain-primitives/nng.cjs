/**
 * domain-primitives/nng.cjs — NNG-style heuristic checker
 * (Plan 23-09).
 *
 * Runs grep-style rules against a single source artifact. Rules are
 * loaded from `reference/heuristics.md` as fenced yaml blocks of the form:
 *
 *   ```yaml
 *   id: nng-01
 *   severity: P1
 *   grep: 'placeholder-as-label'
 *   summary: 'Inputs use placeholder text instead of an explicit label'
 *   ```
 *
 * If the reference file has no parseable yaml blocks today (the current
 * registry is prose), the checker simply treats the rule list as empty.
 * Caller may supply `opts.rules` directly to bypass the file-load path,
 * which is the test-friendly entry point.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3']);

/**
 * @typedef {Object} HeuristicHit
 * @property {string} rule_id
 * @property {'P0'|'P1'|'P2'|'P3'} severity
 * @property {string} summary
 * @property {string} [evidence]
 * @property {number} [line]
 * @property {string} file
 */

/**
 * @typedef {Object} CompiledRule
 * @property {string} id
 * @property {'P0'|'P1'|'P2'|'P3'} severity
 * @property {RegExp} grep
 * @property {string} summary
 */

/**
 * Extract every fenced ```yaml block from a markdown string and parse
 * each as a flat key:value mapping (single-level, no nesting). Skips
 * blocks that don't have an `id` and `grep` field.
 *
 * @param {string} markdown
 * @returns {CompiledRule[]}
 */
function parseRulesFromMarkdown(markdown) {
  const rules = [];
  const re = /```yaml\s*\n([\s\S]*?)\n```/g;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const body = m[1];
    /** @type {Record<string, string>} */
    const fields = {};
    for (const line of body.split(/\r?\n/)) {
      const kv = line.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/);
      if (!kv) continue;
      let v = kv[2];
      if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
        v = v.slice(1, -1);
      }
      fields[kv[1]] = v;
    }
    if (!fields.id || !fields.grep || !SEVERITIES.has(fields.severity)) continue;
    let regex;
    try {
      regex = new RegExp(fields.grep);
    } catch {
      continue;
    }
    rules.push({
      id: fields.id,
      severity: /** @type {'P0'|'P1'|'P2'|'P3'} */ (fields.severity),
      grep: regex,
      summary: fields.summary || fields.id,
    });
  }
  return rules;
}

let _ruleCache = null;

function loadRules(cwd) {
  if (_ruleCache) return _ruleCache;
  const root = cwd ?? path.resolve(__dirname, '..', '..', '..');
  const file = path.join(root, 'reference', 'heuristics.md');
  if (!fs.existsSync(file)) {
    _ruleCache = [];
    return _ruleCache;
  }
  const md = fs.readFileSync(file, 'utf8');
  _ruleCache = parseRulesFromMarkdown(md);
  return _ruleCache;
}

/**
 * @param {{file: string, content: string, type?: string, cwd?: string, rules?: CompiledRule[]}} input
 * @returns {HeuristicHit[]}
 */
function check(input) {
  if (!input || typeof input !== 'object') return [];
  if (typeof input.content !== 'string' || typeof input.file !== 'string') return [];
  const rules = Array.isArray(input.rules) ? input.rules : loadRules(input.cwd);
  /** @type {HeuristicHit[]} */
  const hits = [];
  const lines = input.content.split(/\r?\n/);
  for (const rule of rules) {
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const match = ln.match(rule.grep);
      if (!match) continue;
      hits.push({
        rule_id: rule.id,
        severity: rule.severity,
        summary: rule.summary,
        evidence: match[0].slice(0, 200),
        line: i + 1,
        file: input.file,
      });
    }
  }
  return hits;
}

function _resetCache() {
  _ruleCache = null;
}

module.exports = { check, parseRulesFromMarkdown, _resetCache };
