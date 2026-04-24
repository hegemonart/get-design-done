#!/usr/bin/env node
'use strict';
/**
 * hooks/gdd-decision-injector.js — PreToolUse:Read cross-cycle recall hook.
 *
 * When an agent opens any .design/**.md | reference/**.md | .planning/**.md
 * file ≥1500 bytes, surface the top-N D-XX decisions + L-NN learnings + prior-cycle
 * CYCLE-SUMMARY/EXPERIENCE excerpts that mention the opened file's basename or path.
 *
 * Grep backend now (ripgrep when available, Node fs scan fallback). Phase 19.5
 * swaps in FTS5 transparently — same matcher, same output shape.
 *
 * Contract (PreToolUse:Read):
 *   stdin  : { tool_name: "Read", tool_input: { file_path }, cwd }
 *   stdout : on match  → { continue: true, hookSpecificOutput: { additionalContext } }
 *            otherwise → { continue: true }
 *   exit   : always 0
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MIN_BYTES = 1500;
const TOP_N = 15;
const MATCHER_RE = /[\\/](?:\.design|reference|\.planning)[\\/][^\n]*\.md$/;

// Phase 19.5: try FTS5 backend first; fall back to grep silently.
let _designSearch = null;
try {
  _designSearch = require(path.join(__dirname, '..', 'scripts', 'lib', 'design-search.cjs'));
} catch { /* not available in this install */ }

const BACKEND = _designSearch ? _designSearch.backendName() : null;

function ripgrepAvailable() {
  try {
    const r = spawnSync('rg', ['--version'], { encoding: 'utf8', windowsHide: true });
    return r.status === 0;
  } catch { return false; }
}

function grepLinesNode(filePath, terms) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
  const hits = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    for (const t of terms) {
      if (t && ln.includes(t)) { hits.push({ file: filePath, line: i + 1, text: ln.trim() }); break; }
    }
  }
  return hits;
}

function grepLinesRg(filePath, terms) {
  const pattern = terms.filter(Boolean).map(escapeRe).join('|');
  if (!pattern) return [];
  const r = spawnSync('rg', ['-n', '--no-heading', '-S', pattern, filePath], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0 && r.status !== 1) return [];
  const out = [];
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    const m = line.match(/^(\d+):(.*)$/);
    if (m) out.push({ file: filePath, line: Number(m[1]), text: m[2].trim() });
  }
  return out;
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function findSearchSources(cwd) {
  const roots = [];
  const learnings = path.join(cwd, '.design', 'learnings', 'LEARNINGS.md');
  const state     = path.join(cwd, '.design', 'STATE.md');
  const cycles    = path.join(cwd, '.design', 'CYCLES.md');
  if (fs.existsSync(learnings)) roots.push(learnings);
  if (fs.existsSync(state))     roots.push(state);
  if (fs.existsSync(cycles))    roots.push(cycles);

  // archive/**/CYCLE-SUMMARY.md + archive/**/EXPERIENCE.md
  const archive = path.join(cwd, '.design', 'archive');
  if (fs.existsSync(archive)) {
    try {
      for (const cycleDir of fs.readdirSync(archive)) {
        for (const leaf of ['CYCLE-SUMMARY.md', 'EXPERIENCE.md']) {
          const p = path.join(archive, cycleDir, leaf);
          if (fs.existsSync(p)) roots.push(p);
        }
      }
    } catch { /* unreadable archive → skip */ }
  }
  return roots;
}

function cycleTagFor(file) {
  const m = file.match(/[\\/]cycle-(\d+)[\\/]/);
  if (m) return `cycle-${m[1]}`;
  if (file.endsWith('LEARNINGS.md')) return 'learnings';
  if (file.endsWith('STATE.md')) return 'state';
  if (file.endsWith('CYCLES.md')) return 'cycles';
  return 'archive';
}

function sortKeyFor(tag) {
  // cycle-N: highest cycle wins; state/cycles secondary; learnings last
  if (tag.startsWith('cycle-')) return 1000 + Number(tag.slice(6));
  if (tag === 'cycles') return 100;
  if (tag === 'state') return 50;
  if (tag === 'learnings') return 10;
  return 0;
}

function buildRecallBlock(matches, basename, backendLabel) {
  if (!matches.length) return null;
  const uniq = [];
  const seen = new Set();
  for (const m of matches) {
    // Dedup by (source-file + normalized text) so duplicate excerpts in the
    // same file collapse even when they live on different lines.
    const key = `${m.file}::${m.text.trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(m);
  }
  uniq.sort((a, b) => sortKeyFor(cycleTagFor(b.file)) - sortKeyFor(cycleTagFor(a.file)));
  const top = uniq.slice(0, TOP_N);
  const lines = [];
  lines.push('');
  lines.push(`> ⌂ **Recall** — prior decisions & learnings referencing \`${basename}\`:`);
  for (const m of top) {
    const tag = cycleTagFor(m.file);
    const excerpt = m.text.length > 140 ? m.text.slice(0, 137) + '…' : m.text;
    lines.push(`> - [${tag}] ${excerpt} (${path.relative(process.cwd(), m.file)}:${m.line})`);
  }
  // backendLabel passed in from main()
  if (uniq.length > TOP_N) {
    lines.push(`> … (${uniq.length - TOP_N} more matches; use \`/gdd:recall <term>\` to expand. Backend: ${backendLabel}.)`);
  } else {
    lines.push(`> (${uniq.length} match${uniq.length === 1 ? '' : 'es'} surfaced. Backend: ${backendLabel}.)`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  let buf = '';
  for await (const chunk of process.stdin) buf += chunk;

  let payload;
  try { payload = JSON.parse(buf || '{}'); } catch {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  if (payload?.tool_name !== 'Read') {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const fp = payload?.tool_input?.file_path || '';
  if (!MATCHER_RE.test(fp)) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const cwd = payload?.cwd || process.cwd();
  let size = 0;
  try { size = fs.statSync(fp).size; } catch { /* missing file → silent */ }
  if (size < MIN_BYTES) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const basename = path.basename(fp);
  const relPath = path.relative(cwd, fp).replace(/\\/g, '/');
  const terms = Array.from(new Set([basename, relPath].filter(Boolean)));

  const sources = findSearchSources(cwd);
  if (sources.length === 0) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const useRgGlobal = ripgrepAvailable();
  let hits = [];
  if (BACKEND === 'fts5' && _designSearch) {
    // FTS5 path: single query across all indexed docs
    try {
      const query = terms.join(' OR ');
      hits = _designSearch.search(query, cwd, { limit: TOP_N * 3 });
    } catch { hits = []; }
    if (!hits.length) {
      // FTS5 db may be stale — rebuild silently then retry
      try { _designSearch.reindex(cwd); hits = _designSearch.search(terms.join(' OR '), cwd, { limit: TOP_N * 3 }); } catch { hits = []; }
    }
  } else {
    for (const src of sources) {
      hits.push(...(useRgGlobal ? grepLinesRg(src, terms) : grepLinesNode(src, terms)));
    }
  }

  const backendLabel = BACKEND || (useRgGlobal ? 'ripgrep' : 'node-grep');
  const block = buildRecallBlock(hits, basename, backendLabel);
  if (!block) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  process.stdout.write(JSON.stringify({
    continue: true,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: block },
  }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ continue: true }));
});
