'use strict';
// Phase 41 — hone-detect engine. Pure, dep-free regex engine over file content. Walks a path, runs
// each rule's matcher against the text of each scannable file, and returns structured findings. The
// engine never touches the network or any optional dependency — so the SC#10 network-isolation scan
// stays clean.

const fs = require('node:fs');
const path = require('node:path');
const { RULES, EXEMPT } = require('./rules/index.cjs');

const SCANNABLE_EXT = new Set(['.html', '.htm', '.css', '.scss', '.jsx', '.tsx', '.js', '.ts', '.vue', '.svelte']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.design', '.planning']);

/** Recursively collect scannable file paths under `root` (a file or dir). */
function walk(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const st = fs.statSync(root);
  if (st.isFile()) {
    if (SCANNABLE_EXT.has(path.extname(root).toLowerCase())) out.push(root);
    return out;
  }
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(full); }
      else if (e.isFile() && SCANNABLE_EXT.has(path.extname(e.name).toLowerCase())) out.push(full);
    }
  }
  return out;
}

/** Select the active rule set. `ruleId` (e.g. 'BAN-08') narrows to one rule. */
function selectRules(ruleId) {
  if (!ruleId) return RULES;
  const id = String(ruleId).toUpperCase();
  return RULES.filter((r) => r.id === id);
}

/** Run `rules` over one file's content. Returns findings with file-relative metadata merged in. */
function scanContent(content, ctx, rules) {
  const findings = [];
  for (const rule of rules) {
    let hits = [];
    try { hits = rule.matcher({ content, ext: ctx.ext, path: ctx.path }) || []; } catch { hits = []; }
    for (const h of hits) {
      findings.push({
        ruleId: rule.id, category: rule.category, name: rule.name, severity: rule.severity,
        file: ctx.path, line: h.line, column: h.column, match: h.match, references: rule.references,
      });
    }
  }
  return findings;
}

/**
 * Run the detector over a path.
 * @param {string} root file or directory
 * @param {{ruleId?: string, cwd?: string}} [opts]
 * @returns {{findings: object[], filesScanned: number, errors: number, rules: number}}
 */
function run(root, opts) {
  const o = opts || {};
  const rules = selectRules(o.ruleId);
  const cwd = o.cwd || process.cwd();
  const files = walk(root);
  const findings = [];
  let errors = 0;
  for (const abs of files) {
    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch { errors++; continue; }
    const rel = path.relative(cwd, abs).split(path.sep).join('/');
    findings.push(...scanContent(content, { path: rel || abs, ext: path.extname(abs).toLowerCase() }, rules));
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId));
  return { findings, filesScanned: files.length, errors, rules: rules.length };
}

module.exports = { run, walk, scanContent, selectRules, RULES, EXEMPT, SCANNABLE_EXT, SKIP_DIRS };
