'use strict';
/**
 * scripts/lib/risk/compute-risk.cjs — PURE, deterministic action-risk scorer
 * for the Phase 56 risk gate.
 *
 * NO I/O. NO Date.now / Math.random. Given the same (tool_name, input,
 * thresholds) it always returns the same result. Frozen static tables live in
 * ./tables.cjs; config overrides are merged by the HOOK (which reads
 * .design/config.json and passes the merged thresholds/tables in) — this
 * module stays side-effect-free so the routing matrix is unit-testable.
 *
 * Contract:
 *   computeRisk(tool_name, input, thresholds = THRESHOLDS, tables = defaults)
 *     -> { score:0..1, reasons:string[], suggested_action, breakdown }
 *
 *   score = clamp01( base * fileMult + fileAdd + sum(inputAdds) )
 *   suggested_action in 'allow' | 'review' | 'require_confirmation' | 'block'
 *
 * loadRiskConfig(cwd) is provided (mirrors blast-radius.loadConfig) so the hook
 * can read `.design/config.json#risk.{thresholds, base_tool_extra,
 * file_sensitivity_extra, input_pattern_extra}` and EXTEND the defaults
 * (extend-only — protected-paths discipline). computeRisk itself never calls it.
 */

const fs = require('fs');
const path = require('path');

const TABLES = require('./tables.cjs');
const { BASE_TOOL_RISK, FILE_SENSITIVITY, INPUT_PATTERN_RISK, THRESHOLDS } = TABLES;

function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normPath(p) {
  return String(p == null ? '' : p).replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * pathsFor(tool, input) — the file paths a tool action touches.
 *   Edit/Write/NotebookEdit -> file_path / notebook_path
 *   MultiEdit               -> the shared file_path (edits[] all target it)
 *   Bash                    -> best-effort path-ish tokens extracted from the command
 */
function pathsFor(tool, input) {
  const out = [];
  if (!input || typeof input !== 'object') return out;
  if (typeof input.file_path === 'string') out.push(normPath(input.file_path));
  if (typeof input.notebook_path === 'string') out.push(normPath(input.notebook_path));
  if (typeof input.path === 'string') out.push(normPath(input.path));
  if (tool === 'Bash' && typeof input.command === 'string') {
    for (const t of extractBashPaths(input.command)) out.push(normPath(t));
  }
  // de-dup, drop empties
  return Array.from(new Set(out.filter(Boolean)));
}

// Small, linear extractor: pull whitespace-delimited tokens that look like
// file paths (contain a slash or a dot-extension, no shell metachars). Linear
// scan — no backtracking-prone regex.
function extractBashPaths(command) {
  const tokens = String(command).split(/\s+/);
  const paths = [];
  for (const raw of tokens) {
    const t = raw.replace(/^['"]|['"]$/g, '');
    if (!t || t.startsWith('-')) continue;
    if (/[|;&$`(){}<>*?!]/.test(t)) continue; // skip shell-operator/glob tokens
    if (t.includes('/') || /\.[A-Za-z0-9]{1,8}$/.test(t)) paths.push(t);
  }
  return paths;
}

/**
 * pickMaxFileSensitivity(paths, table) — the single highest-WEIGHT matching
 * entry across all touched paths. "Weight" = mult + add so a clearly higher-mult
 * entry wins over a low de-risking one even when both match (e.g. a file under
 * both `tests/` and `hooks/` resolves to the hook entry). Returns
 * { mult:1, add:0, label:null } when nothing matches.
 */
function pickMaxFileSensitivity(paths, table) {
  let best = null;
  let bestWeight = -Infinity;
  for (const entry of table) {
    for (const p of paths) {
      if (entry.test.test(p)) {
        const w = (typeof entry.mult === 'number' ? entry.mult : 1) + (typeof entry.add === 'number' ? entry.add : 0);
        if (w > bestWeight) {
          bestWeight = w;
          best = entry;
        }
        break; // this entry already matched; move to the next entry
      }
    }
  }
  if (!best) return { mult: 1, add: 0, label: null };
  return { mult: typeof best.mult === 'number' ? best.mult : 1, add: typeof best.add === 'number' ? best.add : 0, label: best.label };
}

function actionFor(score, thresholds) {
  const t = thresholds || THRESHOLDS;
  if (score >= t.block) return 'block';
  if (score >= t.require_confirmation) return 'require_confirmation';
  if (score >= t.review) return 'review';
  return 'allow';
}

/**
 * computeRisk — the pure scorer.
 * @param {string} tool_name
 * @param {object} input            tool_input (Edit/Write/MultiEdit/Bash/...)
 * @param {object} [thresholds]     defaults to TABLES.THRESHOLDS
 * @param {object} [tables]         { BASE_TOOL_RISK, FILE_SENSITIVITY, INPUT_PATTERN_RISK } — defaults to the frozen tables
 * @returns {{score:number, reasons:string[], suggested_action:string, breakdown:object}}
 */
function computeRisk(tool_name, input, thresholds = THRESHOLDS, tables) {
  const baseTbl = (tables && tables.BASE_TOOL_RISK) || BASE_TOOL_RISK;
  const fileTbl = (tables && tables.FILE_SENSITIVITY) || FILE_SENSITIVITY;
  const inputTbl = (tables && tables.INPUT_PATTERN_RISK) || INPUT_PATTERN_RISK;

  const reasons = [];

  // 1. Base tool risk.
  const base = typeof baseTbl[tool_name] === 'number' ? baseTbl[tool_name] : baseTbl.__default;
  reasons.push(`base:${tool_name}=${round(base)}`);

  // 2. File sensitivity (highest-weight match across touched paths).
  const paths = pathsFor(tool_name, input);
  const fs_ = pickMaxFileSensitivity(paths, fileTbl);
  if (fs_.label) {
    reasons.push(`file:${fs_.label}(x${fs_.mult}+${fs_.add})`);
  }

  // 3. Input-pattern addends (fixed table order).
  const inputAdds = [];
  let inputAddSum = 0;
  for (const entry of inputTbl) {
    let hit;
    try {
      hit = entry.when(tool_name, input);
    } catch {
      hit = false;
    }
    if (!hit) continue;
    const add = typeof entry.add === 'function' ? entry.add(hit, tool_name, input) : entry.add;
    const a = typeof add === 'number' && Number.isFinite(add) ? add : 0;
    if (a === 0) continue;
    inputAdds.push({ label: entry.label, add: a });
    inputAddSum += a;
    reasons.push(`input:${entry.label}=+${round(a)}`);
  }

  // 4. Combine + clamp.
  const rawScore = base * fs_.mult + fs_.add + inputAddSum;
  const score = clamp01(rawScore);

  const suggested_action = actionFor(score, thresholds);

  return {
    score,
    reasons,
    suggested_action,
    breakdown: {
      base,
      tool: tool_name,
      paths,
      file: { mult: fs_.mult, add: fs_.add, label: fs_.label },
      inputAdds,
      inputAddSum: round3(inputAddSum),
      raw: round3(rawScore),
      thresholds,
    },
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

// ── Config loader (used by the HOOK, not by computeRisk) ────────────────────
// Mirrors blast-radius.loadConfig. Reads .design/config.json#risk and returns
// merged thresholds + EXTEND-only table extras. Defaults are returned when the
// file/keys are absent or malformed. This is the ONLY function here that does
// I/O; computeRisk stays pure.
function loadRiskConfig(cwd) {
  const configPath = path.join(cwd || process.cwd(), '.design', 'config.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { cfg = {}; }
  const risk = (cfg && typeof cfg === 'object' && cfg.risk) || {};
  const t = (risk && typeof risk.thresholds === 'object' && risk.thresholds) || {};
  return {
    thresholds: {
      review: numOrInRange(t.review, THRESHOLDS.review),
      require_confirmation: numOrInRange(t.require_confirmation, THRESHOLDS.require_confirmation),
      block: numOrInRange(t.block, THRESHOLDS.block),
    },
    // Extend-only table extras (the hook merges these onto the frozen defaults).
    base_tool_extra: (risk && typeof risk.base_tool_extra === 'object' && risk.base_tool_extra) || {},
    file_sensitivity_extra: Array.isArray(risk.file_sensitivity_extra) ? risk.file_sensitivity_extra : [],
    input_pattern_extra: Array.isArray(risk.input_pattern_extra) ? risk.input_pattern_extra : [],
  };
}

function numOrInRange(v, fallback) {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) return v;
  return fallback;
}

module.exports = {
  computeRisk,
  // helpers exported for the hook + tests
  pathsFor,
  pickMaxFileSensitivity,
  actionFor,
  clamp01,
  loadRiskConfig,
  _extractBashPaths: extractBashPaths,
  // re-export the tables so consumers (B/C/D) can `require('./compute-risk')`
  // and get THRESHOLDS without a second import.
  THRESHOLDS,
  BASE_TOOL_RISK,
  FILE_SENSITIVITY,
  INPUT_PATTERN_RISK,
};
