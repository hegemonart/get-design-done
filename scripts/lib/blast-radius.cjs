'use strict';
/**
 * scripts/lib/blast-radius.cjs — per-task blast-radius preflight.
 *
 * Exports:
 *   estimate({touchedPaths, diffStats, config?}) →
 *     { files, lines, exceeds, overBy, limit: {files, lines} }
 *   estimateMCPCalls({toolCalls, config?}) →
 *     { count, exceeds, overBy, limit }
 *   formatDiffSummary({touchedPaths, diffStats, result}) → string
 *   loadConfig(cwd?) → { max_files_per_task, max_lines_per_task, max_mcp_calls_per_task }
 *
 * Config precedence: .design/config.json.blast_radius.{max_files_per_task, max_lines_per_task, max_mcp_calls_per_task}
 * then .design/config.json top-level same keys, then built-in defaults.
 *
 * Zero-value limits DISABLE that dimension.
 */

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  max_files_per_task: 10,
  max_lines_per_task: 400,
  max_mcp_calls_per_task: 30,
};

function loadConfig(cwd) {
  const configPath = path.join(cwd || process.cwd(), '.design', 'config.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { cfg = {}; }
  const br = (cfg && typeof cfg === 'object' && cfg.blast_radius) || {};
  return {
    max_files_per_task: numberOr(br.max_files_per_task, cfg.max_files_per_task, DEFAULTS.max_files_per_task),
    max_lines_per_task: numberOr(br.max_lines_per_task, cfg.max_lines_per_task, DEFAULTS.max_lines_per_task),
    max_mcp_calls_per_task: numberOr(br.max_mcp_calls_per_task, cfg.max_mcp_calls_per_task, DEFAULTS.max_mcp_calls_per_task),
  };
}

function numberOr(...candidates) {
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  }
  return undefined;
}

function estimate({ touchedPaths = [], diffStats = {}, config } = {}) {
  const cfg = config || loadConfig();
  const files = new Set((touchedPaths || []).filter(Boolean)).size;
  const lines = (diffStats.insertions || 0) + (diffStats.deletions || 0);
  const fileLimit = cfg.max_files_per_task;
  const lineLimit = cfg.max_lines_per_task;
  const fileExceeds = fileLimit > 0 && files > fileLimit;
  const lineExceeds = lineLimit > 0 && lines > lineLimit;
  return {
    files,
    lines,
    exceeds: fileExceeds || lineExceeds,
    overBy: {
      files: fileExceeds ? files - fileLimit : 0,
      lines: lineExceeds ? lines - lineLimit : 0,
    },
    limit: { files: fileLimit, lines: lineLimit },
  };
}

function estimateMCPCalls({ toolCalls = [], config } = {}) {
  const cfg = config || loadConfig();
  const count = Array.isArray(toolCalls) ? toolCalls.length : 0;
  const limit = cfg.max_mcp_calls_per_task;
  const exceeds = limit > 0 && count > limit;
  return {
    count,
    exceeds,
    overBy: exceeds ? count - limit : 0,
    limit,
  };
}

function formatDiffSummary({ touchedPaths = [], diffStats = {}, result }) {
  const r = result || estimate({ touchedPaths, diffStats });
  const lines = [];
  lines.push('## Blast-Radius Preflight — Over Limit');
  lines.push('');
  lines.push(`Files touched: ${r.files} (limit ${r.limit.files || 'disabled'})`);
  lines.push(`Lines changed: ${r.lines} (limit ${r.limit.lines || 'disabled'})`);
  if (r.overBy.files) lines.push(`Over by: +${r.overBy.files} files`);
  if (r.overBy.lines) lines.push(`Over by: +${r.overBy.lines} lines`);
  lines.push('');
  lines.push('Touched paths:');
  for (const p of touchedPaths) lines.push(`  - ${p}`);
  lines.push('');
  lines.push('To proceed: split the task into ≤-limit chunks, or raise the ceiling in `.design/config.json.blast_radius.{max_files_per_task,max_lines_per_task}`.');
  return lines.join('\n');
}

module.exports = { estimate, estimateMCPCalls, formatDiffSummary, loadConfig, DEFAULTS };
