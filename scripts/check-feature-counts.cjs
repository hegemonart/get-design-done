#!/usr/bin/env node
'use strict';
/**
 * scripts/check-feature-counts.cjs
 *
 * CI gate that asserts every marketing/user-facing surface that quotes a
 * count of agents / skills / connections / MCP tools agrees with the
 * filesystem reality.
 *
 * Background: this plugin has spent multiple releases drifting between
 * "37 agents" / "22+ agents" / "59 agents" in different surfaces while
 * the filesystem said 61. Each release tries to catch up; six months
 * later the same drift re-emerges because nothing structural pinned the
 * numbers. This gate is that structural pin.
 *
 * Behavior:
 *   - Counts the filesystem truth:
 *       * agents:      ls agents/*.md  (excluding README.md)
 *       * skills:      ls skills/      (dirs only)
 *       * connections: ls connections/*.md
 *       * mcp tools:   ls sdk/mcp/gdd-mcp/tools/gdd_*.ts (one per tool)
 *   - Scans these surfaces for "<N> <noun>" patterns:
 *       * .claude-plugin/plugin.json#description
 *       * .claude-plugin/marketplace.json#description
 *       * .claude-plugin/marketplace.json#plugins[0].description
 *       * .codex-plugin/plugin.json#description, .longDescription
 *       * .cursor-plugin/plugin.json#description
 *       * README.md   (full text)
 *   - Pretty-prints any mismatch and exits 1.
 *
 * Patterns matched (case-insensitive):
 *   /(\d+)\s*\+?\s+(?:specialized\s+)?agents?\b/
 *   /(\d+)\s*\+?\s+skills?\b/                     (excludes "1 skill" trivia)
 *   /(\d+)\s*\+?\s+(?:connection|integration|tool connection)s?\b/
 *   /(\d+)\s*\+?\s+(?:read-only\s+)?MCP\s+tools?\b/
 *
 * "<N>+" forms ("60+ agents") are tolerated when the truth is >= N.
 *
 * Run via:  npm run validate:feature-counts
 * Exit code 0 = clean, 1 = drift detected.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function listAgents() {
  const dir = path.join(ROOT, 'agents');
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .length;
}

function listSkills() {
  const dir = path.join(ROOT, 'skills');
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .length;
}

function listConnections() {
  // Count only genuine integration specs (audit C3 honesty pass, Phase 59.2).
  // Excluded non-integration files that live in connections/ for discoverability:
  //   - connections.md     → the index, not a connection
  //   - cursor.md          → a runtime (see reference/runtimes), not an integration
  //   - design-corpora.md  → a reference list (benchmark corpora), not an integration
  const NON_INTEGRATION = new Set(['connections.md', 'cursor.md', 'design-corpora.md']);
  const dir = path.join(ROOT, 'connections');
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !NON_INTEGRATION.has(f))
    .length;
}

function listMcpTools() {
  const dir = path.join(ROOT, 'sdk', 'mcp', 'gdd-mcp', 'tools');
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir)
    .filter((f) => /^gdd_[a-z_]+\.ts$/.test(f))
    .length;
}

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function readText(p) {
  if (!fs.existsSync(p)) return '';
  try { return fs.readFileSync(p, 'utf8'); }
  catch { return ''; }
}

const TRUTH = {
  agents: listAgents(),
  skills: listSkills(),
  connections: listConnections(),
  mcpTools: listMcpTools(),
};

const PATTERNS = [
  { key: 'agents',      re: /(\d+)\s*(\+)?\s+(?:specialized\s+)?agents?\b/gi },
  // Skill count must be at least 5 to count — avoids accidental matches in prose
  // like "this 1 skill" or "skill 1 of 5".
  { key: 'skills',      re: /(\d+)\s*(\+)?\s+(?:user-invocable\s+)?skills?\b/gi, min: 5 },
  { key: 'connections', re: /(\d+)\s*(\+)?\s+(?:connection|integration|tool connection)s?\b/gi },
  { key: 'mcpTools',    re: /(\d+)\s*(\+)?\s+(?:read-only\s+)?MCP\s+tools?\b/gi },
];

const SURFACES = [
  { label: '.claude-plugin/plugin.json#description',
    text: (readJson(path.join(ROOT, '.claude-plugin', 'plugin.json')) || {}).description || '' },
  { label: '.claude-plugin/marketplace.json#metadata.description',
    text: ((readJson(path.join(ROOT, '.claude-plugin', 'marketplace.json')) || {}).metadata || {}).description || '' },
  { label: '.claude-plugin/marketplace.json#plugins[0].description',
    text: (((readJson(path.join(ROOT, '.claude-plugin', 'marketplace.json')) || {}).plugins || [])[0] || {}).description || '' },
  { label: '.codex-plugin/plugin.json#description',
    text: (readJson(path.join(ROOT, '.codex-plugin', 'plugin.json')) || {}).description || '' },
  { label: '.codex-plugin/plugin.json#interface.longDescription',
    text: ((readJson(path.join(ROOT, '.codex-plugin', 'plugin.json')) || {}).interface || {}).longDescription || '' },
  { label: '.cursor-plugin/plugin.json#description',
    text: (readJson(path.join(ROOT, '.cursor-plugin', 'plugin.json')) || {}).description || '' },
  { label: 'README.md', text: readText(path.join(ROOT, 'README.md')) },
];

const violations = [];

for (const surf of SURFACES) {
  if (!surf.text) continue;
  for (const pat of PATTERNS) {
    pat.re.lastIndex = 0;
    let m;
    while ((m = pat.re.exec(surf.text)) !== null) {
      const claimed = parseInt(m[1], 10);
      const plus = m[2] === '+';
      if (pat.min !== undefined && claimed < pat.min) continue;
      const truth = TRUTH[pat.key];
      if (plus) {
        // "<N>+ X" is tolerated as long as truth >= N (it's an underclaim).
        if (truth < claimed) {
          violations.push({
            surface: surf.label,
            kind: pat.key,
            claimed: `${claimed}+`,
            truth,
            quote: surf.text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\s+/g, ' ').trim(),
          });
        }
      } else if (claimed !== truth) {
        violations.push({
          surface: surf.label,
          kind: pat.key,
          claimed,
          truth,
          quote: surf.text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\s+/g, ' ').trim(),
        });
      }
    }
  }
}

const isCheck = process.argv.includes('--check');

if (violations.length === 0) {
  if (!isCheck) {
    console.log('check-feature-counts: OK');
    console.log(`  agents=${TRUTH.agents} skills=${TRUTH.skills} connections=${TRUTH.connections} mcp-tools=${TRUTH.mcpTools}`);
  }
  process.exit(0);
}

console.error('check-feature-counts: DRIFT DETECTED');
console.error(`  Filesystem truth: agents=${TRUTH.agents} skills=${TRUTH.skills} connections=${TRUTH.connections} mcp-tools=${TRUTH.mcpTools}`);
console.error('');
for (const v of violations) {
  console.error(`  ${v.surface}`);
  console.error(`    ${v.kind}: claimed=${v.claimed}, actual=${v.truth}`);
  console.error(`    near: …${v.quote}…`);
  console.error('');
}
console.error('Fix the surface text(s) above to match filesystem truth.');
process.exit(1);
