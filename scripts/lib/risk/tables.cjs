'use strict';
/**
 * scripts/lib/risk/tables.cjs — frozen, dependency-free static tables for the
 * Phase 56 risk scorer. PURE DATA + linear-only regexes (CodeQL js/redos safe:
 * no nested quantifiers, no `(a+)+`, no `(.*)*`; the secret-shaped pattern is
 * anchored on fixed prefixes with bounded character classes).
 *
 * Consumed by scripts/lib/risk/compute-risk.cjs. Tables are
 * `Object.freeze`-d so a downstream consumer cannot mutate the shared defaults;
 * config overrides EXTEND (never shrink) these via the loadConfig pattern in
 * compute-risk.cjs (protected-paths discipline — D7).
 *
 * Exports:
 *   BASE_TOOL_RISK    — { [toolName]: number, __default: number }
 *   FILE_SENSITIVITY  — ordered [{ test:RegExp, mult, add, label }]
 *   INPUT_PATTERN_RISK— ordered [{ when:(tool,input)=>bool|hit, add:number|fn, label }]
 *   THRESHOLDS        — { review, require_confirmation, block }
 *   SECRET_SHAPED_RE  — the (linear) secret detector, exported for reuse/tests
 *   _SEVERITY_ADD     — dangerous-bash severity -> addend map
 */

const dangerous = require('../dangerous-patterns.cjs');
const blast = require('../blast-radius.cjs');

// ── Base per-tool risk ─────────────────────────────────────────────────────
// Bash is the riskiest (arbitrary shell), then bulk edits, then single edits,
// then whole-file writes; read-only tools are ~zero. __default covers unknown
// tools conservatively.
const BASE_TOOL_RISK = Object.freeze({
  Bash: 0.55,
  MultiEdit: 0.40,
  Edit: 0.35,
  NotebookEdit: 0.35,
  Write: 0.30,
  Read: 0.02,
  Glob: 0,
  Grep: 0,
  __default: 0.20,
});

// ── Secret-shaped content detector ─────────────────────────────────────────
// Linear: each alternative is a fixed prefix + a bounded/anchored class. No
// alternative can backtrack into another (distinct literal prefixes).
//   AWS access key id | PEM private-key header | OpenAI sk- | GitHub ghp_ | Slack xox?-
const SECRET_SHAPED_RE =
  /AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{36}|xox[baprs]-/;

// ── File-sensitivity table (mirrors reference/protected-paths.default.json) ──
// ORDERED, highest-weight first. compute-risk.cjs picks the single
// highest-weight matching entry (pickMaxFileSensitivity). `test` matches a
// forward-slash-normalized path. All regexes linear.
//
// mult multiplies the base tool risk; add is a flat addend. De-risking entries
// (tests/fixtures, docs) use mult<1 + add 0 to pull benign edits below review.
const FILE_SENSITIVITY = Object.freeze([
  // State + config: the audit/control spine.
  { test: /(^|\/)STATE\.md$/i, mult: 1.6, add: 0.25, label: 'planning-state' },
  { test: /(^|\/)config\.json$/i, mult: 1.6, add: 0.25, label: 'config' },
  // Schemas + lockfiles + generated styling contracts.
  { test: /\.schema\.json$/i, mult: 1.5, add: 0.25, label: 'schema' },
  { test: /(^|\/)package-lock\.json$/i, mult: 1.5, add: 0.20, label: 'lockfile' },
  { test: /(^|\/)package\.json$/i, mult: 1.5, add: 0.20, label: 'package-manifest' },
  { test: /\.css\.ts$/i, mult: 1.5, add: 0.20, label: 'css-in-ts' },
  // Hooks + CI: execution surface.
  { test: /(^|\/)hooks\//i, mult: 1.5, add: 0.20, label: 'hook' },
  { test: /(^|\/)\.github\/workflows\//i, mult: 1.5, add: 0.20, label: 'ci-workflow' },
  // Design-token / theme sources.
  { test: /(^|\/)(tokens|theme)(\/|[.-])/i, mult: 1.4, add: 0.18, label: 'design-tokens' },
  // Build/runtime config files.
  { test: /(^|\/)(tsconfig[^/]*\.json|\.npmrc|Dockerfile|\.gitleaks(\.toml)?)$/i, mult: 1.3, add: 0.15, label: 'build-config' },
  // Plugin authoring surface (skills/commands/agents).
  { test: /(^|\/)(skills|commands|agents)\//i, mult: 1.3, add: 0.12, label: 'authoring-surface' },
  // De-risking: tests + fixtures are low-stakes.
  { test: /(^|\/)(tests?|fixtures?|__tests__|__fixtures__)\//i, mult: 0.6, add: 0, label: 'test-or-fixture' },
  // De-risking: docs / markdown.
  { test: /(?:(?:^|\/)docs?\/)|(?:\.mdx?$)/i, mult: 0.5, add: 0, label: 'docs' },
]);

// ── Severity -> addend for destructive bash (via dangerous-patterns.cjs) ────
const _SEVERITY_ADD = Object.freeze({ critical: 0.6, high: 0.4, medium: 0.2 });

// ── Helpers shared by INPUT_PATTERN_RISK predicates ─────────────────────────
function textOf(input) {
  if (!input || typeof input !== 'object') return '';
  const parts = [];
  if (typeof input.content === 'string') parts.push(input.content);
  if (typeof input.new_string === 'string') parts.push(input.new_string);
  if (typeof input.new_str === 'string') parts.push(input.new_str);
  if (Array.isArray(input.edits)) {
    for (const e of input.edits) {
      if (e && typeof e.new_string === 'string') parts.push(e.new_string);
    }
  }
  if (typeof input.command === 'string') parts.push(input.command);
  return parts.join('\n');
}

// Approximate the changed-line count for a Write/Edit/MultiEdit input by
// counting newlines in the new text. Reuses blast-radius.estimate for the
// capped addend math so the large-diff curve matches the blast-radius primitive.
function changedLineCount(tool, input) {
  if (!input || typeof input !== 'object') return 0;
  let lines = 0;
  if (typeof input.content === 'string') lines += countLines(input.content);
  if (typeof input.new_string === 'string') lines += countLines(input.new_string);
  if (Array.isArray(input.edits)) {
    for (const e of input.edits) {
      if (e && typeof e.new_string === 'string') lines += countLines(e.new_string);
    }
  }
  return lines;
}

function countLines(s) {
  if (typeof s !== 'string' || s.length === 0) return 0;
  // A non-empty string is at least one line; each newline adds one.
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

// File-path-ish fields, normalized to forward slashes (for schema/migration sniff).
function pathHintsOf(input) {
  if (!input || typeof input !== 'object') return '';
  const parts = [];
  for (const k of ['file_path', 'notebook_path', 'path']) {
    if (typeof input[k] === 'string') parts.push(input[k]);
  }
  return parts.join('\n').replace(/\\/g, '/');
}

// Linear regexes only.
const SCHEMA_MIGRATION_RE = /(^|\/)migrations?\/|\.schema\.json$|\bALTER\s+TABLE\b|\bCREATE\s+TABLE\b|\bDROP\s+TABLE\b/i;
const DEP_MUTATION_RE = /\b(npm|pnpm|yarn|bun)\s+(install|add|i|remove|rm|uninstall|up|update|upgrade)\b|\b(pip|pip3)\s+install\b|\bcargo\s+(add|install)\b/;
// Broad glob: a pattern argument touching the repo root with ** or a bare /* .
const BROAD_GLOB_RE = /(\*\*|(^|\s)\.?\/?\*(\s|$)|--include=\*|\s-r\b.*\*)/;

// ── Input-pattern risk table ────────────────────────────────────────────────
// ORDERED. Each `when(tool, input)` returns a truthy value (bool or a "hit"
// object) when it applies; `add` is either a flat number or a function of the
// hit/(tool,input) returning the addend. compute-risk.cjs accumulates every
// applicable entry in this fixed order.
const INPUT_PATTERN_RISK = Object.freeze([
  {
    label: 'dangerous-bash',
    when: (tool, input) => {
      if (tool !== 'Bash' || !input || typeof input.command !== 'string') return false;
      const hit = dangerous.match(input.command);
      return hit.matched ? hit : false;
    },
    add: (hit) => _SEVERITY_ADD[hit && hit.severity] || 0.2,
  },
  {
    label: 'large-diff',
    when: (tool, input) => {
      const lines = changedLineCount(tool, input);
      return lines > 0 ? lines : false;
    },
    // Cap at +0.30; curve = lines / 1500 (matches the shared contract).
    add: (lines) => {
      // Route through blast-radius.estimate so the line accounting stays in
      // lockstep with the blast-radius primitive (pure: explicit DEFAULTS-like
      // config, no disk read).
      const est = blast.estimate({ diffStats: { insertions: lines, deletions: 0 }, config: { max_files_per_task: 0, max_lines_per_task: 0, max_mcp_calls_per_task: 0 } });
      return Math.min(0.30, est.lines / 1500);
    },
  },
  {
    label: 'schema-migration',
    when: (tool, input) => SCHEMA_MIGRATION_RE.test(pathHintsOf(input)) || SCHEMA_MIGRATION_RE.test(textOf(input)),
    add: 0.25,
  },
  {
    label: 'secret-shaped',
    when: (tool, input) => SECRET_SHAPED_RE.test(textOf(input)),
    add: 0.5,
  },
  {
    label: 'broad-glob',
    when: (tool, input) => {
      if (tool === 'Bash' && input && typeof input.command === 'string') return BROAD_GLOB_RE.test(input.command);
      if ((tool === 'Glob' || tool === 'Grep') && input && typeof input.pattern === 'string') return BROAD_GLOB_RE.test(input.pattern);
      return false;
    },
    add: 0.15,
  },
  {
    label: 'dependency-mutation',
    when: (tool, input) => {
      if (tool === 'Bash' && input && typeof input.command === 'string' && DEP_MUTATION_RE.test(input.command)) return true;
      // Editing a manifest/lockfile is also a dependency mutation surface.
      const hints = pathHintsOf(input);
      return /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.toml|requirements\.txt)$/i.test(hints);
    },
    add: 0.15,
  },
]);

// ── Thresholds ──────────────────────────────────────────────────────────────
// score < review            -> allow
// review <= score < require_confirmation -> review
// require_confirmation <= score < block  -> require_confirmation
// score >= block            -> block
const THRESHOLDS = Object.freeze({
  review: 0.30,
  require_confirmation: 0.60,
  block: 0.85,
});

module.exports = {
  BASE_TOOL_RISK,
  FILE_SENSITIVITY,
  INPUT_PATTERN_RISK,
  THRESHOLDS,
  SECRET_SHAPED_RE,
  _SEVERITY_ADD,
  // internal helpers exported for compute-risk.cjs + unit visibility
  _textOf: textOf,
  _changedLineCount: changedLineCount,
  _pathHintsOf: pathHintsOf,
};
