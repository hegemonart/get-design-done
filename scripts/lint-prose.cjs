'use strict';
// Phase 43 — editorial prose lint. Fails CI on em dashes, double-hyphens, and AI-prose tells in GDD's
// OWN user-facing prose. Dep-free; maintainer-only (NOT shipped, like lint-changelog.cjs).
//
//   node scripts/lint-prose.cjs [paths...] [--json]
//
// Denylist source of truth: scripts/lib/manifest/prose-denylist.json (Phase 41.5 SoT) via readProseDenylist().
// Default scope: README.md, README.*.md, SKILL.md, scripts/skill-templates/**/*.md, agents/**/*.md, CHANGELOG.md,
// reference/**/*.md. The GENERATED skills/ + dist/ trees are NOT scanned (scripts/skill-templates/ is the authored copy).
//
// Exclusions (masked position-preserving so file:line:column stays exact):
//   - fenced code blocks (``` and ~~~), inline `code` spans
//   - YAML frontmatter (leading --- ... ---)
//   - <!-- prose-lint-disable [phrase] --> ... <!-- prose-lint-enable --> blocks
//   - Cyrillic-majority files (>50% Cyrillic letters → locale skip; en-only denylist in v1)
// The `--` token uses an exactly-two-hyphen guard /(?<!-)--(?!-)/ so structural --- (frontmatter / HR /
// markdown table delimiter rows) never trips it; genuine prose double-hyphens still flag.
//
// Exit: 0 clean · 2 violations found · 1 usage/IO error.

const fs = require('fs');
const path = require('path');
const { readProseDenylist } = require('./lib/manifest/index.cjs');

const ROOT = path.resolve(__dirname, '..');

const DEFAULT_GLOBS = [
  'README.md',
  'SKILL.md',
  'CHANGELOG.md',
];
const DEFAULT_DIRS = [
  { dir: 'scripts/skill-templates', ext: '.md' },
  { dir: 'agents', ext: '.md' },
  { dir: 'reference', ext: '.md' },
];

function listReadmeLocales() {
  const out = [];
  for (const f of fs.readdirSync(ROOT)) {
    if (/^README\..+\.md$/.test(f) || /^README\.[a-z-]+\.md$/i.test(f)) out.push(f);
  }
  return out;
}

function walk(dir, ext) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(rel, ext));
    else if (e.isFile() && e.name.endsWith(ext)) out.push(rel);
  }
  return out;
}

function defaultFiles() {
  const set = new Set();
  for (const g of DEFAULT_GLOBS) if (fs.existsSync(path.join(ROOT, g))) set.add(g);
  for (const f of listReadmeLocales()) set.add(f);
  for (const { dir, ext } of DEFAULT_DIRS) for (const f of walk(dir, ext)) set.add(f);
  return [...set].sort();
}

/** True if >50% of letters are Cyrillic (locale skip — en-only denylist in v1). */
function isCyrillicMajority(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length < 20) return false;
  const cyr = text.match(/\p{Script=Cyrillic}/gu) || [];
  return cyr.length / letters.length > 0.5;
}

/** Replace every non-newline char in [start,end) with a space (mask, position-preserving). */
function blank(str) {
  return str.replace(/[^\n]/g, ' ');
}

/** Mask code, frontmatter, and disable-blocks so denylist scans never fire there. Position-preserving. */
function maskNonProse(text) {
  let out = text;
  // YAML frontmatter: leading --- ... ---
  out = out.replace(/^---\n[\s\S]*?\n---(?=\n|$)/, (m) => blank(m));
  // fenced code blocks — LINE-ANCHORED opener/closer (3+ ` or ~). Any leading indentation is allowed so
  // list-nested fences (a ```bash block indented under a list item) mask correctly. Anchoring keeps
  // openers/closers paired across many fences, and a 4-backtick block wrapping a ```mermaid example masks
  // as one unit (the inner 3-tick run is not the matching closer).
  out = out.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$)/gm, (m) => blank(m));
  // disable-blocks (mask the enclosed content too)
  out = out.replace(/<!--\s*prose-lint-disable[^>]*-->[\s\S]*?<!--\s*prose-lint-enable\s*-->/g, (m) => blank(m));
  // any remaining HTML comments — their <!-- / --> delimiters are syntax, not prose (the prose BETWEEN
  // two separate comments, e.g. harness-only blocks, is left intact and still linted)
  out = out.replace(/<!--[\s\S]*?-->/g, (m) => blank(m));
  // inline code spans — masked PER LINE (backref pairs the exact backtick run within a line). Per-line keeps
  // one stray/unbalanced backtick from cascading a mis-pairing across the whole file; the (rare) intentional
  // cross-line span is left unmasked, which is harmless since such spans almost never carry a denylist token.
  out = out
    .split('\n')
    .map((line) => line.replace(/(`+)[^`\n]*?\1/g, (m) => blank(m)))
    .join('\n');
  // markdown link/image destinations `](...)` — the URL is syntax, not prose. shields.io badge URLs
  // legitimately carry `--` (escaped to render a single `-`, e.g. `license-Apache--2.0`), which is not a
  // prose double-hyphen. Mask only the destination inside the parens, preserving positions.
  out = out.replace(/\]\(([^)\n]*)\)/g, (m, dest) => '](' + ' '.repeat(dest.length) + ')');
  return out;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Decode \uXXXX escapes so the ASCII-safe SoT token "—" becomes the actual em-dash char. */
function decodeUnicodeEscapes(s) {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Build a global matcher for one denylist entry. */
function buildMatcher(entry) {
  const p = entry.kind === 'token' ? decodeUnicodeEscapes(entry.pattern) : entry.pattern;
  if (entry.kind === 'token') {
    if (p === '--') return /(?<!-)--(?!-)/g;          // exactly two hyphens (skips --- structural runs)
    return new RegExp(escapeRe(p), 'g');               // em-dash etc. (literal)
  }
  // phrase: word-boundary, case-insensitive, internal whitespace flexible
  const body = escapeRe(p).replace(/\\?\s+/g, '\\s+');
  const lead = /^\w/.test(p) ? '\\b' : '';
  const tail = /\w$/.test(p) ? '\\b' : '';
  return new RegExp(lead + body + tail, 'gi');
}

function indexToLineCol(text, idx) {
  let line = 1;
  let last = -1;
  for (let i = 0; i < idx; i++) if (text[i] === '\n') { line++; last = i; }
  return { line, col: idx - last };
}

/** Scan masked text for all denylist violations. Returns [{line,col,pattern,kind,match}]. */
function scan(text, denylist) {
  const masked = maskNonProse(text);
  const findings = [];
  for (const entry of denylist) {
    const re = buildMatcher(entry);
    let m;
    while ((m = re.exec(masked)) !== null) {
      const { line, col } = indexToLineCol(masked, m.index);
      findings.push({ line, col, pattern: entry.pattern, kind: entry.kind, match: m[0] });
      if (m.index === re.lastIndex) re.lastIndex++; // zero-width guard
    }
  }
  findings.sort((a, b) => a.line - b.line || a.col - b.col);
  return findings;
}

/** Extract the frontmatter `description` value (single-line or folded continuation). Line-based, not a
 *  single nested-quantifier regex — that form (.*(?:\n[ \t]+.*)*) is a ReDoS (js/redos) on pathological
 *  indented input, so we walk lines linearly instead. */
function extractDescription(text) {
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const lines = fm[1].split('\n');
  const i = lines.findIndex((l) => /^description:/.test(l));
  if (i === -1) return null;
  let val = lines[i].slice(lines[i].indexOf(':') + 1).trim();
  for (let j = i + 1; j < lines.length; j++) {
    if (/^[ \t]+\S/.test(lines[j])) val += ' ' + lines[j].trim(); // folded continuation line
    else break;
  }
  return val.trim();
}

/** SC#7: apply the denylist to a skill/agent `description` — em dash + AI-tells, but NOT the `--` token
 *  (a description legitimately names CLI flags like --dry-run, and YAML values cannot use code spans). */
function scanDescription(text, denylist) {
  const desc = extractDescription(text);
  if (!desc) return [];
  const dl = denylist.filter((t) => !(t.kind === 'token' && t.pattern === '--'));
  const findings = [];
  for (const entry of dl) {
    const re = buildMatcher(entry);
    let m;
    while ((m = re.exec(desc)) !== null) {
      findings.push({ pattern: entry.pattern, kind: entry.kind, match: m[0] });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return findings;
}

function lintFile(rel, denylist) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (isCyrillicMajority(text)) return { rel, skipped: 'cyrillic', findings: [], descFindings: [] };
  return { rel, findings: scan(text, denylist), descFindings: scanDescription(text, denylist) };
}

function main(argv, io = {}) {
  const out = io.stdout || process.stdout;
  const err = io.stderr || process.stderr;
  const json = argv.includes('--json');
  const explicit = argv.filter((a) => !a.startsWith('--'));
  const files = explicit.length ? explicit : defaultFiles();

  const denyData = readProseDenylist();
  const denylist = denyData.tells || [];
  if (!denylist.length) {
    err.write('lint-prose: empty denylist (scripts/lib/manifest/prose-denylist.json)\n');
    return 1;
  }

  const results = [];
  let total = 0;
  for (const rel of files) {
    let r;
    try { r = lintFile(rel, denylist); } catch (e) { err.write(`lint-prose: cannot read ${rel}: ${e.message}\n`); return 1; }
    results.push(r);
    total += r.findings.length + r.descFindings.length;
  }

  const labelOf = (f) => {
    const tok = f.kind === 'token' ? decodeUnicodeEscapes(f.pattern) : f.pattern;
    return f.kind === 'token' ? (tok === '—' ? 'em-dash' : tok === '--' ? 'double-hyphen' : tok) : `tell:${f.pattern}`;
  };

  if (json) {
    out.write(JSON.stringify({ total, results: results.filter((r) => r.findings.length || r.descFindings.length || r.skipped) }, null, 2) + '\n');
  } else {
    for (const r of results) {
      for (const f of r.findings) out.write(`${r.rel}:${f.line}:${f.col}  ${labelOf(f)}\n`);
      for (const f of r.descFindings) out.write(`${r.rel}: (description)  ${labelOf(f)}\n`);
    }
    out.write(`lint-prose: ${files.length} file(s) scanned, ${total} violation(s)\n`);
  }
  return total > 0 ? 2 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, scan, scanDescription, extractDescription, maskNonProse, buildMatcher, defaultFiles, isCyrillicMajority };
