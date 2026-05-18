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
const PROTOTYPING_TOP_N = 5;
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

/**
 * Parse a self-closing-tag attribute string ("a=\"x\" b=\"y\"") into a kv map.
 * Self-contained: avoids a TS-parser import to keep the hook hot path JS-only.
 */
function parseAttrs(attrStr) {
  const out = {};
  if (!attrStr) return out;
  const re = /(\w+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) out[m[1]] = m[2];
  return out;
}

/**
 * One-shot read of STATE.md. Returns `{ prototyping, decisionsMap }` where
 * `prototyping` is the inner body of `<prototyping>...</prototyping>` (or '')
 * and `decisionsMap` is a `D-XX -> rationale` lookup parsed from `<decisions>`.
 * Both fields default to safe empties on unreadable file / absent blocks.
 *
 * Single read keeps the hot path tight (STATE.md is small but reading once
 * beats reading twice).
 */
function readStateForPrototyping(stateFile) {
  const empty = { prototyping: '', decisionsMap: Object.create(null) };
  if (!stateFile) return empty;
  let content;
  try { content = fs.readFileSync(stateFile, 'utf8'); } catch { return empty; }
  const out = { prototyping: '', decisionsMap: Object.create(null) };
  const protoMatch = content.match(/<prototyping>([\s\S]*?)<\/prototyping>/);
  if (protoMatch) out.prototyping = protoMatch[1];
  const decBlock = content.match(/<decisions>([\s\S]*?)<\/decisions>/);
  if (decBlock) {
    const re = /^\s*(D-\d+)\s*:\s*(.+?)\s*$/gm;
    let m;
    while ((m = re.exec(decBlock[1])) !== null) {
      // Strip a trailing `(locked)` / `(tentative)` qualifier if present.
      out.decisionsMap[m[1]] = m[2].replace(/\s*\((?:locked|tentative)\)\s*$/i, '').trim();
    }
  }
  return out;
}

/**
 * Parse `<prototyping>` body into typed entries. Skips comments and unknown tags.
 */
function parsePrototypingEntries(body) {
  const entries = [];
  if (!body) return entries;
  const re = /<(sketch|spike|skipped)\b([^>]*?)\/>/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const type = m[1];
    const attrs = parseAttrs(m[2]);
    entries.push({ type, attrs });
  }
  return entries;
}

/**
 * Tokenize a slug / basename / path for fuzzy comparison.
 * Splits on hyphens, underscores, dots, and path separators; lowercases;
 * drops common no-signal tokens (`md`, file extensions, single chars).
 */
function tokenize(s) {
  if (!s) return [];
  const parts = String(s).toLowerCase().split(/[-_./\\\s]+/).filter(Boolean);
  const stop = new Set(['md', 'txt', 'json', 'ts', 'js', 'plan', 'context', 'state']);
  return parts.filter((p) => p.length > 1 && !stop.has(p));
}

/**
 * Score a prototyping entry against the opened file's basename + relPath tokens.
 * Returns the entry's matcher term if any slug-token is shared with a
 * basename/relPath token (case-insensitive). Falls back to plain substring
 * for terms that don't tokenize (e.g., free-form `reason` strings).
 *
 * Symmetric with the D-XX matcher: the existing recall path greps source
 * lines for the opened file's basename; here we surface a prototyping entry
 * whenever it would have grepped successfully — when the entry's slug
 * mentions the same concept the file's name encodes.
 */
function matchPrototypingEntry(entry, basename, relPath) {
  let term;
  if (entry.type === 'sketch' || entry.type === 'spike') {
    term = entry.attrs.slug;
  } else if (entry.type === 'skipped') {
    term = entry.attrs.reason;
  }
  if (!term) return null;
  const fileTokens = new Set([...tokenize(basename), ...tokenize(relPath)]);
  if (fileTokens.size === 0) return null;
  const termTokens = tokenize(term);
  for (const t of termTokens) {
    if (fileTokens.has(t)) return term;
  }
  // Fallback: plain substring (helps `reason` strings and slugs containing
  // tokens that don't survive the stop-word filter).
  const needle = String(term).toLowerCase();
  if (basename.toLowerCase().includes(needle) || relPath.toLowerCase().includes(needle)) return term;
  return null;
}

/**
 * Format a single prototyping entry for the additionalContext block.
 * Shape: "Prototyping outcome (cycle <cycle>): <type>/<slug> — D-<id> — <verdict-or-status>: <rationale>"
 * Falls back gracefully when fields are missing (e.g., skipped entries lack a D-XX).
 */
function formatPrototypingEntry(entry, decisionsMap) {
  const a = entry.attrs;
  const cycle = a.cycle || '?';
  const ident = a.slug || a.at || '?';
  const segs = [`Prototyping outcome (cycle ${cycle}): ${entry.type}/${ident}`];
  if (a.decision) {
    const rationale = decisionsMap[a.decision];
    segs.push(rationale ? `${a.decision} — ${rationale}` : a.decision);
  }
  if (entry.type === 'spike' && a.verdict) {
    segs.push(`verdict: ${a.verdict}`);
  } else if (a.status) {
    segs.push(`status: ${a.status}`);
  } else if (entry.type === 'skipped' && a.reason) {
    segs.push(`reason: ${a.reason}`);
  }
  return segs.join(' — ');
}

/**
 * Build the prototyping outcomes block. Returns null when nothing matches so the
 * caller can decide whether to omit the heading entirely.
 *
 * Sort: most recent cycle first (matches the existing sortKeyFor recency bias).
 */
function buildPrototypingBlock(stateFile, basename, relPath) {
  if (!stateFile) return null;
  const { prototyping, decisionsMap } = readStateForPrototyping(stateFile);
  if (!prototyping) return null;
  const entries = parsePrototypingEntries(prototyping);
  if (!entries.length) return null;

  const matched = [];
  for (const e of entries) {
    const term = matchPrototypingEntry(e, basename, relPath);
    if (term) matched.push(e);
  }
  if (!matched.length) return null;

  // Recency: cycle is typically `cycle-N` or `N`; coerce to a number for sorting.
  const cycleNum = (e) => {
    const c = String(e.attrs.cycle || '');
    const m = c.match(/(\d+)/);
    return m ? Number(m[1]) : 0;
  };
  matched.sort((a, b) => cycleNum(b) - cycleNum(a));
  const top = matched.slice(0, PROTOTYPING_TOP_N);

  const lines = [];
  lines.push('');
  lines.push('### Prior prototyping outcomes');
  for (const e of top) {
    lines.push(`> - ${formatPrototypingEntry(e, decisionsMap)}`);
  }
  if (matched.length > PROTOTYPING_TOP_N) {
    lines.push(`> … (${matched.length - PROTOTYPING_TOP_N} more prototyping entr${matched.length - PROTOTYPING_TOP_N === 1 ? 'y' : 'ies'})`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Phase 28.5 plan 08 (D-04) — additive CONTEXT.md / ADR context.
 *
 * `CONTEXT.md` is a project-scoped ubiquitous-language glossary (schema:
 * reference/context-md-format.md). Each entry is an `## Term` heading + body
 * paragraph; optional `**Aliases:** [...]` line enables term-merging. The hook
 * surfaces entries whose name or aliases match the opened file's tokens.
 *
 * ADRs live at `docs/adr/NNNN-<slug>.md` (schema: reference/adr-format.md). The
 * hook surfaces matching titles as one-line cross-references.
 *
 * All file reads are defensive: missing or malformed files yield [] silently so
 * the hook NEVER crashes (T-28.5-08-01 mitigation). Output is bounded by
 * PROTOTYPING_TOP_N to prevent DoS (T-28.5-08-03).
 */
function readContextMd(repoRoot) {
  const ctxPath = path.join(repoRoot, 'CONTEXT.md');
  if (!fs.existsSync(ctxPath)) return [];
  let content;
  try { content = fs.readFileSync(ctxPath, 'utf8'); } catch { return []; }
  const entries = [];
  // Split on `## ` only when it is the start of a line. The first segment is
  // preamble (everything before the first ## heading) — discard it.
  const sections = content.split(/^## /m).slice(1);
  for (const sec of sections) {
    const lines = sec.split(/\r?\n/);
    const term = (lines[0] || '').trim();
    if (!term) continue;
    const body = lines.slice(1).join('\n');
    let aliases = [];
    const aliasMatch = body.match(/\*\*Aliases:\*\*\s*\[([^\]]+)\]/);
    if (aliasMatch) {
      aliases = aliasMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }
    entries.push({ term, body, aliases });
  }
  return entries;
}

function readAdrs(repoRoot) {
  const adrDir = path.join(repoRoot, 'docs', 'adr');
  if (!fs.existsSync(adrDir)) return [];
  let files;
  try { files = fs.readdirSync(adrDir); } catch { return []; }
  const entries = [];
  for (const f of files) {
    if (!/^\d{4}-.*\.md$/.test(f)) continue;
    let content;
    try { content = fs.readFileSync(path.join(adrDir, f), 'utf8'); } catch { continue; }
    // Title from frontmatter `title:` line, else first H1, else filename.
    const titleMatch = content.match(/^title:\s*(.+)$/m) || content.match(/^# (.+)$/m);
    const title = titleMatch
      ? titleMatch[1].trim().replace(/^["']|["']$/g, '')
      : f.replace(/\.md$/, '');
    entries.push({ path: `docs/adr/${f}`, title, body: content.slice(0, 500) });
  }
  return entries;
}

function matchContextEntries(entries, tokens) {
  if (!entries.length || !tokens.length) return [];
  const lcTokens = tokens.map((t) => String(t).toLowerCase()).filter(Boolean);
  const out = [];
  for (const e of entries) {
    const candidates = [e.term, ...e.aliases].map((s) => String(s).toLowerCase());
    const hit = candidates.some((cand) =>
      lcTokens.some((tok) => cand.includes(tok) || tok.includes(cand))
    );
    if (hit) out.push(e);
  }
  return out;
}

function matchAdrEntries(entries, tokens) {
  if (!entries.length || !tokens.length) return [];
  const lcTokens = tokens.map((t) => String(t).toLowerCase()).filter(Boolean);
  return entries.filter((a) => {
    const t = a.title.toLowerCase();
    return lcTokens.some((tok) => t.includes(tok));
  });
}

function buildGlossaryBlock(matched) {
  if (!matched.length) return null;
  const lines = [];
  lines.push('');
  lines.push('### Project glossary (CONTEXT.md)');
  for (const e of matched.slice(0, PROTOTYPING_TOP_N)) {
    const snippet = e.body
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.startsWith('**'))
      .slice(0, 2)
      .join(' ')
      .trim();
    const trimmed = snippet.length > 200 ? snippet.slice(0, 197) + '…' : snippet;
    lines.push(`> - **${e.term}** — ${trimmed}`);
  }
  if (matched.length > PROTOTYPING_TOP_N) {
    lines.push(`> … (${matched.length - PROTOTYPING_TOP_N} more glossary entr${matched.length - PROTOTYPING_TOP_N === 1 ? 'y' : 'ies'})`);
  }
  lines.push('');
  return lines.join('\n');
}

function buildAdrBlock(matched) {
  if (!matched.length) return null;
  const lines = [];
  lines.push('');
  lines.push('### Architecture Decision Records (ADRs)');
  for (const a of matched.slice(0, PROTOTYPING_TOP_N)) {
    lines.push(`> - [${a.title}](${a.path})`);
  }
  if (matched.length > PROTOTYPING_TOP_N) {
    lines.push(`> … (${matched.length - PROTOTYPING_TOP_N} more ADR${matched.length - PROTOTYPING_TOP_N === 1 ? '' : 's'})`);
  }
  lines.push('');
  return lines.join('\n');
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

  // Phase 25 (plan 25-06): surface <prototyping> outcomes when an opened
  // planning/design .md ≥1500 bytes shares a slug/reason token with a
  // resolved sketch/spike/skipped entry. STATE.md is the canonical home for
  // the block (D-01); we read it directly here rather than via the TS parser
  // so the hook stays self-contained JS.
  const stateFile = sources.find((p) => p.endsWith(path.sep + 'STATE.md') || p.endsWith('/STATE.md'));
  const protoBlock = buildPrototypingBlock(stateFile, basename, relPath);

  // Phase 28.5 plan 08 (D-04): additive CONTEXT.md + ADR context. Tokens used
  // for matching are derived from the opened file's basename + relPath, split
  // on kebab/snake/path separators and filtered down to substantive tokens.
  // The match is intentionally loose (substring both ways) so an alias like
  // "heuristics" surfaces when opening reference/heuristics.md.
  const matchTokens = Array.from(new Set([
    basename.replace(/\.md$/i, ''),
    ...basename.replace(/\.md$/i, '').split(/[-_./\\]/),
    ...relPath.split(/[-_./\\]/),
  ].filter((t) => t && t.length > 2)));

  let glossaryBlock = null;
  let adrBlock = null;
  try {
    const ctxEntries = readContextMd(cwd);
    const matchedCtx = matchContextEntries(ctxEntries, matchTokens);
    glossaryBlock = buildGlossaryBlock(matchedCtx);
  } catch { /* defensive: never crash on CONTEXT.md issues */ }
  try {
    const adrEntries = readAdrs(cwd);
    const matchedAdrs = matchAdrEntries(adrEntries, matchTokens);
    adrBlock = buildAdrBlock(matchedAdrs);
  } catch { /* defensive: never crash on ADR issues */ }

  if (!block && !protoBlock && !glossaryBlock && !adrBlock) {
    try { require('./_hook-emit.js').emitHookFired('gdd-decision-injector', 'no-hits', { backend: backendLabel }); } catch { /* swallow */ }
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const additionalContext = [block, protoBlock, glossaryBlock, adrBlock].filter(Boolean).join('\n');

  try { require('./_hook-emit.js').emitHookFired('gdd-decision-injector', 'inject', { backend: backendLabel, hit_count: hits.length, prototyping: !!protoBlock, glossary: !!glossaryBlock, adr: !!adrBlock }); } catch { /* swallow */ }
  process.stdout.write(JSON.stringify({
    continue: true,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext },
  }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ continue: true }));
});
